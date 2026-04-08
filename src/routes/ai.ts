import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { performTextAi, performAiAnalysis } from '../services/gemini.js';
import { MealTimes, Medication } from '../types.js';
import { verifyJWTMiddleware } from '../services/jwt.js';

const router = Router();
router.use(verifyJWTMiddleware);

// Anti-abuse limiter: max 3 AI requests per minute per user (fallback to IP).
const aiBurstLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => {
    if (req.userId) return `user:${req.userId}`;
    const rawIp = req.ip || req.socket?.remoteAddress || 'unknown';
    return `ip:${rawIp}`;
  },
  message: {
    error: 'Too many AI requests. Please wait one minute and try again.',
  },
});

router.use(aiBurstLimiter);

const textSchema = z.object({
  prompt: z.string().min(1),
  lang: z.enum(['zh', 'en']).default('zh'),
  citationMode: z
    .enum(['full_report', 'interaction', 'diet', 'weekly_report'])
    .optional(),
  medicationNames: z.array(z.string().min(1)).max(20).default([]),
});

router.post('/text', async (req, res) => {
  try {
    const { prompt, lang, citationMode, medicationNames } = textSchema.parse(req.body);
    const result = await performTextAi(prompt, lang, { citationMode, medicationNames });
    res.json(result);
  } catch (err: any) {
    console.error(err);
    res.status(400).json({ error: err.message || 'AI text error' });
  }
});

const analyzeSchema = z.object({
  imageBase64: z.string().min(10),
  lang: z.enum(['zh', 'en']).default('zh'),
  mealTimes: z.object({
    breakfast: z.string().default('08:00'),
    lunch: z.string().default('12:00'),
    dinner: z.string().default('18:00'),
  }) as z.ZodType<MealTimes>,
  existingMeds: z.array(z.any()).default([]) as z.ZodType<Medication[]>,
});

router.post('/analyze-image', async (req, res) => {
  try {
    const payload = analyzeSchema.parse(req.body);
    const json = await performAiAnalysis(
      payload.imageBase64,
      payload.lang,
      payload.mealTimes,
      payload.existingMeds
    );
    res.json({ result: json });
  } catch (err: any) {
    console.error(err);
    res.status(400).json({ error: err.message || 'AI analysis error' });
  }
});

export default router;
