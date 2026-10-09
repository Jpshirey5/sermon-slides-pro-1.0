// deno test -A --node-modules-dir=none supabase/functions/_shared/presenter/tests/endpoints_test.ts
//
// service-bundle, presenter-status, and fums-report logic against real
// Postgres (PGlite with the presenter migration) and a scripted API.Bible.

import type { PGlite } from "npm:@electric-sql/pglite@0.5.8";
import { assert, assertEquals } from "../../scripture/tests/assert.ts";
import { createTestDatabase } from "../../scripture/tests/db.ts";
import { createFakeApi, createSqlScriptureStore, type FakeApi, passage } from "../../scripture/tests/fakes.ts";
import { MAX_BUNDLE_TTL_MS, MAX_CACHE_TTL_MS } from "../../scripture/expiry.ts";
import type { ResolverDeps } from "../../scripture/resolver.ts";
import { buildServiceBundle, type BundleDeps } from "../bundle.ts";
import { buildPresenterStatus } from "../status.ts";
import { createFumsForwarder, reportFumsEvents, validateFumsBatch } from "../fums.ts";
import { createSqlPresenterStore } from "./sqlStore.ts";
import type { ServiceBundle } from "../types.ts";

const NOW = new Date("2026-10-08T15:00:00.000Z");

const PASSAGES = {
  "JHN.3.16-JHN.3.17": passage([[16, "For God so loved the world."], [17, "For God sent not his Son."]], "tok-john"),
  "ROM.8.28": passage([[28, "All things work together for good."]], "tok-rom"),
  "PSA.23.1-PSA.23.2": passage([[1, "The Lord is my shepherd."], [2, "He maketh me to lie down."]], "tok-psa"),
};

interface World {
  db: PGlite;
  accountId: string;
  memberId: string;
  outsiderId: string;
  serviceId: string;
  sermonId: string;
  api: FakeApi;
}

const one = async <T>(db: PGlite, sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0];

const setup = async (opts: { status?: string } = {}): Promise<World> => {
  const db = await createTestDatabase();
  const accountId = (await one<{ id: string }>(db, `insert into public.accounts (name, subscription_status) values ('Grace', $1) returning id`, [opts.status ?? "active"])).id;
  const otherAccount = (await one<{ id: string }>(db, `insert into public.accounts (name, subscription_status) values ('Other', 'active') returning id`)).id;
  const memberId = crypto.randomUUID();
  const outsiderId = crypto.randomUUID();
  await db.query(`insert into public.account_members (account_id, user_id) values ($1, $2), ($3, $4)`, [accountId, memberId, otherAccount, outsiderId]);

  const sermonId = (await one<{ id: string }>(db, `insert into public.sermons (account_id, title, slides) values ($1, 'Anchored', $2) returning id`, [
    accountId,
    JSON.stringify({
      formData: { title: "Anchored", translation: "KJV" },
      editorSlides: [
        { id: "t", type: "title", content: { title: "Anchored" }, background: "#101820", fontFamily: "Georgia", textColor: "#fff" },
        { id: "a", type: "scripture", content: { scripture: "STALE SAVED VERSE TEXT", reference: "John 3:16-17 (KJV)" }, background: "#000", fontFamily: "Georgia", textColor: "#fff" },
      ],
    }),
  ])).id;

  const serviceId = (await one<{ id: string }>(db, `insert into public.services (account_id, title, service_date, default_translation_id) values ($1, 'Sunday', '2026-10-11', 'KJV') returning id`, [accountId])).id;
  await db.query(
    `insert into public.service_items (service_id, account_id, position, item_type, sermon_id, payload) values
       ($1, $2, 1000, 'logo', null, '{}'),
       ($1, $2, 2000, 'sermon', $3, '{}'),
       ($1, $2, 3000, 'scripture', null, '{"translation_id":"WEB","layout":"verse_by_verse","passages":[{"book":"PSA","chapter":23,"verse_start":1,"verse_end":2}]}'),
       ($1, $2, 4000, 'blank', null, '{}')`,
    [serviceId, accountId, sermonId],
  );
  return { db, accountId, memberId, outsiderId, serviceId, sermonId, api: createFakeApi({ passages: PASSAGES }) };
};

