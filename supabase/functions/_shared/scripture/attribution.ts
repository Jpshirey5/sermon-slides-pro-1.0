// Copyright and attribution lines. Every scripture slide carries one, and the
// full notice is shown on the credits slide and from the operator view.

import type { TranslationRow } from "./store.ts";

type AttributionSource = Pick<TranslationRow, "id" | "name" | "is_public_domain" | "copyright_short" | "copyright_full">;

/** The line shown on the slide, under the text. Null means "do not show this translation". */
export function slideAttribution(t: AttributionSource): string | null {
  const short = t.copyright_short?.trim();
  if (short && !t.is_public_domain) return short;
  if (t.is_public_domain) return `${t.name} (${t.id}), public domain.`;
  return null;
}

/** The full notice for the credits slide and the in-app notice. */
export function fullNotice(t: AttributionSource): string | null {
  const full = t.copyright_full?.trim();
  if (full) return full;
  return slideAttribution(t);
}
