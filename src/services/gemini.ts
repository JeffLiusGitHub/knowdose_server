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
          .join('; ')}。提取 JSON：1.medicationName{zh,en} 2.dailyFrequency 3.timingInstruction{zh,en} 4.isVitamin 5.summary(中文) 6.calculatedTimes(['HH:MM',...]) 7.dosage(容量/规格, e.g. "500mg") 8.dosageInferred(Boolean,若标签无明显规格则是AI推断的) 9.postMedicationWindow(分钟,整数,无则0; 例如"服药后30分钟不可进食"则30. 若标签未提及但根据医学常识需要(如某些抗生素),请推断并填入) 10.postMedicationWindowInferred(Boolean,若标签未提及则是AI根据医学常识推断的) 11.safetyInstruction{zh,en}(简短安全提示). 12.safetyInstructionInferred(Boolean,若标签未提及则是AI推断的).`
      : `Analyze the medication label image. Meal times: breakfast ${mealTimes.breakfast}, lunch ${mealTimes.lunch}, dinner ${mealTimes.dinner}. Existing meds: ${existingMeds
          .map((m) => `${m.medicationName}: ${m.times?.join(',')}`)
          .join('; ')}. Return JSON fields: medicationName {zh,en}, dailyFrequency, timingInstruction {zh,en}, isVitamin, summary(English), calculatedTimes ['HH:MM',...], dosage(string, e.g. "500mg"), dosageInferred(boolean, true if inferred/not distinct), postMedicationWindow(minutes, integer, 0 if none. If label missing but medical knowledge suggests it, infer it.), postMedicationWindowInferred(boolean, true if inferred from medical knowledge), safetyInstruction {zh,en} (short warning), safetyInstructionInferred(boolean, true if inferred).`;

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
