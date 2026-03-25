import { Router } from 'express';
import { db, auth } from '../services/db.js';

const router = Router();
const APP_ID = process.env.APP_ID || 'default-med-app-id';

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
