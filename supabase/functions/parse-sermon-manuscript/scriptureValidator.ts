// QUICK BUILD ADDITION — normalizes parsed refs and fans out to the existing scripture-lookup function.
// Lookups run with the requesting user's JWT (required for ESV entitlement), in parallel
// chunks, with one retry per reference before the ref is reported as a warning.

import type { ParsedScriptureRef } from "./claudeParser.ts";

export interface ValidatedVerseBlock {
  reference: string;
  text: string;
  verses?: { text: string; verse: number }[];
  point_index: number | null;
  subpoint_index: number | null;
}

export interface ValidationOutcome {
  validated: ValidatedVerseBlock[];
  warnings: string[];
}

const LOOKUP_CHUNK_SIZE = 5;

function buildReferenceString(ref: ParsedScriptureRef): string {
  const range =
    ref.end_verse && ref.end_verse !== ref.start_verse
      ? `${ref.start_verse}-${ref.end_verse}`
      : `${ref.start_verse}`;
  return `${ref.book} ${ref.chapter}:${range}`;
}

async function lookupOnce(
  lookupUrl: string,
  headers: Record<string, string>,
  referenceString: string,
  translation: string,
): Promise<{ ok: boolean; payload?: any }> {
  const response = await fetch(lookupUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({ reference: referenceString, translation }),
  });
  if (!response.ok) return { ok: false };
  const payload = await response.json();
  if (payload?.error || !payload?.text) return { ok: false };
  return { ok: true, payload };
}

async function lookupWithRetry(
  lookupUrl: string,
  headers: Record<string, string>,
  ref: ParsedScriptureRef,
  translation: string,
): Promise<ValidatedVerseBlock | null> {
  const referenceString = buildReferenceString(ref);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await lookupOnce(lookupUrl, headers, referenceString, translation);
      if (result.ok) {
        return {
          reference: result.payload.reference || referenceString,
          text: result.payload.text,
          verses: Array.isArray(result.payload.verses) ? result.payload.verses : undefined,
          point_index: ref.point_index,
          subpoint_index: ref.subpoint_index,
        };
      }
    } catch (_err) {
      // network error — fall through to retry
    }
  }
  return null;
}

export async function validateReferences(options: {
  refs: ParsedScriptureRef[];
  translation: string;
  supabaseUrl: string;
  anonKey: string;
  authHeader: string;
}): Promise<ValidationOutcome> {
  const { refs, translation, supabaseUrl, anonKey, authHeader } = options;
  const validated: ValidatedVerseBlock[] = [];
  const warnings: string[] = [];
  const lookupUrl = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/scripture-lookup`;
  // The user's JWT is required: scripture-lookup checks the caller's account for
  // ESV entitlement, which the anon key can never pass.
  const headers: Record<string, string> = {
    "content-type": "application/json",
    apikey: anonKey,
    Authorization: authHeader,
  };

  for (let i = 0; i < refs.length; i += LOOKUP_CHUNK_SIZE) {
    const chunk = refs.slice(i, i + LOOKUP_CHUNK_SIZE);
    const results = await Promise.all(
      chunk.map((ref) => lookupWithRetry(lookupUrl, headers, ref, translation)),
    );
    results.forEach((result, index) => {
      if (result) {
        validated.push(result);
      } else {
        warnings.push(
          `Could not validate reference: '${chunk[index].raw_text}' — please check in Sermon Review`,
        );
      }
    });
  }

  return { validated, warnings };
}
