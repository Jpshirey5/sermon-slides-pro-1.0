// deno test -A --no-lock --node-modules-dir=none supabase/functions/parse-sermon-manuscript/manuscriptVerses_test.ts

import { pullVersesFromManuscript } from "./manuscriptVerses.ts";
import { buildSermon } from "./sermonBuilder.ts";
import type { ParsedScriptureRef } from "./claudeParser.ts";

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

// Made-up verse wording: these tests check copying, not any real translation.
const MANUSCRIPT = `Hope Holds

1. God moves first
John 3:16 (NIV)
"For the Maker so loved every nation that he sent the only Son, that whoever trusts him will not be lost but will live forever."

2. Light wins
Romans 8:28
We'll read this one together on screen.

3. Rest is near
Psalm 23:1 NLT
The Lord is my shepherd guide; I have every single thing I need today.`;

const ref = (raw: string, book: string, chapter: number, start: number, end: number | null, point: number): ParsedScriptureRef => ({
  raw_text: raw, book, chapter, start_verse: start, end_verse: end, point_index: point, subpoint_index: null,
});
const REFS = [ref("John 3:16", "John", 3, 16, null, 0), ref("Romans 8:28", "Romans", 8, 28, null, 1), ref("Psalm 23:1", "Psalms", 23, 1, null, 2)];
const JOHN = `"For the Maker so loved every nation that he sent the only Son, that whoever trusts him will not be lost but will live forever."`;

Deno.test("full verse text in the manuscript: exact words, with the translation written beside it", () => {
  const pulled = pullVersesFromManuscript({
    manuscript: MANUSCRIPT,
    refs: REFS,
    verseTexts: [
      { reference: "John 3:16", first_words: `"For the Maker so loved every nation that he`, last_words: "will not be lost but will live forever.\"", translation: "NIV" },
      { reference: "Psalm 23:1", first_words: "The Lord is my shepherd guide; I have", last_words: "I have every single thing I need today.", translation: "New Living Translation" },
    ],
    fallbackTranslation: "KJV",
  });
  eq(pulled.get(0), { text: JOHN, translation: "NIV", exactMatch: true }, "John");
  eq(pulled.get(2)?.translation, "NLT", "Psalm translation");
  eq(pulled.get(2)?.text, "The Lord is my shepherd guide; I have every single thing I need today.", "Psalm text");
});

Deno.test("the AI's words differ from the manuscript by one word: the manuscript's words are used", () => {
  const pulled = pullVersesFromManuscript({
    manuscript: MANUSCRIPT,
    refs: REFS,
    verseTexts: [{ reference: "John 3:16", first_words: `"For the Maker so loved the world that he`, last_words: "will not perish but will live forever.\"", translation: null }],
    fallbackTranslation: "KJV",
  });
  eq(pulled.get(0)?.text, JOHN, "John text");
  eq(pulled.get(0)?.exactMatch, false, "flagged as not exact");
  eq(pulled.get(0)?.translation, "NIV", "translation from the manuscript");
});

Deno.test("words that aren't in the manuscript are never used", () => {
  const pulled = pullVersesFromManuscript({
    manuscript: MANUSCRIPT,
    refs: REFS,
    verseTexts: [{ reference: "Romans 8:28", first_words: "And we know that in all things", last_words: "called according to his purpose.", translation: "NIV" }],
    fallbackTranslation: "KJV",
  });
  eq(pulled.size, 0, "nothing pulled");
});

Deno.test("a reference with no verse text becomes a needs-scripture verse, and the rest of the sermon builds", () => {
  const pulled = pullVersesFromManuscript({
    manuscript: MANUSCRIPT,
    refs: REFS,
    verseTexts: [{ reference: "John 3:16", first_words: `"For the Maker so loved every nation that he`, last_words: "will not be lost but will live forever.\"", translation: "NIV" }],
    fallbackTranslation: "NIV",
  });
  const validated = REFS.map((r, i) => {
    const p = pulled.get(i);
    return p
      ? { reference: `${r.book} ${r.chapter}:${r.start_verse}`, text: p.text, point_index: r.point_index, subpoint_index: null, translation: p.translation, source: "church" as const }
      : { reference: `${r.book} ${r.chapter}:${r.start_verse}`, text: "", point_index: r.point_index, subpoint_index: null, needs_scripture: true };
  });
  const built = buildSermon({
    parsed: { title: "Hope Holds", series: null, points: [{ title: "God moves first", summary: "", subpoints: [] }, { title: "Light wins", summary: "", subpoints: [] }, { title: "Rest is near", summary: "", subpoints: [] }], scripture_references: REFS, verse_texts: [] },
    validatedVerses: validated,
    translation: "NIV",
  });
  const verses = built.formData.points.filter((p: { type: string }) => p.type === "verse").map((p: { scriptures: unknown[] }) => p.scriptures[0]);
  eq(verses[0], { reference: "John 3:16", text: JOHN, source: "church", translation: "NIV" }, "John from the manuscript");
  eq(verses[1], { reference: "Romans 8:28", text: "", needsScripture: true }, "Romans needs pasting");
  eq(built.pointsCount, 3, "all points kept");
});
