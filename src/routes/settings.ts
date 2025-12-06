import { Router } from 'express';
import { z } from 'zod';
import { db } from '../services/db';

const router = Router();

const requireUser = (req: any, res: any, next: any) => {
  const userId = (req.headers['x-user-id'] as string) || '';
  if (!userId) return res.status(401).json({ error: 'Missing x-user-id' });
  (req as any).userId = userId;
  next();
};

router.use(requireUser);

router.get('/', async (req, res) => {
  try {
    const userId = (req as any).userId as string;
    const doc = await db.collection('user_settings').doc(userId).get();
    res.json(doc.exists ? doc.data() : {});
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Fetch settings failed' });
  }
});

router.post('/', async (req, res) => {
  try {
    const userId = (req as any).userId as string;
    const payload = z
      .object({
        mealTimes: z
          .object({
            breakfast: z.string().optional(),
            lunch: z.string().optional(),
            dinner: z.string().optional(),
          })
          .optional(),
        emailNotification: z.any().optional(),
      })
      .parse(req.body);
    await db.collection('user_settings').doc(userId).set(payload, { merge: true });
    res.json({ ok: true });
  } catch (err: any) {
    console.error(err);
    res.status(400).json({ error: err.message || 'Update settings failed' });
  }
});

export default router;
