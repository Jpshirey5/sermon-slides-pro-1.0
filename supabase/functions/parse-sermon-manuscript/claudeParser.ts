// QUICK BUILD ADDITION — AWS Bedrock API call + schema validation of the returned data.
// The model now reviews the actual document (native PDF input, or structure-preserving
// HTML for .docx) and returns its result through a forced tool call, so the output is
// schema-shaped by the API rather than free-form JSON text.

import { invokeBedrockForcedTool } from "../_shared/bedrock.ts";

// ── Bedrock config ─────────────────────────────────────────────────────────────
// QUICK_BUILD_MODEL_ID lets prod A/B a different model without a code deploy;
// model_id is recorded on every quick_build_usage row so drift stays visible.
export const BEDROCK_MODEL_ID = Deno.env.get("QUICK_BUILD_MODEL_ID") ?? "us.anthropic.claude-sonnet-4-6";
// Analysis scratchpad fields consume output budget on top of the extraction.
const MAX_TOKENS = 12288;

// Bump on every prompt/schema iteration so accuracy is comparable across versions.
export const PROMPT_VERSION = "v2-2026-07";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ParsedScriptureRef {
  raw_text: string;
  book: string;
  chapter: number;
  start_verse: number;
  end_verse: number | null;
  point_index: number | null;
  subpoint_index: number | null;
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
  prompt_version: string;
  model_id: string;
}

export interface ParseOptions {
  /** Per-user format hints from quick_build_user_profiles (Phase 2 learning loop). */
  userFormatHints?: string;
}

// ── Prompt ─────────────────────────────────────────────────────────────────────

