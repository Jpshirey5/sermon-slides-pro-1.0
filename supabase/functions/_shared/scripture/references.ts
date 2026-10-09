// Scripture references as structured data. Services store these, never text.
//
// The book names and the free-text parser are shared by scripture-lookup, the
// presenter endpoints, and the app (src/lib/scripture-storage.ts). The app's
// picker list in src/lib/bible-books.ts must stay in sync with BOOK_ALIASES.

export interface PassageRef {
  /** USFM book code, for example "JHN". */
  book: string;
  chapter: number;
  verse_start: number;
  /** Inclusive. Omitted or equal to verse_start for a single verse. */
  verse_end?: number | null;
}

/** A reference with verse_end always filled in. */
export interface NormalizedPassage {
  book: string;
  chapter: number;
  verse_start: number;
  verse_end: number;
}

/** The longest chapter (Psalm 119) has 176 verses. */
const MAX_VERSE = 176;
const MAX_CHAPTER = 150;

const BOOK_ALIASES: Record<string, string> = {
  "genesis": "GEN", "gen": "GEN",
  "exodus": "EXO", "exo": "EXO", "ex": "EXO",
  "leviticus": "LEV", "lev": "LEV",
  "numbers": "NUM", "num": "NUM",
  "deuteronomy": "DEU", "deu": "DEU", "deut": "DEU",
  "joshua": "JOS", "jos": "JOS", "josh": "JOS",
  "judges": "JDG", "jdg": "JDG", "judg": "JDG",
  "ruth": "RUT", "rut": "RUT",
  "1 samuel": "1SA", "1samuel": "1SA", "1sam": "1SA", "1 sam": "1SA",
  "2 samuel": "2SA", "2samuel": "2SA", "2sam": "2SA", "2 sam": "2SA",
  "1 kings": "1KI", "1kings": "1KI", "1ki": "1KI", "1 ki": "1KI",
  "2 kings": "2KI", "2kings": "2KI", "2ki": "2KI", "2 ki": "2KI",
  "1 chronicles": "1CH", "1chronicles": "1CH", "1chr": "1CH", "1 chr": "1CH",
  "2 chronicles": "2CH", "2chronicles": "2CH", "2chr": "2CH", "2 chr": "2CH",
  "ezra": "EZR", "ezr": "EZR",
  "nehemiah": "NEH", "neh": "NEH",
  "esther": "EST", "est": "EST",
  "job": "JOB",
  "psalms": "PSA", "psalm": "PSA", "psa": "PSA", "ps": "PSA",
  "proverbs": "PRO", "prov": "PRO", "pro": "PRO",
  "ecclesiastes": "ECC", "ecc": "ECC", "eccl": "ECC",
  "song of solomon": "SNG", "song": "SNG", "sos": "SNG", "sng": "SNG",
  "isaiah": "ISA", "isa": "ISA",
  "jeremiah": "JER", "jer": "JER",
  "lamentations": "LAM", "lam": "LAM",
  "ezekiel": "EZK", "ezk": "EZK", "eze": "EZK",
  "daniel": "DAN", "dan": "DAN",
  "hosea": "HOS", "hos": "HOS",
  "joel": "JOL", "jol": "JOL",
  "amos": "AMO", "amo": "AMO",
  "obadiah": "OBA", "oba": "OBA", "obad": "OBA",
  "jonah": "JON", "jon": "JON",
  "micah": "MIC", "mic": "MIC",
  "nahum": "NAM", "nam": "NAM", "nah": "NAM",
  "habakkuk": "HAB", "hab": "HAB",
  "zephaniah": "ZEP", "zep": "ZEP", "zeph": "ZEP",
  "haggai": "HAG", "hag": "HAG",
  "zechariah": "ZEC", "zec": "ZEC", "zech": "ZEC",
  "malachi": "MAL", "mal": "MAL",
  "matthew": "MAT", "mat": "MAT", "matt": "MAT",
  "mark": "MRK", "mrk": "MRK",
  "luke": "LUK", "luk": "LUK",
  "john": "JHN", "jhn": "JHN", "joh": "JHN",
  "acts": "ACT", "act": "ACT",
  "romans": "ROM", "rom": "ROM",
  "1 corinthians": "1CO", "1corinthians": "1CO", "1cor": "1CO", "1 cor": "1CO",
  "2 corinthians": "2CO", "2corinthians": "2CO", "2cor": "2CO", "2 cor": "2CO",
  "galatians": "GAL", "gal": "GAL",
  "ephesians": "EPH", "eph": "EPH",
  "philippians": "PHP", "php": "PHP", "phil": "PHP",
  "colossians": "COL", "col": "COL",
  "1 thessalonians": "1TH", "1thessalonians": "1TH", "1thess": "1TH", "1 thess": "1TH",
  "2 thessalonians": "2TH", "2thessalonians": "2TH", "2thess": "2TH", "2 thess": "2TH",
  "1 timothy": "1TI", "1timothy": "1TI", "1tim": "1TI", "1 tim": "1TI",
  "2 timothy": "2TI", "2timothy": "2TI", "2tim": "2TI", "2 tim": "2TI",
  "titus": "TIT", "tit": "TIT",
  "philemon": "PHM", "phm": "PHM", "phlm": "PHM",
  "hebrews": "HEB", "heb": "HEB",
  "james": "JAS", "jas": "JAS",
  "1 peter": "1PE", "1peter": "1PE", "1pet": "1PE", "1 pet": "1PE",
  "2 peter": "2PE", "2peter": "2PE", "2pet": "2PE", "2 pet": "2PE",
  "1 john": "1JN", "1john": "1JN", "1jn": "1JN",
  "2 john": "2JN", "2john": "2JN", "2jn": "2JN",
  "3 john": "3JN", "3john": "3JN", "3jn": "3JN",
  "jude": "JUD", "jud": "JUD",
  "revelation": "REV", "rev": "REV", "revelations": "REV",
};

