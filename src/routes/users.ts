import { Router } from 'express';
import { verifyIdToken } from 'apple-signin-auth';
import { db, auth } from '../services/db.js';
import { generateToken, verifyToken } from '../services/jwt.js';

const router = Router();
const APP_ID = process.env.APP_ID || 'default-med-app-id';
const IS_DEV = process.env.NODE_ENV !== 'production';
const APPLE_VERIFY_TIMEOUT_MS = Number(process.env.APPLE_VERIFY_TIMEOUT_MS || 5000);
const FIREBASE_VERIFY_TIMEOUT_MS = Number(process.env.FIREBASE_VERIFY_TIMEOUT_MS || 4000);
const FIRESTORE_WRITE_TIMEOUT_MS = Number(process.env.FIRESTORE_WRITE_TIMEOUT_MS || 2000);
const APPLE_AUDIENCES = Array.from(
    new Set(
        [
            ...(process.env.APPLE_APP_IDS || '').split(','),
            process.env.APPLE_SERVICE_ID || '',
            process.env.APPLE_APP_ID || 'com.knowdose.app',
        ]
            .map(value => value.trim())
            .filter(Boolean)
    )
);

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(label)), timeoutMs);
    });

    try {
        return await Promise.race([promise, timeoutPromise]);
    } finally {
        if (timeoutId) clearTimeout(timeoutId);
    }
}

function isTimeoutError(error: unknown): boolean {
    const message =
        error instanceof Error
            ? error.message
            : typeof error === 'string'
              ? error
              : String(error || '');
    return message.toLowerCase().includes('timed out');
}

/**
 * Helper: Decode mock Apple token for testing (development only)
 * This is used when testing with mock tokens from test scripts
 */
function decodeMockAppleToken(token: string): any {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) {
            throw new Error('Invalid token format');
        }
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'));
        return payload;
    } catch (err) {
        return null;
    }
}

/**
 * Helper: Verify Apple token (real or mock for development)
 */
async function verifyAppleToken(identityToken: string): Promise<any> {
    try {
        // Try real Apple verification first (supports multiple audiences).
        let lastError: any = null;
        for (const audience of APPLE_AUDIENCES) {
            try {
                return await verifyIdToken(identityToken, { audience });
            } catch (err: any) {
                lastError = err;
            }
        }
        throw lastError || new Error('No valid Apple audience matched');
    } catch (realErr: any) {
        // If real verification fails and we're in development, try mock token
        if (IS_DEV) {
            console.log('Real Apple verification failed, attempting mock token decode (DEV ONLY)');
            const mockPayload = decodeMockAppleToken(identityToken);
            if (mockPayload) {
                console.log('Successfully decoded mock Apple token');
                return mockPayload;
            }
        }
        throw realErr;
    }
}

/**
 * POST /api/users/login/apple
 * Authenticate user with Apple Sign In identity token and return JWT
 */
