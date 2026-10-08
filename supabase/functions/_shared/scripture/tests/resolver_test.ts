// deno test -A --node-modules-dir=none supabase/functions/_shared/scripture/tests/resolver_test.ts
//
// The resolver against real Postgres (PGlite, presenter migration applied) and
// a scripted API.Bible. Covers cache hits, expiry, revocation, entitlement,
// copyright handling, caps, and upstream failures.

import type { PGlite } from "npm:@electric-sql/pglite@0.5.8";
import { assert, assertEquals } from "./assert.ts";
import { createTestDatabase } from "./db.ts";
import { createFakeApi, createSqlScriptureStore, type FakeApi, passage } from "./fakes.ts";
import { ApiBibleError } from "../apiBible.ts";
import { DAY_MS, MAX_CACHE_TTL_MS } from "../expiry.ts";
import { checkTranslation, resolvePassages, type ResolverDeps } from "../resolver.ts";
import type { PassageRef } from "../references.ts";

const NOW = new Date("2026-10-08T15:00:00.000Z");
const JOHN_3_16_17: PassageRef = { book: "JHN", chapter: 3, verse_start: 16, verse_end: 17 };
const ROM_8_28: PassageRef = { book: "ROM", chapter: 8, verse_start: 28 };

const PASSAGES = {
  "JHN.3.16-JHN.3.17": passage([[16, "For God so loved the world."], [17, "For God sent not his Son."]], "tok-john"),
  "ROM.8.28": passage([[28, "All things work together."]], "tok-rom"),
};

const NIV_NOTICE = "Holy Bible, New International Version. Used by permission.";

const setup = async (opts: { esv?: boolean } = {}) => {
  let accountId = "";
  const db = await createTestDatabase(async (pre) => {
    accountId = (await pre.query<{ id: string }>(
      `insert into public.accounts (name, can_use_esv) values ('A', $1) returning id`,
      [Boolean(opts.esv)],
    )).rows[0].id;
  });
  return { db, accountId, store: createSqlScriptureStore(db) };
};

const deps = (db: PGlite, api: FakeApi | null, now = NOW): ResolverDeps => ({
  store: createSqlScriptureStore(db),
  api,
  bibleIdFallback: (id) => ({ NIV: "niv-secret-id", ESV: "esv-id" } as Record<string, string>)[id] ?? null,
  now: () => now,
});

const cachedPassageIds = async (db: PGlite, translation: string) =>
  (await db.query<{ passage_id: string }>(
    `select passage_id from public.scripture_cache where translation_id = $1 order by passage_id`,
    [translation],
  )).rows.map((r) => r.passage_id);

// ── happy path and caching ──────────────────────────────────────────────────

Deno.test("first request fetches from API.Bible and caches for exactly 30 days", async () => {
  const { db, accountId } = await setup();
  const api = createFakeApi({ passages: PASSAGES });
  const result = await resolvePassages(deps(db, api), { accountId, translationId: "kjv", passages: [JOHN_3_16_17] });

  assert(result.ok, "resolved");
  if (!result.ok) return;
  assertEquals(result.translation.id, "KJV");
  assertEquals(result.translation.attribution, "King James Version (KJV), public domain.");
  assertEquals(result.passages.length, 1);
  assertEquals(result.passages[0].reference, "John 3:16-17");
  assertEquals(result.passages[0].verses.map((v) => v.verse), [16, 17]);
  assertEquals(result.passages[0].fums_token, "tok-john");
  assertEquals(result.passages[0].expires_at, new Date(NOW.getTime() + MAX_CACHE_TTL_MS).toISOString());
  assertEquals(api.passageCalls, [{ bibleId: "de4e12af7f28f599-02", passageId: "JHN.3.16-JHN.3.17" }]);
  assertEquals(await cachedPassageIds(db, "KJV"), ["JHN.3.16-JHN.3.17"]);
});

