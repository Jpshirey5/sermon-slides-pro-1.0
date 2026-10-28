// deno test -A --no-lock --node-modules-dir=none supabase/functions/parse-sermon-manuscript/pdfText_test.ts

import { readPdfText } from "./pdfText.ts";
import { pullVersesFromManuscript } from "./manuscriptVerses.ts";

const SAMPLE = new URL("./testdata/sample-sermon.pdf", import.meta.url);
const JOHN = `"For the Maker so loved every nation that he sent the only Son, that whoever trusts him will not be lost but will live forever."`;

Deno.test("reads a PDF's text and copies a verse from it word for word, with its translation", async () => {
  const text = await readPdfText(await Deno.readFile(SAMPLE), 200_000);
  if (!text.includes("John 3:16 (NIV)")) throw new Error(`PDF text not read: ${text.slice(0, 80)}`);
  const pulled = pullVersesFromManuscript({
    manuscript: text,
    refs: [{ raw_text: "John 3:16", book: "John", chapter: 3, start_verse: 16, end_verse: null, point_index: 0, subpoint_index: null }],
    verseTexts: [{ reference: "John 3:16", first_words: `"For the Maker so loved every nation that he`, last_words: "but will live forever.\"", translation: "NIV" }],
    fallbackTranslation: "KJV",
  });
  const verse = pulled.get(0);
  if (!verse || verse.text !== JOHN || verse.translation !== "NIV") throw new Error(`got ${JSON.stringify(verse)}`);
});

Deno.test("a file that isn't a readable PDF gives no text instead of failing the upload", async () => {
  const text = await readPdfText(new TextEncoder().encode("not a pdf"), 200_000);
  if (text !== "") throw new Error("expected empty text");
});
