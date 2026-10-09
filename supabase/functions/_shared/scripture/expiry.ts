// Expiry and revocation rules for licensed scripture. Pure functions with no
// Deno or browser APIs, so the edge functions and the presenter (and later the
// desktop shell) all apply the same rules.
//
// Every check fails closed: a missing or unreadable date counts as expired, and
// a translation we cannot fully vouch for counts as unavailable.

export const DAY_MS = 24 * 60 * 60 * 1000;

/** API.Bible: stored scripture must be refreshed at least every 30 days. */
export const MAX_CACHE_TTL_MS = 30 * DAY_MS;

/** A presenter bundle is never valid for longer than this, even if its text is. */
export const MAX_BUNDLE_TTL_MS = DAY_MS;

export type TranslationStatus = "active" | "suspended" | "revoked";

export interface TranslationRecord {
  id: string;
  status: TranslationStatus;
  is_public_domain: boolean;
  requires_entitlement: boolean;
  /** The Bible id we would fetch with, after any fallback the caller applies. */
  provider_bible_id: string | null;
  copyright_short: string | null;
}

export interface AccessGrant {
  translation_id: string;
  revoked_at: string | null;
}

export type UnavailableReason =
  | "unknown_translation"
  | "suspended"
  | "revoked"
  | "no_source"
  | "missing_copyright"
  | "not_entitled";

export type Availability =
  | { available: true }
  | { available: false; reason: UnavailableReason };

type DateInput = Date | string | number | null | undefined;

function toTime(value: DateInput): number {
  if (value === null || value === undefined || value === "") return NaN;
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

/**
 * When a passage fetched at `fetchedAt` must be refetched. The TTL is clamped
 * to 30 days, so no caller can ask for longer.
 */
export function computeCacheExpiry(fetchedAt: DateInput, ttlMs: number = MAX_CACHE_TTL_MS): Date {
  const fetched = toTime(fetchedAt);
  if (Number.isNaN(fetched)) throw new Error("computeCacheExpiry: fetchedAt is not a valid date");
  const ttl = Number.isFinite(ttlMs) ? Math.min(Math.max(ttlMs, 0), MAX_CACHE_TTL_MS) : 0;
  return new Date(fetched + ttl);
}

/** True once `now` reaches `expiresAt`. Missing or invalid dates are expired. */
export function isExpired(expiresAt: DateInput, now: DateInput = Date.now()): boolean {
  const expires = toTime(expiresAt);
  const current = toTime(now);
  if (Number.isNaN(expires) || Number.isNaN(current)) return true;
  return current >= expires;
}

/**
 * Can this account show this translation right now?
 * `grants` are the account's rows from account_translation_access.
 */
export function checkTranslationAvailability(
  translation: TranslationRecord | null | undefined,
  grants: readonly AccessGrant[] = [],
): Availability {
  if (!translation) return { available: false, reason: "unknown_translation" };
  if (translation.status === "revoked") return { available: false, reason: "revoked" };
  if (translation.status !== "active") return { available: false, reason: "suspended" };
  if (!translation.provider_bible_id?.trim()) return { available: false, reason: "no_source" };
  if (!translation.is_public_domain && !translation.copyright_short?.trim()) {
    return { available: false, reason: "missing_copyright" };
  }
  if (translation.requires_entitlement) {
    const id = translation.id.toUpperCase();
    const granted = grants.some((g) => g.translation_id.toUpperCase() === id && !g.revoked_at);
    if (!granted) return { available: false, reason: "not_entitled" };
  }
  return { available: true };
}

/** The earliest of the given dates, or null if none are valid. */
export function earliestExpiry(dates: readonly DateInput[]): Date | null {
  let min = Infinity;
  for (const d of dates) {
    const t = toTime(d);
    if (!Number.isNaN(t) && t < min) min = t;
  }
  return min === Infinity ? null : new Date(min);
}

/**
 * When a whole bundle stops being valid: the earliest item expiry, but never
 * more than 24 hours after it was issued. Items with no scripture pass null.
 */
export function computeBundleExpiry(itemExpiries: readonly DateInput[], issuedAt: DateInput): Date {
  const issued = toTime(issuedAt);
  if (Number.isNaN(issued)) throw new Error("computeBundleExpiry: issuedAt is not a valid date");
  const cap = issued + MAX_BUNDLE_TTL_MS;
  const earliest = earliestExpiry(itemExpiries);
  return new Date(earliest ? Math.min(earliest.getTime(), cap) : cap);
}

export interface CacheRowRef {
  translation_id: string;
  expires_at: DateInput;
}

/**
 * Should this cached passage be deleted? Yes if it expired, or its translation
 * is unknown or no longer active. Mirrors public.presenter_housekeeping().
 */
export function shouldPurgeCacheRow(
  row: CacheRowRef,
  statusByTranslation: ReadonlyMap<string, TranslationStatus>,
  now: DateInput = Date.now(),
): boolean {
  if (isExpired(row.expires_at, now)) return true;
  const status = statusByTranslation.get(row.translation_id);
  return status !== "active";
}

/** The cached rows that must be deleted, from a list of candidates. */
export function selectRowsToPurge<T extends CacheRowRef>(
  rows: readonly T[],
  statusByTranslation: ReadonlyMap<string, TranslationStatus>,
  now: DateInput = Date.now(),
): T[] {
  return rows.filter((row) => shouldPurgeCacheRow(row, statusByTranslation, now));
}