Deno.test("cache hit: a fresh row is served without calling API.Bible", async () => {
  const { db, accountId } = await setup();
  const first = createFakeApi({ passages: PASSAGES });
  await resolvePassages(deps(db, first), { accountId, translationId: "KJV", passages: [JOHN_3_16_17] });

  const second = createFakeApi({ passages: PASSAGES });
  const later = new Date(NOW.getTime() + 29 * DAY_MS);
  const result = await resolvePassages(deps(db, second, later), { accountId, translationId: "KJV", passages: [JOHN_3_16_17] });
  assert(result.ok && result.passages.length === 1, "served from cache");
  assertEquals(second.passageCalls.length, 0, "no API call on a hit");
});

Deno.test("cache hit works even when API.Bible is not configured", async () => {
  const { db, accountId } = await setup();
  await resolvePassages(deps(db, createFakeApi({ passages: PASSAGES })), { accountId, translationId: "KJV", passages: [JOHN_3_16_17] });
  const result = await resolvePassages(deps(db, null), { accountId, translationId: "KJV", passages: [JOHN_3_16_17, ROM_8_28] });
  assert(result.ok, "ok");
  if (!result.ok) return;
  assertEquals(result.passages.map((p) => p.passage_id), ["JHN.3.16-JHN.3.17"]);
  assertEquals(result.missing, [{ passage_id: "ROM.8.28", reason: "not_configured" }]);
});

Deno.test("expired row: refetched, and the cache row gets a new 30 day expiry", async () => {
  const { db, accountId } = await setup();
  await resolvePassages(deps(db, createFakeApi({ passages: PASSAGES })), { accountId, translationId: "KJV", passages: [ROM_8_28] });

  const day30 = new Date(NOW.getTime() + 30 * DAY_MS);
  const api = createFakeApi({ passages: { "ROM.8.28": passage([[28, "Refreshed text."]], "tok-new") } });
  const result = await resolvePassages(deps(db, api, day30), { accountId, translationId: "KJV", passages: [ROM_8_28] });

  assertEquals(api.passageCalls.length, 1, "refetched once");
  assert(result.ok, "ok");
  if (!result.ok) return;
  assertEquals(result.passages[0].verses[0].text, "Refreshed text.");
  assertEquals(result.passages[0].fums_token, "tok-new");
  const row = (await db.query<{ expires_at: Date; fetched_at: Date }>(`select expires_at, fetched_at from public.scripture_cache where passage_id = 'ROM.8.28'`)).rows[0];
  assertEquals(new Date(row.fetched_at).toISOString(), day30.toISOString());
  assertEquals(new Date(row.expires_at).getTime(), day30.getTime() + MAX_CACHE_TTL_MS);
});

Deno.test("duplicate references are fetched once", async () => {
  const { db, accountId } = await setup();
  const api = createFakeApi({ passages: PASSAGES });
  const result = await resolvePassages(deps(db, api), { accountId, translationId: "KJV", passages: [ROM_8_28, { ...ROM_8_28, verse_end: 28 }] });
  assertEquals(api.passageCalls.length, 1);
  assert(result.ok && result.passages.length === 1, "one passage");
});

// ── revocation and status ───────────────────────────────────────────────────

Deno.test("revoked translation: refused, nothing fetched, nothing stored, old rows gone", async () => {
  const { db, accountId } = await setup();
  await resolvePassages(deps(db, createFakeApi({ passages: PASSAGES })), { accountId, translationId: "KJV", passages: [JOHN_3_16_17] });
  assertEquals((await cachedPassageIds(db, "KJV")).length, 1);

  await db.query(`update public.bible_translations set status = 'revoked' where id = 'KJV'`);
  assertEquals((await cachedPassageIds(db, "KJV")).length, 0, "revoke purged the cache");

  const api = createFakeApi({ passages: PASSAGES });
  const result = await resolvePassages(deps(db, api), { accountId, translationId: "KJV", passages: [JOHN_3_16_17] });
  assertEquals(result, { ok: false, reason: "revoked" });
  assertEquals(api.passageCalls.length, 0, "no fetch for a revoked translation");
  assertEquals((await cachedPassageIds(db, "KJV")).length, 0, "nothing stored");
});

Deno.test("suspended translation is refused the same way", async () => {
  const { db, accountId } = await setup();
  await db.query(`update public.bible_translations set status = 'suspended' where id = 'WEB'`);
  const api = createFakeApi({ passages: PASSAGES });
  assertEquals(await resolvePassages(deps(db, api), { accountId, translationId: "WEB", passages: [ROM_8_28] }), { ok: false, reason: "suspended" });
  assertEquals(api.passageCalls.length, 0);
});

