// QUICK BUILD ADDITION — AWS Bedrock API call + conversion of the returned data.
// The model reviews the actual document (native PDF input, or structure-preserving
// HTML for .docx) and reports an ORDERED outline through a forced tool call: one
// items[] entry per point/subpoint, with scripture citations as RAW STRINGS only.
// Chapter/verse integers are never model-emitted — raw strings are parsed
// deterministically here (parseRawReference), so a verse number that isn't in the
// document text can't reach a slide.

import { invokeBedrockForcedTool } from "../_shared/bedrock.ts";
import { dedupeContainedRefs, parseRawReference } from "./refExtractor.ts";

// ── Bedrock config ─────────────────────────────────────────────────────────────
// QUICK_BUILD_MODEL_ID lets prod A/B a different model without a code deploy;
// model_id is recorded on every quick_build_usage row so drift stays visible.
export const BEDROCK_MODEL_ID = Deno.env.get("QUICK_BUILD_MODEL_ID") ?? "us.anthropic.claude-sonnet-4-6";
// Analysis scratchpad fields consume output budget on top of the extraction.
const MAX_TOKENS = 12288;

// Bump on every prompt/schema iteration so accuracy is comparable across versions.
export const PROMPT_VERSION = "v3-2026-07";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ParsedScriptureRef {
  raw_text: string;
  book: string;
  chapter: number;
  start_verse: number;
  end_verse: number | null;
  point_index: number | null;
  subpoint_index: number | null;
  /** Only meaningful when point_index is null: where an unplaced ref renders. */
  placement?: "intro" | "conclusion";
}

export interface ParsedSubpoint {
  title: string;
}

export interface ParsedPoint {
  title: string;
  summary: string;
  subpoints: ParsedSubpoint[];
}

export interface ParsedManuscript {
  title: string;
  series: string | null;
  points: ParsedPoint[];
  scripture_references: ParsedScriptureRef[];
}

export type ParserInput =
  | { kind: "pdf"; base64: string }
  | { kind: "html"; html: string }
  | { kind: "text"; text: string };

export interface ClaudeParseResult {
  data: ParsedManuscript;
  tokens_used: number;
  /** Model's own read of the document's formatting convention (scratchpad fields). */
  analysis: Record<string, unknown> | null;
  /** User-facing extraction warnings (unparseable citations, point-count mismatch). */
  warnings: string[];
  prompt_version: string;
  model_id: string;
}

export interface ParseOptions {
  /** Per-user format hints from quick_build_user_profiles (Phase 2 learning loop). */
  userFormatHints?: string;
}

// ── Prompt ─────────────────────────────────────────────────────────────────────

