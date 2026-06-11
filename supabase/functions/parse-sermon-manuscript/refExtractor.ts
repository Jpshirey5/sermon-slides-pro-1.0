// QUICK BUILD ADDITION — deterministic regex backstop for scripture references.
// Scripture citations follow rigid patterns, so a regex pass over the document text
// catches any reference the model missed. Regex-only refs get point_index null
// (they land as intro verses) — imperfect placement, but never silently absent.

import type { ParsedScriptureRef } from "./claudeParser.ts";

// Maps recognized book spellings/abbreviations (lowercase) to canonical names.
const BOOK_ALIASES: Record<string, string> = {
  "genesis": "Genesis", "gen": "Genesis",
  "exodus": "Exodus", "exod": "Exodus", "exo": "Exodus", "ex": "Exodus",
  "leviticus": "Leviticus", "lev": "Leviticus",
  "numbers": "Numbers", "num": "Numbers",
  "deuteronomy": "Deuteronomy", "deut": "Deuteronomy",
  "joshua": "Joshua", "josh": "Joshua",
  "judges": "Judges", "judg": "Judges",
  "ruth": "Ruth",
  "1 samuel": "1 Samuel", "1 sam": "1 Samuel", "first samuel": "1 Samuel",
  "2 samuel": "2 Samuel", "2 sam": "2 Samuel", "second samuel": "2 Samuel",
  "1 kings": "1 Kings", "1 kgs": "1 Kings", "first kings": "1 Kings",
  "2 kings": "2 Kings", "2 kgs": "2 Kings", "second kings": "2 Kings",
  "1 chronicles": "1 Chronicles", "1 chr": "1 Chronicles", "1 chron": "1 Chronicles", "first chronicles": "1 Chronicles",
  "2 chronicles": "2 Chronicles", "2 chr": "2 Chronicles", "2 chron": "2 Chronicles", "second chronicles": "2 Chronicles",
  "ezra": "Ezra",
  "nehemiah": "Nehemiah", "neh": "Nehemiah",
  "esther": "Esther", "esth": "Esther",
  "job": "Job",
  "psalms": "Psalms", "psalm": "Psalms", "psa": "Psalms", "ps": "Psalms",
  "proverbs": "Proverbs", "prov": "Proverbs",
  "ecclesiastes": "Ecclesiastes", "eccl": "Ecclesiastes", "ecc": "Ecclesiastes",
  "song of solomon": "Song of Solomon", "song of songs": "Song of Solomon", "song": "Song of Solomon",
  "isaiah": "Isaiah", "isa": "Isaiah",
  "jeremiah": "Jeremiah", "jer": "Jeremiah",
  "lamentations": "Lamentations", "lam": "Lamentations",
  "ezekiel": "Ezekiel", "ezek": "Ezekiel",
  "daniel": "Daniel", "dan": "Daniel",
  "hosea": "Hosea", "hos": "Hosea",
  "joel": "Joel",
  "amos": "Amos",
  "obadiah": "Obadiah", "obad": "Obadiah",
  "jonah": "Jonah",
  "micah": "Micah", "mic": "Micah",
  "nahum": "Nahum", "nah": "Nahum",
  "habakkuk": "Habakkuk", "hab": "Habakkuk",
  "zephaniah": "Zephaniah", "zeph": "Zephaniah",
  "haggai": "Haggai", "hag": "Haggai",
  "zechariah": "Zechariah", "zech": "Zechariah",
  "malachi": "Malachi", "mal": "Malachi",
  "matthew": "Matthew", "matt": "Matthew", "mat": "Matthew",
  "mark": "Mark", "mrk": "Mark",
  "luke": "Luke", "luk": "Luke",
  "john": "John", "jhn": "John",
  "acts": "Acts",
  "romans": "Romans", "rom": "Romans",
  "1 corinthians": "1 Corinthians", "1 cor": "1 Corinthians", "first corinthians": "1 Corinthians",
  "2 corinthians": "2 Corinthians", "2 cor": "2 Corinthians", "second corinthians": "2 Corinthians",
  "galatians": "Galatians", "gal": "Galatians",
  "ephesians": "Ephesians", "eph": "Ephesians",
  "philippians": "Philippians", "phil": "Philippians", "php": "Philippians",
  "colossians": "Colossians", "col": "Colossians",
  "1 thessalonians": "1 Thessalonians", "1 thess": "1 Thessalonians", "first thessalonians": "1 Thessalonians",
  "2 thessalonians": "2 Thessalonians", "2 thess": "2 Thessalonians", "second thessalonians": "2 Thessalonians",
  "1 timothy": "1 Timothy", "1 tim": "1 Timothy", "first timothy": "1 Timothy",
  "2 timothy": "2 Timothy", "2 tim": "2 Timothy", "second timothy": "2 Timothy",
  "titus": "Titus",
  "philemon": "Philemon", "phlm": "Philemon",
  "hebrews": "Hebrews", "heb": "Hebrews",
  "james": "James", "jas": "James",
  "1 peter": "1 Peter", "1 pet": "1 Peter", "first peter": "1 Peter",
  "2 peter": "2 Peter", "2 pet": "2 Peter", "second peter": "2 Peter",
  "1 john": "1 John", "1 jn": "1 John", "first john": "1 John",
  "2 john": "2 John", "2 jn": "2 John", "second john": "2 John",
  "3 john": "3 John", "3 jn": "3 John", "third john": "3 John",
  "jude": "Jude",
  "revelation": "Revelation", "rev": "Revelation",
};

