// deno test -A --no-lock --node-modules-dir=none supabase/functions/scripture-lookup/handler_test.ts

import { assert, assertEquals } from "../_shared/scripture/tests/assert.ts";
import { createTestDatabase } from "../_shared/scripture/tests/db.ts";
import { createFakeApi, createSqlScriptureStore, passage } from "../_shared/scripture/tests/fakes.ts";
import { createSqlPresenterStore } from "../_shared/presenter/tests/sqlStore.ts";
import { type Caller, handleLookup, identifyCaller, type LookupDeps } from "./handler.ts";
import type { EsvFetcher } from "./esv.ts";

const NOW = new Date("2026-10-08T15:00:00Z");
const NIV_NOTICE = "NIV notice from the provider";

async function setup(opts: { esvAccount?: boolean } = {}) {
  let accountId = "";
  const db = await createTestDatabase(async (pre) => {
    accountId = (await pre.query<{ id: string }>(`insert into public.accounts (name, can_use_esv) values ('A', $1) returning id`, [Boolean(opts.esvAccount)])).rows[0].id;
  });
  const userId = crypto.randomUUID();
  await db.query(`insert into public.account_members (account_id, user_id) values ($1, $2)`, [accountId, userId]);
  const api = createFakeApi({
    passages: {
      "JHN.3.16": passage([[16, "For God so loved the world."]], "tok"),
      "JHN.3.16-JHN.3.17": passage([[16, "For God so loved."], [17, "For God sent."]], "tok2"),
    },
    copyright: NIV_NOTICE,
  });
  const esvCalls: string[] = [];
  const esv: EsvFetcher = async (reference) => {
    esvCalls.push(reference);
    return { text: "ESV words", reference, verses: [{ verse: 16, text: "ESV words" }] };
  };
  const presenterStore = createSqlPresenterStore(db);
  const deps = (over: Partial<LookupDeps> = {}): LookupDeps => ({
    resolver: { store: createSqlScriptureStore(db), api, bibleIdFallback: (t) => (t === "NIV" ? "niv-id" : null), now: () => NOW },
    rateTake: presenterStore.rateTake,
    getMemberAccountIds: presenterStore.getMemberAccountIds,
    esv,
    now: () => NOW,
    ...over,
  });
  const user: Caller = { kind: "user", userId };
  const guest: Caller = { kind: "anonymous", ip: "203.0.113.9" };
  return { db, accountId, userId, api, esvCalls, deps, user, guest };
}

Deno.test("signed-in user gets text, verses, reference, and the copyright line", async () => {
  const w = await setup();
  const r = await handleLookup(w.deps(), w.user, { reference: "john 3:16-17", translation: "niv" });
  assertEquals(r.status, 200);
  assertEquals(r.body, {
    text: "For God so loved. For God sent.",
    reference: "John 3:16-17",
    translation: "NIV",
    verses: [{ verse: 16, text: "For God so loved." }, { verse: 17, text: "For God sent." }],
    copyright: NIV_NOTICE,
  });
});

Deno.test("the second lookup is served from the cache", async () => {
  const w = await setup();
  await handleLookup(w.deps(), w.user, { reference: "John 3:16", translation: "KJV" });
  await handleLookup(w.deps(), w.user, { reference: "John 3:16", translation: "KJV" });
  assertEquals(w.api.passageCalls.length, 1);
});

Deno.test("guests get public domain translations only", async () => {
  const w = await setup();
  const kjv = await handleLookup(w.deps(), w.guest, { reference: "John 3:16", translation: "KJV" });
  assertEquals(kjv.status, 200);
  const niv = await handleLookup(w.deps(), w.guest, { reference: "John 3:16", translation: "NIV" });
  assertEquals(niv.status, 401);
  assert(niv.body.errorMessage!.includes("Sign in"), niv.body.errorMessage!);
  assertEquals(niv.body.text, "");
  assertEquals(w.api.passageCalls.filter((c) => c.bibleId === "niv-id").length, 0, "no NIV fetch for guests");
});

Deno.test("a signed-in user with no church is treated like a guest", async () => {
  const w = await setup();
  const r = await handleLookup(w.deps(), { kind: "user", userId: crypto.randomUUID() }, { reference: "John 3:16", translation: "NIV" });
  assertEquals(r.status, 401);
});

Deno.test("revoked and unsupported translations are refused, with nothing fetched", async () => {
  const w = await setup();
  await w.db.query(`update public.bible_translations set status = 'revoked' where id = 'KJV'`);
  assertEquals((await handleLookup(w.deps(), w.user, { reference: "John 3:16", translation: "KJV" })).status, 403);
  assertEquals((await handleLookup(w.deps(), w.user, { reference: "John 3:16", translation: "AMP" })).status, 403);
  assertEquals((await handleLookup(w.deps(), w.user, { reference: "John 3:16", translation: "XYZ" })).status, 400);
  assertEquals(w.api.passageCalls.length, 0);
});

