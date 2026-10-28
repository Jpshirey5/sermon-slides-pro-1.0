// deno test -A --no-lock --node-modules-dir=none supabase/functions/_shared/scripture-text/verbatim_test.ts

import { assert, assertEquals } from "jsr:@std/assert@1";
import { findCitation, htmlToText, isExactPiece, locatePassage } from "./verbatim.ts";

// Made-up passage text: the tests check copying, not any real translation's wording.
const MANUSCRIPT = `Point 1: Hope holds

Read with me from John 3:16 (NIV):
“16 For the Maker so loved every nation that he sent the only Son, that whoever trusts him will not be lost but will live forever.”

That changes everything.

Point 2: Light wins
Psalm 27:1
The Lord is my lamp and my rescue; whom shall I dread?`;

const VERSE = "“16 For the Maker so loved every nation that he sent the only Son, that whoever trusts him will not be lost but will live forever.”";

Deno.test("copies the passage from the manuscript, character for character", () => {
  const found = locatePassage(MANUSCRIPT, "16 For the Maker so loved every nation that", "will not be lost but will live forever.");
  assert(found);
  assertEquals(found.text, VERSE);
  assertEquals(found.exactMatch, true);
  assert(isExactPiece(MANUSCRIPT, found.text));
});

Deno.test("an AI anchor that's off by one word still finds the manuscript's own words", () => {
  // "world" instead of "nation", and "perish" instead of "be lost".
  const found = locatePassage(MANUSCRIPT, "16 For the Maker so loved every world that he", "trusts him will not perish but will live forever");
  assert(found);
  assertEquals(found.text, VERSE, "slide text is the manuscript's, never the AI's");
  assertEquals(found.exactMatch, false);
});

Deno.test("straight vs curly quotes and line breaks don't block a match", () => {
  const found = locatePassage(MANUSCRIPT, "\"16 For the Maker so loved", "but will live forever.\"");
  assert(found);
  assertEquals(found.text, VERSE);
});

Deno.test("words that aren't in the manuscript find nothing", () => {
  assertEquals(locatePassage(MANUSCRIPT, "In the beginning was the Word", "the Word was God"), null);
});

Deno.test("when a passage appears twice, the copy after the citation wins", () => {
  const doc = "Intro quote: the Lord is my lamp and my rescue.\n\nPsalm 27:1 (KJV)\nThe Lord is my lamp and my rescue.";
  const at = findCitation(doc, "Psalm 27:1");
  const found = locatePassage(doc, "The Lord is my lamp", "lamp and my rescue.", at);
  assert(found);
  assertEquals(found.start, doc.lastIndexOf("The Lord is my lamp"));
});

Deno.test("Word file HTML keeps verse lines on their own lines", () => {
  assertEquals(htmlToText("<p>John 1:1 (KJV)</p><p>Line one<br>Line two &amp; three</p>"), "John 1:1 (KJV)\nLine one\nLine two & three\n");
});

Deno.test("finds a citation regardless of spacing and case", () => {
  assertEquals(findCitation("see  JOHN 3:16 now", "John 3:16"), 5);
  assertEquals(findCitation("nothing here", "John 3:16"), -1);
});
