// Pull each verse's text out of the pastor's manuscript, word for word.
//
// Claude reports where a passage's words are (its first and last words) and
// any translation label beside it. This code finds those words in the
// manuscript and copies the manuscript's own text, so every verse on a slide
// is an exact piece of what the pastor wrote. The AI never supplies the words.

import type { ParsedScriptureRef, VerseTextLocation } from "./claudeParser.ts";
import { parseRawReference } from "./refExtractor.ts";
import { documentTranslation, detectTranslationNear, findTranslationMentions, normalizeTranslationCode } from "../_shared/scripture-text/translations.ts";
import { findCitation, isExactPiece, locatePassage, tokenize } from "../_shared/scripture-text/verbatim.ts";

export interface PulledVerse {
  text: string;
  translation: string;
  /** The AI's first and last words matched the manuscript exactly. */
  exactMatch: boolean;
}

const sameRef = (a: ParsedScriptureRef, b: ParsedScriptureRef) =>
  a.book === b.book && a.chapter === b.chapter && a.start_verse === b.start_verse && (a.end_verse ?? a.start_verse) === (b.end_verse ?? b.start_verse);

/** The location a reference's text is at: same passage, or a written-out passage that starts with it. */
function locationFor(ref: ParsedScriptureRef, locations: { loc: VerseTextLocation; refs: ParsedScriptureRef[] }[]) {
  return locations.find((l) => l.refs.some((r) => sameRef(r, ref))) ??
    locations.find((l) => l.refs[0] && l.refs[0].book === ref.book && l.refs[0].chapter === ref.chapter && l.refs[0].start_verse === ref.start_verse);
}

/**
 * For each reference (by index), the verse text copied from the manuscript and
 * its translation. References whose text isn't written out, or can't be found
 * exactly, are left out; the caller looks up public domain ones or marks them
 * "needs scripture".
 */
export function pullVersesFromManuscript(options: {
  manuscript: string;
  refs: readonly ParsedScriptureRef[];
  verseTexts: readonly VerseTextLocation[];
  /** Used when no translation is written near the passage or for the whole document. */
  fallbackTranslation: string;
}): Map<number, PulledVerse> {
  const { manuscript, refs, verseTexts, fallbackTranslation } = options;
  const pulled = new Map<number, PulledVerse>();
  if (!manuscript.trim() || verseTexts.length === 0) return pulled;

  const tokens = tokenize(manuscript);
  const wholeDocument = documentTranslation(manuscript);
  const locations = verseTexts.map((loc) => ({ loc, refs: parseRawReference(loc.reference) }));
  const used = new Set<VerseTextLocation>();
  let cursor = 0;

  refs.forEach((ref, index) => {
    const match = locationFor(ref, locations.filter((l) => !used.has(l.loc)));
    if (!match) return;
    const cited = findCitation(manuscript, ref.raw_text, cursor);
    const near = cited >= 0 ? cited : cursor;
    const found = locatePassage(manuscript, match.loc.first_words, match.loc.last_words, near, tokens);
    // Every verse must be an exact piece of the manuscript. locatePassage only ever
    // returns a slice of it; the check is a guard against future changes.
    if (!found || !isExactPiece(manuscript, found.text)) return;
    used.add(match.loc);
    cursor = found.end;
    const translation =
      detectTranslationNear(manuscript, found.start, found.end) ??
      (match.loc.translation ? findTranslationMentions(match.loc.translation)[0]?.code ?? normalizeTranslationCode(match.loc.translation) : null) ??
      wholeDocument ??
      fallbackTranslation;
    pulled.set(index, { text: found.text.trim(), translation, exactMatch: found.exactMatch });
  });
  return pulled;
}
