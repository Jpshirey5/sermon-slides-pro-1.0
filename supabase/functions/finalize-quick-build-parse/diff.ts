// QUICK BUILD LEARNING LOOP — deterministic diff between what the parser extracted
// and what the user actually kept after Sermon Review. No model calls; pure logic
// so it can be unit-tested with `deno test`.

export interface ParsedStructurePoint {
  title: string;
  summary?: string;
  subpoints?: { title: string }[];
}

export interface ParsedStructureRef {
  raw_text?: string;
  book: string;
  chapter: number;
  start_verse: number;
  end_verse?: number | null;
  point_index: number | null;
  subpoint_index?: number | null;
}

export interface ParsedStructure {
  title?: string;
  series?: string | null;
  points: ParsedStructurePoint[];
  scripture_references: ParsedStructureRef[];
}

export type FinalBlock =
  | { type: "point"; title: string }
  | { type: "scripture"; references: string[] };

export interface FinalStructure {
  title?: string;
  series?: string | null;
  blocks: FinalBlock[];
}

export interface StructureDiff {
  points_added: string[];
  points_removed: string[];
  points_retitled: { from: string; to: string }[];
  verses_added: string[];
  verses_removed: string[];
  verses_moved: { reference: string; from_point: number | null; to_point: number | null }[];
  title_changed: boolean;
  series_changed: boolean;
  total_changes: number;
}

const normalize = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const tokenSet = (value: string): Set<string> => new Set(normalize(value).split(" ").filter(Boolean));

/** Jaccard similarity over word tokens; 1 = identical token sets. */
export function titleSimilarity(a: string, b: string): number {
  const setA = tokenSet(a);
  const setB = tokenSet(b);
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const token of setA) if (setB.has(token)) intersection += 1;
  return intersection / (setA.size + setB.size - intersection);
}

const MATCH_THRESHOLD = 0.6;

/** "1 John 3:16-18" → "1 john|3|16"; identity ignores end_verse, mirroring mergeRefs. */
export function refKeyFromString(reference: string): string | null {
  const match = reference.trim().match(/^(.+?)\s+(\d+):(\d+)(?:\s*[-–]\s*\d+(?::\d+)?)?$/);
  if (!match) return null;
  return `${normalize(match[1])}|${Number(match[2])}|${Number(match[3])}`;
}

const refKeyFromParsed = (ref: ParsedStructureRef): string =>
  `${normalize(ref.book)}|${ref.chapter}|${ref.start_verse}`;

const refDisplay = (ref: ParsedStructureRef): string =>
  ref.raw_text ||
  `${ref.book} ${ref.chapter}:${ref.start_verse}${ref.end_verse ? `-${ref.end_verse}` : ""}`;

interface FlatParsedPoint {
  title: string;
  /** Index of the owning MAIN point (subpoints map to their parent). */
  mainPointIndex: number;
}