// Longest aliases first so e.g. "1 corinthians" wins over "corinthians"-less matches.
const BOOK_PATTERN = Object.keys(BOOK_ALIASES)
  .sort((a, b) => b.length - a.length)
  .map((alias) => alias.replace(/\s+/g, "\\s+"))
  .join("|");

// book chapter:verse, optionally ranged: "-endVerse" (same chapter) or
// "-endChapter:endVerse" (cross-chapter, e.g. "1 John 1:5-2:2"). Requires the
// chapter:verse form so prose like "John 3" alone or "Psalm 23" without a verse
// is not extracted (matches the model prompt's rule of explicit citations only).
// Groups: 1=book, 2=chapter, 3=startVerse, 4=endChapter (cross-chapter only), 5=endVerse
const REF_REGEX = new RegExp(
  `\\b(${BOOK_PATTERN})\\.?\\s+(\\d{1,3})\\s*:\\s*(\\d{1,3})(?:\\s*[-–]\\s*(?:(\\d{1,3})\\s*:\\s*)?(\\d{1,3}))?\\b`,
  "gi",
);

export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ");
}

export function extractRefsFromText(text: string): ParsedScriptureRef[] {
  const refs: ParsedScriptureRef[] = [];
  for (const match of text.matchAll(REF_REGEX)) {
    const aliasKey = match[1].toLowerCase().replace(/\s+/g, " ").trim();
    const book = BOOK_ALIASES[aliasKey];
    if (!book) continue;
    const chapter = parseInt(match[2], 10);
    const startVerse = parseInt(match[3], 10);
    const endChapter = match[4] ? parseInt(match[4], 10) : null;
    let endVerse = match[5] ? parseInt(match[5], 10) : null;
    if (!chapter || !startVerse) continue;

    const rawText = match[0].trim();
    const baseRef = {
      raw_text: rawText,
      book,
      point_index: null,
      subpoint_index: null,
    };

    if (endChapter !== null && endChapter > chapter && endVerse !== null) {
      // Cross-chapter citation (e.g. "1 John 1:5-2:2"). The backstop can't know
      // where the first chapter ends, so it anchors both ends of the span:
      // the start verse, and the closing chapter's range. If the model already
      // extracted the citation (the normal case), these dedupe away in mergeRefs.
      refs.push({ ...baseRef, chapter, start_verse: startVerse, end_verse: null });
      refs.push({
        ...baseRef,
        chapter: endChapter,
        start_verse: 1,
        end_verse: endVerse > 1 ? endVerse : null,
      });
      continue;
    }

    if (endVerse !== null && endVerse <= startVerse) endVerse = null;
    refs.push({ ...baseRef, chapter, start_verse: startVerse, end_verse: endVerse });
  }
  return refs;
}

const refKey = (r: ParsedScriptureRef) =>
  `${r.book.toLowerCase()}|${r.chapter}|${r.start_verse}`;

// Union of model refs and regex refs, model refs winning (they carry point placement).
// Dedupe on book/chapter/start_verse so a range variant ("3:16" vs "3:16-17") of an
// already-captured passage doesn't create a near-duplicate verse block.
export function mergeRefs(
  modelRefs: ParsedScriptureRef[],
  regexRefs: ParsedScriptureRef[],
): ParsedScriptureRef[] {
  const seen = new Set(modelRefs.map(refKey));
  const merged = [...modelRefs];
  for (const ref of regexRefs) {
    const key = refKey(ref);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(ref);
  }
  return merged;
}
