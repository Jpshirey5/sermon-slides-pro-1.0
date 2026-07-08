// QUICK BUILD LEARNING LOOP — maintains the per-user format profile that gets
// injected into future parses. A small Haiku call PROPOSES hints; all safety
// guards (length caps, N-consistent graduation, formatting-only scope) are
// enforced in code, never delegated to the model.

import { invokeBedrockForcedTool } from "../_shared/bedrock.ts";
import type { StructureDiff } from "./diff.ts";

const PROFILE_MODEL_ID =
  Deno.env.get("QUICK_BUILD_PROFILE_MODEL_ID") ?? "us.anthropic.claude-haiku-4-5";
const MAX_PROFILE_CHARS = 800;
const MAX_HINT_CHARS = 160;
const MAX_HINTS = 8;
// A hint must be proposed in this many consecutive finalizations before it
// graduates into the profile text that future parses actually see.
const GRADUATION_COUNT = 2;

export interface CandidateHint {
  hint: string;
  seen_count: number;
}

const HINT_TOOL = {
  name: "propose_format_hints",
  description:
    "Report the durable formatting conventions observed in this user's sermon documents.",
  input_schema: {
    type: "object",
    properties: {
      hints: { type: "array", items: { type: "string" } },
    },
    required: ["hints"],
  },
};

const HINT_PROMPT = `You maintain a short memory of how one specific pastor formats their sermon documents, so an automated parser can read their future uploads more accurately.

You are given:
1. EXISTING HINTS from previous uploads.
2. The parser's DOCUMENT ANALYSIS of the latest upload.
3. A CORRECTIONS DIFF showing what the user fixed after parsing (points the parser missed or over-extracted, verses that were missing or attached to the wrong point).

Propose an updated list of hints. Rules:
- Each hint describes a durable FORMATTING convention only (e.g., "Marks main points with standalone ALL-CAPS lines", "Lists scripture references in a block at the end of each point", "Includes an announcements section before the sermon that must be ignored").
- Never include sermon content, theology, names, or one-off observations from a single document.
- If an existing hint is still consistent with this upload, repeat it VERBATIM, character for character.
- Drop existing hints that this upload contradicts.
- Add a new hint only when this upload's corrections clearly suggest one.
- At most 6 hints, each a single sentence under 120 characters.

EXISTING HINTS:
{EXISTING_HINTS}

DOCUMENT ANALYSIS (parser's read of the latest upload):
{DOCUMENT_ANALYSIS}

CORRECTIONS DIFF (what the user fixed):
{DIFF}

Call propose_format_hints exactly once with the updated hint list.`;

const normalizeHint = (hint: string): string =>
  hint.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();

function sanitizeHints(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((h): h is string => typeof h === "string")
    .map((h) => h.trim())
    .filter((h) => h.length > 0)
    .map((h) => h.slice(0, MAX_HINT_CHARS))
    .slice(0, MAX_HINTS);
}

/**
 * Merge proposed hints into candidates: a proposed hint matching an existing
 * candidate increments its count; unrepeated candidates are dropped (a hint must
 * hold across consecutive corrected uploads to survive — this is the drift guard).
 */
export function mergeCandidateHints(
  existing: CandidateHint[],
  proposed: string[],
): CandidateHint[] {
  const existingByKey = new Map(existing.map((c) => [normalizeHint(c.hint), c]));
  const merged: CandidateHint[] = [];
  const used = new Set<string>();
  for (const hint of proposed) {
    const key = normalizeHint(hint);
    if (!key || used.has(key)) continue;
    used.add(key);
    const prior = existingByKey.get(key);
    merged.push({ hint, seen_count: prior ? prior.seen_count + 1 : 1 });
  }
  return merged.slice(0, MAX_HINTS);
}

export function buildProfileText(candidates: CandidateHint[]): string {
  const graduated = candidates.filter((c) => c.seen_count >= GRADUATION_COUNT);
  let text = "";
  for (const candidate of graduated) {
    const line = `- ${candidate.hint}\n`;
    if (text.length + line.length > MAX_PROFILE_CHARS) break;
    text += line;
  }
  return text.trim();
}

export interface ProfileUpdateInput {
  userId: string;
  accountId: string;
  documentAnalysis: Record<string, unknown> | null;
  diff: StructureDiff;
}

// deno-lint-ignore no-explicit-any
export async function updateFormatProfile(supabaseAdmin: any, input: ProfileUpdateInput): Promise<void> {
  const { data: profileRow } = await supabaseAdmin
    .from("quick_build_user_profiles")
    .select("profile_text, candidate_hints, parse_count, meaningful_correction_count")
    .eq("user_id", input.userId)
    .maybeSingle();

  const existingCandidates: CandidateHint[] = Array.isArray(profileRow?.candidate_hints)
    ? (profileRow.candidate_hints as CandidateHint[]).filter(
        (c) => c && typeof c.hint === "string" && Number.isInteger(c.seen_count),
      )
    : [];

  const prompt = HINT_PROMPT
    .replace(
      "{EXISTING_HINTS}",
      existingCandidates.length
        ? existingCandidates.map((c) => `- ${c.hint}`).join("\n")
        : "(none yet)",
    )
    .replace("{DOCUMENT_ANALYSIS}", JSON.stringify(input.documentAnalysis ?? {}, null, 2))
    .replace(
      "{DIFF}",
      JSON.stringify(
        {
          points_added: input.diff.points_added,
          points_removed: input.diff.points_removed,
          verses_added: input.diff.verses_added,
          verses_removed: input.diff.verses_removed,
          verses_moved: input.diff.verses_moved,
        },
        null,
        2,
      ),
    );

  const result = await invokeBedrockForcedTool({
    modelId: PROFILE_MODEL_ID,
    maxTokens: 1024,
    tools: [HINT_TOOL],
    toolName: "propose_format_hints",
    messages: [{ role: "user", content: [{ type: "text", text: prompt }] }],
  });

  const proposed = sanitizeHints(result.input.hints);
  const candidates = mergeCandidateHints(existingCandidates, proposed);
  const profileText = buildProfileText(candidates);

  await supabaseAdmin.from("quick_build_user_profiles").upsert(
    {
      user_id: input.userId,
      account_id: input.accountId,
      profile_text: profileText || null,
      candidate_hints: candidates,
      parse_count: (profileRow?.parse_count ?? 0) + 1,
      meaningful_correction_count: (profileRow?.meaningful_correction_count ?? 0) + 1,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
}