Deno.test("purgeTranslation clears one translation's cache through the store", async () => {
  const { db, accountId, store } = await setup();
  await resolvePassages(deps(db, createFakeApi({ passages: PASSAGES })), { accountId, translationId: "KJV", passages: [JOHN_3_16_17, ROM_8_28] });
  await resolvePassages(deps(db, createFakeApi({ passages: PASSAGES })), { accountId, translationId: "WEB", passages: [ROM_8_28] });
  assertEquals(await store.purgeTranslation("KJV"), 2);
  assertEquals((await cachedPassageIds(db, "KJV")).length, 0);
  assertEquals(await cachedPassageIds(db, "WEB"), ["ROM.8.28"]);
});

Deno.test("unknown translation and translations with no source are refused", async () => {
  const { db, accountId } = await setup();
  const api = createFakeApi({ passages: PASSAGES });
  assertEquals(await resolvePassages(deps(db, api), { accountId, translationId: "XYZ", passages: [ROM_8_28] }), { ok: false, reason: "unknown_translation" });
  assertEquals(await resolvePassages(deps(db, api), { accountId, translationId: "AMP", passages: [ROM_8_28] }), { ok: false, reason: "no_source" });
  assertEquals(api.passageCalls.length, 0);
});

Deno.test("ESV is not served through API.Bible, even for an entitled account", async () => {
  const { db, accountId } = await setup({ esv: true });
  const api = createFakeApi({ passages: PASSAGES });
  const result = await resolvePassages(deps(db, api), { accountId, translationId: "ESV", passages: [ROM_8_28] });
  assertEquals(result, { ok: false, reason: "no_source" });
  assertEquals(api.passageCalls.length, 0);
});

Deno.test("entitlement: a translation that needs a grant is refused without one and served with one", async () => {
  const { db, accountId } = await setup();
  await db.query(`update public.bible_translations set requires_entitlement = true where id = 'WEB'`);
  const api = createFakeApi({ passages: PASSAGES });
  assertEquals(await resolvePassages(deps(db, api), { accountId, translationId: "WEB", passages: [ROM_8_28] }), { ok: false, reason: "not_entitled" });

  await db.query(`insert into public.account_translation_access (account_id, translation_id) values ($1, 'WEB')`, [accountId]);
  const granted = await resolvePassages(deps(db, api), { accountId, translationId: "WEB", passages: [ROM_8_28] });
  assert(granted.ok, "granted");

  await db.query(`update public.account_translation_access set revoked_at = now() where account_id = $1`, [accountId]);
  assertEquals(await resolvePassages(deps(db, api), { accountId, translationId: "WEB", passages: [ROM_8_28] }), { ok: false, reason: "not_entitled" });
});

// ── copyright ───────────────────────────────────────────────────────────────

Deno.test("copyrighted translation: notice is pulled from API.Bible before any text is served", async () => {
  const { db, accountId } = await setup();
  const api = createFakeApi({ passages: PASSAGES, copyright: NIV_NOTICE });
  const result = await resolvePassages(deps(db, api), { accountId, translationId: "NIV", passages: [ROM_8_28] });

  assert(result.ok, "resolved");
  if (!result.ok) return;
  assertEquals(api.copyrightCalls, ["niv-secret-id"], "used the Bible id from secrets");
  assertEquals(api.passageCalls[0].bibleId, "niv-secret-id");
  assertEquals(result.translation.attribution, NIV_NOTICE);
  assertEquals(result.translation.notice, NIV_NOTICE);
  const row = (await db.query<{ copyright_short: string }>(`select copyright_short from public.bible_translations where id = 'NIV'`)).rows[0];
  assertEquals(row.copyright_short, NIV_NOTICE, "stored for next time");
});