router.post('/login/apple', async (req, res) => {
    try {
        const { identityToken, firebaseIdToken, appleUserId: appleUserIdHint, user } = req.body || {};

        if (!identityToken && !firebaseIdToken) {
            return res.status(400).json({ error: 'Missing identityToken or firebaseIdToken' });
        }

        let appleUserId =
            typeof appleUserIdHint === 'string' && appleUserIdHint.trim()
                ? appleUserIdHint.trim()
                : '';
        let email = user?.email || '';
        let name = user?.name?.firstName || user?.name?.givenName || user?.displayName || '';
        let firebaseVerified = false;

        // Fast path: verify Firebase token first and confirm it came from Apple sign-in.
        if (firebaseIdToken) {
            try {
                const firebaseDecoded: any = await withTimeout(
                    auth.verifyIdToken(firebaseIdToken),
                    FIREBASE_VERIFY_TIMEOUT_MS,
                    'Firebase ID token verification timed out'
                );
                const signInProvider = firebaseDecoded?.firebase?.sign_in_provider || '';
                const identities = firebaseDecoded?.firebase?.identities || {};
                const appleIdentities = Array.isArray(identities['apple.com']) ? identities['apple.com'] : [];
                const hasAppleIdentity = appleIdentities.length > 0 || signInProvider === 'apple.com';
                const firebaseUidRaw = String(firebaseDecoded?.uid || '');
                const firebaseUidAsAppleSub = firebaseUidRaw.startsWith('apple_')
                    ? firebaseUidRaw.slice('apple_'.length)
                    : firebaseUidRaw;

                if (!hasAppleIdentity) {
                    return res.status(401).json({ error: 'Firebase token is not from Apple sign-in' });
                }

                firebaseVerified = true;
                appleUserId = appleUserId || appleIdentities[0] || firebaseUidAsAppleSub || '';
                email = email || firebaseDecoded.email || '';
                name = name || firebaseDecoded.name || '';
            } catch (firebaseErr: any) {
                console.warn(
                    'Firebase token verification failed during Apple login fast path:',
                    firebaseErr?.message || firebaseErr
                );
                if (!identityToken) {
                    if (isTimeoutError(firebaseErr)) {
                        return res.status(503).json({ error: 'Firebase token verification timed out' });
                    }
                    return res.status(401).json({ error: 'Invalid or expired Firebase ID token' });
                }
            }
        }

        // Fallback path: verify Apple identity token only if needed to resolve Apple sub.
        if (!appleUserId && identityToken) {
            try {
                const decodedToken = await withTimeout(
                    verifyAppleToken(identityToken),
                    APPLE_VERIFY_TIMEOUT_MS,
                    'Apple identity token verification timed out'
                );
                appleUserId = decodedToken?.sub || appleUserId;
                email = decodedToken?.email || email;
            } catch (appleErr: any) {
                console.warn('Apple token verification failed during fallback:', appleErr?.message || appleErr);
                if (!firebaseVerified) {
                    if (isTimeoutError(appleErr)) {
                        return res.status(503).json({ error: 'Apple identity token verification timed out' });
                    }
                    return res.status(401).json({ error: 'Invalid or expired Apple identity token' });
                }
            }
        }

        if (!appleUserId) {
            return res.status(400).json({ error: 'Could not extract user ID from Apple token' });
        }

        const appleMappedUid = `apple_${appleUserId}`;
        let firebaseUserId: string | null = null;

        // Resolve user deterministically by Apple sub first, then by email.
        // This avoids immediate re-login failures right after account deletion
        // when email may be unavailable on subsequent Apple sign-ins.
        let firebaseUser: any = null;
        try {
            firebaseUser = await auth.getUser(appleMappedUid);
            firebaseUserId = firebaseUser.uid;
            console.log(`Using existing Firebase user by apple sub: ${firebaseUserId}`);
        } catch (err: any) {
            if (err.code !== 'auth/user-not-found') {
                throw err;
            }
        }

        if (!firebaseUser && email) {
            try {
                firebaseUser = await auth.getUserByEmail(email);
                firebaseUserId = firebaseUser.uid;
                console.log(`Using existing Firebase user by email: ${firebaseUserId}`);
            } catch (err: any) {
                if (err.code !== 'auth/user-not-found') {
                    throw err;
                }
            }
        }

        if (!firebaseUser) {
            try {
                const newUser = await auth.createUser({
                    email: email || `apple-${appleUserId}@knowdose.app`,
                    displayName: name,
                    uid: appleMappedUid,
                });
                firebaseUserId = newUser.uid;
                console.log(`Created new Firebase user: ${firebaseUserId}`);
            } catch (createErr: any) {
                const createCode = createErr?.code || '';

                if (createCode === 'auth/uid-already-exists') {
                    const existing = await auth.getUser(appleMappedUid);
                    firebaseUserId = existing.uid;
                    firebaseUser = existing;
                    console.warn(`Recovered from uid conflict by reusing ${firebaseUserId}`);
                } else if (createCode === 'auth/email-already-exists' && email) {
                    const existing = await auth.getUserByEmail(email);
                    firebaseUserId = existing.uid;
                    firebaseUser = existing;
                    console.warn(`Recovered from email conflict by reusing ${firebaseUserId}`);
                } else {
                    throw createErr;
                }
            }
        }

        if (!firebaseUserId) {
            throw new Error('Failed to resolve Firebase user for Apple login');
        }

        // Generate JWT token and respond immediately so UI is not blocked by profile sync.
        const token = generateToken(firebaseUserId);
        res.json({
            ok: true,
            token,
            userId: firebaseUserId,
            user: {
                email,
                displayName: name,
                appleUserId,
            },
        });

        // Store or update user info in Firestore asynchronously.
        const userDocRef = db.collection('artifacts').doc(APP_ID).collection('users').doc(firebaseUserId);
        void withTimeout(
            userDocRef.set(
                {
                    email: email || null,
                    displayName: name || null,
                    appleUserId,
                    loginMethod: 'apple',
                    lastLogin: new Date(),
                },
                { merge: true }
            ),
            FIRESTORE_WRITE_TIMEOUT_MS,
            'Firestore user profile write timed out'
        ).catch((writeErr: any) => {
            console.error('Async Firestore profile sync failed after login:', writeErr?.message || writeErr);
        });
    } catch (err: any) {
        console.error('Error in Apple authentication:', err);
        res.status(500).json({ error: err.message || 'Apple login failed' });
    }
});

