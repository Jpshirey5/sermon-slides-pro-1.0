// deno test -A --no-lock --node-modules-dir=none supabase/functions/_shared/partner/tests/auth_test.ts
// withPartner: API keys, request signing, timestamps, body cap, rate limiting,
// idempotency, the error contract, and the request log.

import { assert, assertEquals } from "./assert.ts";
import { createHarness } from "./harness.ts";

const THEME = { external_theme_id: "t-1", church_name: "Grace Church", config: { background: "#112233" } };

Deno.test("auth: a correctly signed request passes, via the proxy path and the direct function path", async () => {
  const h = await createHarness();
  const acme = await h.createPartner({ slug: "acme" });
  const viaProxy = await h.call(acme, "POST", "/themes", THEME);
  assertEquals(viaProxy.status, 201, viaProxy.text);
  const direct = await h.call(acme, "GET", "/themes/t-1", undefined, { direct: true });
  assertEquals(direct.status, 200, direct.text);
  assert(/^req_[0-9a-f]{24}$/.test(direct.headers.get("x-request-id") || ""), "X-Request-Id on success");
});

Deno.test("auth: a tampered body fails with invalid_signature", async () => {
  const h = await createHarness();
  const acme = await h.createPartner({ slug: "acme" });
  const res = await h.call(acme, "POST", "/themes", { ...THEME, church_name: "Evil Church" }, {
    signedBody: JSON.stringify(THEME),
  });
  assertEquals(res.status, 401);
  assertEquals(res.body.error.code, "invalid_signature");
  assertEquals(res.body.error.request_id, res.headers.get("x-request-id"), "error body and header share the request id");
});

Deno.test("auth: a signature over a different path or method fails", async () => {
  const h = await createHarness();
  const acme = await h.createPartner({ slug: "acme" });
  await h.call(acme, "POST", "/themes", THEME);
  const otherPath = await h.call(acme, "GET", "/themes/t-1", undefined, { signedPath: "/themes/t-2" });
  assertEquals(otherPath.body.error.code, "invalid_signature");
  const otherMethod = await h.call(acme, "DELETE", "/accounts/u-1/entitlement", undefined, {
    signedMethod: "GET",
  });
  assertEquals(otherMethod.body.error.code, "invalid_signature");
  const queryIgnored = await h.call(acme, "GET", "/themes/t-1?utm=x");
  assertEquals(queryIgnored.status, 200, "query string is not part of the signed pathname");
});

Deno.test("auth: a stale timestamp fails with timestamp_skew, and so does a future one", async () => {
  const h = await createHarness();
  const acme = await h.createPartner({ slug: "acme" });
  const now = Math.floor(Date.now() / 1000);
  const stale = await h.call(acme, "GET", "/themes/t-1", undefined, { timestamp: now - 301 });
  assertEquals(stale.status, 401);
  assertEquals(stale.body.error.code, "timestamp_skew");
  const future = await h.call(acme, "GET", "/themes/t-1", undefined, { timestamp: now + 301 });
  assertEquals(future.body.error.code, "timestamp_skew");
  const edge = await h.call(acme, "GET", "/themes/t-1", undefined, { timestamp: now - 290 });
  assertEquals(edge.body.error.code, "theme_not_found", "within 300s is accepted");
});

Deno.test("auth: bad, revoked, and wrong-mode keys are unauthorized", async () => {
  const h = await createHarness();
  const acme = await h.createPartner({ slug: "acme" });
  const malformed = await h.call(acme, "GET", "/themes/t-1", undefined, { apiKey: "sk_live_nope" });
  assertEquals(malformed.body.error.code, "unauthorized");
  const unknown = await h.call(acme, "GET", "/themes/t-1", undefined, {
    apiKey: `ssp_live_${acme.prefix}_${"x".repeat(43)}`,
  });
  assertEquals(unknown.body.error.code, "unauthorized");
  const testModeKey = await h.call(acme, "GET", "/themes/t-1", undefined, {
    apiKey: acme.apiKey.replace("ssp_live_", "ssp_test_"),
  });
  assertEquals(testModeKey.body.error.code, "unauthorized");

  await h.pg.query(`update public.partner_api_keys set revoked_at = now() where key_prefix = $1`, [acme.prefix]);
  const revoked = await h.call(acme, "GET", "/themes/t-1");
  assertEquals(revoked.status, 401);
  assertEquals(revoked.body.error.code, "unauthorized");
});

Deno.test("auth: a signing secret that does not match its stored hash is refused, not trusted", async () => {
  const h = await createHarness();
  const acme = await h.createPartner({ slug: "acme" });
  h.env.set(`PARTNER_SIGNING_SECRET_${acme.prefix.toUpperCase()}`, "attacker-chosen-secret");
  const res = await h.call(acme, "GET", "/themes/t-1", undefined);
  assertEquals(res.status, 500);
  assertEquals(res.body.error.code, "internal_error");
});

