import { GoogleGenAI } from '@google/genai';
import { MealTimes, Medication, LocalizedText } from '../types.js';

const apiKey = process.env.GEMINI_API_KEY || '';

const aiClient = apiKey
  ? new GoogleGenAI({ apiKey })
  : null;

const MODEL_TEXT = 'gemini-2.5-flash';
const MODEL_IMAGE = 'gemini-2.5-flash';

type CitationMode = 'full_report' | 'interaction' | 'diet' | 'weekly_report';

interface TextAiOptions {
  citationMode?: CitationMode;
  medicationNames?: string[];
}

export interface TextAiSourceHints {
  medications: string[];
  foods: string[];
}

export interface TextAiResult {
  text: string;
  sourceHints?: TextAiSourceHints;
}

const MAX_MEDICATION_CONTEXT_NAMES = 4;
const MAX_SOURCE_MEDICATION_HINTS = 3;
const MAX_SOURCE_FOOD_HINTS = 4;

const normalizeMedicationNames = (
  medicationNames: string[] = [],
  limit = MAX_MEDICATION_CONTEXT_NAMES
) =>
  [...new Set(medicationNames.map((n) => n.trim()).filter(Boolean))].slice(0, limit);

const normalizeHintList = (values: unknown, limit: number): string[] => {
  if (!Array.isArray(values)) return [];
  const normalized = values
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean)
    .map((value) =>
      value
        .replace(/\s+/g, ' ')
        .replace(/[。；，、]/g, '')
        .trim()
    );
  return [...new Set(normalized)].slice(0, limit);
};

