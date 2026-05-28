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

// Translations that are license-restricted and only available to entitled
// organizations (see accounts.can_use_esv). Codes are compared upper-cased.
export const RESTRICTED_TRANSLATIONS = new Set(["ESV"]);

export const isTranslationAllowed = (code: string | null | undefined, canUseEsv: boolean): boolean => {
  if (!code) return true;
  if (canUseEsv) return true;
  return !RESTRICTED_TRANSLATIONS.has(code.toUpperCase());
};

// The translation list a given user may pick from. Restricted translations are
// dropped unless the user's org is entitled to them.
export const getAvailableTranslations = (canUseEsv: boolean): TranslationOption[] =>
  canUseEsv
    ? TRANSLATION_OPTIONS
    : TRANSLATION_OPTIONS.filter((t) => !RESTRICTED_TRANSLATIONS.has(t.code.toUpperCase()));