Deno.test("auth: bodies over 1 MB are rejected with payload_too_large", async () => {
  const h = await createHarness();
  const acme = await h.createPartner({ slug: "acme" });
  const big = JSON.stringify({ ...THEME, church_name: "x".repeat(1024 * 1024) });
  const res = await h.call(acme, "POST", "/themes", undefined, { rawBody: big });
  assertEquals(res.status, 413);
  assertEquals(res.body.error.code, "payload_too_large");
});

Deno.test("rate limit: returns 429 rate_limited with Retry-After: 60 once the minute's budget is spent", async () => {
  const h = await createHarness();
  const acme = await h.createPartner({ slug: "acme", rateLimitPerMin: 3 });
  const statuses: number[] = [];
  let last;
  for (let i = 0; i < 4; i++) {
    last = await h.call(acme, "GET", "/themes/t-1");
    statuses.push(last.status);
  }
  assertEquals(statuses, [404, 404, 404, 429]);
  assertEquals(last!.body.error.code, "rate_limited");
  assertEquals(last!.headers.get("retry-after"), "60");

  // Another partner has its own budget.
  const other = await h.createPartner({ slug: "other", rateLimitPerMin: 3 });
  assertEquals((await h.call(other, "GET", "/themes/t-1")).status, 404);

  // The next minute starts fresh.
  h.advanceClock(60_000);
  assertEquals((await h.call(acme, "GET", "/themes/t-1")).status, 404);
});

Deno.test("rate limit: fails open when the counter errors", async () => {
  const h = await createHarness();
  const acme = await h.createPartner({ slug: "acme", rateLimitPerMin: 1 });
  await h.pg.exec(`drop function public.partner_rate_take(uuid, text, int)`);
  assertEquals((await h.call(acme, "GET", "/themes/t-1")).status, 404);
  assertEquals((await h.call(acme, "GET", "/themes/t-1")).status, 404);
});

Deno.test("idempotency: same key and body replays the stored response verbatim", async () => {
  const h = await createHarness();
  const acme = await h.createPartner({ slug: "acme" });
  const first = await h.call(acme, "POST", "/themes", THEME, { idempotencyKey: "idem-1" });
  const second = await h.call(acme, "POST", "/themes", THEME, { idempotencyKey: "idem-1" });
  assertEquals(first.status, 201);
  assertEquals(second.status, 201);
  assertEquals(second.text, first.text, "replayed body is byte-identical");
  assertEquals(second.headers.get("idempotent-replayed"), "true");
});

Deno.test("idempotency: same key with a different body is validation_failed", async () => {
  const h = await createHarness();
  const acme = await h.createPartner({ slug: "acme" });
  await h.call(acme, "POST", "/themes", THEME, { idempotencyKey: "idem-2" });
  const res = await h.call(acme, "POST", "/themes", { ...THEME, church_name: "Other" }, { idempotencyKey: "idem-2" });
  assertEquals(res.status, 422);
  assertEquals(res.body.error.code, "validation_failed");
});

Deno.test("idempotency: keys are per partner", async () => {
  const h = await createHarness();
  const acme = await h.createPartner({ slug: "acme" });
  const other = await h.createPartner({ slug: "other" });
  await h.call(acme, "POST", "/themes", THEME, { idempotencyKey: "shared" });
  const res = await h.call(other, "POST", "/themes", { ...THEME, church_name: "Other" }, { idempotencyKey: "shared" });
  assertEquals(res.status, 201);
  assertEquals(res.body.church_name, "Other");
});

Deno.test("logging: every request is logged without keys, secrets, or signatures", async () => {
  const h = await createHarness();
  const acme = await h.createPartner({ slug: "acme" });
  await h.call(acme, "POST", "/themes", THEME, { idempotencyKey: "log-1" });
  await h.call(acme, "GET", "/themes/nope");
  await h.call(acme, "GET", "/themes/nope", undefined, { signature: "0".repeat(64) });

  const { rows } = await h.pg.query<Record<string, unknown>>(`select * from public.partner_api_log order by id`);
  assertEquals(rows.map((r) => [r.method, r.path, r.status, r.error_code]), [
    ["POST", "/api/partner/v1/themes", 201, null],
    ["GET", "/api/partner/v1/themes/nope", 404, "theme_not_found"],
    ["GET", "/api/partner/v1/themes/nope", 401, "invalid_signature"],
  ]);
  assertEquals(rows[0].idempotency_key, "log-1");
  const dump = JSON.stringify(rows);
  assert(!dump.includes(acme.apiKey), "API key must not be logged");
  assert(!dump.includes(acme.secret), "signing secret must not be logged");
});

Deno.test("routing: unknown paths and methods get a JSON 404/405", async () => {
  const h = await createHarness();
  const acme = await h.createPartner({ slug: "acme" });
  const missing = await h.call(acme, "GET", "/nope");
  assertEquals(missing.status, 404);
  assertEquals(missing.body.error.code, "route_not_found");
  const wrongMethod = await h.call(acme, "PUT", "/themes", THEME);
  assertEquals(wrongMethod.status, 405);
});
