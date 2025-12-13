import express from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../services/db.js';
import { User } from '../types.js';

const router = express.Router();
const APP_ID = process.env.APP_ID || 'default-med-app-id';

const inviteCodeDoc = (code: string) => 
    db.collection('artifacts').doc(APP_ID).collection('invite_codes').doc(code);

const userSettingsDoc = (userId: string) =>
    db.collection('artifacts').doc(APP_ID).collection('users').doc(userId).collection('user_settings').doc('preferences');

const medCollection = (userId: string) =>
    db.collection('artifacts').doc(APP_ID).collection('users').doc(userId).collection('medications');

const recordCollection = (userId: string) =>
    db.collection('artifacts').doc(APP_ID).collection('users').doc(userId).collection('records');

// Join a family using invite code
// The user entering the code (Requester) becomes a SUPERVISOR of the invite code owner (Target/Patient)
// OR the other way around?
// Re-evaluating App.tsx: 
// 1. App generates inviteCode for ME.
// 2. I give it to YOU.
// 3. YOU enter it in "Join Family".
// 4. YOU get added to MY "supervisees" list (App.tsx:549 "for (const superviseeId of userSettings.supervisees)").
// Wait. If I enter the code, I call /api/supervision/join.
// Then I call /api/settings.
// Then I see "supervisees".
// unique logic: If I enter a code, I GAIN a supervisee.
// So:
// - I (Requester) am the SUPERVISOR.
// - The Code Owner (Target) is the SUPERVISEE.
router.post('/join', async (req, res) => {
    const userId = req.headers['x-user-id'] as string; // Me (Supervisor)
    const { inviteCode } = req.body;

    if (!userId || !inviteCode) {
        return res.status(400).json({ error: 'Missing userId or inviteCode' });
    }

    try {
        // Find user with this invite code
        const codeDoc = await inviteCodeDoc(inviteCode).get();

        if (!codeDoc.exists) {
            return res.status(404).json({ error: 'Invalid invite code' });
        }

        const targetUserId = codeDoc.data()?.userId; // Patient

        if (!targetUserId) {
            return res.status(404).json({ error: 'Invalid invite code link' });
        }

        if (targetUserId === userId) {
            return res.status(400).json({ error: 'Cannot supervise yourself' });
        }

        // Add Target to My Supervisees
        await userSettingsDoc(userId).set({
            supervisees: FieldValue.arrayUnion(targetUserId)
        }, { merge: true });

        // Add Me to Target's Supervisors
        await userSettingsDoc(targetUserId).set({
            supervisors: FieldValue.arrayUnion(userId)
        }, { merge: true });

        res.json({ success: true, message: 'Joined family successfully', superviseeId: targetUserId });

    } catch (error) {
        console.error('Error joining family:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get data for a supervised user
router.get('/:id', async (req, res) => {
    const requesterId = req.headers['x-user-id'] as string;
    const targetUserId = req.params.id;

    if (!requesterId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        // Verify authorization: Requester must be in Target's supervisors list
        // OR simple check: Is target in Requester's supervisees list? (Easier, but less secure if data integrity fails)
        // Better: Check Target's supervisors list (Consent is on Target side).
        
        const targetSettingsSync = await userSettingsDoc(targetUserId).get();
        if (!targetSettingsSync.exists) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const targetSettings = targetSettingsSync.data() as User;
        const supervisors = targetSettings.supervisors || []; // Using generic User type but stored in settings

        if (!supervisors.includes(requesterId)) {
            return res.status(403).json({ error: 'Not authorized to view this user' });
        }

        // Fetch Meds
        const medsSnapshot = await medCollection(targetUserId).get();
        const medications = medsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Fetch Records
        const recordsSnapshot = await recordCollection(targetUserId).orderBy('timestamp', 'desc').limit(100).get(); 
        const records = recordsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        res.json({
            name: targetSettings.name || 'Family Member',
            medications,
            records
        });

    } catch (error) {
        console.error('Error fetching supervised user:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
