// deno test -A --no-lock --node-modules-dir=none supabase/functions/_shared/scripture-text/translations_test.ts

import { assertEquals } from "jsr:@std/assert@1";
import { detectTranslationNear, documentTranslation, findTranslationMentions, normalizeTranslationCode } from "./translations.ts";

const near = (doc: string, verse: string) => {
  const start = doc.indexOf(verse);
  return detectTranslationNear(doc, start, start + verse.length);
};

Deno.test("finds the tag on the reference line or right after the verse", () => {
  assertEquals(near("John 3:16 (NIV)\nFor God so loved the world.\n\nMore text.", "For God so loved the world."), "NIV");
  assertEquals(near("Read this:\n\"Be still, and know.\" Psalm 46:10 NLT\n", "\"Be still, and know.\""), "NLT");
  assertEquals(near("Romans 8:28 [ESV] And we know.", "And we know."), "ESV");
});

Deno.test("the nearest tag wins when two passages are close together", () => {
  const doc = "John 1:1 (KJV)\nIn the beginning was the Word.\n\nJohn 1:2 (NIV)\nHe was with God in the beginning.";
  assertEquals(near(doc, "He was with God in the beginning."), "NIV");
  assertEquals(near(doc, "In the beginning was the Word."), "KJV");
});

Deno.test("written-out names count, and the longer name wins", () => {
  assertEquals(findTranslationMentions("from the New King James Version").map((m) => m.code), ["NKJV"]);
  assertEquals(findTranslationMentions("the New Living Translation says").map((m) => m.code), ["NLT"]);
});

Deno.test("words that are also codes only count in brackets", () => {
  assertEquals(findTranslationMentions("a NET gain and an AMP up WEB page").length, 0);
  assertEquals(findTranslationMentions("Philippians 4:13 (AMP)").map((m) => m.code), ["AMP"]);
  assertEquals(findTranslationMentions("lowercase niv is not a tag").length, 0);
});

Deno.test("no tag nearby means null, so the church default is used", () => {
  assertEquals(near("John 3:16\nFor God so loved the world.", "For God so loved the world."), null);
});

Deno.test("a document that names one translation throughout", () => {
  assertEquals(documentTranslation("Scripture quotations are from the ESV.\nJohn 3:16 For God..."), "ESV");
  assertEquals(documentTranslation("John 1:1 (KJV) ... John 1:2 (NIV) ..."), null);
});

Deno.test("normalizes codes", () => {
  assertEquals(normalizeTranslationCode(" (niv) "), "NIV");
  assertEquals(normalizeTranslationCode("x"), null);
  assertEquals(normalizeTranslationCode(42), null);
});

Deno.test("test sermon: a reference with no verse text gets the translation beside it, and a written-out name counts", async () => {
  const { findCitation } = await import("./verbatim.ts");
  const doc = "Write this one down and read it on the screen together:\nHebrews 6:19 (NIV)\nWe'll talk about what it means for hope to be an anchor for the soul.\n\n3. God Gives Strength\nIsaiah 40:31 (WEB)\nBut those who wait";
  const at = findCitation(doc, "Hebrews 6:19");
  assertEquals(detectTranslationNear(doc, at, at + "Hebrews 6:19".length), "NIV");
  const romans = "Romans 8:28, English Standard Version\nAnd we know that for those who love God all things work together for good.";
  assertEquals(near(romans, "And we know that for those who love God all things work together for good."), "ESV");
});
