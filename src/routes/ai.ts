import { Router } from 'express';
import { z } from 'zod';
import { performTextAi, performAiAnalysis } from '../services/gemini';
import { MealTimes, Medication } from '../types';

const router = Router();

const textSchema = z.object({
  prompt: z.string().min(1),
  lang: z.enum(['zh', 'en']).default('zh'),
});

router.post('/text', async (req, res) => {
  try {
    const { prompt, lang } = textSchema.parse(req.body);
    const text = await performTextAi(prompt, lang);
    res.json({ text });
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
