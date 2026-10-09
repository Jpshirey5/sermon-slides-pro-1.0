// deno test -A --no-lock --node-modules-dir=none supabase/functions/_shared/partner/tests/unit_test.ts
// Pure functions: schemas, return_url validation, completeness, crypto.

import { assert, assertEquals } from "./assert.ts";
import { canonicalPathname } from "../auth.ts";
import { completenessScore } from "../completeness.ts";
import { parseApiKey, safeEqual } from "../crypto.ts";
import { PartnerError } from "../errors.ts";
import { validateReturnUrl } from "../returnUrl.ts";
import { accountCreateSchema, deckCreateSchema, parseOrThrow, themeCreateSchema } from "../schemas.ts";

const expectError = (fn: () => unknown, code: string, messageIncludes?: string) => {
  try {
    fn();
  } catch (error) {
    assert(error instanceof PartnerError, `expected PartnerError, got ${error}`);
    assertEquals((error as PartnerError).code, code);
    if (messageIncludes) {
      assert((error as PartnerError).message.includes(messageIncludes), `message "${(error as PartnerError).message}" should include "${messageIncludes}"`);
    }
    return;
  }
  throw new Error(`expected ${code}`);
};

Deno.test("completeness: the documented formula, clamped and rounded", () => {
  assertEquals(completenessScore({ total_points: 3, points_with_slides: 3, total_refs: 4, resolved_refs: 3 }), 0.86);
  assertEquals(completenessScore({ total_points: 0, points_with_slides: 0, total_refs: 0, resolved_refs: 0 }), 1);
  assertEquals(completenessScore({ total_points: 2, points_with_slides: 0, total_refs: 1, resolved_refs: 0 }), 0);
  assertEquals(completenessScore({ total_points: 1, points_with_slides: 5, total_refs: 0, resolved_refs: 0 }), 1);
  assertEquals(completenessScore({ total_points: 3, points_with_slides: 2, total_refs: 0, resolved_refs: 0 }), 0.67);
});

Deno.test("return_url: https on an exactly allowlisted host is accepted and normalized", () => {
  assertEquals(validateReturnUrl("https://App.Acme.test/done?x=1", ["app.acme.test"]), "https://app.acme.test/done?x=1");
});

Deno.test("return_url: everything else is invalid_return_url", () => {
  const hosts = ["app.acme.test"];
  const bad = [
    "http://app.acme.test/done",
    "https://evil.test/done",
    "https://app.acme.test.evil.test/",
    "https://evil-app.acme.test/",
    "https://sub.app.acme.test/",
    "https://app.acme.test@evil.test/",
    "https://user:pass@app.acme.test/",
    "https://app.acme.test:8443/",
    "https://app.acme.test\\@evil.test",
    "https://app.acme.test/\ndone",
    " https://app.acme.test/",
    "//app.acme.test/",
    "javascript:alert(1)//app.acme.test",
    "data:text/html,https://app.acme.test",
    "https://app.acme.test./",
    "",
    `https://app.acme.test/${"a".repeat(2050)}`,
  ];
  for (const url of bad) expectError(() => validateReturnUrl(url, hosts), "invalid_return_url");
  expectError(() => validateReturnUrl("https://app.acme.test/", []), "invalid_return_url", "allowlist");
});

Deno.test("schemas: parseOrThrow names the field", () => {
  expectError(() => parseOrThrow(accountCreateSchema, { email: "a@b.co" }), "validation_failed", "external_user_id: is required");
  expectError(() => parseOrThrow(accountCreateSchema, { external_user_id: "u1", email: "nope" }), "validation_failed", "email:");
  expectError(() => parseOrThrow(accountCreateSchema, { external_user_id: "has space", email: "a@b.co" }), "validation_failed", "external_user_id:");
});

Deno.test("schemas: theme config is strict", () => {
  expectError(
    () => parseOrThrow(themeCreateSchema, { external_theme_id: "t", church_name: "C", config: { background: "#000", sparkle: true } }),
    "validation_failed",
    "config: unknown field(s): sparkle",
  );
  expectError(
    () => parseOrThrow(themeCreateSchema, { external_theme_id: "t", church_name: "C", config: { logo_url: "http://x.test/l.png" } }),
    "validation_failed",
    "config.logo_url",
  );
  const ok = parseOrThrow(themeCreateSchema, { external_theme_id: "t", church_name: "C", config: { default_translation: "niv" } });
  assertEquals(ok.config.default_translation, "NIV");
});

Deno.test("schemas: a deck needs points or raw_text, not neither or both", () => {
  const base = { external_user_id: "u1", title: "T" };
  expectError(() => parseOrThrow(deckCreateSchema, base), "validation_failed", "points: supply either points or raw_text");
  expectError(
    () => parseOrThrow(deckCreateSchema, { ...base, raw_text: "x", points: [{ heading: "h" }] }),
    "validation_failed",
    "raw_text",
  );
  const withPoints = parseOrThrow(deckCreateSchema, { ...base, points: [{ heading: "h" }], translation: "kjv" });
  assertEquals(withPoints.points![0].refs, []);
  assertEquals(withPoints.translation, "KJV");
  expectError(() => parseOrThrow(deckCreateSchema, { ...base, raw_text: "x", translation: "XYZ" }), "validation_failed", "translation");
  expectError(() => parseOrThrow(deckCreateSchema, { ...base, raw_text: "x", service_date: "9/7/2026" }), "validation_failed", "service_date");
});

Deno.test("schemas: unknown top-level fields are stripped, never passed through", () => {
  const parsed = parseOrThrow(accountCreateSchema, { external_user_id: "u1", email: "A@B.co", is_admin: true }) as Record<string, unknown>;
  assertEquals("is_admin" in parsed, false);
  assertEquals(parsed.email, "a@b.co");
});

Deno.test("crypto: key parsing and constant-time compare", () => {
  const key = `ssp_live_abcd1234_${"A".repeat(43)}`;
  assertEquals(parseApiKey(key)?.prefix, "abcd1234");
  assertEquals(parseApiKey(`ssp_live_ABCD1234_${"A".repeat(43)}`), null);
  assertEquals(parseApiKey("ssp_prod_abcd1234_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"), null);
  assert(safeEqual("abc", "abc"), "equal");
  assert(!safeEqual("abc", "abd"), "unequal");
  assert(!safeEqual("abc", "abcd"), "length");
});

Deno.test("canonicalPathname: proxy, gateway, and runtime paths all sign as /api/partner/v1/...", () => {
  for (const url of [
    "https://www.sermonslidepro.com/api/partner/v1/accounts/v1/entitlement",
    "https://ref.supabase.co/functions/v1/partner-api/v1/accounts/v1/entitlement",
    "http://localhost:9000/partner-api/v1/accounts/v1/entitlement/",
  ]) {
    assertEquals(canonicalPathname(url), "/api/partner/v1/accounts/v1/entitlement", url);
  }
  assertEquals(canonicalPathname("https://x.test/other/v1/accounts"), "/other/v1/accounts", "unknown prefixes are not rewritten");
});
