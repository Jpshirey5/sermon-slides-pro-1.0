// deno test supabase/functions/finalize-quick-build-parse/diff_test.ts
import {
  computeStructureDiff,
  isMeaningfulDiff,
  refKeyFromString,
  titleSimilarity,
  type FinalStructure,
  type ParsedStructure,
} from "./diff.ts";
import { buildProfileText, mergeCandidateHints } from "./profileUpdater.ts";

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};
const assertEquals = (actual: unknown, expected: unknown, message?: string) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${message || "assertEquals"}: ${a} !== ${e}`);
};

const parsed: ParsedStructure = {
  title: "Anchored in Hope",
  series: "Unshakable",
  points: [
    { title: "Hope is anchored in God's promises", subpoints: [{ title: "God's promise cannot fail" }] },
    { title: "Hope holds fast in the storm", subpoints: [] },
    { title: "Hope looks forward to Jesus", subpoints: [] },
  ],
  scripture_references: [
    { raw_text: "Hebrews 6:19", book: "Hebrews", chapter: 6, start_verse: 19, end_verse: null, point_index: null },
    { raw_text: "Numbers 23:19", book: "Numbers", chapter: 23, start_verse: 19, end_verse: null, point_index: 0 },
    { raw_text: "1 Peter 1:3-9", book: "1 Peter", chapter: 1, start_verse: 3, end_verse: 9, point_index: 1 },
    { raw_text: "Romans 5:1-5", book: "Romans", chapter: 5, start_verse: 1, end_verse: 5, point_index: 2 },
  ],
};

const identicalFinal: FinalStructure = {
  title: "Anchored in Hope",
  series: "Unshakable",
  blocks: [
    { type: "scripture", references: ["Hebrews 6:19"] },
    { type: "point", title: "Hope is anchored in God's promises" },
    { type: "point", title: "God's promise cannot fail" },
    { type: "scripture", references: ["Numbers 23:19"] },
    { type: "point", title: "Hope holds fast in the storm" },
    { type: "scripture", references: ["1 Peter 1:3-9"] },
    { type: "point", title: "Hope looks forward to Jesus" },
    { type: "scripture", references: ["Romans 5:1-5"] },
  ],
};

Deno.test("identical structures produce an empty diff", () => {
  const diff = computeStructureDiff(parsed, identicalFinal);
  assertEquals(diff.total_changes, 0, "no changes expected");
  assert(!isMeaningfulDiff(diff), "identical diff must not be meaningful");
});

Deno.test("verse placement: intro verse under first point is not a move (subpoint context)", () => {
  // Numbers 23:19 sits after the subpoint block, which maps to main point 0 — same as parsed.
  const diff = computeStructureDiff(parsed, identicalFinal);
  assertEquals(diff.verses_moved, [], "no spurious moves through subpoint blocks");
});

Deno.test("removed point and deleted verse are detected", () => {
  const final: FinalStructure = {
    ...identicalFinal,
    blocks: identicalFinal.blocks.filter(
      (b) =>
        !(b.type === "point" && b.title === "Hope holds fast in the storm") &&
        !(b.type === "scripture" && b.references.includes("1 Peter 1:3-9")),
    ),
  };
  const diff = computeStructureDiff(parsed, final);
  assertEquals(diff.points_removed, ["Hope holds fast in the storm"]);
  assertEquals(diff.verses_removed, ["1 Peter 1:3-9"]);
  assert(isMeaningfulDiff(diff), "point + verse removal is meaningful");
});

Deno.test("retitle within threshold is retitled, not add+remove", () => {
  const final: FinalStructure = {
    ...identicalFinal,
    blocks: identicalFinal.blocks.map((b) =>
      b.type === "point" && b.title === "Hope looks forward to Jesus"
        ? { type: "point" as const, title: "Hope looks forward to Jesus Christ" }
        : b,
    ),
  };
  const diff = computeStructureDiff(parsed, final);
  assertEquals(diff.points_added, []);
  assertEquals(diff.points_removed, []);
  assertEquals(diff.points_retitled, [
    { from: "Hope looks forward to Jesus", to: "Hope looks forward to Jesus Christ" },
  ]);
  assert(!isMeaningfulDiff(diff), "a lone retitle is not meaningful");
});

Deno.test("verse moved to a different point is detected with correct indices", () => {
  const blocks = identicalFinal.blocks
    .filter((b) => !(b.type === "scripture" && b.references.includes("Numbers 23:19")))
    .concat([{ type: "scripture", references: ["Numbers 23:19"] }]); // now after point 2
  const diff = computeStructureDiff(parsed, { ...identicalFinal, blocks });
  assertEquals(diff.verses_moved, [
    { reference: "Numbers 23:19", from_point: 0, to_point: 2 },
  ]);
});

Deno.test("verse under an ADDED point is not reported as moved (unknown placement)", () => {
  const blocks: FinalStructure["blocks"] = [
    ...identicalFinal.blocks.filter(
      (b) => !(b.type === "scripture" && b.references.includes("Romans 5:1-5")),
    ),
    { type: "point", title: "A brand new closing point" },
    { type: "scripture", references: ["Romans 5:1-5"] },
  ];
  const diff = computeStructureDiff(parsed, { ...identicalFinal, blocks });
  assertEquals(diff.points_added, ["A brand new closing point"]);
  assertEquals(diff.verses_moved, [], "unknown placement must not count as a move");
});

Deno.test("title/series changes flagged; cosmetic punctuation is not a change", () => {
  const diff = computeStructureDiff(parsed, {
    ...identicalFinal,
    title: "Anchored, in Hope!",
    series: "Unshakable Faith",
  });
  assert(!diff.title_changed, "punctuation-only title change ignored");
  assert(diff.series_changed, "series change detected");
});

Deno.test("refKeyFromString handles ranges, cross-chapter ranges, and numbered books", () => {
  assertEquals(refKeyFromString("John 3:16"), "john|3|16");
  assertEquals(refKeyFromString("1 Corinthians 13:4-7"), "1 corinthians|13|4");
  assertEquals(refKeyFromString("1 John 1:5-2:2"), "1 john|1|5");
  assertEquals(refKeyFromString("not a reference"), null);
});

Deno.test("titleSimilarity: same tokens reordered ≈ 1, disjoint = 0", () => {
  assertEquals(titleSimilarity("God is love", "love is God"), 1);
  assertEquals(titleSimilarity("God is love", "announcements today"), 0);
});

Deno.test("hint graduation requires two consecutive proposals; cap enforced", () => {
  const run1 = mergeCandidateHints([], ["Marks points with ALL-CAPS lines"]);
  assertEquals(buildProfileText(run1), "", "no graduation after one sighting");

  const run2 = mergeCandidateHints(run1, [
    "Marks points with ALL-CAPS lines",
    "Lists scriptures at the end of each point",
  ]);
  assertEquals(buildProfileText(run2), "- Marks points with ALL-CAPS lines");

  // A hint not repeated in the next run is dropped entirely, while the repeated
  // one reaches its second sighting and graduates.
  const run3 = mergeCandidateHints(run2, ["Lists scriptures at the end of each point"]);
  assertEquals(
    buildProfileText(run3),
    "- Lists scriptures at the end of each point",
    "unrepeated hint dropped; repeated hint graduates",
  );
  assert(!run3.some((c) => c.hint.includes("ALL-CAPS")), "dropped hint removed from candidates");

  // Profile text stays under the hard cap even with adversarially long hints.
  const giant = Array.from({ length: 8 }, (_, i) => `${"x".repeat(150)} ${i}`);
  const capped = mergeCandidateHints(
    giant.map((hint) => ({ hint, seen_count: 5 })),
    giant,
  );
  assert(buildProfileText(capped).length <= 800, "profile text must stay capped");
});
