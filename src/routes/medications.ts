import { Router } from 'express';
import { z } from 'zod';
import { db } from '../services/db';
import { Medication, RecordItem } from '../types';

const router = Router();

const medSchema = z.object({
  medicationName: z.any(),
  timingInstruction: z.any().optional(),
  dailyFrequency: z.number().optional(),
  duration: z.union([z.number(), z.string()]).optional(),
  category: z.string().optional(),
  times: z.array(z.string()).optional(),
  coverImage: z.string().optional(),
  summary: z.any().optional(),
  customSchedules: z.record(z.array(z.string())).optional(),
  startDate: z.any().optional(),
  createdAt: z.any().optional(),
});

const requireUser = (req: any, res: any, next: any) => {
  const userId = (req.headers['x-user-id'] as string) || '';
  if (!userId) return res.status(401).json({ error: 'Missing x-user-id' });
  (req as any).userId = userId;
  next();
};

router.use(requireUser);

router.get('/records', async (req, res) => {
  try {
    const userId = (req as any).userId as string;
    const snap = await db.collection('records').where('userId', '==', userId).get();
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    res.json(items);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Fetch records failed' });
  }
});

router.get('/', async (req, res) => {
  try {
    const userId = (req as any).userId as string;
    const snap = await db.collection('medications').where('userId', '==', userId).get();
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    res.json(items);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Fetch failed' });
  }
});

router.post('/', async (req, res) => {
  try {
    const userId = (req as any).userId as string;
    const data = medSchema.parse(req.body);
    const now = new Date();
    const docRef = await db.collection('medications').add({
      ...data,
      userId,
      startDate: data.startDate ? new Date(data.startDate) : now,
      createdAt: now,
    } as Medication);
    res.json({ id: docRef.id });
  } catch (err: any) {
    console.error(err);
    res.status(400).json({ error: err.message || 'Create failed' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const userId = (req as any).userId as string;
    const { id } = req.params;
    const data = medSchema.partial().parse(req.body);
    await db.collection('medications').doc(id).update({ ...data, userId });
    res.json({ ok: true });
  } catch (err: any) {
    console.error(err);
    res.status(400).json({ error: err.message || 'Update failed' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const userId = (req as any).userId as string;
    const { id } = req.params;
    await db.collection('medications').doc(id).delete();
    // cascade delete records
    const recSnap = await db.collection('records').where('userId', '==', userId).where('medicationId', '==', id).get();
    const batch = db.batch();
    recSnap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    res.json({ ok: true });
  } catch (err: any) {
    console.error(err);
    res.status(400).json({ error: err.message || 'Delete failed' });
  }
});

router.get('/:id/records', async (req, res) => {
  try {
    const userId = (req as any).userId as string;
    const { id } = req.params;
    const snap = await db
      .collection('records')
      .where('userId', '==', userId)
      .where('medicationId', '==', id)
      .orderBy('timestamp', 'desc')
      .get();
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    res.json(items);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Fetch records failed' });
  }
});

router.post('/:id/records', async (req, res) => {
  try {
    const userId = (req as any).userId as string;
    const { id } = req.params;
    const record = z
      .object({
        name: z.any(),
        timeSlot: z.string(),
        status: z.string(),
        timestamp: z.any().optional(),
      })
      .parse(req.body);
    const rec: RecordItem = {
      ...record,
      medicationId: id,
      userId,
      timestamp: record.timestamp ? new Date(record.timestamp) : new Date(),
    };
    const docRef = await db.collection('records').add(rec);
    res.json({ id: docRef.id });
  } catch (err: any) {
    console.error(err);
    res.status(400).json({ error: err.message || 'Create record failed' });
  }
});

export default router;