Deno.test("copyrighted translation with no obtainable notice is refused and nothing is fetched", async () => {
  const { db, accountId } = await setup();
  const api = createFakeApi({ passages: PASSAGES, copyright: null });
  assertEquals(await resolvePassages(deps(db, api), { accountId, translationId: "NIV", passages: [ROM_8_28] }), { ok: false, reason: "missing_copyright" });
  assertEquals(api.passageCalls.length, 0);

  const down = createFakeApi({ failWith: new ApiBibleError("network", null) });
  assertEquals(await resolvePassages(deps(db, down), { accountId, translationId: "NIV", passages: [ROM_8_28] }), { ok: false, reason: "missing_copyright" });
});

Deno.test("an admin-set notice is never overwritten by the provider's", async () => {
  const { db, accountId } = await setup();
  await db.query(`update public.bible_translations set copyright_short = 'Admin line', copyright_full = 'Admin full' where id = 'NIV'`);
  const api = createFakeApi({ passages: PASSAGES, copyright: "Provider line" });
  const result = await resolvePassages(deps(db, api), { accountId, translationId: "NIV", passages: [ROM_8_28] });
  assert(result.ok, "ok");
  if (!result.ok) return;
  assertEquals(result.translation.attribution, "Admin line");
  assertEquals(result.translation.notice, "Admin full");
  assertEquals(api.copyrightCalls.length, 0, "no need to ask the provider");
});

Deno.test("checkTranslation reports availability without fetching any text", async () => {
  const { db, accountId } = await setup();
  const api = createFakeApi({ passages: PASSAGES });
  const kjv = await checkTranslation(deps(db, api), accountId, "KJV");
  assert(kjv.ok, "KJV ok");
  assertEquals(api.passageCalls.length, 0);
});

// ── limits and failures ─────────────────────────────────────────────────────

Deno.test("verse cap: a request over the cap is refused before anything is fetched", async () => {
  const { db, accountId } = await setup();
  const api = createFakeApi({ passages: PASSAGES });
  const psalm119: PassageRef = { book: "PSA", chapter: 119, verse_start: 1, verse_end: 176 };
  const result = await resolvePassages(deps(db, api), {
    accountId,
    translationId: "KJV",
    // 176 + 125 = 301 verses, one over the default cap of 300.
    passages: [psalm119, { book: "PSA", chapter: 119, verse_start: 1, verse_end: 125 }],
  });
  assertEquals(result, { ok: false, reason: "too_many_verses" });
  assertEquals(api.passageCalls.length, 0);
  const small = await resolvePassages(deps(db, api), { accountId, translationId: "KJV", passages: [JOHN_3_16_17], maxVerses: 1 });
  assertEquals(small, { ok: false, reason: "too_many_verses" });
});

Deno.test("invalid references are refused", async () => {
  const { db, accountId } = await setup();
  const api = createFakeApi({ passages: PASSAGES });
  const bad = { book: "JHN", chapter: 3, verse_start: 20, verse_end: 10 } as PassageRef;
  assertEquals(await resolvePassages(deps(db, api), { accountId, translationId: "KJV", passages: [bad] }), { ok: false, reason: "invalid_reference" });
});

Deno.test("a passage API.Bible cannot find is reported missing and not cached", async () => {
  const { db, accountId } = await setup();
  const api = createFakeApi({ passages: { "ROM.8.28": PASSAGES["ROM.8.28"] } });
  const result = await resolvePassages(deps(db, api), { accountId, translationId: "KJV", passages: [JOHN_3_16_17, ROM_8_28] });
  assert(result.ok, "partial success is still ok");
  if (!result.ok) return;
  assertEquals(result.passages.map((p) => p.passage_id), ["ROM.8.28"]);
  assertEquals(result.missing, [{ passage_id: "JHN.3.16-JHN.3.17", reason: "not_found" }]);
  assertEquals(await cachedPassageIds(db, "KJV"), ["ROM.8.28"]);
});

Deno.test("an API.Bible outage is reported as upstream and nothing is cached", async () => {
  const { db, accountId } = await setup();
  const api = createFakeApi({ failWith: new ApiBibleError("upstream", 503) });
  const result = await resolvePassages(deps(db, api), { accountId, translationId: "KJV", passages: [ROM_8_28] });
  assert(result.ok, "ok with missing");
  if (!result.ok) return;
  assertEquals(result.missing, [{ passage_id: "ROM.8.28", reason: "upstream" }]);
  assertEquals((await cachedPassageIds(db, "KJV")).length, 0);
});