const stripSourcesSection = (text: string) =>
  text.replace(/(?:\n|^)###\s*(Sources|来源)\b[\s\S]*$/i, '').trim();

const buildSafetyInstruction = (lang: 'zh' | 'en') => {
  if (lang === 'zh') {
    return `

安全要求：不做诊断，不给绝对停药/换药指令；证据不足要明确不确定；涉及严重急症信号时提示立即就医。`;
  }

  return `

Safety: no diagnosis, no absolute stop/switch directives; state uncertainty when evidence is limited; advise urgent care for severe red flags.`;
};

const buildScenarioInstruction = (
  citationMode: CitationMode | undefined,
  medicationNames: string[],
  lang: 'zh' | 'en'
) => {
  if (!citationMode) return '';

  const meds = normalizeMedicationNames(medicationNames, MAX_MEDICATION_CONTEXT_NAMES);
  const medicationContext = meds.length
    ? lang === 'zh'
      ? `药物：${meds.join('、')}。`
      : `Meds: ${meds.join(', ')}.`
    : '';

  if (citationMode === 'interaction') {
    return lang === 'zh'
      ? `

场景：药物相互作用。
${medicationContext}
输出重点相互作用和可执行建议（监测/错开/咨询），不要给高/中/低风险分级；仅讨论相关药物。不要输出 Sources 区块。`
      : `

Task: medication interactions.
${medicationContext}
Provide key interactions and actionable steps (monitor/space/follow-up); do not output high/medium/low risk levels; stay medication-specific. Do not output a Sources section.`;
  }

  if (citationMode === 'diet') {
    return lang === 'zh'
      ? `

场景：饮食与补充剂建议。
${medicationContext}
按“避免/限制/一般可行”分组，给出触发条件和可执行替代/错开时间建议。不要输出 Sources 区块。`
      : `

Task: diet and supplement guidance.
${medicationContext}
Group as "Avoid/Limit/Generally OK" with conditions and practical alternatives/spacing advice. Do not output a Sources section.`;
  }

  if (citationMode === 'weekly_report') {
    return lang === 'zh'
      ? `

场景：周报。
仅基于给定依从性数据给出趋势、风险和改进建议，不臆测缺失指标。`
      : `

Task: weekly adherence report.
Use only provided adherence data for trends, risks, and practical improvements; do not assume missing clinical metrics.`;
  }

  if (citationMode === 'full_report') {
    return lang === 'zh'
      ? `

场景：单药摘要。
覆盖用法、副作用观察、饮食相互作用和储存要点，保持简洁可执行。`
      : `

Task: single-medication summary.
Cover usage, side-effect monitoring, diet interactions, and storage with concise actionable guidance.`;
  }

  return '';
};

const buildStructuredHintInstruction = (
  citationMode: CitationMode,
  lang: 'zh' | 'en'
) => {
  const common = lang === 'zh'
    ? `请只输出严格 JSON（不要 Markdown 代码块），格式：
{
  "answer": "给用户展示的正文回答",
  "sourceHints": {
    "medications": ["英文通用名1", "英文通用名2"],
    "foods": ["英文食物或补充剂通用名1"]
  }
}
要求：
1) answer 不要包含 Sources 或链接。
2) sourceHints 里的名字必须用英文、通用名、便于检索，不要品牌名。
3) 如果不确定就返回空数组。`
    : `Output strict JSON only (no markdown code fences), schema:
{
  "answer": "final user-facing answer",
  "sourceHints": {
    "medications": ["english generic medication name 1", "english generic medication name 2"],
    "foods": ["english food/supplement generic name 1"]
  }
}
Rules:
1) answer must not include a Sources section or links.
2) sourceHints values must be English generic/common searchable names, avoid brand names.
3) Use empty arrays when uncertain.`;

  if (citationMode === 'interaction') {
    return `${common}

${lang === 'zh'
  ? 'interaction 场景：medications 返回 2-3 个最关键相互作用药名；foods 返回空数组。'
  : 'For interaction mode: medications should contain 2-3 key interacting meds; foods should be an empty array.'}`;
  }

  if (citationMode === 'diet') {
    return `${common}

${lang === 'zh'
  ? 'diet 场景：medications 返回核心药名 1-2 个；foods 返回相关食物/饮品/补充剂 1-4 个。'
  : 'For diet mode: medications should contain 1-2 core meds; foods should contain 1-4 relevant foods/drinks/supplements.'}`;
  }

  return common;
};

const parseStructuredResult = (
  rawText: string,
  citationMode: CitationMode
): TextAiResult => {
  const fallbackText = stripSourcesSection(rawText || 'No response generated.');

  try {
    const parsed = JSON.parse(rawText || '{}') as {
      answer?: unknown;
      sourceHints?: {
        medications?: unknown;
        foods?: unknown;
      };
    };

    const text =
      typeof parsed.answer === 'string' && parsed.answer.trim()
        ? stripSourcesSection(parsed.answer.trim())
        : fallbackText;

    const medications = normalizeHintList(
      parsed.sourceHints?.medications,
      MAX_SOURCE_MEDICATION_HINTS
    );
    const foods = normalizeHintList(
      parsed.sourceHints?.foods,
      MAX_SOURCE_FOOD_HINTS
    );

    if (citationMode === 'interaction') {
      return { text, sourceHints: { medications, foods: [] } };
    }

    if (citationMode === 'diet') {
      return { text, sourceHints: { medications, foods } };
    }

    return { text };
  } catch {
    return { text: fallbackText };
  }
};

export const ensureClient = () => {
  if (!aiClient) {
    throw new Error('GEMINI_API_KEY missing; AI unavailable');
  }
  return aiClient;
};

export const performTextAi = async (
  userPrompt: string,
  lang: 'zh' | 'en',
  options: TextAiOptions = {}
): Promise<TextAiResult> => {
  const ai = ensureClient();
  const baseSystemPrompt =
    lang === 'zh'
      ? '你是一个专业的医疗助手，请用中文回答，保持专业、客观、简洁。'
      : 'You are a professional medical assistant. Respond in English, professionally and concisely.';
  const safetyInstruction = buildSafetyInstruction(lang);
  const scenarioInstruction = buildScenarioInstruction(
    options.citationMode,
    options.medicationNames || [],
    lang
  );

  const mode = options.citationMode;
  const requiresHints = mode === 'interaction' || mode === 'diet';

  if (requiresHints && mode) {
    const structuredInstruction = buildStructuredHintInstruction(mode, lang);
    const systemPrompt = `${baseSystemPrompt}${safetyInstruction}${scenarioInstruction}\n\n${structuredInstruction}`;

    const response = await ai.models.generateContent({
      model: MODEL_TEXT,
      contents: userPrompt,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: 'application/json',
      },
    });

    return parseStructuredResult(response.text || '{}', mode);
  }

  const systemPrompt = `${baseSystemPrompt}${safetyInstruction}${scenarioInstruction}`;
  const response = await ai.models.generateContent({
    model: MODEL_TEXT,
    contents: userPrompt,
    config: { systemInstruction: systemPrompt },
  });

  return { text: stripSourcesSection(response.text || 'No response generated.') };
};

