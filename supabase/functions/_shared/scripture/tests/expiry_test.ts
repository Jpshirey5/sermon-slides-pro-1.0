// deno test -A supabase/functions/_shared/scripture/tests/expiry_test.ts

import { assert, assertEquals } from "./assert.ts";
import {
  checkTranslationAvailability,
  computeBundleExpiry,
  computeCacheExpiry,
  DAY_MS,
  earliestExpiry,
  isExpired,
  MAX_BUNDLE_TTL_MS,
  MAX_CACHE_TTL_MS,
  selectRowsToPurge,
  shouldPurgeCacheRow,
  type TranslationRecord,
  type TranslationStatus,
} from "../expiry.ts";

const T0 = new Date("2026-10-01T12:00:00.000Z");
const at = (ms: number) => new Date(T0.getTime() + ms);

const niv = (over: Partial<TranslationRecord> = {}): TranslationRecord => ({
  id: "NIV",
  status: "active",
  is_public_domain: false,
  requires_entitlement: false,
  provider_bible_id: "niv-id",
  copyright_short: "NIV copyright line",
  ...over,
});

// ── computeCacheExpiry ──────────────────────────────────────────────────────

Deno.test("computeCacheExpiry defaults to exactly 30 days", () => {
  assertEquals(computeCacheExpiry(T0).toISOString(), at(30 * DAY_MS).toISOString());
});

Deno.test("computeCacheExpiry never exceeds 30 days, whatever TTL is asked for", () => {
  assertEquals(computeCacheExpiry(T0, 90 * DAY_MS).getTime(), T0.getTime() + MAX_CACHE_TTL_MS);
  assertEquals(computeCacheExpiry(T0, Infinity).getTime(), T0.getTime(), "non-finite TTL expires immediately");
});

Deno.test("computeCacheExpiry honors a shorter TTL and floors negatives at zero", () => {
  assertEquals(computeCacheExpiry(T0, DAY_MS).getTime(), T0.getTime() + DAY_MS);
  assertEquals(computeCacheExpiry(T0, -5).getTime(), T0.getTime());
});

Deno.test("computeCacheExpiry accepts ISO strings and rejects garbage", () => {
  assertEquals(computeCacheExpiry(T0.toISOString(), DAY_MS).getTime(), T0.getTime() + DAY_MS);
  let threw = false;
  try {
    computeCacheExpiry("not a date");
  } catch {
    threw = true;
  }
  assert(threw, "invalid fetchedAt must throw");
});

// ── isExpired ───────────────────────────────────────────────────────────────

Deno.test("isExpired: before, at, and after the boundary", () => {
  const expires = at(DAY_MS);
  assertEquals(isExpired(expires, at(DAY_MS - 1)), false);
  assertEquals(isExpired(expires, at(DAY_MS)), true, "expired exactly at expires_at");
  assertEquals(isExpired(expires, at(DAY_MS + 1)), true);
});

Deno.test("isExpired fails closed on missing or invalid dates", () => {
  assertEquals(isExpired(null, T0), true);
  assertEquals(isExpired(undefined, T0), true);
  assertEquals(isExpired("", T0), true);
  assertEquals(isExpired("garbage", T0), true);
  assertEquals(isExpired(at(DAY_MS), "garbage"), true);
});

Deno.test("isExpired: a 30 day cache entry is valid on day 29 and gone on day 30", () => {
  const expires = computeCacheExpiry(T0);
  assertEquals(isExpired(expires, at(29 * DAY_MS)), false);
  assertEquals(isExpired(expires, at(30 * DAY_MS)), true);
});

// ── checkTranslationAvailability ────────────────────────────────────────────

Deno.test("availability: an active, sourced, attributed translation is available", () => {
  assertEquals(checkTranslationAvailability(niv()), { available: true });
});

Deno.test("availability: revoked and suspended are refused with distinct reasons", () => {
  assertEquals(checkTranslationAvailability(niv({ status: "revoked" })), { available: false, reason: "revoked" });
  assertEquals(checkTranslationAvailability(niv({ status: "suspended" })), { available: false, reason: "suspended" });
});

Deno.test("availability: an unrecognized status is treated as suspended, not active", () => {
  const odd = niv({ status: "paused" as unknown as TranslationStatus });
  assertEquals(checkTranslationAvailability(odd), { available: false, reason: "suspended" });
});

Deno.test("availability: unknown translation and missing source are refused", () => {
  assertEquals(checkTranslationAvailability(null), { available: false, reason: "unknown_translation" });
  assertEquals(checkTranslationAvailability(niv({ provider_bible_id: null })), { available: false, reason: "no_source" });
  assertEquals(checkTranslationAvailability(niv({ provider_bible_id: "  " })), { available: false, reason: "no_source" });
});