export const BOOK_CODES: ReadonlySet<string> = new Set(Object.values(BOOK_ALIASES));

export function bookCodeFromName(name: string): string | null {
  const key = name.toLowerCase().trim().replace(/\s+/g, " ");
  if (BOOK_ALIASES[key]) return BOOK_ALIASES[key];
  const upper = name.trim().toUpperCase();
  return BOOK_CODES.has(upper) ? upper : null;
}

/**
 * Parse "John 3:16", "1 Cor 13:4-7", "Song of Solomon 2:1". Also tolerates a
 * trailing translation tag like "John 3:16 (NIV)", which is how sermon slides
 * label their reference today. Single chapter only, like the rest of the app.
 */
export function parseReference(text: string): NormalizedPassage | null {
  const normalized = text.trim().replace(/\s+/g, " ").replace(/\s*\([A-Za-z0-9]+\)\s*$/, "");
  const match = normalized.match(/^((?:\d\s*)?[A-Za-z]+(?:\s+[A-Za-z]+)*)\s+(\d+):(\d+)(?:\s*-\s*(\d+))?$/);
  if (!match) return null;
  const book = bookCodeFromName(match[1]);
  if (!book) return null;
  const ref: PassageRef = {
    book,
    chapter: parseInt(match[2], 10),
    verse_start: parseInt(match[3], 10),
    verse_end: match[4] ? parseInt(match[4], 10) : null,
  };
  return validatePassage(ref) ? normalizePassage(ref) : null;
}

/** True when the reference is well formed. Does not check a chapter's real length. */
export function validatePassage(ref: unknown): ref is PassageRef {
  if (!ref || typeof ref !== "object") return false;
  const r = ref as Record<string, unknown>;
  const isInt = (v: unknown, min: number, max: number) =>
    typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
  if (typeof r.book !== "string" || !BOOK_CODES.has(r.book)) return false;
  if (!isInt(r.chapter, 1, MAX_CHAPTER)) return false;
  if (!isInt(r.verse_start, 1, MAX_VERSE)) return false;
  if (r.verse_end !== undefined && r.verse_end !== null) {
    if (!isInt(r.verse_end, 1, MAX_VERSE)) return false;
    if ((r.verse_end as number) < (r.verse_start as number)) return false;
  }
  return true;
}

export function normalizePassage(ref: PassageRef): NormalizedPassage {
  const end = ref.verse_end ?? ref.verse_start;
  return { book: ref.book, chapter: ref.chapter, verse_start: ref.verse_start, verse_end: end };
}

export function verseCount(ref: PassageRef): number {
  const n = normalizePassage(ref);
  return n.verse_end - n.verse_start + 1;
}

/** API.Bible passage id: "JHN.3.16" or "JHN.3.16-JHN.3.18". Also the cache key. */
export function passageId(ref: PassageRef): string {
  const n = normalizePassage(ref);
  const start = `${n.book}.${n.chapter}.${n.verse_start}`;
  return n.verse_end === n.verse_start ? start : `${start}-${n.book}.${n.chapter}.${n.verse_end}`;
}

const BOOK_DISPLAY: Record<string, string> = Object.fromEntries(
  Object.entries(BOOK_ALIASES)
    .filter(([alias]) => alias.length > 3 || alias === "job" || alias === "acts")
    .reduce<[string, string][]>((acc, [alias, code]) => {
      if (!acc.some(([, c]) => c === code)) acc.push([alias, code]);
      return acc;
    }, [])
    .map(([alias, code]) => [code, alias.replace(/(^|\s)([a-z])/g, (_, s, c) => s + c.toUpperCase())]),
);
// "Psalm 23:1", not "Psalms 23:1"; "Song of Solomon", not "Song Of Solomon".
BOOK_DISPLAY.PSA = "Psalm";
BOOK_DISPLAY.SNG = "Song of Solomon";

/** "John 3:16-17". Used on slides next to the text. */
export function formatReference(ref: PassageRef): string {
  const n = normalizePassage(ref);
  const book = BOOK_DISPLAY[n.book] ?? n.book;
  const verses = n.verse_end === n.verse_start ? `${n.verse_start}` : `${n.verse_start}-${n.verse_end}`;
  return `${book} ${n.chapter}:${verses}`;
}
