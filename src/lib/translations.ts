export interface TranslationOption {
  code: string;
  name: string;
  language: string;
}

export const TRANSLATION_OPTIONS: TranslationOption[] = [
  { code: "KJV", name: "King James Version", language: "English" },
  { code: "NKJV", name: "New King James Version", language: "English" },
  { code: "NIV", name: "New International Version", language: "English" },
  { code: "CSB", name: "Christian Standard Bible", language: "English" },
  { code: "ESV", name: "English Standard Version", language: "English" },
  { code: "WEB", name: "World English Bible", language: "English" },
  { code: "ASV", name: "American Standard Version", language: "English" },
  { code: "AMP", name: "Amplified Bible", language: "English" },
  { code: "RVR1960", name: "Reina-Valera 1960", language: "Spanish" },
  { code: "NVI", name: "Nueva Versión Internacional", language: "Spanish" },
  { code: "LSG", name: "Louis Segond", language: "French" },
  { code: "LUT", name: "Luther Bible", language: "German" },
  { code: "ALMEIDA", name: "Almeida Revisada", language: "Portuguese" },
];

export const DEFAULT_TRANSLATION = "KJV";
