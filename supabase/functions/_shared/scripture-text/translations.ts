// Find which Bible translation a passage in a manuscript is from, for the
// credit on its slide ("John 3:16 (NIV)"). The church supplies the words; we
// only read the translation tag the pastor wrote next to them.
//
// Plain code, no AI. Shared by the upload parser (Deno) and the app.

/** Translation codes we recognize, with names a pastor might write out instead. */
export const KNOWN_TRANSLATIONS: Record<string, string[]> = {
  KJV: ["King James Version", "King James"],
  NKJV: ["New King James Version", "New King James"],
  NIV: ["New International Version"],
  NIRV: ["New International Reader's Version"],
  NLT: ["New Living Translation"],
  ESV: ["English Standard Version"],
  CSB: ["Christian Standard Bible"],
  HCSB: ["Holman Christian Standard Bible"],
  NASB: ["New American Standard Bible"],
  NASB95: [],
  NASB1995: [],
  LSB: ["Legacy Standard Bible"],
  NRSV: ["New Revised Standard Version"],
  NRSVUE: [],
  RSV: ["Revised Standard Version"],
  AMP: ["Amplified Bible"],
  AMPC: ["Amplified Bible, Classic Edition"],
  MSG: ["The Message"],
  TPT: ["The Passion Translation"],
  CEV: ["Contemporary English Version"],
  GNT: ["Good News Translation"],
  NCV: ["New Century Version"],
  NET: ["New English Translation"],
  CEB: ["Common English Bible"],
  BSB: ["Berean Standard Bible"],
  LEB: ["Lexham English Bible"],
  TLB: ["The Living Bible"],
  WEB: ["World English Bible"],
  ASV: ["American Standard Version"],
  YLT: ["Young's Literal Translation"],
  NABRE: ["New American Bible, Revised Edition"],
  RVR1960: ["Reina-Valera 1960"],
  NVI: ["Nueva Versión Internacional"],
  NTV: ["Nueva Traducción Viviente"],
  LBLA: ["La Biblia de las Américas"],
};

/** Codes that are also ordinary words, so they only count inside parentheses or brackets. */
const NEEDS_BRACKETS = new Set(["NET", "AMP", "MSG", "WEB", "TLB", "CEV", "LSB"]);

const CODES = Object.keys(KNOWN_TRANSLATIONS).sort((a, b) => b.length - a.length);
const CODE_PATTERN = new RegExp(`(\\(|\\[)?\\b(${CODES.join("|")})\\b(\\)|\\])?`, "g");
const NAME_PATTERNS = Object.entries(KNOWN_TRANSLATIONS).flatMap(([code, names]) =>
  names.map((name) => ({ code, re: new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi") }))
);

export interface TranslationMention {
  code: string;
  index: number;
}

/** Every translation tag in a piece of text, in order. */
export function findTranslationMentions(text: string): TranslationMention[] {
  const found: Array<TranslationMention & { end: number }> = [];
  for (const m of text.matchAll(CODE_PATTERN)) {
    const code = m[2];
    const bracketed = Boolean(m[1] && m[3]);
    if (NEEDS_BRACKETS.has(code) && !bracketed) continue;
    const index = m.index! + (m[1] ? 1 : 0);
    found.push({ code, index, end: index + code.length });
  }
  for (const { code, re } of NAME_PATTERNS) {
    for (const m of text.matchAll(re)) found.push({ code, index: m.index!, end: m.index! + m[0].length });
  }
  // A longer match wins over one inside it ("New King James Version" is NKJV, not also KJV).
  found.sort((a, b) => a.index - b.index || b.end - a.end);
  const kept: typeof found = [];
  for (const f of found) {
    if (kept.some((k) => f.index >= k.index && f.end <= k.end)) continue;
    kept.push(f);
  }
  return kept.map(({ code, index }) => ({ code, index }));
}

const BEFORE = 160;
const AFTER = 120;

/**
 * The translation for the passage at [start, end) in the manuscript: the
 * nearest tag written just before or just after it (the reference line, or a
 * credit right after the verse). Null when there isn't one nearby.
 */
export function detectTranslationNear(manuscript: string, start: number, end: number): string | null {
  const from = Math.max(0, start - BEFORE);
  const to = Math.min(manuscript.length, end + AFTER);
  const before = findTranslationMentions(manuscript.slice(from, start)).map((m) => ({ code: m.code, distance: start - (from + m.index) }));
  const after = findTranslationMentions(manuscript.slice(end, to)).map((m) => ({ code: m.code, distance: m.index }));
  // A tag inside the verse text itself is part of the passage line ("John 3:16 (NIV) For God so loved...").
  const inside = findTranslationMentions(manuscript.slice(start, end)).map((m) => ({ code: m.code, distance: 0 }));
  const all = [...inside, ...before, ...after].sort((a, b) => a.distance - b.distance);
  return all[0]?.code ?? null;
}

/** A translation used for the whole document, when the manuscript names exactly one. */
export function documentTranslation(manuscript: string): string | null {
  const codes = new Set(findTranslationMentions(manuscript).map((m) => m.code));
  return codes.size === 1 ? [...codes][0] : null;
}

/** "niv" -> "NIV"; anything that isn't a plausible code -> null. */
export function normalizeTranslationCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase().replace(/[()[\]\s]/g, "");
  return /^[A-Z0-9]{2,10}$/.test(code) ? code : null;
}
