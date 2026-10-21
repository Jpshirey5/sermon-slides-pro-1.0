// Turn a whole pasted song, or a lyrics file a church downloaded from
// SongSelect under its own CCLI license, into song sections. Section labels
// like "Verse 1", "Chorus", or "[Bridge]" start a new section; a blank line
// inside a section starts a new slide. SongSelect's footer (CCLI song number,
// authors, copyright, license lines) fills in the song details and is never
// shown as lyrics.

export interface ImportedSection {
  label: string;
  lyrics: string;
}

export interface ImportedSong {
  title: string;
  author: string;
  ccliSongNumber: string;
  copyright: string;
  sections: ImportedSection[];
  /** Section indexes in singing order, when a section repeats in the text. Empty means "as listed". */
  arrangement: number[];
  /** The text looked like a SongSelect lyrics file. */
  fromSongSelect: boolean;
}

export const MAX_SONG_TEXT = 20_000;

const SECTION_WORDS =
  "verse|chorus|pre-?chorus|bridge|tag|intro|outro|ending|interlude|refrain|instrumental|vamp|turnaround|coda|misc(?:ellaneous)?|hook|post-?chorus";
const LABEL = new RegExp(`^\\[?\\s*((?:${SECTION_WORDS})(?:\\s*\\d+[a-z]?)?)\\s*\\]?\\s*:?$`, "i");
const SHORT_LABEL = /^\[?\s*(v\d+|c\d*|pc\d*|b\d*)\s*\]?\s*:?$/i;
const SHORT_NAMES: Record<string, string> = { v: "Verse", c: "Chorus", pc: "Pre-chorus", b: "Bridge" };

const CCLI_SONG = /^ccli\s*song\s*(?:#|no\.?|number)?\s*:?\s*(\d{1,12})/i;
const COPYRIGHT = /^(?:©|\(c\)|copyright\b)/i;
const SONGSELECT_TERMS = /songselect|www\.ccli\.com|terms of use|all rights reserved/i;
const CCLI_LICENSE = /^ccli\s*licen[cs]e/i;

function labelOf(line: string): string | null {
  const t = line.trim();
  if (!t || t.length > 30) return null;
  const long = t.match(LABEL);
  if (long) return tidyLabel(long[1]);
  const short = t.match(SHORT_LABEL);
  if (short) {
    const [, code] = short;
    const letters = code.replace(/\d+/g, "").toLowerCase();
    const number = code.replace(/\D+/g, "");
    return `${SHORT_NAMES[letters]}${number ? ` ${number}` : ""}`;
  }
  return null;
}

function tidyLabel(raw: string): string {
  const spaced = raw.replace(/\s+/g, " ").replace(/^(\D+?)(\d)/, "$1 $2").replace(/\s+/g, " ").trim();
  const lower = spaced.toLowerCase().replace(/^pre ?-?chorus/, "pre-chorus").replace(/^post ?-?chorus/, "post-chorus");
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

const normalize = (text: string) => text.replace(/\r\n?/g, "\n").replace(/\u00a0/g, " ").replace(/[ \t]+$/gm, "");
const trimBlankLines = (text: string) => text.replace(/^\s*\n/, "").replace(/\n\s*$/, "").replace(/\n{3,}/g, "\n\n").trim();

/** Read a whole song. Returns null when there are no lyrics in it. */
export function parseSongText(input: string): ImportedSong | null {
  const lines = normalize(input.slice(0, MAX_SONG_TEXT)).split("\n");

  // ── footer: everything from the CCLI song number down, plus any license or terms lines ──
  let footerStart = lines.findIndex((l) => CCLI_SONG.test(l.trim()));
  const footer: string[] = [];
  if (footerStart >= 0) {
    footer.push(...lines.slice(footerStart));
    lines.length = footerStart;
  } else {
    footerStart = lines.length;
  }
  // Copyright and license lines at the very end, even without a CCLI song number.
  while (lines.length) {
    const last = lines[lines.length - 1].trim();
    if (!last || COPYRIGHT.test(last) || SONGSELECT_TERMS.test(last) || CCLI_LICENSE.test(last)) {
      if (last) footer.unshift(last);
      lines.pop();
    } else break;
  }

  let ccliSongNumber = "";
  let copyright = "";
  let author = "";
  for (const raw of footer) {
    const line = raw.trim();
    if (!line) continue;
    const ccli = line.match(CCLI_SONG);
    if (ccli) ccliSongNumber = ccli[1];
    else if (COPYRIGHT.test(line)) copyright = copyright || line.replace(/^(?:©|\(c\)|copyright)\s*/i, "").trim();
    else if (SONGSELECT_TERMS.test(line) || CCLI_LICENSE.test(line)) continue;
    else if (!author) author = line.split("|").map((a) => a.trim()).filter(Boolean).join(", ");
  }

  // ── title: a first line followed by a section label (SongSelect puts the title on top) ──
  let title = "";
  const firstText = lines.findIndex((l) => l.trim());
  if (firstText >= 0 && !labelOf(lines[firstText])) {
    const nextText = lines.findIndex((l, i) => i > firstText && l.trim());
    if (nextText >= 0 && labelOf(lines[nextText]) && lines[firstText].trim().length <= 160) {
      title = lines[firstText].trim();
      lines.splice(firstText, 1);
    }
  }

  // ── sections ──
  const found: ImportedSection[] = [];
  let current: { label: string | null; body: string[] } = { label: null, body: [] };
  const flush = () => {
    const lyrics = trimBlankLines(current.body.join("\n"));
    if (lyrics) found.push({ label: current.label ?? "", lyrics });
    else if (current.label) found.push({ label: current.label, lyrics: "" });
  };
  for (const line of lines) {
    const label = labelOf(line);
    if (label) {
      flush();
      current = { label, body: [] };
    } else {
      current.body.push(line);
    }
  }
  flush();

  const withLyrics = found.filter((s) => s.lyrics);
  if (withLyrics.length === 0) return null;
  const labeled = found.some((s) => s.label);
  if (!labeled) {
    return { title, author, ccliSongNumber, copyright, sections: [{ label: "Lyrics", lyrics: withLyrics.map((s) => s.lyrics).join("\n\n") }], arrangement: [], fromSongSelect: Boolean(ccliSongNumber) };
  }

  // A repeated section with the same words is sung again: list it once and put the repeat in the arrangement.
  // An empty repeat ("Chorus" on its own line) means "sing the chorus again".
  const sections: ImportedSection[] = [];
  const order: number[] = [];
  for (const s of found) {
    const label = s.label || "Verse";
    const sameLabel = sections.findIndex((x) => x.label === label);
    if (sameLabel >= 0 && (!s.lyrics || sections[sameLabel].lyrics === s.lyrics)) {
      order.push(sameLabel);
      continue;
    }
    if (!s.lyrics) continue;
    let unique = label;
    for (let n = 2; sections.some((x) => x.label === unique); n++) unique = `${label} (${n})`;
    sections.push({ label: unique, lyrics: s.lyrics });
    order.push(sections.length - 1);
  }
  const repeats = order.length !== sections.length || order.some((v, i) => v !== i);

  return {
    title,
    author,
    ccliSongNumber,
    copyright,
    sections,
    arrangement: repeats ? order : [],
    fromSongSelect: Boolean(ccliSongNumber) && footer.some((l) => SONGSELECT_TERMS.test(l) || CCLI_LICENSE.test(l)),
  };
}
