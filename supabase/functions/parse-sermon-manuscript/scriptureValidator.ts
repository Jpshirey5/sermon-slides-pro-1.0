// QUICK BUILD ADDITION — normalizes parsed refs and fans out to the existing scripture-lookup function.

import type { ParsedScriptureRef } from "./claudeParser.ts";

export interface ValidatedVerseBlock {
  reference: string;
  text: string;
  verses?: { text: string; verse: number }[];
  point_index: number | null;
}

export interface ValidationOutcome {
  validated: ValidatedVerseBlock[];
  warnings: string[];
}

function buildReferenceString(ref: ParsedScriptureRef): string {
  const range =
    ref.end_verse && ref.end_verse !== ref.start_verse
      ? `${ref.start_verse}-${ref.end_verse}`
      : `${ref.start_verse}`;
  return `${ref.book} ${ref.chapter}:${range}`;
}

export async function validateReferences(options: {
  refs: ParsedScriptureRef[];
  translation: string;
  supabaseUrl: string;
  anonKey: string;
}): Promise<ValidationOutcome> {
  const { refs, translation, supabaseUrl, anonKey } = options;
  const validated: ValidatedVerseBlock[] = [];
  const warnings: string[] = [];
  const lookupUrl = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/scripture-lookup`;

  for (const ref of refs) {
    const referenceString = buildReferenceString(ref);
    try {
      const response = await fetch(lookupUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
        },
        body: JSON.stringify({ reference: referenceString, translation }),
      });
      if (!response.ok) {
        warnings.push(`Could not validate reference: '${ref.raw_text}' — please check in Sermon Review`);
        continue;
      }
      const payload = await response.json();
      if (payload?.error || !payload?.text) {
        warnings.push(`Could not validate reference: '${ref.raw_text}' — please check in Sermon Review`);
        continue;
      }
      validated.push({
        reference: payload.reference || referenceString,
        text: payload.text,
        verses: Array.isArray(payload.verses) ? payload.verses : undefined,
        point_index: ref.point_index,
      });
    } catch (_err) {
      warnings.push(`Could not validate reference: '${ref.raw_text}' — please check in Sermon Review`);
    }
  }

  return { validated, warnings };
}