const resolver = (w: World): ResolverDeps => ({ store: createSqlScriptureStore(w.db), api: w.api, now: () => NOW });
const bundleDeps = (w: World, over: Partial<BundleDeps> = {}): BundleDeps => ({
  store: createSqlPresenterStore(w.db),
  resolver: resolver(w),
  now: () => NOW,
  ...over,
});

const okBundle = async (w: World): Promise<ServiceBundle> => {
  const result = await buildServiceBundle(bundleDeps(w), { userId: w.memberId, serviceId: w.serviceId });
  if (!result.ok) throw new Error(`expected a bundle, got ${result.status} ${result.error}`);
  return result.bundle;
};

// ── access ──────────────────────────────────────────────────────────────────

Deno.test("bundle: a member of a paying church gets the whole service in order", async () => {
  const w = await setup();
  const bundle = await okBundle(w);
  assertEquals(bundle.service, { id: w.serviceId, title: "Sunday", service_date: "2026-10-11", logo_path: null });
  assertEquals(bundle.items.map((i) => i.type), ["logo", "sermon", "scripture", "blank", "credits"]);
  assertEquals(bundle.items[1].label, "Anchored");
  assertEquals(bundle.revocation_epoch, 1);
});

Deno.test("bundle: unknown service and non-member both get 404", async () => {
  const w = await setup();
  assertEquals(await buildServiceBundle(bundleDeps(w), { userId: w.outsiderId, serviceId: w.serviceId }), { ok: false, status: 404, error: "not_found" });
  assertEquals(await buildServiceBundle(bundleDeps(w), { userId: w.memberId, serviceId: crypto.randomUUID() }), { ok: false, status: 404, error: "not_found" });
  assertEquals(w.api.passageCalls.length, 0, "no scripture fetched for refused callers");
});

Deno.test("bundle: churches without a paying plan get 403; past_due, trials, and partner billing still present", async () => {
  for (const status of ["inactive", "canceled"]) {
    const w = await setup({ status });
    assertEquals(await buildServiceBundle(bundleDeps(w), { userId: w.memberId, serviceId: w.serviceId }), { ok: false, status: 403, error: "plan_required" }, status);
    assertEquals(w.api.passageCalls.length, 0);
  }
  const pastDue = await setup({ status: "past_due" });
  await okBundle(pastDue);

  const trial = await setup({ status: "inactive" });
  await trial.db.query(`update public.accounts set is_beta_user = true, beta_trial_ends_at = $2 where id = $1`, [trial.accountId, new Date(NOW.getTime() + 86400000).toISOString()]);
  await okBundle(trial);

  const partner = await setup({ status: "inactive" });
  await partner.db.query(`update public.accounts set partner_billing_active = true where id = $1`, [partner.accountId]);
  await okBundle(partner);
});

Deno.test("bundle: rate limited per user per minute", async () => {
  const w = await setup();
  const deps = bundleDeps(w, { limits: { perUserPerMinute: 2 } });
  for (let i = 0; i < 2; i++) assert((await buildServiceBundle(deps, { userId: w.memberId, serviceId: w.serviceId })).ok, `call ${i}`);
  assertEquals(await buildServiceBundle(deps, { userId: w.memberId, serviceId: w.serviceId }), { ok: false, status: 429, error: "rate_limited" });
  const nextMinute = bundleDeps(w, { limits: { perUserPerMinute: 2 }, now: () => new Date(NOW.getTime() + 60_000) });
  assert((await buildServiceBundle(nextMinute, { userId: w.memberId, serviceId: w.serviceId })).ok, "new minute resets");
});

