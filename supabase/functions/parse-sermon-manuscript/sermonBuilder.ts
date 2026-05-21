// QUICK BUILD ADDITION — assembles the SermonPresentation['data'] payload used by Sermon Review.

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

  let verseSeq = 0;
  const makeVerseBlock = (verse: ValidatedVerseBlock) => ({
    id: String(now + parsed.points.length + verseSeq++),
    type: "verse" as const,
    title: formatScriptureReferenceForDisplay(verse.reference),
    scriptures: [
      {
        reference: formatScriptureReferenceForDisplay(verse.reference),
        text: verse.text,
        ...(verse.verses ? { verses: verse.verses } : {}),
      },
    ],
  });

  const introVerses: ReturnType<typeof makeVerseBlock>[] = [];
  const versesByPoint = new Map<number, ReturnType<typeof makeVerseBlock>[]>();
  parsed.points.forEach((_, i) => versesByPoint.set(i, []));

  for (const verse of validatedVerses) {
    const idx = verse.point_index;
    if (idx === null || idx < 0 || idx >= parsed.points.length) {
      introVerses.push(makeVerseBlock(verse));
    } else {
      versesByPoint.get(idx)!.push(makeVerseBlock(verse));
    }
  }

  const points: any[] = [...introVerses];
  parsed.points.forEach((point, index) => {
    points.push({
      id: String(now + index),
      type: "point" as const,
      title: point.title,
      scriptures: [],
    });
    points.push(...versesByPoint.get(index)!);
  });

  const versesCount = verseSeq;
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
