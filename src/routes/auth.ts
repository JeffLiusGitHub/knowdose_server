import express from 'express';
import { getAuth } from 'firebase-admin/auth';
import { db } from '../services/db.js';

const router = express.Router();

// Verify Google Token and Create/Update User
router.post('/google', async (req, res) => {
    const { token } = req.body;

    if (!token) {
        return res.status(400).json({ error: 'Missing token' });
    }

    try {
        // Verify the ID token
        const decodedToken = await getAuth().verifyIdToken(token);
        const uid = decodedToken.uid;
        const email = decodedToken.email;

        // Check if user exists in our DB (Mock or Real)
        // For this mock DB, we'll just simulate a user record
        // In a real app with Firestore, we'd do: await db.collection('users').doc(uid).set({ ... }, { merge: true });
        
        console.log(`User verified: ${email} (${uid})`);

        // Return session info
        res.json({
            uid,
            email,
            verified: true
        });
    } catch (error) {
        console.error('Error verifying Google token:', error);
        res.status(401).json({ error: 'Invalid token' });
    }
});

// Verify Apple Token and Create/Update User
router.post('/apple', async (req, res) => {
    const { token } = req.body;

    if (!token) {
        return res.status(400).json({ error: 'Missing token' });
    }

    try {
        // Verify the ID token
        const decodedToken = await getAuth().verifyIdToken(token);
        const uid = decodedToken.uid;
        const email = decodedToken.email;

        // Check if user exists in our DB (Mock or Real)
        
        console.log(`User verified (Apple): ${email} (${uid})`);

        // Return session info
        res.json({
            uid,
            email,
            verified: true
        });
    } catch (error) {
        console.error('Error verifying Apple token:', error);
        res.status(401).json({ error: 'Invalid token' });
    }
});

// Sync Onboarding Data
router.post('/onboarding', async (req, res) => {
    const userId = req.headers['x-user-id'] as string;
    const { name, healthProfile, preferences, emergencyContact } = req.body;

    if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        console.log(`Syncing onboarding data for user ${userId}:`, { name, healthProfile });

        // In a real app, save to DB
        // await db.collection('users').doc(userId).update({
        //     name,
        //     healthProfile,
        //     preferences,
        //     emergencyContact,
        //     onboardingCompleted: true
        // });

        res.json({ success: true });
    } catch (error) {
        console.error('Error syncing onboarding data:', error);
        res.status(500).json({ error: 'Failed to sync data' });
    }
});

export default router;