Deno.test("bundle: rate limited per account per day", async () => {
  const w = await setup();
  const deps = bundleDeps(w, { limits: { perAccountPerDay: 1 } });
  assert((await buildServiceBundle(deps, { userId: w.memberId, serviceId: w.serviceId })).ok, "first");
  assertEquals(await buildServiceBundle(deps, { userId: w.memberId, serviceId: w.serviceId }), { ok: false, status: 429, error: "rate_limited" });
});

Deno.test("bundle: verse and item caps", async () => {
  const w = await setup();
  assertEquals(await buildServiceBundle(bundleDeps(w, { limits: { maxVerses: 3 } }), { userId: w.memberId, serviceId: w.serviceId }), { ok: false, status: 422, error: "too_many_verses" });
  assertEquals(w.api.passageCalls.length, 0, "cap is checked before fetching");
  assertEquals(await buildServiceBundle(bundleDeps(w, { limits: { maxItems: 3 } }), { userId: w.memberId, serviceId: w.serviceId }), { ok: false, status: 422, error: "too_many_items" });
});

// ── content ─────────────────────────────────────────────────────────────────

Deno.test("bundle: sermon scripture is fetched fresh; saved verse text never appears", async () => {
  const w = await setup();
  const bundle = await okBundle(w);
  assert(!JSON.stringify(bundle).includes("STALE SAVED VERSE TEXT"), "saved text must not be served");
  const sermon = bundle.items[1];
  assertEquals(sermon.slides.map((s) => s.kind), ["title", "scripture"]);
  assertEquals(sermon.slides[0].style.background, "#101820", "pastor's styling kept");
  assertEquals(sermon.slides[1].text, '"For God so loved the world. For God sent not his Son."');
  assertEquals(sermon.slides[1].reference, "John 3:16-17 (KJV)");
  assertEquals(sermon.translation_ids, ["KJV"]);
});

Deno.test("bundle: every scripture slide carries its attribution and FUMS token", async () => {
  const w = await setup();
  const bundle = await okBundle(w);
  const scripture = bundle.items.flatMap((i) => i.slides).filter((s) => s.kind === "scripture");
  assertEquals(scripture.length, 3);
  for (const s of scripture) {
    assert(s.attribution && s.attribution.length > 0, `${s.id} attribution`);
    assertEquals(s.fums_tokens?.length, 1, `${s.id} fums token`);
  }
  assertEquals(bundle.items[2].slides.map((s) => s.reference), ["Psalm 23:1 (WEB)", "Psalm 23:2 (WEB)"]);
});

Deno.test("bundle: credits item lists the full notice for every translation shown", async () => {
  const w = await setup();
  const credits = (await okBundle(w)).items.at(-1)!;
  assertEquals(credits.type, "credits");
  assertEquals(credits.slides[0].notices?.map((n) => n.translation_id), ["KJV", "WEB"]);
  assert(credits.slides[0].notices!.every((n) => n.notice.length > 0), "notices filled");
});

Deno.test("bundle: per-item expiry follows the cache, and the bundle expires within 24 hours", async () => {
  const w = await setup();
  const bundle = await okBundle(w);
  const cacheExpiry = new Date(NOW.getTime() + MAX_CACHE_TTL_MS).toISOString();
  assertEquals(bundle.items.map((i) => i.expires_at), [null, cacheExpiry, cacheExpiry, null, null]);
  assertEquals(bundle.issued_at, NOW.toISOString());
  assertEquals(bundle.bundle_expires_at, new Date(NOW.getTime() + MAX_BUNDLE_TTL_MS).toISOString());
});

Deno.test("bundle: an item whose cached text expires soon pulls the bundle expiry in", async () => {
  const w = await setup();
  await okBundle(w);
  await w.db.query(`update public.scripture_cache set expires_at = $1 where translation_id = 'WEB'`, [new Date(NOW.getTime() + 3_600_000).toISOString()]);
  const bundle = await okBundle(w);
  assertEquals(bundle.items[2].expires_at, new Date(NOW.getTime() + 3_600_000).toISOString());
  assertEquals(bundle.bundle_expires_at, new Date(NOW.getTime() + 3_600_000).toISOString());
});

