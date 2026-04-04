import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { verifyIdToken } from 'apple-signin-auth';
import { db, auth } from '../services/db.js';
import { generateToken, verifyToken, verifyJWTMiddleware } from '../services/jwt.js';

const router = Router();
const APP_ID = process.env.APP_ID || 'default-med-app-id';

/**
 * POST /api/users/login/apple
 * Authenticate user with Apple Sign In identity token and return JWT
 */
router.post('/login/apple', async (req, res) => {
    try {
        const { identityToken, user } = req.body;

        if (!identityToken) {
            return res.status(400).json({ error: 'Missing identityToken' });
        }

        // Verify the Apple identity token
        let decodedToken;
        try {
            decodedToken = await verifyIdToken(identityToken, {
                audience: process.env.APPLE_APP_ID || 'com.knowdose.app',
            });
        } catch (tokenErr: any) {
            console.error('Apple token verification failed:', tokenErr.message);
            return res.status(401).json({ error: 'Invalid or expired Apple identity token' });
        }

        const appleUserId = decodedToken.sub; // Apple's unique user identifier
        const email = decodedToken.email || user?.email;
        const name = user?.name?.firstName || user?.name?.givenName || '';

        if (!appleUserId) {
            return res.status(400).json({ error: 'Could not extract user ID from Apple token' });
        }

        let firebaseUserId: string;

        // Check if user already exists in Firebase by email or Apple UID
        let firebaseUser = null;
        if (email) {
            try {
                firebaseUser = await auth.getUserByEmail(email);
                firebaseUserId = firebaseUser.uid;
            } catch (err: any) {
                if (err.code !== 'auth/user-not-found') {
                    throw err;
                }
            }
        }

        // If user doesn't exist, create them
        if (!firebaseUser) {
            const newUser = await auth.createUser({
                email: email || `apple-${appleUserId}@knowdose.app`,
                displayName: name,
                uid: `apple_${appleUserId}`,
            });
            firebaseUserId = newUser.uid;
            console.log(`Created new Firebase user: ${firebaseUserId}`);
        } else {
            firebaseUserId = firebaseUser.uid;
            console.log(`Using existing Firebase user: ${firebaseUserId}`);
        }

        // Store or update user info in Firestore
        const userDocRef = db.collection('artifacts').doc(APP_ID).collection('users').doc(firebaseUserId);
        await userDocRef.set(
            {
                email: email || null,
                displayName: name || null,
                appleUserId,
                loginMethod: 'apple',
                lastLogin: new Date(),
            },
            { merge: true }
        );

        // Generate JWT token
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

export default router;