/**
 * POST /api/users/verify-token
 * Verify if a JWT token is still valid
 */
router.post('/verify-token', (req, res) => {
    try {
        const { token } = req.body;

        if (!token) {
            return res.status(400).json({ error: 'Missing token' });
        }

        const decoded = verifyToken(token);
        res.json({
            ok: true,
            userId: decoded.userId,
            expiresIn: decoded.exp ? decoded.exp - Math.floor(Date.now() / 1000) : null,
        });
    } catch (err: any) {
        res.status(401).json({ error: 'Invalid or expired token' });
    }
});

// Add the user deletion route
router.delete('/me', async (req, res) => {
    try {
        const userId = (req.headers['x-user-id'] as string) || '';
        if (!userId) {
            return res.status(401).json({ error: 'Missing x-user-id' });
        }

        let authDeleted = false;

        // 1. Delete user from Firebase Auth if they exist
        try {
            await auth.deleteUser(userId);
            authDeleted = true;
            console.log(`Deleted user ${userId} from Firebase Auth`);
        } catch (authErr: any) {
            const authCode = authErr?.code || '';
            if (authCode === 'auth/user-not-found') {
                authDeleted = true;
                console.log(`User ${userId} was already absent from Firebase Auth`);
            } else {
                console.warn(`Could not delete user ${userId} from Auth:`, authErr.message);
                throw authErr;
            }
        }

        // 2. Delete all Firestore data for this user, including any nested subcollections
        const userRef = db.collection('artifacts').doc(APP_ID).collection('users').doc(userId);
        await db.recursiveDelete(userRef);
        console.log(`Deleted all Firestore data for user ${userId}`);

        res.json({
            ok: true,
            authDeleted,
            firestoreDeleted: true,
            userId,
        });
    } catch (err: any) {
        console.error('Error deleting user:', err);
        res.status(500).json({ error: err.message || 'Failed to delete user' });
    }
});

/**
 * POST /api/users/login/apple/test
 * TEST ENDPOINT (Development Only)
 * Mock Apple login without Firebase - use this to test the full flow
 * 
 * Example request:
 * POST http://localhost:4000/api/users/login/apple/test
 * {
 *   "identityToken": "<mock_token>",
 *   "user": { "name": { "firstName": "John" }, "email": "john@example.com" }
 * }
 */
router.post('/login/apple/test', async (req, res) => {
    if (!IS_DEV) {
        return res.status(403).json({ error: 'Test endpoint only available in development' });
    }

    try {
        const { identityToken, user } = req.body;

        if (!identityToken) {
            return res.status(400).json({ error: 'Missing identityToken' });
        }

        // Decode the token (mock or real)
        let decodedToken;
        try {
            decodedToken = await verifyAppleToken(identityToken);
        } catch (tokenErr: any) {
            console.error('Token decode failed:', tokenErr.message);
            return res.status(401).json({ error: 'Invalid token format' });
        }

        const appleUserId = decodedToken.sub;
        const email = decodedToken.email || user?.email || `apple-${appleUserId}@test.local`;
        const name = user?.name?.firstName || user?.name?.givenName || 'TestUser';

        if (!appleUserId) {
            return res.status(400).json({ error: 'Could not extract user ID from token' });
        }

        // Generate a mock Firebase user ID
        const firebaseUserId = `apple_${appleUserId}`;

        // Generate JWT token directly (skip Firebase)
        const token = generateToken(firebaseUserId);

        console.log(`[TEST] Mock Apple login: ${firebaseUserId}`);

        res.json({
            ok: true,
            token,
            userId: firebaseUserId,
            user: {
                email,
                displayName: name,
                appleUserId,
            },
            _testMode: true,
            _note: 'This is a test endpoint. No Firebase data was persisted.',
        });
    } catch (err: any) {
        console.error('Test login error:', err);
        res.status(500).json({ error: err.message || 'Test login failed' });
    }
});

export default router;
