// Copy scripture out of a pastor's manuscript, word for word.
//
// The AI only says where a passage is: its first few words and its last few
// words. This code finds those words in the manuscript and copies everything
// between them. The slide text is therefore always an exact piece of the
// manuscript. The AI's words are never used as slide text, so a wrong or
// reworded word in what the AI sent can't reach a slide; at worst the passage
// isn't found and the slide is marked "needs scripture".

export interface ManuscriptToken {
  /** Character range in the manuscript. */
  start: number;
  end: number;
  /** Comparison key: lowercase, straight quotes, no surrounding punctuation. */
  key: string;
}

export interface LocatedPassage {
  /** The manuscript's own text for the passage. */
  text: string;
  start: number;
  end: number;
  /** True when the AI's first and last words matched the manuscript exactly. */
  exactMatch: boolean;
}

/** Longest passage we'll copy, in words, so a bad match can't swallow the whole sermon. */
const MAX_PASSAGE_WORDS = 700;
/** Fewest words that must match in a row to trust a match. */
const MIN_RUN = 3;
/** Longest run we look for; anchors are 8 to 12 words. */
const MAX_RUN = 6;

const keyOf = (word: string) =>
  word
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");

/** Split text into words with their positions. Punctuation-only tokens are skipped. */
export function tokenize(text: string): ManuscriptToken[] {
  const tokens: ManuscriptToken[] = [];
  for (const m of text.matchAll(/\S+/g)) {
    const key = keyOf(m[0]);
    if (key) tokens.push({ start: m.index!, end: m.index! + m[0].length, key });
  }
  return tokens;
}

const keysOf = (text: string) => tokenize(text).map((t) => t.key);

function occurrences(tokens: readonly ManuscriptToken[], keys: readonly string[]): number[] {
  const found: number[] = [];
  outer: for (let i = 0; i + keys.length <= tokens.length; i++) {
    for (let j = 0; j < keys.length; j++) if (tokens[i + j].key !== keys[j]) continue outer;
    found.push(i);
  }
  return found;
}

/**
 * Where a run of anchor words begins in the manuscript. Tries the whole
 * anchor first, then shorter runs from inside it, so one wrong or missing word
 * in the anchor doesn't lose the passage. Returns candidate token indexes for
 * the anchor's first word (side "start") or last word (side "end").
 */
function anchorCandidates(tokens: readonly ManuscriptToken[], anchor: readonly string[], side: "start" | "end"): { index: number; exact: boolean }[] {
  if (anchor.length === 0) return [];
  const exact = occurrences(tokens, anchor).map((i) => ({ index: side === "start" ? i : i + anchor.length - 1, exact: true }));
  if (exact.length) return exact;
  if (anchor.length < MIN_RUN) return [];
  const results = new Map<number, { index: number; exact: boolean }>();
  for (let run = Math.min(MAX_RUN, anchor.length - 1); run >= MIN_RUN; run--) {
    // Prefer runs nearest the edge we're anchoring.
    const offsets = Array.from({ length: anchor.length - run + 1 }, (_, i) => i);
    if (side === "end") offsets.reverse();
    for (const offset of offsets) {
      for (const at of occurrences(tokens, anchor.slice(offset, offset + run))) {
        const index = side === "start" ? at - offset : at + (anchor.length - offset) - 1;
        if (index >= 0 && index < tokens.length && !results.has(index)) results.set(index, { index, exact: false });
      }
      // The run nearest the edge is the most reliable; a run further in can be
      // shifted by a word the AI got wrong between it and the edge.
      if (results.size) break;
    }
    if (results.size) break;
  }
  return [...results.values()];
}

/**
 * Find the passage that begins with `firstWords` and ends with `lastWords`.
 * `near` is a character position (for example where the reference is cited);
 * when the words appear more than once, the match closest after it wins.
 */
export function locatePassage(manuscript: string, firstWords: string, lastWords: string, near = 0, tokens = tokenize(manuscript)): LocatedPassage | null {
  const startCands = anchorCandidates(tokens, keysOf(firstWords), "start");
  const endCands = anchorCandidates(tokens, keysOf(lastWords), "end");
  if (!startCands.length || !endCands.length) return null;

  const nearToken = tokens.findIndex((t) => t.start >= near);
  const anchorAt = nearToken < 0 ? tokens.length : nearToken;
  // Closest start at or after the citation, else the closest before it.
  const ranked = [...startCands].sort((a, b) => {
    const da = a.index >= anchorAt ? a.index - anchorAt : (anchorAt - a.index) + tokens.length;
    const db = b.index >= anchorAt ? b.index - anchorAt : (anchorAt - b.index) + tokens.length;
    return da - db;
  });
  for (const s of ranked) {
    const e = endCands
      .filter((c) => c.index >= s.index && c.index - s.index < MAX_PASSAGE_WORDS)
      .sort((a, b) => a.index - b.index)[0];
    if (!e) continue;
    const start = tokens[s.index].start;
    const end = tokens[e.index].end;
    return { text: manuscript.slice(start, end), start, end, exactMatch: s.exact && e.exact };
  }
  return null;
}

/** True when `text` appears in the manuscript exactly (ignoring only spaces and line breaks). */
export function isExactPiece(manuscript: string, text: string): boolean {
  const squash = (s: string) => s.replace(/\s+/g, " ").trim();
  const needle = squash(text);
  return needle.length > 0 && squash(manuscript).includes(needle);
}

/**
 * Plain text from the HTML a Word file turns into, keeping line breaks
 * between paragraphs and list items so verse lines stay on their own lines.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|h[1-6]|div|blockquote|tr)>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

/** Where a reference is cited, searching from `from`. Case and spacing don't matter. Returns -1 if not found. */
export function findCitation(manuscript: string, raw: string, from = 0): number {
  const pattern = raw.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s*");
  if (!pattern) return -1;
  const re = new RegExp(pattern, "gi");
  re.lastIndex = Math.max(0, from);
  const m = re.exec(manuscript);
  return m ? m.index : -1;
}
