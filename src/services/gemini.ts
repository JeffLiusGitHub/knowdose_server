import { GoogleGenAI } from '@google/genai';
import { MealTimes, Medication, LocalizedText } from '../types.js';

const apiKey = process.env.GEMINI_API_KEY || '';

const aiClient = apiKey
  ? new GoogleGenAI({ apiKey })
  : null;

const MODEL_TEXT = 'gemini-2.5-flash';
const MODEL_IMAGE = 'gemini-2.5-flash';

export const ensureClient = () => {
  if (!aiClient) {
    throw new Error('GEMINI_API_KEY missing; AI unavailable');
  }
  return aiClient;
};

export const performTextAi = async (userPrompt: string, lang: 'zh' | 'en') => {
  const ai = ensureClient();
  const systemPrompt =
    lang === 'zh'
      ? '你是一个专业的医疗助手，请用中文回答，保持专业、客观、简洁。'
      : 'You are a professional medical assistant. Respond in English, professionally and concisely.';

  const response = await ai.models.generateContent({
    model: MODEL_TEXT,
    contents: userPrompt,
    config: { systemInstruction: systemPrompt },
  });

  return response.text || 'No response generated.';
};

export const performAiAnalysis = async (
  base64Image: string,
  lang: 'zh' | 'en',
  mealTimes: MealTimes,
  existingMeds: Medication[]
) => {
  const ai = ensureClient();
  const prompt =
    lang === 'zh'
      ? `分析药物标签。用户三餐时间：早餐${mealTimes.breakfast}, 午餐${mealTimes.lunch}, 晚餐${mealTimes.dinner}。现有药物时间：${existingMeds
          .map((m) => `${m.medicationName}: ${m.times?.join(',')}`)
          .join('; ')}。提取 JSON：1.medicationName{zh,en} 2.dailyFrequency 3.timingInstruction{zh,en} 4.isVitamin 5.summary(中文) 6.calculatedTimes(['HH:MM',...]).`
      : `Analyze the medication label image. Meal times: breakfast ${mealTimes.breakfast}, lunch ${mealTimes.lunch}, dinner ${mealTimes.dinner}. Existing meds: ${existingMeds
          .map((m) => `${m.medicationName}: ${m.times?.join(',')}`)
          .join('; ')}. Return JSON fields: medicationName {zh,en}, dailyFrequency, timingInstruction {zh,en}, isVitamin, summary(English), calculatedTimes ['HH:MM',...].`;

  const response = await ai.models.generateContent({
    model: MODEL_IMAGE,
    contents: {
      parts: [
        { text: prompt },
        {
          inlineData: {
            mimeType: 'image/jpeg',
            data: base64Image,
          },
        },
      ],
    },
    config: { responseMimeType: 'application/json' },
  });

  return response.text || '{}';
};