const PROMPT = `You are a sermon manuscript parser for a church presentation software platform. Read the sermon document provided ({DOCUMENT_NOTE}) and extract its structure for slide generation: the ordered outline of points and subpoints, and the scripture citations attached to each, exactly as they appear in the document.

Pastors format their sermons in many different ways. Do NOT assume one fixed format. First infer how THIS document marks its structure, then extract using the convention you identified.
{USER_FORMAT_HINTS}
WORK IN TWO STEPS, IN THIS ORDER:

STEP 1 — ANALYZE THE DOCUMENT. Fill in the document_analysis fields FIRST, before any extraction fields:
- point_marker_convention: how this document marks its main points (e.g., "bold numbered headings", "standalone ALL-CAPS lines", "'Big Idea:' labels", "underlined sentences", "fill-in-the-blank lines")
- subpoint_marker_convention: how subpoints are marked, or "none"
- verse_placement_convention: where scripture citations sit relative to points (e.g., "inline in body text", "in parentheses on the point line", "'Scripture:' labeled lines", "listed in a block at the end of each point section", "passage quoted with bare verse numbers")
- non_sermon_sections: any sections that are NOT sermon content (announcements, welcome, worship order, offering, prayer, speaker/stage notes, etc.); empty array if none
- expected_point_count: how many main points the document appears to contain

Within one document, main points almost always share a single marking convention. Sermons typically have 2 to 7 main points. If a candidate line does not match the convention the other points use, it is probably not a main point.

STEP 2 — EXTRACT, walking the document strictly TOP TO BOTTOM.

CORE RULES:
1. Preserve document order exactly. The items array must list points and subpoints in the order they appear in the document; sequence_index starts at 0 and increases by 1 for each item.
2. Never skip, merge, or summarize an outline heading. Every main point and every explicitly marked subpoint becomes its own item.
3. Never fabricate points, subpoints, or scripture references that do not appear in the document.
4. If you cannot parse the document at all, still fill document_analysis with your best reading, use "Untitled Sermon" as the title, and return empty items and reference arrays.

TITLE:
- Look for the first major heading, bolded title, or clearly labeled sermon title ("Title:", "Sermon:", "Message:")
- If no title is found, use "Untitled Sermon"
- The sermon title must never also appear as a point item

SERIES:
- Look for "Series:", "Part of:", "Week", "Part" followed by a series name (e.g., "Series: Walking by Faith", "Part 3 of: The Beatitudes")
- If no series is mentioned, return null

ITEMS with kind "point" — the main structural divisions of the sermon's teaching content:
- Recognize whatever marking convention this document actually uses: numbered/lettered/roman outlines, heading styles, bolded or ALL-CAPS or underlined header lines, labels such as "Point 1:", "Main Point:", "Big Idea:", "Truth:", "Move 1:", "Takeaway:", or fill-in-the-blank handout lines (keep blanks as written; use the filled-in answer if the document provides one)
- NEVER extract as a point (or as the title):
  - Announcements, welcome/greeting, worship order or song titles, prayer, offering, benediction
  - Illustration or story headers, block quotes, and quoted material
  - Application/"So what?"/challenge paragraphs, unless the document labels them as a point
  - Speaker or stage notes, dates, times, venue names, speaker names
  - The introduction or conclusion, unless explicitly labeled as a point
  - A scripture citation on its own line is a verse, never a point
- text: the heading with ALL leading numbering and labeling stripped — arabic/roman/letter outlines with their separators ("1.", "1)", "(2)", "II:", "A."), label prefixes ("Point 1:", "Main Point —", "Big Idea:"), qualifier markers like "(Optional)", and any leftover bullets, dashes, or colons. Preserve the substantive wording exactly as written. Examples: "Point 1: God is love" → "God is love"; "(2) God is love" → "God is love"; "(Optional) Rooted in Grace" → "Rooted in Grace"
- summary: a 1 to 2 sentence summary of the content under that point

ITEMS with kind "subpoint" — ONLY explicitly outline-marked subordinate items under a main point:
- Letter or roman outlines at a deeper level ("a.", "b)", "i.", "ii."), nested/indented bullets, deeper heading levels, or short bold lead-in labels ("1 - RELIGIOUS -", "Riches —")
- text: the label or heading portion ONLY (e.g., "Religious", "The belt of truth") — never the full sentence that follows a label
- An ordinary body sentence, application line, or quote is NOT a subpoint, even when it sits in a bullet list. If a bullet is a full prose sentence with no label or heading formatting, it is body text — do not create an item for it.
- A subpoint item comes right after its parent point item, in document order. Do not promote subpoints to points. leave summary as an empty string for subpoints.

SCRIPTURE REFERENCES — raw citation strings, attached where they appear:
- scripture_references_raw on each item: every scripture citation appearing in that item's section of the document, in order. Copy each citation exactly as written (e.g., "John 3:16", "Rom. 8:28-30", "1 Corinthians 13:4-7", "Galatians 5:16-17, 22-25", "1 John 1:5-2:2", "(see Psalm 23:1)" → "Psalm 23:1").
- References cited BEFORE the first point (opening passage, introduction) go in intro_references_raw. References cited AFTER the last point's content (conclusion, call to response, closing prayer) go in conclusion_references_raw.
- A citation is allowed from EXACTLY TWO sources, nothing else:
  (a) a citation literally written in the document text; or
  (b) scripture QUOTED with its own verse numbers, where the book and chapter are unambiguous from the immediate context — e.g., the sermon is teaching John chapter 3 and quotes "13 No one has ascended into heaven... 14 And as Moses lifted up the serpent...": report "John 3:13-15" in standard Book Chapter:Verse form, covering exactly the verse numbers present in the quote. If the book or chapter is not certain, omit it.
- NEVER report a reference from a theme, allusion, story retelling, or paraphrase.
- NEVER report a book-and-chapter mention that has no verse number ("Numbers 21", "the promise in Ezekiel 36", "Paul's letter to the Romans") — skip these entirely; never invent a verse number for them.
- If the same passage is cited or quoted more than once under the same point, report it once, at its first occurrence.

SELF-CHECK — before calling the tool, verify all of the following, and fix the extraction if any check fails:
1. The number of kind "point" items equals expected_point_count (the main-point headings you counted in STEP 1)
2. extracted_item_count equals the total length of the items array
3. Items appear in document order with sequence_index running 0, 1, 2, ... with no gaps
4. Every reference string satisfies the two-source rule and has an explicit verse number

Report your result by calling the save_sermon_structure tool exactly once. Fill the document_analysis fields first, then the extracted data.`;