export function computeStructureDiff(
  parsed: ParsedStructure,
  final: FinalStructure,
): StructureDiff {
  // The review screen shows subpoints as their own point blocks (sermonBuilder emits
  // them that way), so the parsed side flattens points + subpoints for matching.
  const flatParsed: FlatParsedPoint[] = [];
  (parsed.points || []).forEach((point, index) => {
    flatParsed.push({ title: point.title, mainPointIndex: index });
    (point.subpoints || []).forEach((sub) => {
      flatParsed.push({ title: sub.title, mainPointIndex: index });
    });
  });

  const finalBlocks = final.blocks || [];
  const finalPoints: { title: string; blockIndex: number }[] = [];
  finalBlocks.forEach((block, blockIndex) => {
    if (block.type === "point") finalPoints.push({ title: block.title, blockIndex });
  });

  // Greedy best-match: each parsed point claims its most similar unmatched final point.
  const finalMatched = new Array<number>(finalPoints.length).fill(-1);
  const parsedMatched = new Array<number>(flatParsed.length).fill(-1);
  flatParsed.forEach((parsedPoint, parsedIndex) => {
    let bestScore = 0;
    let bestFinal = -1;
    finalPoints.forEach((finalPoint, finalIndex) => {
      if (finalMatched[finalIndex] !== -1) return;
      const score = titleSimilarity(parsedPoint.title, finalPoint.title);
      if (score > bestScore) {
        bestScore = score;
        bestFinal = finalIndex;
      }
    });
    if (bestFinal !== -1 && bestScore >= MATCH_THRESHOLD) {
      finalMatched[bestFinal] = parsedIndex;
      parsedMatched[parsedIndex] = bestFinal;
    }
  });

  const points_removed = flatParsed
    .filter((_, index) => parsedMatched[index] === -1)
    .map((point) => point.title);
  const points_added = finalPoints
    .filter((_, index) => finalMatched[index] === -1)
    .map((point) => point.title);
  const points_retitled = flatParsed.flatMap((point, index) => {
    const finalIndex = parsedMatched[index];
    if (finalIndex === -1) return [];
    const finalTitle = finalPoints[finalIndex].title;
    return normalize(point.title) === normalize(finalTitle)
      ? []
      : [{ from: point.title, to: finalTitle }];
  });

  // Verse placement in the final order: a scripture block belongs to the nearest
  // preceding point block; map that block back to its parsed MAIN point index.
  // Blocks under an added (unmatched) point have unknown parsed placement and are
  // excluded from move detection rather than reported as spurious moves.
  const blockToMainPoint = new Map<number, number | null | undefined>();
  let lastPointContext: number | null | undefined = null; // null = intro, undefined = unknown
  finalBlocks.forEach((block, blockIndex) => {
    if (block.type === "point") {
      const finalPointIndex = finalPoints.findIndex((p) => p.blockIndex === blockIndex);
      const parsedIndex = finalPointIndex >= 0 ? finalMatched[finalPointIndex] : -1;
      lastPointContext = parsedIndex >= 0 ? flatParsed[parsedIndex].mainPointIndex : undefined;
    } else {
      blockToMainPoint.set(blockIndex, lastPointContext);
    }
  });

  const parsedRefs = new Map<string, { display: string; pointIndex: number | null }>();
  (parsed.scripture_references || []).forEach((ref) => {
    const key = refKeyFromParsed(ref);
    if (!parsedRefs.has(key)) {
      parsedRefs.set(key, { display: refDisplay(ref), pointIndex: ref.point_index ?? null });
    }
  });

  const finalRefs = new Map<string, { display: string; pointIndex: number | null | undefined }>();
  finalBlocks.forEach((block, blockIndex) => {
    if (block.type !== "scripture") return;
    const placement = blockToMainPoint.get(blockIndex);
    for (const reference of block.references || []) {
      const key = refKeyFromString(reference);
      if (key && !finalRefs.has(key)) {
        finalRefs.set(key, { display: reference, pointIndex: placement });
      }
    }
  });

  const verses_removed: string[] = [];
  const verses_moved: StructureDiff["verses_moved"] = [];
  for (const [key, parsedRef] of parsedRefs) {
    const finalRef = finalRefs.get(key);
    if (!finalRef) {
      verses_removed.push(parsedRef.display);
      continue;
    }
    if (finalRef.pointIndex !== undefined && finalRef.pointIndex !== parsedRef.pointIndex) {
      verses_moved.push({
        reference: parsedRef.display,
        from_point: parsedRef.pointIndex,
        to_point: finalRef.pointIndex,
      });
    }
  }
  const verses_added = [...finalRefs.entries()]
    .filter(([key]) => !parsedRefs.has(key))
    .map(([, ref]) => ref.display);

  const title_changed = Boolean(
    parsed.title && final.title && normalize(parsed.title) !== normalize(final.title),
  );
  const series_changed = normalize(parsed.series || "") !== normalize(final.series || "");

  const total_changes =
    points_added.length +
    points_removed.length +
    points_retitled.length +
    verses_added.length +
    verses_removed.length +
    verses_moved.length +
    (title_changed ? 1 : 0) +
    (series_changed ? 1 : 0);

  return {
    points_added,
    points_removed,
    points_retitled,
    verses_added,
    verses_removed,
    verses_moved,
    title_changed,
    series_changed,
    total_changes,
  };
}

/**
 * A diff is "meaningful" enough to update the user's format profile when the user
 * made structural corrections (not just cosmetic retitles): the parser missed or
 * over-extracted points, or verses were missing/misplaced.
 */
export function isMeaningfulDiff(diff: StructureDiff): boolean {
  return (
    diff.points_added.length +
      diff.points_removed.length +
      diff.verses_added.length +
      diff.verses_removed.length +
      diff.verses_moved.length >=
    2
  );
}
