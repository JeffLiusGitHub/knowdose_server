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

interface CitationLink {
  label: string;
  url: string;
}

const DAILYMED_HOME = 'https://dailymed.nlm.nih.gov/dailymed/';
const DAILYMED_SEARCH = (query: string) =>
  `https://dailymed.nlm.nih.gov/dailymed/search.cfm?query=${encodeURIComponent(query)}`;
const MEDLINEPLUS_DRUG_INFO = 'https://medlineplus.gov/druginformation.html';
const MEDLINEPLUS_NUTRITION = 'https://medlineplus.gov/nutrition.html';
const FDA_DRUG_INTERACTIONS =
  'https://www.fda.gov/drugs/resources-drugs/drug-interactions-what-you-should-know';
const FDA_DRUG_SAFETY = 'https://www.fda.gov/drugs/drug-safety-and-availability';
const NIH_ODS = 'https://ods.od.nih.gov/';
const CDC_MEDICATION_SAFETY = 'https://www.cdc.gov/medication-safety/about/index.html';

const normalizeMedicationNames = (medicationNames: string[] = []) =>
  [...new Set(medicationNames.map((n) => n.trim()).filter(Boolean))].slice(0, 8);

const dedupeLinks = (links: CitationLink[]) => {
  const seen = new Set<string>();
  return links.filter((link) => {
    if (seen.has(link.url)) return false;
    seen.add(link.url);
    return true;
  });
};

const buildCitationLinks = (
  citationMode: CitationMode,
  medicationNames: string[],
  lang: 'zh' | 'en'
): CitationLink[] => {
  const meds = normalizeMedicationNames(medicationNames);
  const links: CitationLink[] = meds.map((name) => ({
    label: lang === 'zh' ? `DailyMed 搜索：${name}` : `DailyMed Search: ${name}`,
    url: DAILYMED_SEARCH(name),
  }));

  if (citationMode === 'full_report') {
    links.push(
      {
        label:
          lang === 'zh'
            ? 'DailyMed（美国国家医学图书馆）'
            : 'DailyMed (U.S. National Library of Medicine)',
        url: DAILYMED_HOME,
      },
      {
        label: lang === 'zh' ? 'MedlinePlus：药物信息' : 'MedlinePlus: Drug Information',
        url: MEDLINEPLUS_DRUG_INFO,
      },
      {
        label: lang === 'zh' ? 'FDA：药物安全信息' : 'FDA: Drug Safety and Availability',
        url: FDA_DRUG_SAFETY,
      }
    );
  }

  if (citationMode === 'interaction') {
    links.push(
      {
        label:
          lang === 'zh'
            ? 'FDA：药物相互作用须知'
            : 'FDA: Drug Interactions (What You Should Know)',
        url: FDA_DRUG_INTERACTIONS,
      },
      {
        label:
          lang === 'zh'
            ? 'DailyMed（美国国家医学图书馆）'
            : 'DailyMed (U.S. National Library of Medicine)',
        url: DAILYMED_HOME,
      }
    );
  }

  if (citationMode === 'diet') {
    links.push(
      {
        label:
          lang === 'zh'
            ? 'FDA：药物相互作用须知'
            : 'FDA: Drug Interactions (What You Should Know)',
        url: FDA_DRUG_INTERACTIONS,
      },
      {
        label:
          lang === 'zh'
            ? 'NIH ODS：膳食补充剂办公室'
            : 'NIH ODS: Office of Dietary Supplements',
        url: NIH_ODS,
      },
      {
        label: lang === 'zh' ? 'MedlinePlus：营养与饮食' : 'MedlinePlus: Nutrition',
        url: MEDLINEPLUS_NUTRITION,
      },
      {
        label:
          lang === 'zh'
            ? 'DailyMed（美国国家医学图书馆）'
            : 'DailyMed (U.S. National Library of Medicine)',
        url: DAILYMED_HOME,
      }
    );
  }

  if (citationMode === 'weekly_report') {
    links.push(
      {
        label: lang === 'zh' ? 'CDC：用药安全' : 'CDC: Medication Safety',
        url: CDC_MEDICATION_SAFETY,
      },
      {
        label:
          lang === 'zh'
            ? 'DailyMed（美国国家医学图书馆）'
            : 'DailyMed (U.S. National Library of Medicine)',
        url: DAILYMED_HOME,
      }
    );
  }

  if (!links.length) {
    links.push({
      label:
        lang === 'zh'
          ? 'DailyMed（美国国家医学图书馆）'
          : 'DailyMed (U.S. National Library of Medicine)',
      url: DAILYMED_HOME,
    });
  }

  return dedupeLinks(links);
};

