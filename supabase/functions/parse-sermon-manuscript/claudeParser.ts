// QUICK BUILD ADDITION — AWS Bedrock API call + schema validation of the returned JSON.
// Rerouted from direct Anthropic API to AWS Bedrock (Claude Sonnet 4.6).
// Exported function signature is identical — index.ts requires no changes.

// ── Bedrock config ─────────────────────────────────────────────────────────────
const BEDROCK_MODEL_ID = "us.anthropic.claude-sonnet-4-6";
const MAX_TOKENS = 4096;

// ── Types (unchanged) ──────────────────────────────────────────────────────────

export interface ParsedScriptureRef {
  raw_text: string;
  book: string;
  chapter: number;
  start_verse: number;
  end_verse: number | null;
  point_index: number | null;
}

export interface ParsedPoint {
  title: string;
  summary: string;
}

export interface ParsedManuscript {
  title: string;
  series: string | null;
  points: ParsedPoint[];
  scripture_references: ParsedScriptureRef[];
}

export interface ClaudeParseResult {
  data: ParsedManuscript;
  tokens_used: number;
}

// ── Prompt (unchanged) ─────────────────────────────────────────────────────────

const PROMPT = `You are a sermon manuscript parser for a church presentation software platform. Your job is to extract structured data from a sermon manuscript or outline document.

STRICT OUTPUT RULES:
1. Return ONLY a valid JSON object. No markdown formatting, no code fences, no explanations before or after the JSON.
2. Your response must begin with { and end with }. Nothing else.
3. If you cannot parse the manuscript, return: {"title":"Untitled Sermon","series":null,"points":[],"scripture_references":[]}
4. Never fabricate sermon points or scripture references that do not appear in the manuscript.
5. Never guess at scripture references. If a passage is implied but not cited, skip it.
6. If a scripture reference is ambiguous or clearly malformed in a way you cannot resolve, skip it entirely.

EXTRACTION RULES FOR TITLE:
- Look for the first major heading, bolded title, or clearly labeled sermon title
- If the document starts with "Title:", "Sermon:", or "Message:" followed by text, use that text
- If no title is found, use "Untitled Sermon"

EXTRACTION RULES FOR SERIES:
- Look for "Series:", "Part of:", "Week", "Part" followed by a series name
- Common patterns: "Series: Walking by Faith", "Part 3 of: The Beatitudes"
- If no series is mentioned, return null

EXTRACTION RULES FOR SERMON POINTS:
- Sermon points are the main structural divisions of the sermon
- They are typically numbered (1, 2, 3 or I, II, III), bolded, or clearly labeled as "Point 1:", "Main Point:", etc.
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
- Do NOT extract sub-points as separate points unless they are clearly labeled as main points
- Do NOT extract the introduction or conclusion as sermon points unless explicitly labeled as such

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
- Do NOT extract general references like "the Psalms", "the Gospels", or "Paul's letter to the Romans" without a specific chapter and verse
- For each valid reference, record: the raw text as it appeared, the normalized book name, the chapter number, the start verse, the end verse (null if single verse), and which sermon point it belongs to
- For point_index: identify which sermon point this scripture reference falls under based on its position in the manuscript. Use 0 for the first point, 1 for the second point, 2 for the third point, and so on. If a reference appears before any sermon point (e.g., in the introduction or as a sermon-wide opening passage), use null. References must be associated with the point they appear under in the manuscript — not the point that quotes them earliest or shares a theme. Preserve the original document order.

CANONICAL BOOK NAMES — always normalize extracted book names to one of these exact strings:
Genesis, Exodus, Leviticus, Numbers, Deuteronomy, Joshua, Judges, Ruth, 1 Samuel, 2 Samuel, 1 Kings, 2 Kings, 1 Chronicles, 2 Chronicles, Ezra, Nehemiah, Esther, Job, Psalms, Proverbs, Ecclesiastes, Song of Solomon, Isaiah, Jeremiah, Lamentations, Ezekiel, Daniel, Hosea, Joel, Amos, Obadiah, Jonah, Micah, Nahum, Habakkuk, Zephaniah, Haggai, Zechariah, Malachi, Matthew, Mark, Luke, John, Acts, Romans, 1 Corinthians, 2 Corinthians, Galatians, Ephesians, Philippians, Colossians, 1 Thessalonians, 2 Thessalonians, 1 Timothy, 2 Timothy, Titus, Philemon, Hebrews, James, 1 Peter, 2 Peter, 1 John, 2 John, 3 John, Jude, Revelation

RETURN THIS EXACT JSON STRUCTURE:
{
  "title": "string",
  "series": "string or null",
  "points": [
    {
      "title": "string — the heading of this sermon point exactly as written",
      "summary": "string — 1 to 2 sentence summary of the content under this point"
    }
  ],
  "scripture_references": [
    {
      "raw_text": "string — exactly as it appeared in the manuscript",
      "book": "string — canonical book name from the list above",
      "chapter": integer,
      "start_verse": integer,
      "end_verse": integer or null,
      "point_index": integer or null
    }
  ]
}

NOW PARSE THE FOLLOWING MANUSCRIPT AND RETURN ONLY THE JSON OBJECT:

---
{MANUSCRIPT_TEXT}
---`;

