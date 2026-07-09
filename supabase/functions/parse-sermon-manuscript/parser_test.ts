// Deterministic tests for the parser's non-model layers: raw-citation parsing,
// containment dedupe, outline-prefix stripping, tool-payload conversion, and
// deck ordering. Run with: deno test supabase/functions/parse-sermon-manuscript/
import { assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import {
  dedupeContainedRefs,
  extractRefsFromText,
  mergeRefs,
  parseRawReference,
} from "./refExtractor.ts";
import {
  convertToolPayload,
  stripOutlinePrefix,
  type ParsedScriptureRef,
} from "./claudeParser.ts";
import { buildSermon } from "./sermonBuilder.ts";
import type { ValidatedVerseBlock } from "./scriptureValidator.ts";

const ref = (
  book: string,
  chapter: number,
  start: number,
  end: number | null = null,
  pointIndex: number | null = null,
): ParsedScriptureRef => ({
  raw_text: `${book} ${chapter}:${start}${end ? `-${end}` : ""}`,
  book,
  chapter,
  start_verse: start,
  end_verse: end,
  point_index: pointIndex,
  subpoint_index: null,
});

// ── parseRawReference ──────────────────────────────────────────────────────────

Deno.test("parseRawReference: simple citation", () => {
  const refs = parseRawReference("John 3:16");
  assertEquals(refs.length, 1);
  assertEquals(refs[0].book, "John");
  assertEquals(refs[0].chapter, 3);
  assertEquals(refs[0].start_verse, 16);
  assertEquals(refs[0].end_verse, null);
});

Deno.test("parseRawReference: abbreviation with range", () => {
  const refs = parseRawReference("Rom. 8:28-30");
  assertEquals(refs.length, 1);
  assertEquals(refs[0].book, "Romans");
  assertEquals(refs[0].end_verse, 30);
});

Deno.test("parseRawReference: chapter-only mention yields nothing", () => {
  assertEquals(parseRawReference("Numbers 21"), []);
  assertEquals(parseRawReference("the promise in Ezekiel 36"), []);
});

Deno.test("parseRawReference: comma verse-list continuation", () => {
  const refs = parseRawReference("Galatians 5:16-17, 22-25");
  assertEquals(refs.length, 2);
  assertEquals([refs[0].start_verse, refs[0].end_verse], [16, 17]);
  assertEquals([refs[1].chapter, refs[1].start_verse, refs[1].end_verse], [5, 22, 25]);
});

Deno.test("parseRawReference: comma chapter:verse continuation", () => {
  const refs = parseRawReference("John 3:16, 6:44");
  assertEquals(refs.length, 2);
  assertEquals([refs[1].chapter, refs[1].start_verse], [6, 44]);
});

Deno.test("parseRawReference: cross-chapter span splits into anchors", () => {
  const refs = parseRawReference("1 John 1:5-2:2");
  assertEquals(refs.length, 2);
  assertEquals([refs[0].chapter, refs[0].start_verse, refs[0].end_verse], [1, 5, null]);
  assertEquals([refs[1].chapter, refs[1].start_verse, refs[1].end_verse], [2, 1, 2]);
});

Deno.test("parseRawReference: multiple books in one string", () => {
  const refs = parseRawReference("John 3:16; Romans 6:23");
  assertEquals(refs.map((r) => r.book), ["John", "Romans"]);
});

Deno.test("parseRawReference: unknown book yields nothing", () => {
  assertEquals(parseRawReference("Hezekiah 3:16"), []);
});

// ── dedupeContainedRefs ────────────────────────────────────────────────────────

Deno.test("dedupe: contained range under same point is dropped", () => {
  const out = dedupeContainedRefs([
    ref("John", 3, 13, 15, 1),
    ref("John", 3, 14, 15, 1),
  ]);
  assertEquals(out.length, 1);
  assertEquals(out[0].start_verse, 13);
});

Deno.test("dedupe: same range under different points is kept", () => {
  const out = dedupeContainedRefs([
    ref("John", 3, 16, null, 0),
    ref("John", 3, 16, null, 2),
  ]);
  assertEquals(out.length, 2);
});

Deno.test("dedupe: equal ranges keep the first", () => {
  const out = dedupeContainedRefs([
    ref("John", 3, 16, null, 1),
    ref("John", 3, 16, null, 1),
  ]);
  assertEquals(out.length, 1);
});

// ── mergeRefs (backstop union) ─────────────────────────────────────────────────

Deno.test("mergeRefs: regex ref contained in model range is dropped", () => {
  const merged = mergeRefs([ref("John", 3, 9, 12, 0)], [ref("John", 3, 10)]);
  assertEquals(merged.length, 1);
});

Deno.test("mergeRefs: genuinely new regex ref is appended", () => {
  const merged = mergeRefs([ref("John", 3, 16, null, 1)], [ref("Romans", 6, 23)]);
  assertEquals(merged.length, 2);
  assertEquals(merged[1].book, "Romans");
});

// ── stripOutlinePrefix ─────────────────────────────────────────────────────────

Deno.test("stripOutlinePrefix: numbering and label variants", () => {
  const cases: [string, string][] = [
    ["Point 1: God is love", "God is love"],
    ["1. God is love", "God is love"],
    ["1) God is love", "God is love"],
    ["I. God is love", "God is love"],
    ["(2) God is love", "God is love"],
    ["Main Point: God is love", "God is love"],
    ["1 - RELIGIOUS", "RELIGIOUS"],
    ["(Optional) Self-Control Is Rooted in Grace", "Self-Control Is Rooted in Grace"],
    ["a. The devil schemes", "The devil schemes"],
  ];
  for (const [input, expected] of cases) {
    assertEquals(stripOutlinePrefix(input), expected, `input: ${input}`);
  }
});

Deno.test("stripOutlinePrefix: leaves ordinary titles alone", () => {
  for (const title of ["A Word of Comfort", "I am the way", "Are you born again?", "2x grace"]) {
    assertEquals(stripOutlinePrefix(title), title);
  }
});

// ── convertToolPayload ─────────────────────────────────────────────────────────

const payload = (overrides: Record<string, unknown> = {}) => ({
  document_analysis: {
    point_marker_convention: "numbered",
    subpoint_marker_convention: "none",
    verse_placement_convention: "inline",
    non_sermon_sections: [],
    expected_point_count: 2,
    extracted_item_count: 2,
  },
  title: "Test Sermon",
  series: null,
  items: [
    { sequence_index: 0, kind: "point", text: "1. First point", summary: "s", scripture_references_raw: ["John 3:16"] },
    { sequence_index: 1, kind: "point", text: "2. Second point", summary: "s", scripture_references_raw: [] },
  ],
  intro_references_raw: [],
  conclusion_references_raw: [],
  ...overrides,
});

Deno.test("convert: points in order, numbering stripped, refs placed", () => {
  const { data, warnings } = convertToolPayload(payload());
  assertEquals(data.points.map((p) => p.title), ["First point", "Second point"]);
  assertEquals(data.scripture_references.length, 1);
  assertEquals(data.scripture_references[0].point_index, 0);
  assertEquals(warnings, []);
});

Deno.test("convert: subpoints nest under preceding point with ref placement", () => {
  const { data } = convertToolPayload(payload({
    items: [
      { sequence_index: 0, kind: "point", text: "Know your enemy", summary: "s", scripture_references_raw: [] },
      { sequence_index: 1, kind: "subpoint", text: "a. The devil schemes", summary: "", scripture_references_raw: ["Ephesians 6:11"] },
      { sequence_index: 2, kind: "point", text: "Take up the armor", summary: "s", scripture_references_raw: [] },
    ],
    document_analysis: { ...payload().document_analysis, expected_point_count: 2, extracted_item_count: 3 },
  }));
  assertEquals(data.points.length, 2);
  assertEquals(data.points[0].subpoints, [{ title: "The devil schemes" }]);
  const subRef = data.scripture_references[0];
  assertEquals([subRef.point_index, subRef.subpoint_index], [0, 0]);
});

Deno.test("convert: intro and conclusion raw refs get placements", () => {
  const { data } = convertToolPayload(payload({
    intro_references_raw: ["John 3:1-2"],
    conclusion_references_raw: ["Romans 10:9"],
  }));
  const intro = data.scripture_references.find((r) => r.book === "John" && r.chapter === 3);
  const conclusion = data.scripture_references.find((r) => r.book === "Romans");
  assertEquals(intro?.placement, "intro");
  assertEquals(intro?.point_index, null);
  assertEquals(conclusion?.placement, "conclusion");
});

Deno.test("convert: unparseable raw ref becomes a warning, never a verse", () => {
  const { data, warnings } = convertToolPayload(payload({
    items: [
      { sequence_index: 0, kind: "point", text: "P1", summary: "s", scripture_references_raw: ["Numbers 21"] },
      { sequence_index: 1, kind: "point", text: "P2", summary: "s", scripture_references_raw: [] },
    ],
  }));
  assertEquals(data.scripture_references, []);
  assertEquals(warnings.length, 1);
  assertEquals(warnings[0].includes("Numbers 21"), true);
});

Deno.test("convert: point-count mismatch produces a warning", () => {
  const { warnings } = convertToolPayload(payload({
    document_analysis: { ...payload().document_analysis, expected_point_count: 3 },
  }));
  assertEquals(warnings.some((w) => w.includes("expected 3")), true);
});

Deno.test("convert: repeated quote under same point dedupes", () => {
  const { data } = convertToolPayload(payload({
    items: [
      { sequence_index: 0, kind: "point", text: "P1", summary: "s", scripture_references_raw: ["John 3:13-15", "John 3:14-15"] },
      { sequence_index: 1, kind: "point", text: "P2", summary: "s", scripture_references_raw: [] },
    ],
  }));
  assertEquals(data.scripture_references.length, 1);
  assertEquals(data.scripture_references[0].start_verse, 13);
});

// ── buildSermon ordering ───────────────────────────────────────────────────────

Deno.test("buildSermon: intro verses first, conclusion verses last", () => {
  const verse = (
    reference: string,
    pointIndex: number | null,
    placement?: "intro" | "conclusion",
  ): ValidatedVerseBlock => ({
    reference,
    text: "text",
    point_index: pointIndex,
    subpoint_index: null,
    ...(placement ? { placement } : {}),
  });

  const built = buildSermon({
    parsed: {
      title: "T",
      series: null,
      points: [
        { title: "P1", summary: "", subpoints: [] },
        { title: "P2", summary: "", subpoints: [] },
      ],
      scripture_references: [],
    },
    validatedVerses: [
      verse("Galatians 6:7-9", null, "conclusion"),
      verse("John 3:1-2", null, "intro"),
      verse("John 3:16", 1),
    ],
    translation: "KJV",
  });

  const sequence = built.formData.points.map((b: any) => `${b.type}:${b.title}`);
  assertEquals(sequence, [
    "verse:John 3:1-2",
    "point:P1",
    "point:P2",
    "verse:John 3:16",
    "verse:Galatians 6:7-9",
  ]);
});

// ── backstop regex still behaves ───────────────────────────────────────────────

Deno.test("extractRefsFromText: no comma continuation over prose", () => {
  const refs = extractRefsFromText("Turn to John 3:16, 17 people responded that day.");
  assertEquals(refs.length, 1);
  assertEquals(refs[0].end_verse, null);
});