const PDF_DOCUMENT_NOTE = "attached as a PDF file — review the actual document, including its layout and formatting";
const HTML_DOCUMENT_NOTE = "provided below as the HTML rendering of the original Word document — heading tags, <strong>/<b>, <u>, and list nesting reflect the document's real formatting";
const TEXT_DOCUMENT_NOTE = "provided below as plain text";

// ── Tool schema (forced tool_choice guarantees schema-shaped output) ───────────

const SERMON_TOOL = {
  name: "save_sermon_structure",
  description:
    "Save the structured sermon data extracted from the document. Must be called exactly once with the complete extraction result.",
  input_schema: {
    type: "object",
    properties: {
      // Scratchpad: listed first (and required) so the model commits to a read of
      // the document's convention before emitting the extraction fields.
      document_analysis: {
        type: "object",
        properties: {
          point_marker_convention: { type: "string" },
          subpoint_marker_convention: { type: "string" },
          verse_placement_convention: { type: "string" },
          non_sermon_sections: { type: "array", items: { type: "string" } },
          expected_point_count: { type: "integer" },
          extracted_item_count: { type: "integer" },
        },
        required: [
          "point_marker_convention",
          "subpoint_marker_convention",
          "verse_placement_convention",
          "non_sermon_sections",
          "expected_point_count",
          "extracted_item_count",
        ],
      },
      title: { type: "string" },
      series: { type: ["string", "null"] },
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            sequence_index: { type: "integer" },
            kind: { type: "string", enum: ["point", "subpoint"] },
            text: { type: "string" },
            summary: { type: "string" },
            scripture_references_raw: { type: "array", items: { type: "string" } },
          },
          required: ["sequence_index", "kind", "text", "summary", "scripture_references_raw"],
        },
      },
      intro_references_raw: { type: "array", items: { type: "string" } },
      conclusion_references_raw: { type: "array", items: { type: "string" } },
    },
    required: [
      "document_analysis",
      "title",
      "series",
      "items",
      "intro_references_raw",
      "conclusion_references_raw",
    ],
  },
};

// ── Conversion (tool payload → ParsedManuscript) ───────────────────────────────

// Deterministic backstop behind the prompt's stripping instructions: leading
// bullets/dashes, "(Optional)"-style qualifiers, label words, and outline
// numbering with a separator. Applied repeatedly until stable.
const STRIP_PATTERNS = [
  /^[\s•*·]+/,
  /^[-–—:]+\s+/,
  /^\(\s*optional\s*\)\s*[:.\-–—]?\s*/i,
  /^\(?(?:point|main point|big idea|truth|move|takeaway|part|section|heading)\s*(?:one|two|three|four|five|six|seven|\d{1,2})?\)?\s*[:.\-–—]\s*/i,
  /^\((?:\d{1,2}|[IVXLC]+|[A-Za-z])\)\s*/, // "(2) God is love"
  /^(?:\d{1,2}|[IVXLC]+|[A-Za-z])\s*(?:[.):]|[-–—])+\s*/, // "1.", "II:", "a)", "1 - "
];

export function stripOutlinePrefix(text: string): string {
  let current = text.trim();
  for (let pass = 0; pass < 4; pass++) {
    let next = current;
    for (const pattern of STRIP_PATTERNS) next = next.replace(pattern, "");
    next = next.trim();
    if (next === current || next.length === 0) break;
    current = next;
  }
  return current.length > 0 ? current : text.trim();
}

export interface ConvertedPayload {
  data: ParsedManuscript;
  warnings: string[];
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    : [];
}