Deno.test("bundle: a revoked translation's items come back with a reason and no text", async () => {
  const w = await setup();
  await okBundle(w);
  await w.db.query(`update public.bible_translations set status = 'revoked' where id = 'WEB'`);
  const bundle = await okBundle(w);

  const psalm = bundle.items[2];
  assertEquals(psalm.slides.map((s) => [s.kind, s.missing_reason]), [["missing", "revoked"]]);
  assert(!JSON.stringify(psalm).includes("shepherd"), "no revoked text in the bundle");
  assertEquals(psalm.translation_ids, []);
  assertEquals(bundle.items[1].slides[1].kind, "scripture", "other translations unaffected");
  assertEquals(bundle.items.at(-1)!.slides[0].notices?.map((n) => n.translation_id), ["KJV"]);
  assertEquals(bundle.revocation_epoch, 2, "epoch moved");
});

Deno.test("bundle: a deleted sermon shows as a missing item instead of breaking the service", async () => {
  const w = await setup();
  await w.db.query(`delete from public.sermons where id = $1`, [w.sermonId]);
  const bundle = await okBundle(w);
  assertEquals(bundle.items[1].slides.map((s) => [s.kind, s.missing_reason]), [["missing", "sermon_deleted"]]);
});

Deno.test("bundle: a second request is served from the cache", async () => {
  const w = await setup();
  await okBundle(w);
  const calls = w.api.passageCalls.length;
  await okBundle(w);
  assertEquals(w.api.passageCalls.length, calls, "no new API.Bible calls");
});

// ── presenter-status ────────────────────────────────────────────────────────

Deno.test("status: reports epoch, unavailable translations, and plan state, and no scripture", async () => {
  const w = await setup();
  const deps = { store: createSqlPresenterStore(w.db), resolver: resolver(w), now: () => NOW };
  const first = await buildPresenterStatus(deps, { userId: w.memberId, serviceId: w.serviceId, translationIds: ["KJV", "web"] });
  assertEquals(first, { ok: true, status: { revocation_epoch: 1, unavailable_translations: [], can_present: true, checked_at: NOW.toISOString() } });

  await w.db.query(`update public.bible_translations set status = 'revoked' where id = 'WEB'`);
  await w.db.query(`update public.accounts set subscription_status = 'canceled' where id = $1`, [w.accountId]);
  const after = await buildPresenterStatus(deps, { userId: w.memberId, serviceId: w.serviceId, translationIds: ["KJV", "WEB"] });
  assert(after.ok, "ok");
  if (!after.ok) return;
  assertEquals(after.status.unavailable_translations, ["WEB"]);
  assertEquals(after.status.revocation_epoch, 2);
  assertEquals(after.status.can_present, false);
  assertEquals(w.api.passageCalls.length, 0, "status never fetches scripture");
});

Deno.test("status: non-members get 404, bad input gets 400, polling is rate limited", async () => {
  const w = await setup();
  const deps = { store: createSqlPresenterStore(w.db), resolver: resolver(w), now: () => NOW };
  assertEquals(await buildPresenterStatus(deps, { userId: w.outsiderId, serviceId: w.serviceId, translationIds: [] }), { ok: false, status: 404, error: "not_found" });
  assertEquals(await buildPresenterStatus(deps, { userId: w.memberId, serviceId: w.serviceId, translationIds: ["NIV; drop table"] }), { ok: false, status: 400, error: "bad_request" });
  for (let i = 0; i < 10; i++) await buildPresenterStatus(deps, { userId: w.memberId, serviceId: w.serviceId, translationIds: [] });
  assertEquals(await buildPresenterStatus(deps, { userId: w.memberId, serviceId: w.serviceId, translationIds: [] }), { ok: false, status: 429, error: "rate_limited" });
});

// ── fums-report ─────────────────────────────────────────────────────────────

const event = (over: Record<string, unknown> = {}) => ({
  client_event_id: crypto.randomUUID(),
  fums_token: "tok-john",
  translation_id: "kjv",
  device_id: "device-1",
  session_id: "session-1",
  displayed_at: NOW.toISOString(),
  ...over,
});