export const performAiAnalysis = async (
  base64Image: string,
  lang: 'zh' | 'en',
  mealTimes: MealTimes,
  existingMeds: Medication[],
  imageMimeType: string = 'image/jpeg'
) => {
  const ai = ensureClient();
  const detectMimeFromBase64 = (b64: string): string | null => {
    const head = (b64 || '').slice(0, 64);
    if (head.startsWith('/9j/')) return 'image/jpeg';
    if (head.startsWith('iVBORw0KGgo')) return 'image/png';
    if (head.startsWith('UklGR')) return 'image/webp';
    if (head.startsWith('R0lGOD')) return 'image/gif';
    if (
      head.startsWith('AAAA') &&
      (b64.includes('ZnR5cGhlaWM') || b64.includes('ZnR5cGhlaWY') || b64.includes('ZnR5cG1pZjE'))
    ) {
      return 'image/heic';
    }
    return null;
  };
  const normalizedMime = (imageMimeType || 'image/jpeg').toLowerCase().trim();
  const detectedMime = detectMimeFromBase64(base64Image);
  const allowedMimeTypes = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/heic',
    'image/heif',
  ]);
  const resolvedMimeType =
    (allowedMimeTypes.has(normalizedMime) ? normalizedMime : null) ||
    (detectedMime && allowedMimeTypes.has(detectedMime) ? detectedMime : null) ||
    'image/jpeg';
  const prompt =
    lang === 'zh'
      ? `分析药物标签。用户三餐时间：早餐${mealTimes.breakfast}, 午餐${mealTimes.lunch}, 晚餐${mealTimes.dinner}。现有药物时间：${existingMeds
          .map((m) => `${m.medicationName}: ${m.times?.join(',')}`)
          .join('; ')}。提取 JSON：1.medicationName{zh,en}(简洁，最长30字符) 2.dailyFrequency 3.timingInstruction{zh,en} 4.isVitamin 5.summary(中文) 6.calculatedTimes(['HH:MM',...], 推荐的最佳时间表) 7.dosage(容量/规格, e.g. "500mg") 8.dosageInferred(Boolean,若标签无明显规格则是AI推断的) 9.postMedicationWindow(分钟,整数,无则0. 仅在标签明确提及"服药后x分钟"或有明确且必须的医学限制时填入. 若不确定或无信息则填0) 10.postMedicationWindowInferred(Boolean) 11.safetyInstruction{zh,en}(简短提示"在窗口期内不能做的事"或"必须做的事", 如"不可平卧", "不可进食". 若无窗口期则为空). 12.safetyInstructionInferred(Boolean) 13.scheduleOptions([{label: string, times: string[], reason: string}]). 提供2-3种合理的用药时间方案供选择（例如“标准”、“避开晚餐”等），并解释原因。`
      : `Analyze the medication label image. Meal times: breakfast ${mealTimes.breakfast}, lunch ${mealTimes.lunch}, dinner ${mealTimes.dinner}. Existing meds: ${existingMeds
          .map((m) => `${m.medicationName}: ${m.times?.join(',')}`)
          .join('; ')}. Return JSON fields: medicationName {zh,en} (concise, max 30 chars), dailyFrequency, timingInstruction {zh,en}, isVitamin, summary(English), calculatedTimes ['HH:MM',...](recommended best schedule), dosage(string, e.g. "500mg"), dosageInferred(boolean, true if inferred), postMedicationWindow(minutes, integer, 0 if none. Only include if explicitly stated on label or strictly medically required. If uncertain, return 0.), postMedicationWindowInferred(boolean), safetyInstruction {zh,en} (short warning on what to do/avoid DURING the window, e.g. "Do not lie down", "Do not eat". Empty if no window.), safetyInstructionInferred(boolean), scheduleOptions([{label, times, reason}]). Provide 2-3 valid schedule options considering meals and interactions (e.g. "Standard", "Late Start") with brief reasons.`;

  const response = await ai.models.generateContent({
    model: MODEL_IMAGE,
    contents: {
      parts: [
        { text: prompt },
        {
          inlineData: {
            mimeType: resolvedMimeType,
            data: base64Image,
          },
        },
      ],
    },
    config: { responseMimeType: 'application/json' },
  });

  return response.text || '{}';
};
