// Resolve structured references to verse text for display inside SSP.
//
// Order of checks, so nothing is fetched or stored for a translation we may
// not show:
//   1. references are valid and under the verse cap
//   2. the translation is known, active, has a source and a copyright line,
//      and (if it needs one) the account holds a live grant
//   3. fresh cache rows are used as is; missing or expired ones are fetched
//      from API.Bible and stored with a 30 day expiry
//
// Race note: if a translation is revoked while a request is mid-flight, a
// fetched row can land after the revoke trigger purged the cache. The hourly
// presenter_housekeeping job deletes rows of non-active translations, which
// keeps us well inside the 72 hour removal promise.

import { ApiBibleError, type ApiBibleClient, type FetchedVerse } from "./apiBible.ts";
import { fullNotice, slideAttribution } from "./attribution.ts";
import {
  checkTranslationAvailability,
  computeCacheExpiry,
  isExpired,
  type UnavailableReason,
} from "./expiry.ts";
import {
  formatReference,
  type NormalizedPassage,
  normalizePassage,
  passageId,
  type PassageRef,
  validatePassage,
  verseCount,
} from "./references.ts";
import type { CacheRow, ScriptureStore, TranslationRow } from "./store.ts";

export const DEFAULT_MAX_VERSES = 300;
const FETCH_CONCURRENCY = 4;

export interface ResolverDeps {
  store: ScriptureStore;
  /** Null when BIBLE_API_KEY is not set; cached text can still be served. */
  api: ApiBibleClient | null;
  /** Fallback for Bible ids kept in secrets (BIBLE_ID_NIV and so on). */
  bibleIdFallback?: (translationId: string) => string | null;
  now?: () => Date;
}

export interface ResolveRequest {
  accountId: string;
  translationId: string;
  passages: readonly PassageRef[];
  maxVerses?: number;
}

export interface ResolvedTranslation {
  id: string;
  name: string;
  /** Shown on every slide with this translation's text. */
  attribution: string;
  /** Shown on the credits slide and from the operator view. */
  notice: string;
  is_public_domain: boolean;
}

export interface ResolvedPassage {
  passage_id: string;
  ref: NormalizedPassage;
  /** "John 3:16-17" */
  reference: string;
  verses: FetchedVerse[];
  fums_token: string | null;
  expires_at: string;
}

export type MissingReason = "not_found" | "upstream" | "not_configured";

export type ResolveResult =
  | {
    ok: true;
    translation: ResolvedTranslation;
    passages: ResolvedPassage[];
    missing: { passage_id: string; reason: MissingReason }[];
  }
  | { ok: false; reason: UnavailableReason | "invalid_reference" | "too_many_verses" };

export type TranslationCheck =
  | { ok: true; translation: TranslationRow; bibleId: string; resolved: ResolvedTranslation }
  | { ok: false; reason: UnavailableReason };

/**
 * Is this translation showable for this account right now? Fills a missing
 * copyright line from the provider first, so a translation with a source is
 * not blocked just because nobody typed its notice in.
 */
export async function checkTranslation(
  deps: ResolverDeps,
  accountId: string,
  translationId: string,
): Promise<TranslationCheck> {
  const id = translationId.trim().toUpperCase();
  let row = await deps.store.getTranslation(id);
  if (!row) return { ok: false, reason: "unknown_translation" };

  const bibleId = row.provider === "api_bible"
    ? row.provider_bible_id?.trim() || deps.bibleIdFallback?.(row.id) || null
    : null;
  const grants = row.requires_entitlement ? await deps.store.getGrants(accountId) : [];

  let availability = checkTranslationAvailability({ ...row, provider_bible_id: bibleId }, grants);

  if (!availability.available && availability.reason === "missing_copyright" && bibleId && deps.api) {
    try {
      const copyright = await deps.api.fetchCopyright(bibleId);
      if (copyright) {
        await deps.store.setCopyrightIfMissing(row.id, copyright, copyright);
        row = (await deps.store.getTranslation(id)) ?? row;
        availability = checkTranslationAvailability({ ...row, provider_bible_id: bibleId }, grants);
      }
    } catch {
      // Stay unavailable. Better to show nothing than text without its notice.
    }
  }

  if (!availability.available) return { ok: false, reason: availability.reason };

  const attribution = slideAttribution(row);
  const notice = fullNotice(row);
  if (!attribution || !notice || !bibleId) return { ok: false, reason: "missing_copyright" };

  return {
    ok: true,
    translation: row,
    bibleId,
    resolved: { id: row.id, name: row.name, attribution, notice, is_public_domain: row.is_public_domain },
  };
}

async function mapLimited<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function resolvePassages(deps: ResolverDeps, request: ResolveRequest): Promise<ResolveResult> {
  const now = deps.now?.() ?? new Date();
  const maxVerses = request.maxVerses ?? DEFAULT_MAX_VERSES;

  // 1. References.
  if (!request.passages.every((p) => validatePassage(p))) return { ok: false, reason: "invalid_reference" };
  const unique = new Map<string, NormalizedPassage>();
  for (const p of request.passages) unique.set(passageId(p), normalizePassage(p));
  const totalVerses = [...unique.values()].reduce((sum, p) => sum + verseCount(p), 0);
  if (totalVerses > maxVerses) return { ok: false, reason: "too_many_verses" };

  // 2. Translation and access.
  const check = await checkTranslation(deps, request.accountId, request.translationId);
  if (!check.ok) return { ok: false, reason: check.reason };
  const { translation, bibleId } = check;

  // 3. Cache, then API.Bible for anything missing or expired.
  const ids = [...unique.keys()];
  const cached = await deps.store.readCache(translation.id, ids);
  const fresh = new Map<string, CacheRow>();
  for (const row of cached) if (!isExpired(row.expires_at, now)) fresh.set(row.passage_id, row);

  const toFetch = ids.filter((id) => !fresh.has(id));
  const missing: { passage_id: string; reason: MissingReason }[] = [];
  const written: CacheRow[] = [];

  if (toFetch.length > 0 && !deps.api) {
    for (const id of toFetch) missing.push({ passage_id: id, reason: "not_configured" });
  } else if (toFetch.length > 0 && deps.api) {
    const api = deps.api;
    const fetched = await mapLimited(toFetch, FETCH_CONCURRENCY, async (id) => {
      try {
        const passage = await api.fetchPassage(bibleId, id, unique.get(id)!.verse_start);
        const row: CacheRow = {
          translation_id: translation.id,
          passage_id: id,
          verses: passage.verses,
          fums_token: passage.fumsToken,
          fetched_at: now.toISOString(),
          expires_at: computeCacheExpiry(now).toISOString(),
        };
        return { kind: "ok" as const, id, row };
      } catch (error) {
        const reason: MissingReason = error instanceof ApiBibleError && error.kind === "not_found" ? "not_found" : "upstream";
        return { kind: "missing" as const, id, reason };
      }
    });
    for (const result of fetched) {
      if (result.kind === "ok") {
        written.push(result.row);
        fresh.set(result.id, result.row);
      } else {
        missing.push({ passage_id: result.id, reason: result.reason });
      }
    }
    await deps.store.writeCache(written);
  }

  const passages: ResolvedPassage[] = [];
  for (const id of ids) {
    const row = fresh.get(id);
    if (!row) continue;
    const ref = unique.get(id)!;
    passages.push({
      passage_id: id,
      ref,
      reference: formatReference(ref),
      verses: row.verses,
      fums_token: row.fums_token,
      expires_at: new Date(row.expires_at).toISOString(),
    });
  }

  return { ok: true, translation: check.resolved, passages, missing };
}
