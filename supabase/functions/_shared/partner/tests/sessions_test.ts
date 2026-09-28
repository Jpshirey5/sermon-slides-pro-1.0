// deno test -A --no-lock --node-modules-dir=none supabase/functions/_shared/partner/tests/sessions_test.ts
// POST /sessions and GET /handoff

import { assert, assertEquals } from "./assert.ts";
import { APP_ORIGIN, createHarness, type Harness, type PartnerCreds } from "./harness.ts";
import { handleHandoff } from "../../../partner-handoff/handler.ts";

const PASTOR = { external_user_id: "ext-1", email: "pat@grace.test" };

const setup = async () => {
  const h = await createHarness();
  const acme = await h.createPartner({ slug: "acme", hosts: ["app.acme.test"] });
  const seat = await h.call(acme, "POST", "/accounts", PASTOR);
  return { h, acme, userId: seat.body.ssp_user_id as string };
};

const follow = (h: Harness, url: string) => handleHandoff(new Request(url.replace(APP_ORIGIN, "https://project.supabase.co/functions/v1/partner-handoff")), h.deps);

const mint = (h: Harness, creds: PartnerCreds, body: Record<string, unknown> = {}) =>
  h.call(creds, "POST", "/sessions", { external_user_id: "ext-1", ...body });

Deno.test("sessions: mints a 300s single-use URL and stores only the token hash", async () => {
  const { h, acme } = await setup();
  const res = await mint(h, acme, { return_url: "https://app.acme.test/sermons/9" });
  assertEquals(res.status, 201, res.text);
  assertEquals(res.body.expires_in, 300);
  const url = new URL(res.body.url);
  assertEquals(`${url.origin}${url.pathname}`, `${APP_ORIGIN}/handoff`);
  const token = url.searchParams.get("t")!;
  assert(/^[A-Za-z0-9_-]{43}$/.test(token), "32 bytes, base64url");

  const { rows } = await h.pg.query<Record<string, unknown>>(`select * from public.handoff_tokens`);
  assertEquals(rows.length, 1);
  assert(!JSON.stringify(rows).includes(token), "raw token is not stored");
  assertEquals(rows[0].created_ip, "203.0.113.7");
  assertEquals(rows[0].return_url, "https://app.acme.test/sermons/9");
  const ttl = (new Date(rows[0].expires_at as string).getTime() - Date.now()) / 1000;
  assert(ttl > 290 && ttl <= 300, `ttl ${ttl}`);

  const logs = await h.pg.query(`select * from public.partner_api_log`);
  assert(!JSON.stringify(logs.rows).includes(token), "raw token is not logged");
});

Deno.test("sessions: a return_url off the allowlist is rejected", async () => {
  const { h, acme } = await setup();
  for (const returnUrl of ["https://evil.test/x", "http://app.acme.test/x", "https://app.acme.test.evil.test/"]) {
    const res = await mint(h, acme, { return_url: returnUrl });
    assertEquals(res.status, 400, returnUrl);
    assertEquals(res.body.error.code, "invalid_return_url");
  }
  assertEquals((await h.pg.query(`select 1 from public.handoff_tokens`)).rows.length, 0, "nothing minted");
});

Deno.test("sessions: unknown seats 404, revoked seats 403", async () => {
  const { h, acme } = await setup();
  const unknown = await h.call(acme, "POST", "/sessions", { external_user_id: "nobody" });
  assertEquals(unknown.body.error.code, "account_not_provisioned");
  await h.call(acme, "DELETE", "/accounts/ext-1/entitlement");
  const revoked = await mint(h, acme);
  assertEquals(revoked.status, 403);
  assertEquals(revoked.body.error.code, "entitlement_inactive");
});

Deno.test("sessions: deck_id must belong to this seat", async () => {
  const { h, acme } = await setup();
  await h.call(acme, "POST", "/accounts", { external_user_id: "ext-2", email: "other@grace.test" });
  const deck = await h.call(acme, "POST", "/decks", { external_user_id: "ext-2", title: "Other's deck", points: [{ heading: "One" }] });
  await h.drain();
  const res = await mint(h, acme, { deck_id: deck.body.deck_id });
  assertEquals(res.status, 404);
  assertEquals(res.body.error.code, "deck_not_found");
});

