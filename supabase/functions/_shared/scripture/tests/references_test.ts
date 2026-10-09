// deno test -A supabase/functions/_shared/scripture/tests/references_test.ts

import { assertEquals } from "./assert.ts";
import { BOOK_CODES, formatReference, parseReference, passageId, validatePassage, verseCount } from "../references.ts";

Deno.test("there are 66 book codes", () => {
  assertEquals(BOOK_CODES.size, 66);
});

Deno.test("parseReference handles common forms", () => {
  assertEquals(parseReference("John 3:16"), { book: "JHN", chapter: 3, verse_start: 16, verse_end: 16 });
  assertEquals(parseReference("  1 Cor 13:4-7 "), { book: "1CO", chapter: 13, verse_start: 4, verse_end: 7 });
  assertEquals(parseReference("Song of Solomon 2:1"), { book: "SNG", chapter: 2, verse_start: 1, verse_end: 1 });
  assertEquals(parseReference("psalm 23:1 - 6"), { book: "PSA", chapter: 23, verse_start: 1, verse_end: 6 });
});

Deno.test("parseReference strips the translation tag that sermon slides add", () => {
  assertEquals(parseReference("John 3:16-17 (NIV)"), { book: "JHN", chapter: 3, verse_start: 16, verse_end: 17 });
  assertEquals(parseReference("Romans 8:28 (RVR1960)"), { book: "ROM", chapter: 8, verse_start: 28, verse_end: 28 });
});

Deno.test("parseReference rejects what it cannot read", () => {
  for (const bad of ["", "John", "John 3", "Hezekiah 1:1", "John 3:17-16", "John 0:1", "John 3:500", "John 3:16; 4:1"]) {
    assertEquals(parseReference(bad), null, bad);
  }
});

Deno.test("validatePassage guards structured input from clients", () => {
  assertEquals(validatePassage({ book: "JHN", chapter: 3, verse_start: 16, verse_end: 18 }), true);
  assertEquals(validatePassage({ book: "JHN", chapter: 3, verse_start: 16 }), true);
  assertEquals(validatePassage({ book: "jhn", chapter: 3, verse_start: 16 }), false, "codes are upper case");
  assertEquals(validatePassage({ book: "JHN", chapter: "3", verse_start: 16 }), false);
  assertEquals(validatePassage({ book: "JHN", chapter: 3, verse_start: 1.5 }), false);
  assertEquals(validatePassage({ book: "JHN", chapter: 3, verse_start: 5, verse_end: 4 }), false);
  assertEquals(validatePassage(null), false);
  assertEquals(validatePassage("JHN.3.16"), false);
});

Deno.test("passageId matches API.Bible's format", () => {
  assertEquals(passageId({ book: "JHN", chapter: 3, verse_start: 16 }), "JHN.3.16");
  assertEquals(passageId({ book: "JHN", chapter: 3, verse_start: 16, verse_end: 16 }), "JHN.3.16");
  assertEquals(passageId({ book: "JHN", chapter: 3, verse_start: 16, verse_end: 18 }), "JHN.3.16-JHN.3.18");
});

Deno.test("verseCount and formatReference", () => {
  assertEquals(verseCount({ book: "PSA", chapter: 23, verse_start: 1, verse_end: 6 }), 6);
  assertEquals(formatReference({ book: "PSA", chapter: 23, verse_start: 1, verse_end: 6 }), "Psalm 23:1-6");
  assertEquals(formatReference({ book: "1CO", chapter: 13, verse_start: 4 }), "1 Corinthians 13:4");
  assertEquals(formatReference({ book: "SNG", chapter: 2, verse_start: 1 }), "Song of Solomon 2:1");
  assertEquals(formatReference({ book: "JOB", chapter: 1, verse_start: 1 }), "Job 1:1");
  assertEquals(formatReference({ book: "ACT", chapter: 2, verse_start: 38 }), "Acts 2:38");
});