Deno.test("availability: copyrighted text without a copyright line is refused", () => {
  assertEquals(
    checkTranslationAvailability(niv({ copyright_short: null })),
    { available: false, reason: "missing_copyright" },
  );
  assertEquals(
    checkTranslationAvailability(niv({ copyright_short: "  " })),
    { available: false, reason: "missing_copyright" },
  );
});

Deno.test("availability: public domain does not need a copyright line", () => {
  const kjv = niv({ id: "KJV", is_public_domain: true, copyright_short: null });
  assertEquals(checkTranslationAvailability(kjv), { available: true });
});

Deno.test("availability: entitlement needs a live grant", () => {
  const esv = niv({ id: "ESV", requires_entitlement: true });
  assertEquals(checkTranslationAvailability(esv, []), { available: false, reason: "not_entitled" });
  assertEquals(
    checkTranslationAvailability(esv, [{ translation_id: "ESV", revoked_at: "2026-10-01T00:00:00Z" }]),
    { available: false, reason: "not_entitled" },
    "a revoked grant does not count",
  );
  assertEquals(
    checkTranslationAvailability(esv, [{ translation_id: "NIV", revoked_at: null }]),
    { available: false, reason: "not_entitled" },
    "a grant for another translation does not count",
  );
  assertEquals(checkTranslationAvailability(esv, [{ translation_id: "esv", revoked_at: null }]), { available: true });
});

Deno.test("availability: revocation wins over an entitlement grant", () => {
  const esv = niv({ id: "ESV", requires_entitlement: true, status: "revoked" });
  assertEquals(
    checkTranslationAvailability(esv, [{ translation_id: "ESV", revoked_at: null }]),
    { available: false, reason: "revoked" },
  );
});

// ── earliestExpiry and computeBundleExpiry ──────────────────────────────────

Deno.test("earliestExpiry picks the minimum and skips nulls", () => {
  assertEquals(earliestExpiry([at(3 * DAY_MS), null, at(DAY_MS), "garbage"])?.getTime(), at(DAY_MS).getTime());
  assertEquals(earliestExpiry([]), null);
  assertEquals(earliestExpiry([null, undefined]), null);
});

Deno.test("computeBundleExpiry is capped at 24 hours after issue", () => {
  const issued = T0;
  assertEquals(computeBundleExpiry([at(10 * DAY_MS)], issued).getTime(), T0.getTime() + MAX_BUNDLE_TTL_MS);
  assertEquals(computeBundleExpiry([], issued).getTime(), T0.getTime() + MAX_BUNDLE_TTL_MS, "no scripture");
});

Deno.test("computeBundleExpiry uses an item that expires sooner than the cap", () => {
  assertEquals(computeBundleExpiry([at(DAY_MS), at(2 * 60 * 60 * 1000)], T0).getTime(), at(2 * 60 * 60 * 1000).getTime());
});

// ── purge selection ─────────────────────────────────────────────────────────

Deno.test("shouldPurgeCacheRow: expired rows go, fresh active rows stay", () => {
  const statuses = new Map<string, TranslationStatus>([["NIV", "active"]]);
  assertEquals(shouldPurgeCacheRow({ translation_id: "NIV", expires_at: at(DAY_MS) }, statuses, T0), false);
  assertEquals(shouldPurgeCacheRow({ translation_id: "NIV", expires_at: at(-1) }, statuses, T0), true);
});

Deno.test("shouldPurgeCacheRow: fresh rows of a revoked, suspended, or unknown translation go", () => {
  const statuses = new Map<string, TranslationStatus>([["NIV", "revoked"], ["CSB", "suspended"]]);
  const fresh = at(DAY_MS);
  assertEquals(shouldPurgeCacheRow({ translation_id: "NIV", expires_at: fresh }, statuses, T0), true);
  assertEquals(shouldPurgeCacheRow({ translation_id: "CSB", expires_at: fresh }, statuses, T0), true);
  assertEquals(shouldPurgeCacheRow({ translation_id: "XYZ", expires_at: fresh }, statuses, T0), true);
});

Deno.test("selectRowsToPurge returns exactly the rows that must go", () => {
  const statuses = new Map<string, TranslationStatus>([["NIV", "active"], ["CSB", "revoked"], ["KJV", "active"]]);
  const rows = [
    { id: 1, translation_id: "NIV", expires_at: at(DAY_MS) },
    { id: 2, translation_id: "NIV", expires_at: at(-DAY_MS) },
    { id: 3, translation_id: "CSB", expires_at: at(DAY_MS) },
    { id: 4, translation_id: "KJV", expires_at: null },
    { id: 5, translation_id: "KJV", expires_at: at(DAY_MS) },
  ];
  assertEquals(selectRowsToPurge(rows, statuses, T0).map((r) => r.id), [2, 3, 4]);
});