const buildCitationInstruction = (
  lang: 'zh' | 'en',
  links: CitationLink[]
) => {
  const linkList = links
    .map((link, idx) => `${idx + 1}. [${link.label}](${link.url})`)
    .join('\n');

  if (lang === 'zh') {
    return `

你必须使用“带引用编号”的输出格式：
1) 所有关键建议句末都要添加引用编号，格式为 [1]、[2]（阿拉伯数字）。
2) 在回答正文最后，必须追加以下两个区块，且它们必须放在最末尾：
### Sources
按数字编号列出可点击 Markdown 链接，格式：1. [来源名称](URL)

### Disclaimer
AI 内容仅供参考，不可替代专业医疗建议。请在调整用药或饮食前咨询医生或药师。

3) 优先使用 DailyMed 搜索链接作为药品事实依据。
4) 只允许使用下方“可用来源”中的链接，不要编造或输出其他来源链接。

可用来源（请原样引用）：
${linkList}
`;
  }

  return `

You must use a citation-number format:
1) Add citation markers at the end of every key recommendation sentence using [1], [2], etc.
2) At the very end of the response, append exactly these two sections:
### Sources
List clickable Markdown links using numeric order, format: 1. [Source Name](URL)

### Disclaimer
AI content is for reference only and is not a substitute for professional medical advice. Consult a doctor or pharmacist before making medication or diet changes.

3) Prioritize DailyMed search links for medication-specific claims.
4) Only use links from the provided source list below. Do not invent or output other source URLs.

Allowed sources (use as-is):
${linkList}
`;
};

const injectFallbackCitationMarkers = (text: string) => {
  if (/\[\d+\]/.test(text)) return text;

  const lines = text.split('\n');
  let inMetaSection = false;

  const withMarkers = lines.map((line) => {
    if (/^###\s*(Sources|来源|Disclaimer|免责声明)\b/i.test(line.trim())) {
      inMetaSection = true;
      return line;
    }
    if (inMetaSection) return line;

    const trimmed = line.trim();
    if (!trimmed) return line;
    if (/^#{1,3}\s/.test(trimmed)) return line;
    if (/^\s*>\s+/.test(line)) return line;

    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      return `${line.trimEnd()} [1]`;
    }

    return `${line.trimEnd()} [1]`;
  });

  return withMarkers.join('\n');
};

const appendSourcesAndDisclaimer = (
  text: string,
  links: CitationLink[],
  lang: 'zh' | 'en'
) => {
  const sourcesHeading = lang === 'zh' ? '### Sources' : '### Sources';
  const disclaimerHeading = lang === 'zh' ? '### Disclaimer' : '### Disclaimer';
  const disclaimerText =
    lang === 'zh'
      ? 'AI 内容仅供参考，不可替代专业医疗建议。请在调整用药或饮食前咨询医生或药师。'
      : 'AI content is for reference only and is not a substitute for professional medical advice. Consult a doctor or pharmacist before making medication or diet changes.';

  const hasSources = /(^|\n)###\s*(Sources|来源)\b/i.test(text);
  const hasDisclaimer = /(^|\n)###\s*(Disclaimer|免责声明)\b/i.test(text);

  let normalized = text.trim();
  if (!hasSources) {
    const sourceLines = links
      .map((link, idx) => `${idx + 1}. [${link.label}](${link.url})`)
      .join('\n');
    normalized = `${normalized}\n\n${sourcesHeading}\n${sourceLines}`;
  }

  if (!hasDisclaimer) {
    normalized = `${normalized}\n\n${disclaimerHeading}\n${disclaimerText}`;
  }

  return normalized;
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
) => {
  const ai = ensureClient();
  const baseSystemPrompt =
    lang === 'zh'
      ? '你是一个专业的医疗助手，请用中文回答，保持专业、客观、简洁。'
      : 'You are a professional medical assistant. Respond in English, professionally and concisely.';

  const citationLinks = options.citationMode
    ? buildCitationLinks(options.citationMode, options.medicationNames || [], lang)
    : [];

  const citationInstruction =
    options.citationMode && citationLinks.length
      ? buildCitationInstruction(lang, citationLinks)
      : '';

  const systemPrompt = `${baseSystemPrompt}${citationInstruction}`;

  const response = await ai.models.generateContent({
    model: MODEL_TEXT,
    contents: userPrompt,
    config: { systemInstruction: systemPrompt },
  });

  let text = response.text || 'No response generated.';
  if (options.citationMode && citationLinks.length) {
    text = injectFallbackCitationMarkers(text);
    text = appendSourcesAndDisclaimer(text, citationLinks, lang);
  }

  return text;
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