const PROMPT = `You are a sermon manuscript parser for a church presentation software platform. Your job is to read through and review the sermon document provided ({DOCUMENT_NOTE}) and extract structured data from it, whether it is a full manuscript, an outline, or a sermon handout.

Pastors format their sermons in many different ways. Do NOT assume one fixed format. First infer how THIS document marks its structure, then extract using the convention you identified.
{USER_FORMAT_HINTS}
WORK IN TWO STEPS, IN THIS ORDER:

STEP 1 — ANALYZE THE DOCUMENT. Fill in the document_analysis fields FIRST, before any extraction fields:
- point_marker_convention: how this document marks its main points (e.g., "bold numbered headings", "standalone ALL-CAPS lines", "'Big Idea:' labels", "underlined sentences", "fill-in-the-blank lines")
- subpoint_marker_convention: how subpoints are marked, or "none"
- verse_placement_convention: where scripture citations sit relative to points (e.g., "inline in body text", "in parentheses on the point line", "'Scripture:' labeled lines", "listed in a block at the end of each point section")
- non_sermon_sections: any sections that are NOT sermon content (announcements, welcome, worship order, offering, prayer, speaker/stage notes, etc.); empty array if none
- expected_point_count: how many main points the document appears to contain

Within one document, main points almost always share a single marking convention. Sermons typically have 2 to 7 main points. If a candidate line does not match the convention the other points use, it is probably not a main point.

STEP 2 — EXTRACT the structured data below, applying the convention you identified in STEP 1.

STRICT RULES:
1. Never fabricate sermon points, subpoints, or scripture references that do not appear in the document.
2. Never guess at scripture references. If a passage is implied but not cited, skip it.
3. If a scripture reference is ambiguous or clearly malformed in a way you cannot resolve, skip it entirely.
4. If you cannot parse the document at all, still fill document_analysis with your best reading, and use {"title":"Untitled Sermon","series":null,"points":[],"scripture_references":[]} for the extraction fields.

EXTRACTION RULES FOR TITLE:
- Look for the first major heading, bolded title, or clearly labeled sermon title
- If the document starts with "Title:", "Sermon:", or "Message:" followed by text, use that text
- If no title is found, use "Untitled Sermon"
- The sermon title must never also appear as a sermon point

EXTRACTION RULES FOR SERIES:
- Look for "Series:", "Part of:", "Week", "Part" followed by a series name
- Common patterns: "Series: Walking by Faith", "Part 3 of: The Beatitudes"
- If no series is mentioned, return null

EXTRACTION RULES FOR SERMON POINTS:
- Sermon points are the main structural divisions of the sermon's teaching content
- Recognize whatever marking convention this document actually uses, including:
  - Numbered or lettered outlines (1, 2, 3 / I, II, III / A, B, C), heading styles, or bolded headings
  - Standalone ALL-CAPS lines used as section headers
  - Standalone bold or underlined sentences that function as headers
  - Labels such as "Point 1:", "Main Point:", "Big Idea:", "Truth:", "Move 1:", "Takeaway:"
  - Fill-in-the-blank handout lines containing blanks like "______" — extract the line as the point title and keep the blank as written; if the document also provides the filled-in answer, use the completed text instead
- NEVER extract the following as sermon points (or as the title):
  - Announcements, welcome/greeting, worship order or song titles, prayer, offering, benediction
  - Illustration or story headers, block quotes, and quoted material
  - Application/"So what?"/challenge paragraphs, unless the document labels them as a point
  - Speaker or stage notes, dates, times, venue names, speaker names
  - The introduction or conclusion, unless explicitly labeled as a point
  - A scripture citation on its own line is a verse, never a point title
- Extract the heading/title of each point, but STRIP all leading numbering and labeling so the title contains only the substantive statement.
- Specifically strip from the start of the title:
  - Arabic numerals with separators: "1.", "1)", "1:", "1 -", "1 –", "(1)"
  - Roman numerals with separators: "I.", "II)", "III:", "IV -"
  - Letter outlines: "A.", "B)", "a.", "b)"
  - Labels like "Point 1:", "Point One:", "Main Point:", "Big Idea:", "Heading:", "Section 2 —", "Part 3:"
  - Any combination of the above (e.g., "Point 1. ", "1) Main Point —")
- Also strip any leading whitespace, dashes, em-dashes, en-dashes, colons, or bullet characters (•, *, -, –, —) left behind after removing the numbering.
- Preserve the substantive wording exactly as written — only the numbering/labeling prefix is removed.
- Examples of correct stripping:
  - "Point 1: God is love" → "God is love"
  - "1. God is love" → "God is love"
  - "1) God is love" → "God is love"
  - "I. God is love" → "God is love"
  - "Main Point: God is love" → "God is love"
  - "Point One — God is love" → "God is love"
  - "(2) God is love" → "God is love"
- Write a 1 to 2 sentence summary of the content under that point

EXTRACTION RULES FOR SUBPOINTS:
- Subpoints are clearly subordinate divisions nested under a main point: letter outlines ("a.", "b)", "A.", "B."), roman numerals at a deeper level ("i.", "ii."), nested/indented bullets, or deeper heading levels under a main point's heading
- Record each subpoint in its parent point's "subpoints" array, in document order
- Strip leading numbering/labeling from subpoint titles using the same stripping rules as main points
- Do NOT promote subpoints to main points, and do NOT extract ordinary body sentences or paragraph text as subpoints — only clearly marked subordinate headings/outline items
- If a point has no subpoints, use an empty array

EXTRACTION RULES FOR SCRIPTURE REFERENCES:
- Extract ONLY explicit Bible citations that follow recognizable patterns:
  - "John 3:16" — book chapter:verse
  - "Romans 3:23-25" — book chapter:startVerse-endVerse
  - "Matthew 5:3-12" — range
  - "(see Psalm 23)" — parenthetical citation
  - "[Hebrews 11:1]" — bracketed citation
  - "1 Corinthians 13:4-7" — numbered book with chapter and verse
- Accept all standard book name formats: full name, common abbreviation (Gen, Ex, Lev, Num, Deut, Josh, Judg, Ruth, 1 Sam, 2 Sam, 1 Kgs, 2 Kgs, 1 Chr, 2 Chr, Ezra, Neh, Esth, Job, Ps, Prov, Eccl, Song, Isa, Jer, Lam, Ezek, Dan, Hos, Joel, Amos, Obad, Jonah, Mic, Nah, Hab, Zeph, Hag, Zech, Mal, Matt, Mark, Luke, John, Acts, Rom, 1 Cor, 2 Cor, Gal, Eph, Phil, Col, 1 Thess, 2 Thess, 1 Tim, 2 Tim, Titus, Phlm, Heb, Jas, 1 Pet, 2 Pet, 1 John, 2 John, 3 John, Jude, Rev)
- Accept spelled-out ordinals: "First Corinthians", "Second Peter", "Third John"
- CROSS-CHAPTER RANGES: a citation may span chapters, written as "book chapter:verse-chapter:verse" (e.g., "1 John 1:5-2:2" means 1 John chapter 1 verse 5 through chapter 2 verse 2). Always extract these — never skip them. Because each reference entry covers a single chapter, split a cross-chapter citation into consecutive single-chapter references that together cover the full passage:
  - "1 John 1:5-2:2" → one reference for 1 John chapter 1, start_verse 5, end_verse 10 (the last verse of 1 John 1), AND one reference for 1 John chapter 2, start_verse 1, end_verse 2
  - Use your knowledge of the canonical verse counts to end the first chapter's reference at that chapter's final verse. If the span covers three or more chapters, emit one reference per chapter, with the middle chapters running from verse 1 through their final verse.
  - Every reference produced from the same cross-chapter citation keeps the same raw_text (the citation exactly as it appeared, e.g. "1 John 1:5-2:2") and the same point_index and subpoint_index.
- end_verse must always be a verse within the same chapter as start_verse (cross-chapter spans are represented by the split rule above, never by an end_verse in a different chapter)
- Do NOT extract general references like "the Psalms", "the Gospels", or "Paul's letter to the Romans" without a specific chapter and verse
- For each valid reference, record: the raw text as it appeared, the normalized book name, the chapter number, the start verse, the end verse (null if single verse), which sermon point it belongs to, and which subpoint (if any) it falls under
- For point_index: identify which sermon point this scripture reference falls under based on its position in the document. Use 0 for the first point, 1 for the second point, 2 for the third point, and so on. If a reference appears before any sermon point (e.g., in the introduction or as a sermon-wide opening passage), use null. References must be associated with the point they appear under in the document — not the point that quotes them earliest or shares a theme. Preserve the original document order. Apply these placement rules:
  - References listed in a block or list at the END of a point's section belong to THAT point, not the next one
  - References in parentheses on a point's own heading line (e.g., "God keeps His promises (Hebrews 6:13-18)") get that point's index
  - References on labeled lines like "Scripture:", "Text:", "Passage:", or "Read:" attach to the nearest preceding point; use null if no point precedes them
- For subpoint_index: if the reference appears under a specific subpoint of its point, use that subpoint's index within the point (0 for the first subpoint, 1 for the second, and so on). If the reference sits directly under the main point (not under any subpoint), use null. If point_index is null, subpoint_index must also be null.

CANONICAL BOOK NAMES — always normalize extracted book names to one of these exact strings:
Genesis, Exodus, Leviticus, Numbers, Deuteronomy, Joshua, Judges, Ruth, 1 Samuel, 2 Samuel, 1 Kings, 2 Kings, 1 Chronicles, 2 Chronicles, Ezra, Nehemiah, Esther, Job, Psalms, Proverbs, Ecclesiastes, Song of Solomon, Isaiah, Jeremiah, Lamentations, Ezekiel, Daniel, Hosea, Joel, Amos, Obadiah, Jonah, Micah, Nahum, Habakkuk, Zephaniah, Haggai, Zechariah, Malachi, Matthew, Mark, Luke, John, Acts, Romans, 1 Corinthians, 2 Corinthians, Galatians, Ephesians, Philippians, Colossians, 1 Thessalonians, 2 Thessalonians, 1 Timothy, 2 Timothy, Titus, Philemon, Hebrews, James, 1 Peter, 2 Peter, 1 John, 2 John, 3 John, Jude, Revelation

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
        },
        required: [
          "point_marker_convention",
          "subpoint_marker_convention",
          "verse_placement_convention",
          "non_sermon_sections",
          "expected_point_count",
        ],
      },
      title: { type: "string" },
      series: { type: ["string", "null"] },
      points: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            summary: { type: "string" },
            subpoints: {
              type: "array",
              items: {
                type: "object",
                properties: { title: { type: "string" } },
                required: ["title"],
              },
            },
          },
          required: ["title", "summary", "subpoints"],
        },
      },
      scripture_references: {
        type: "array",
        items: {
          type: "object",
          properties: {
            raw_text: { type: "string" },
            book: { type: "string" },
            chapter: { type: "integer" },
            start_verse: { type: "integer" },
            end_verse: { type: ["integer", "null"] },
            point_index: { type: ["integer", "null"] },
            subpoint_index: { type: ["integer", "null"] },
          },
          required: [
            "raw_text",
            "book",
            "chapter",
            "start_verse",
            "end_verse",
            "point_index",
            "subpoint_index",
          ],
        },
      },
    },
    required: ["document_analysis", "title", "series", "points", "scripture_references"],
  },
};

// ── Shape validation (backstop behind the tool schema) ────────────────────────

function validateShape(value: unknown): ParsedManuscript {
  if (!value || typeof value !== "object")
    throw new Error("Parser returned non-object");
  const v = value as any;
  if (typeof v.title !== "string") throw new Error("Parser returned no title");
  if (!(v.series === null || v.series === undefined || typeof v.series === "string"))
    throw new Error("Parser series invalid");
  if (!Array.isArray(v.points)) throw new Error("Parser points invalid");
  if (!Array.isArray(v.scripture_references))
    throw new Error("Parser scripture_references invalid");

  const points: ParsedPoint[] = v.points
    .filter((p: any) => p && typeof p.title === "string")
    .map((p: any) => ({
      title: String(p.title || "").trim(),
      summary: typeof p.summary === "string" ? p.summary.trim() : "",
      subpoints: Array.isArray(p.subpoints)
        ? p.subpoints
            .filter((s: any) => s && typeof s.title === "string")
            .map((s: any) => ({ title: String(s.title).trim() }))
            .filter((s: ParsedSubpoint) => s.title.length > 0)
        : [],
    }))
    .filter((p: ParsedPoint) => p.title.length > 0);

  const refs: ParsedScriptureRef[] = v.scripture_references
    .filter(
      (r: any) =>
        r &&
        typeof r.book === "string" &&
        Number.isInteger(r.chapter) &&
        Number.isInteger(r.start_verse),
    )
    .map((r: any) => ({
      raw_text:
        typeof r.raw_text === "string"
          ? r.raw_text
          : `${r.book} ${r.chapter}:${r.start_verse}`,
      book: String(r.book).trim(),
      chapter: Number(r.chapter),
      start_verse: Number(r.start_verse),
      end_verse:
        r.end_verse === null || r.end_verse === undefined
          ? null
          : Number(r.end_verse),
      point_index:
        Number.isInteger(r.point_index) && r.point_index >= 0
          ? Number(r.point_index)
          : null,
      subpoint_index:
        Number.isInteger(r.subpoint_index) && r.subpoint_index >= 0
          ? Number(r.subpoint_index)
          : null,
    }));

  return {
    title: v.title.trim() || "Untitled Sermon",
    series: v.series ? String(v.series).trim() || null : null,
    points,
    scripture_references: refs,
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

  return {
    data: validateShape(toolInput),
    tokens_used,
    analysis,
    prompt_version: PROMPT_VERSION,
    model_id: BEDROCK_MODEL_ID,
  };
}
