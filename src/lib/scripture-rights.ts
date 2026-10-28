// Which verse text Sermon Slide Pro may fill in, and which may go into an
// exported file.
//
// Public domain translations (KJV, WEB, ASV) have no copyright: the app fills
// them in and they export freely. Copyrighted translations (NIV, ESV, CSB,
// NKJV, and the rest) come from the church: the pastor pastes the verse or
// includes it in the manuscript. Text the app looked up for a copyrighted
// translation in the past stays visible in the editor but never goes into an
// export until the church pastes its own.

import type { SlideData } from "@/lib/export-pptx";

export const PUBLIC_DOMAIN_TRANSLATIONS = new Set(["KJV", "WEB", "ASV"]);

/** Where a verse's words came from: the church (pasted or in the manuscript), or an app lookup. */
export type ScriptureSource = "church" | "lookup";

export const isPublicDomain = (translation: string | null | undefined): boolean =>
  PUBLIC_DOMAIN_TRANSLATIONS.has((translation ?? "").trim().toUpperCase());

/** "John 3:16 (NIV)" -> "NIV". */
export function translationOfReference(reference: string | undefined): string | null {
  const m = (reference ?? "").match(/\(([A-Za-z0-9]{2,10})\)\s*$/);
  return m ? m[1].toUpperCase() : null;
}

/** Text that may go into an exported file: public domain, or words the church supplied. */
export function canExportScriptureText(translation: string | null | undefined, source: ScriptureSource | undefined): boolean {
  return isPublicDomain(translation) || source === "church";
}

export const PASTE_PLACEHOLDER = "Paste the verse here.";

/** A scripture slide whose words can't be exported yet: no text, or copyrighted text the app looked up. */
export function needsChurchScripture(slide: SlideData): boolean {
  if (slide.type !== "scripture") return false;
  const text = (slide.content.scripture ?? "").trim();
  if (!text || text === PASTE_PLACEHOLDER) return true;
  return !canExportScriptureText(translationOfReference(slide.content.reference), slide.content.scriptureSource);
}

/**
 * Slides as they may be exported: scripture slides that need the church's
 * words keep their reference (with its translation) and get a placeholder
 * instead of the text. Returns how many slides were held back.
 */
export function slidesForExport(slides: readonly SlideData[]): { slides: SlideData[]; needPasting: number } {
  let needPasting = 0;
  const out = slides.map((slide) => {
    if (!needsChurchScripture(slide)) return slide;
    needPasting++;
    return { ...slide, content: { ...slide.content, scripture: PASTE_PLACEHOLDER } };
  });
  return { slides: out, needPasting };
}
