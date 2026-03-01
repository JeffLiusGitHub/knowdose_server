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

        // 1. Delete user from Firebase Auth if they exist
        try {
            await auth.deleteUser(userId);
            console.log(`Deleted user ${userId} from Firebase Auth`);
        } catch (authErr: any) {
            console.warn(`Could not delete user ${userId} from Auth (may not exist or already deleted):`, authErr.message);
        }

        // 2. Delete all Firestore data for this user
        const userRef = db.collection('artifacts').doc(APP_ID).collection('users').doc(userId);
        
        // Delete medications collection
        const medsSnap = await userRef.collection('medications').get();
        const batch = db.batch();
        medsSnap.docs.forEach((doc) => batch.delete(doc.ref));
        
        // Delete settings collection
        const settingsSnap = await userRef.collection('user_settings').get();
        settingsSnap.docs.forEach((doc) => batch.delete(doc.ref));

        // Note: Records collection is already local-only mostly, but clear any old ones
        const recordsSnap = await userRef.collection('records').get();
        recordsSnap.docs.forEach((doc) => batch.delete(doc.ref));

        // Commit subcollection deletions
        await batch.commit();

        // Delete the main user document
        await userRef.delete();
        console.log(`Deleted all Firestore data for user ${userId}`);

        res.json({ ok: true });
    } catch (err: any) {
        console.error('Error deleting user:', err);
        res.status(500).json({ error: err.message || 'Failed to delete user' });
    }
});

export default router;
