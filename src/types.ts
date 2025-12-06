export type Language = 'zh' | 'en';

export interface MealTimes {
  breakfast: string;
  lunch: string;
  dinner: string;
}

export interface LocalizedText {
  zh?: string;
  en?: string;
}

export interface Medication {
  id?: string;
  userId: string;
  medicationName: LocalizedText | string;
  timingInstruction?: LocalizedText | string;
  dailyFrequency?: number;
  duration?: number | string;
  category?: string;
  times?: string[];
  coverImage?: string;
  summary?: LocalizedText | string;
  customSchedules?: Record<string, string[]>;
  startDate?: Date;
  createdAt?: Date;
}

export interface RecordItem {
  id?: string;
  userId: string;
  medicationId: string;
  name: LocalizedText | string;
  timeSlot: string;
  status: string;
  timestamp: Date;
}