// ── AWS Signature V4 signing ───────────────────────────────────────────────────

async function hmacSHA256(
  key: ArrayBuffer | string,
  data: string,
): Promise<ArrayBuffer> {
  const keyBuffer =
    typeof key === "string" ? new TextEncoder().encode(key) : key;
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data));
}

async function sha256Hex(data: string): Promise<string> {
  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(data),
  );
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function bufToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function buildBedrockHeaders(
  region: string,
  accessKeyId: string,
  secretAccessKey: string,
  path: string,
  body: string,
): Promise<Record<string, string>> {
  const service = "bedrock";
  const now = new Date();
  const amzDate =
    now.toISOString().replace(/[:-]|\.\d{3}/g, "").slice(0, 15) + "Z";
  const dateStamp = amzDate.slice(0, 8);
  const host = `bedrock-runtime.${region}.amazonaws.com`;
  const payloadHash = await sha256Hex(body);

  const canonicalHeaders =
    `content-type:application/json\n` +
    `host:${host}\n` +
    `x-amz-date:${amzDate}\n`;
  const signedHeaders = "content-type;host;x-amz-date";

  const canonicalRequest = [
    "POST",
    path,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const canonicalRequestHash = await sha256Hex(canonicalRequest);
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    canonicalRequestHash,
  ].join("\n");

  const kDate = await hmacSHA256(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = await hmacSHA256(kDate, region);
  const kService = await hmacSHA256(kRegion, service);
  const kSigning = await hmacSHA256(kService, "aws4_request");
  const signature = bufToHex(await hmacSHA256(kSigning, stringToSign));

  const authorizationHeader =
    `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    "Content-Type": "application/json",
    "X-Amz-Date": amzDate,
    Authorization: authorizationHeader,
  };
}

// ── JSON helpers (unchanged) ───────────────────────────────────────────────────

function extractFirstJsonObject(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) return trimmed;
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
  return null;
}

function validateShape(value: unknown): ParsedManuscript {
  if (!value || typeof value !== "object")
    throw new Error("Parser returned non-object");
  const v = value as any;
  if (typeof v.title !== "string") throw new Error("Parser returned no title");
  if (!(v.series === null || typeof v.series === "string"))
    throw new Error("Parser series invalid");
  if (!Array.isArray(v.points)) throw new Error("Parser points invalid");
  if (!Array.isArray(v.scripture_references))
    throw new Error("Parser scripture_references invalid");

  const points: ParsedPoint[] = v.points
    .filter((p: any) => p && typeof p.title === "string")
    .map((p: any) => ({
      title: String(p.title || "").trim(),
      summary: typeof p.summary === "string" ? p.summary.trim() : "",
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
    }));

  return {
    title: v.title.trim() || "Untitled Sermon",
    series: v.series ? String(v.series).trim() || null : null,
    points,
    scripture_references: refs,
  };
}

// ── Main exported function (signature unchanged — index.ts needs no changes) ───

export async function parseManuscriptWithClaude(
  manuscriptText: string,
): Promise<ClaudeParseResult> {
  // Read AWS credentials from Supabase Edge Function secrets
  const accessKeyId = Deno.env.get("AWS_ACCESS_KEY_ID") ?? "";
  const secretAccessKey = Deno.env.get("AWS_SECRET_ACCESS_KEY") ?? "";
  const region = Deno.env.get("AWS_REGION") ?? "us-east-1";

  if (!accessKeyId || !secretAccessKey) {
    throw new Error("AWS_ACCESS_KEY_ID or AWS_SECRET_ACCESS_KEY is not configured");
  }

  const filledPrompt = PROMPT.replace("{MANUSCRIPT_TEXT}", manuscriptText);

  const encodedModelId = encodeURIComponent(BEDROCK_MODEL_ID);
  const path = `/model/${encodedModelId}/invoke`;
  const endpoint = `https://bedrock-runtime.${region}.amazonaws.com${path}`;

  const requestBody = JSON.stringify({
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: MAX_TOKENS,
    temperature: 0,
    messages: [{ role: "user", content: filledPrompt }],
  });

  const headers = await buildBedrockHeaders(
    region,
    accessKeyId,
    secretAccessKey,
    path,
    requestBody,
  );

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: requestBody,
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(
      `Bedrock API error ${response.status}: ${errBody.slice(0, 400)}`,
    );
  }

  const payload = await response.json();
  const inputTokens = payload?.usage?.input_tokens || 0;
  const outputTokens = payload?.usage?.output_tokens || 0;
  const tokens_used = inputTokens + outputTokens;

  const contentBlock = Array.isArray(payload?.content)
    ? payload.content[0]
    : null;
  const rawText: string =
    typeof contentBlock?.text === "string" ? contentBlock.text : "";

  const jsonSlice = extractFirstJsonObject(rawText);
  if (!jsonSlice) throw new Error("Parser returned no JSON");

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonSlice);
  } catch (err) {
    throw new Error(
      `Parser returned invalid JSON: ${(err as Error).message}`,
    );
  }

  return { data: validateShape(parsed), tokens_used };
}