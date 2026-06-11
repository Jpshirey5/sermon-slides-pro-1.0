// QUICK BUILD ADDITION — assembles the SermonPresentation['data'] payload used by Sermon Review.
// Subpoints are emitted as additional "point" blocks (same shape as main points) so the
// formData stays byte-compatible with the structured creator, the editor, and exporters.

import type { ParsedManuscript } from "./claudeParser.ts";
import type { ValidatedVerseBlock } from "./scriptureValidator.ts";

interface BuiltSermon {
  sermonId: string;
  title: string;
  series: string | null;
  presentationDate: string;
  formData: any;
  pointsCount: number;
  versesCount: number;
}

function formatScriptureReferenceForDisplay(reference: string): string {
  const normalized = reference.trim().replace(/\s+/g, " ");
  return normalized.replace(/^(\d?\s*)([a-z])/, (_, prefix: string, firstLetter: string) =>
    `${prefix}${firstLetter.toUpperCase()}`,
  );
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function buildSermon(options: {
  parsed: ParsedManuscript;
  validatedVerses: ValidatedVerseBlock[];
  translation: string;
}): BuiltSermon {
  const { parsed, validatedVerses, translation } = options;
  const now = Date.now();
  const date = todayIsoDate();

  let blockSeq = 0;
  const nextId = () => String(now + blockSeq++);

  let versesCount = 0;
  const makeVerseBlock = (verse: ValidatedVerseBlock) => {
    versesCount++;
    return {
      id: nextId(),
      type: "verse" as const,
      title: formatScriptureReferenceForDisplay(verse.reference),
      scriptures: [
        {
          reference: formatScriptureReferenceForDisplay(verse.reference),
          text: verse.text,
          ...(verse.verses ? { verses: verse.verses } : {}),
        },
      ],
    };
  };

  const makePointBlock = (title: string) => ({
    id: nextId(),
    type: "point" as const,
    title,
    scriptures: [],
  });

  // Group verses by (point, subpoint) while preserving document order within each group.
  const introVerses: ValidatedVerseBlock[] = [];
  const byPoint = new Map<number, { direct: ValidatedVerseBlock[]; bySubpoint: Map<number, ValidatedVerseBlock[]> }>();
  parsed.points.forEach((_, i) => byPoint.set(i, { direct: [], bySubpoint: new Map() }));

  for (const verse of validatedVerses) {
    const pIdx = verse.point_index;
    if (pIdx === null || pIdx < 0 || pIdx >= parsed.points.length) {
      introVerses.push(verse);
      continue;
    }
    const group = byPoint.get(pIdx)!;
    const sIdx = verse.subpoint_index;
    if (sIdx === null || sIdx < 0 || sIdx >= parsed.points[pIdx].subpoints.length) {
      group.direct.push(verse);
    } else {
      if (!group.bySubpoint.has(sIdx)) group.bySubpoint.set(sIdx, []);
      group.bySubpoint.get(sIdx)!.push(verse);
    }
  }

  // Document order: intro verses, then per point — point block, its direct verses,
  // then each subpoint block followed by that subpoint's verses.
  const points: any[] = introVerses.map(makeVerseBlock);
  parsed.points.forEach((point, index) => {
    const group = byPoint.get(index)!;
    points.push(makePointBlock(point.title));
    points.push(...group.direct.map(makeVerseBlock));
    point.subpoints.forEach((subpoint, sIdx) => {
      points.push(makePointBlock(subpoint.title));
      const subVerses = group.bySubpoint.get(sIdx) || [];
      points.push(...subVerses.map(makeVerseBlock));
    });
  });

  const pointsCount = parsed.points.length;

  const formData = {
    title: parsed.title,
    series: parsed.series || null,
    date,
    translation,
    verseBreakdown: "verse-by-verse",
    proPresenterMode: false,
    slideStyle: "balanced",
    themeStyle: "clean",
    points,
  };

  return {
    sermonId: crypto.randomUUID(),
    title: parsed.title,
    series: parsed.series,
    presentationDate: date,
    formData,
    pointsCount,
    versesCount,
  };
}