export function convertToolPayload(value: unknown): ConvertedPayload {
  if (!value || typeof value !== "object")
    throw new Error("Parser returned non-object");
  const v = value as any;
  if (typeof v.title !== "string") throw new Error("Parser returned no title");
  if (!Array.isArray(v.items)) throw new Error("Parser items invalid");

  const warnings: string[] = [];
  const unparsedRefs: string[] = [];
  const points: ParsedPoint[] = [];
  const refs: ParsedScriptureRef[] = [];

  const addRawRefs = (
    raws: string[],
    pointIndex: number | null,
    subpointIndex: number | null,
    placement?: "intro" | "conclusion",
  ) => {
    for (const raw of raws) {
      const parsed = parseRawReference(raw);
      if (parsed.length === 0) {
        unparsedRefs.push(raw.trim());
        continue;
      }
      for (const ref of parsed) {
        refs.push({
          ...ref,
          point_index: pointIndex,
          subpoint_index: subpointIndex,
          ...(placement ? { placement } : {}),
        });
      }
    }
  };

  addRawRefs(asStringArray(v.intro_references_raw), null, null, "intro");

  for (const item of v.items) {
    if (!item || typeof item.text !== "string") continue;
    const title = stripOutlinePrefix(item.text);
    if (title.length === 0) continue;
    const raws = asStringArray(item.scripture_references_raw);

    // A subpoint arriving before any point can't nest — treat it as a point so
    // its content isn't dropped.
    if (item.kind === "subpoint" && points.length > 0) {
      const parent = points[points.length - 1];
      parent.subpoints.push({ title });
      addRawRefs(raws, points.length - 1, parent.subpoints.length - 1);
    } else {
      points.push({
        title,
        summary: typeof item.summary === "string" ? item.summary.trim() : "",
        subpoints: [],
      });
      addRawRefs(raws, points.length - 1, null);
    }
  }

  addRawRefs(asStringArray(v.conclusion_references_raw), null, null, "conclusion");

  if (unparsedRefs.length > 0) {
    warnings.push(
      `Some references couldn't be added as verses: ${[...new Set(unparsedRefs)].join(", ")} — add them manually in Sermon Review if needed`,
    );
  }

  const expectedPoints = v.document_analysis?.expected_point_count;
  if (Number.isInteger(expectedPoints) && expectedPoints !== points.length) {
    warnings.push(
      `The parser found ${points.length} point${points.length === 1 ? "" : "s"} but expected ${expectedPoints} — double-check the point list in Sermon Review`,
    );
  }

  return {
    data: {
      title: v.title.trim() || "Untitled Sermon",
      series: v.series ? String(v.series).trim() || null : null,
      points,
      scripture_references: dedupeContainedRefs(refs),
    },
    warnings,
  };
}

// ── Message construction ───────────────────────────────────────────────────────

// The document is always authoritative over past hints — a stale or wrong hint
// must never override what the model observes in the file itself.
function formatUserHints(userFormatHints?: string): string {
  const hints = (userFormatHints ?? "").trim();
  if (!hints) return "";
  return `\nPAST FORMAT HINTS for this user, learned from their previous uploads. The document itself is always authoritative — ignore any hint that contradicts what you observe in this document:\n${hints}\n`;
}

function buildPrompt(documentNote: string, userFormatHints?: string): string {
  return PROMPT.replace("{DOCUMENT_NOTE}", documentNote).replace(
    "{USER_FORMAT_HINTS}",
    formatUserHints(userFormatHints),
  );
}

function buildMessageContent(input: ParserInput, userFormatHints?: string): unknown[] {
  if (input.kind === "pdf") {
    return [
      {
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: input.base64,
        },
      },
      { type: "text", text: buildPrompt(PDF_DOCUMENT_NOTE, userFormatHints) },
    ];
  }
  if (input.kind === "html") {
    return [
      {
        type: "text",
        text:
          buildPrompt(HTML_DOCUMENT_NOTE, userFormatHints) +
          `\n\nDOCUMENT (HTML rendering):\n---\n${input.html}\n---`,
      },
    ];
  }
  return [
    {
      type: "text",
      text:
        buildPrompt(TEXT_DOCUMENT_NOTE, userFormatHints) +
        `\n\nDOCUMENT (plain text):\n---\n${input.text}\n---`,
    },
  ];
}

// ── Main exported function ─────────────────────────────────────────────────────

export async function parseManuscriptWithClaude(
  input: ParserInput,
  options: ParseOptions = {},
): Promise<ClaudeParseResult> {
  const { input: toolInput, tokens_used } = await invokeBedrockForcedTool({
    modelId: BEDROCK_MODEL_ID,
    maxTokens: MAX_TOKENS,
    tools: [SERMON_TOOL],
    toolName: "save_sermon_structure",
    messages: [{ role: "user", content: buildMessageContent(input, options.userFormatHints) }],
  });

  const rawAnalysis = toolInput.document_analysis;
  const analysis =
    rawAnalysis && typeof rawAnalysis === "object" && !Array.isArray(rawAnalysis)
      ? (rawAnalysis as Record<string, unknown>)
      : null;

  const { data, warnings } = convertToolPayload(toolInput);

  return {
    data,
    tokens_used,
    analysis,
    warnings,
    prompt_version: PROMPT_VERSION,
    model_id: BEDROCK_MODEL_ID,
  };
}
