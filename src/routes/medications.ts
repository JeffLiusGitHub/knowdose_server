import { Router } from 'express';
import { z } from 'zod';
import { db } from '../services/db.js';
import { Medication, RecordItem } from '../types.js';

const router = Router();
const APP_ID = process.env.APP_ID || 'default-med-app-id';

const medCollection = (userId: string) =>
  db.collection('artifacts').doc(APP_ID).collection('users').doc(userId).collection('medications');

const recordCollection = (userId: string) =>
  db.collection('artifacts').doc(APP_ID).collection('users').doc(userId).collection('records');

const nullableString = z
  .string()
  .nullable()
  .optional()
  .transform((v) => (v === null ? undefined : v));

const medSchema = z.object({
  medicationName: z.any(),
  timingInstruction: z.any().optional(),
  dailyFrequency: z.union([z.number(), z.string()]).optional(),
  duration: z.union([z.number(), z.string()]).optional(),
  category: nullableString,
  times: z.array(nullableString).optional(),
  // coverImage: nullableString, // REMOVED: Local only
  summary: z.any().optional(),
  customSchedules: z.record(z.array(z.string())).optional(),
  startDate: z.any().optional(),
  createdAt: z.any().optional(),
  postMedicationWindow: z.number().optional(),
  safetyInstruction: z.any().optional(),
});

const requireUser = (req: any, res: any, next: any) => {
  const userId = (req.headers['x-user-id'] as string) || '';
  if (!userId) return res.status(401).json({ error: 'Missing x-user-id' });
  (req as any).userId = userId;
  next();
};

const removeUndefined = (obj: any): any => {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.filter((v) => v !== undefined).map(removeUndefined);
  if (typeof obj === 'object') {
    const out: any = {};
    Object.entries(obj).forEach(([k, v]) => {
      if (v === undefined) return;
      out[k] = removeUndefined(v);
    });
    return out;
  }
  return obj;
};

router.use(requireUser);

router.get('/records', async (req, res) => {
  try {
    const userId = (req as any).userId as string;
    const snap = await recordCollection(userId).get();
    const items = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
    res.json(items);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Fetch records failed' });
  }
});

router.get('/', async (req, res) => {
  try {
    const userId = (req as any).userId as string;
    const snap = await medCollection(userId).get();
    const items = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
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
    const docRef = await medCollection(userId).add({
      ...removeUndefined(data),
      userId,
      startDate: data.startDate ? new Date(data.startDate) : now,
      createdAt: data.createdAt ? new Date(data.createdAt) : now,
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
    await medCollection(userId).doc(id).update({ ...removeUndefined(data), userId });
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
    await medCollection(userId).doc(id).delete();
    // cascade delete records
    const recSnap = await recordCollection(userId).where('medicationId', '==', id).get();
    const batch = db.batch();
    recSnap.docs.forEach((d: any) => batch.delete(d.ref));
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
    const snap = await recordCollection(userId).where('medicationId', '==', id).orderBy('timestamp', 'desc').get();
    const items = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
    res.json(items);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Fetch records failed' });
  }
});

router.post('/:id/records', async (req, res) => {
    // RECORDS ARE NOW LOCAL ONLY. Backend storage disabled for privacy.
    res.status(200).json({ id: 'local-only-no-sync' });
    /*
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
      name: record.name as any,
      timeSlot: record.timeSlot,
      status: record.status,
      medicationId: id,
      userId,
      timestamp: record.timestamp ? new Date(record.timestamp) : new Date(),
    };
    const docRef = await recordCollection(userId).add(rec);
    res.json({ id: docRef.id });
  } catch (err: any) {
    console.error(err);
    res.status(400).json({ error: err.message || 'Create record failed' });
  }
    */
});

export default router;