Deno.test("handoff: a token works once, then redirects as expired", async () => {
  const { h, acme, userId } = await setup();
  const deck = await h.call(acme, "POST", "/decks", { external_user_id: "ext-1", title: "Sunday", points: [{ heading: "One" }] });
  await h.drain();
  const session = await mint(h, acme, { deck_id: deck.body.deck_id, return_url: "https://app.acme.test/back" });

  const first = await follow(h, session.body.url);
  assertEquals(first.status, 302);
  assertEquals(first.headers.get("referrer-policy"), "no-referrer");
  const location = new URL(first.headers.get("location")!);
  assertEquals(`${location.origin}${location.pathname}`, `${APP_ORIGIN}/handoff/complete`);
  const fragment = new URLSearchParams(location.hash.slice(1));
  assertEquals(fragment.get("next"), `/editor/${deck.body.deck_id}`);
  assertEquals(fragment.get("deck"), deck.body.deck_id);
  assertEquals(fragment.get("can_return"), "1");
  assertEquals(fragment.get("partner"), "Partner acme");
  assertEquals(h.fake.generatedLinks.map((l) => [l.email, l.hashed_token]), [["pat@grace.test", fragment.get("token_hash")]]);
  assert(!location.href.includes("app.acme.test"), "return_url never reaches the browser");

  const second = await follow(h, session.body.url);
  assertEquals(second.status, 302);
  assertEquals(second.headers.get("location"), `${APP_ORIGIN}/login?handoff=expired`);
  assertEquals(h.fake.generatedLinks.length, 1, "no second session minted");

  const audit = await h.pg.query<{ path: string; error_code: string | null; partner_id: string | null }>(
    `select path, error_code, partner_id from public.partner_api_log where path = '/handoff' order by id`,
  );
  assertEquals(audit.rows.map((r) => r.error_code), [null, "handoff_expired"]);
  assertEquals(audit.rows[0].partner_id, acme.partnerId);
  void userId;
});

Deno.test("handoff: an expired token redirects instead of erroring", async () => {
  const { h, acme } = await setup();
  const session = await mint(h, acme);
  await h.pg.query(`update public.handoff_tokens set expires_at = now() - interval '1 second'`);
  const res = await follow(h, session.body.url);
  assertEquals(res.status, 302);
  assertEquals(res.headers.get("location"), `${APP_ORIGIN}/login?handoff=expired`);
});

Deno.test("handoff: garbage, missing, and forged tokens redirect as expired", async () => {
  const { h } = await setup();
  for (const query of ["", "?t=", "?t=abc", `?t=${"A".repeat(43)}`, "?t=%00%00"]) {
    const res = await handleHandoff(new Request(`https://project.supabase.co/functions/v1/partner-handoff${query}`), h.deps);
    assertEquals(res.status, 302, query);
    assertEquals(res.headers.get("location"), `${APP_ORIGIN}/login?handoff=expired`);
  }
});

Deno.test("handoff: a seat revoked after minting cannot use its token", async () => {
  const { h, acme } = await setup();
  const session = await mint(h, acme);
  await h.call(acme, "DELETE", "/accounts/ext-1/entitlement");
  const res = await follow(h, session.body.url);
  assertEquals(res.headers.get("location"), `${APP_ORIGIN}/login?handoff=expired`);
  assertEquals(h.fake.generatedLinks.length, 0);
});

Deno.test("handoff: an internal failure redirects to a friendly error, never a 500", async () => {
  const { h, acme } = await setup();
  const session = await mint(h, acme);
  // deno-lint-ignore no-explicit-any
  (h.fake.client.auth.admin as any).generateLink = () => Promise.resolve({ data: null, error: { message: "boom" } });
  const res = await follow(h, session.body.url);
  assertEquals(res.status, 302);
  assertEquals(res.headers.get("location"), `${APP_ORIGIN}/login?handoff=error`);
});

Deno.test("handoff: no deck lands on the dashboard", async () => {
  const { h, acme } = await setup();
  const session = await mint(h, acme);
  const res = await follow(h, session.body.url);
  const fragment = new URLSearchParams(new URL(res.headers.get("location")!).hash.slice(1));
  assertEquals(fragment.get("next"), "/dashboard");
  assertEquals(fragment.get("deck"), null);
  assertEquals(fragment.get("can_return"), null);
});