Deno.test("fums: validation accepts good events and refuses bad ones", () => {
  assert(validateFumsBatch({ events: [event()] }, NOW).ok, "good event");
  assertEquals(validateFumsBatch({ events: [] }, NOW), { ok: true, events: [] });
  for (const bad of [
    { client_event_id: "not-a-uuid" },
    { fums_token: "" },
    { fums_token: "x".repeat(513) },
    { translation_id: "N IV" },
    { device_id: "has spaces" },
    { displayed_at: "yesterday-ish" },
    { displayed_at: new Date(NOW.getTime() + 10 * 60_000).toISOString() },
    { displayed_at: new Date(NOW.getTime() - 31 * 86400000).toISOString() },
  ]) {
    assert(!validateFumsBatch({ events: [event(bad)] }, NOW).ok, JSON.stringify(bad));
  }
  assert(!validateFumsBatch({}, NOW).ok, "missing events");
  assert(!validateFumsBatch({ events: Array.from({ length: 201 }, () => event()) }, NOW).ok, "batch too large");
});

Deno.test("fums: events are recorded once even if the presenter resends them", async () => {
  const w = await setup();
  const deps = { store: createSqlPresenterStore(w.db), forward: null, now: () => NOW };
  const batch = { events: [event(), event()] };
  assertEquals(await reportFumsEvents(deps, { userId: w.memberId, body: batch }), { ok: true, accepted: 2, duplicates: 0, forwarded: 0 });
  assertEquals(await reportFumsEvents(deps, { userId: w.memberId, body: batch }), { ok: true, accepted: 0, duplicates: 2, forwarded: 0 });
  const rows = await w.db.query<{ account_id: string; translation_id: string; forwarded_at: unknown }>(`select account_id, translation_id, forwarded_at from public.fums_events`);
  assertEquals(rows.rows.length, 2);
  assert(rows.rows.every((r) => r.account_id === w.accountId && r.translation_id === "KJV" && r.forwarded_at === null), "recorded, not yet forwarded");
});

Deno.test("fums: with an endpoint configured, events are forwarded and marked", async () => {
  const w = await setup();
  const seen: string[] = [];
  const forward = createFumsForwarder("https://fums.example.test/f3", (async (url: string | URL) => {
    seen.push(String(url));
    return new Response("", { status: String(url).includes("bad") ? 500 : 200 });
  }) as typeof fetch);
  const deps = { store: createSqlPresenterStore(w.db), forward, now: () => NOW };
  const result = await reportFumsEvents(deps, { userId: w.memberId, body: { events: [event(), event({ fums_token: "bad" })] } });
  assertEquals(result, { ok: true, accepted: 2, duplicates: 0, forwarded: 1 });
  assert(seen[0].startsWith("https://fums.example.test/f3?t=tok-john&dId=device-1&sId=session-1&uId="), seen[0]);
  const rows = await w.db.query<{ fums_token: string; forwarded_at: unknown; forward_error: string | null }>(`select fums_token, forwarded_at, forward_error from public.fums_events order by fums_token`);
  assertEquals(rows.rows.map((r) => [r.fums_token, r.forwarded_at !== null, r.forward_error]), [["bad", false, "status_500"], ["tok-john", true, null]]);
});

Deno.test("fums: callers with no church are refused; reports are rate limited", async () => {
  const w = await setup();
  const deps = { store: createSqlPresenterStore(w.db), forward: null, now: () => NOW };
  assertEquals(await reportFumsEvents(deps, { userId: crypto.randomUUID(), body: { events: [event()] } }), { ok: false, status: 403, error: "no_account" });
  for (let i = 0; i < 30; i++) await reportFumsEvents(deps, { userId: w.memberId, body: { events: [event()] } });
  assertEquals(await reportFumsEvents(deps, { userId: w.memberId, body: { events: [event()] } }), { ok: false, status: 429, error: "rate_limited" });
});