Deno.test("no mislabeled fallback text: a missing passage is a clear 404", async () => {
  const w = await setup();
  const r = await handleLookup(w.deps(), w.user, { reference: "Romans 8:28", translation: "KJV" });
  assertEquals(r.status, 404);
  assertEquals(r.body.text, "");
});

Deno.test("ESV: entitled churches only, never cached, and revocation applies", async () => {
  const entitled = await setup({ esvAccount: true });
  const ok = await handleLookup(entitled.deps(), entitled.user, { reference: "John 3:16", translation: "ESV" });
  assertEquals([ok.status, ok.body.text], [200, "ESV words"]);
  const cached = await entitled.db.query(`select 1 from public.scripture_cache where translation_id = 'ESV'`);
  assertEquals(cached.rows.length, 0, "ESV text is not cached");

  await entitled.db.query(`update public.bible_translations set status = 'revoked' where id = 'ESV'`);
  assertEquals((await handleLookup(entitled.deps(), entitled.user, { reference: "John 3:16", translation: "ESV" })).status, 403);

  const notEntitled = await setup();
  assertEquals((await handleLookup(notEntitled.deps(), notEntitled.user, { reference: "John 3:16", translation: "ESV" })).status, 403);
  assertEquals((await handleLookup(notEntitled.deps(), notEntitled.guest, { reference: "John 3:16", translation: "ESV" })).status, 401);
  assertEquals(notEntitled.esvCalls.length, 0);
});

Deno.test("bad input is refused in plain language", async () => {
  const w = await setup();
  for (const body of [{}, { reference: "Jo" }, { reference: "Hezekiah 1:1" }, { reference: "John 3:16", translation: "N I V" }, null]) {
    const r = await handleLookup(w.deps(), w.user, body);
    assertEquals(r.status, 400, JSON.stringify(body));
    assert(r.body.error === true && r.body.errorMessage!.length > 0, "has a message");
  }
});

Deno.test("long passages are refused before anything is fetched", async () => {
  const w = await setup();
  const r = await handleLookup(w.deps(), w.user, { reference: "Psalm 119:1-176", translation: "KJV" });
  assertEquals(r.status, 400);
  assertEquals(w.api.passageCalls.length, 0);
});

Deno.test("rate limits per user, per church, and per guest IP", async () => {
  const w = await setup();
  const tight = w.deps({ limits: { perUserPerMinute: 2, perIpPerMinute: 1 } });
  const ref = { reference: "John 3:16", translation: "KJV" };
  assertEquals((await handleLookup(tight, w.user, ref)).status, 200);
  assertEquals((await handleLookup(tight, w.user, ref)).status, 200);
  assertEquals((await handleLookup(tight, w.user, ref)).status, 429);
  assertEquals((await handleLookup(tight, w.guest, ref)).status, 200);
  assertEquals((await handleLookup(tight, w.guest, ref)).status, 429);

  // Fresh church so the earlier calls above do not count toward its daily cap.
  const c = await setup();
  const perChurch = c.deps({ limits: { perAccountPerDay: 1 } });
  const other: Caller = { kind: "user", userId: crypto.randomUUID() };
  await c.db.query(`insert into public.account_members (account_id, user_id) values ($1, $2)`, [c.accountId, other.userId]);
  assertEquals((await handleLookup(perChurch, other, ref)).status, 200);
  assertEquals((await handleLookup(perChurch, c.user, ref)).status, 429, "church-wide daily cap shared across users");
});

Deno.test("identifyCaller: session token, server-to-server, and anonymous", async () => {
  const userIdFromToken = async (t: string) => (t === "good-session" ? "11111111-1111-4111-8111-111111111111" : null);
  const req = (headers: Record<string, string>) => new Request("https://x/functions/v1/scripture-lookup", { method: "POST", headers });
  const opts = { serviceRoleKey: "service-role-secret", userIdFromToken };

  assertEquals(await identifyCaller(req({ Authorization: "Bearer good-session" }), opts), { kind: "user", userId: "11111111-1111-4111-8111-111111111111" });
  assertEquals(
    await identifyCaller(req({ Authorization: "Bearer service-role-secret", "x-ssp-on-behalf-of-user": "22222222-2222-4222-8222-222222222222" }), opts),
    { kind: "user", userId: "22222222-2222-4222-8222-222222222222" },
  );
  // Naming a user without the service key does nothing.
  assertEquals(
    await identifyCaller(req({ Authorization: "Bearer anon-key", "x-ssp-on-behalf-of-user": "22222222-2222-4222-8222-222222222222", "cf-connecting-ip": "1.2.3.4" }), opts),
    { kind: "anonymous", ip: "1.2.3.4" },
  );
  assertEquals(await identifyCaller(req({}), opts), { kind: "anonymous", ip: "unknown" });
  assertEquals(await identifyCaller(req({ Authorization: "Bearer service-role-secret", "x-ssp-on-behalf-of-user": "not-a-uuid", "x-forwarded-for": "5.6.7.8, 9.9.9.9" }), opts), { kind: "anonymous", ip: "5.6.7.8" });
});
