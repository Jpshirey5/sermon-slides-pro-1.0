// deno test -A --no-lock --node-modules-dir=none supabase/functions/_shared/partner/tests/themes_test.ts
// POST /themes, GET /themes/{id}

import { assertEquals } from "./assert.ts";
import { createHarness } from "./harness.ts";

const THEME = {
  external_theme_id: "grace-dark",
  church_name: "Grace Church",
  config: {
    background: "#101820",
    text_color: "#F2AA4C",
    accent_color: "#FFFFFF",
    font_family: "Georgia",
    logo_url: "https://cdn.grace.test/logo.png",
    default_translation: "NIV",
  },
};

Deno.test("themes: create returns 201 and the stored theme", async () => {
  const h = await createHarness();
  const acme = await h.createPartner({ slug: "acme" });
  const res = await h.call(acme, "POST", "/themes", THEME);
  assertEquals(res.status, 201, res.text);
  assertEquals(res.body.external_theme_id, "grace-dark");
  assertEquals(res.body.config, THEME.config);
});

Deno.test("themes: POST upserts on external_theme_id", async () => {
  const h = await createHarness();
  const acme = await h.createPartner({ slug: "acme" });
  const first = await h.call(acme, "POST", "/themes", THEME);
  const second = await h.call(acme, "POST", "/themes", { ...THEME, church_name: "Grace Church (North)", config: { background: "#000000" } });
  assertEquals(second.status, 201);
  assertEquals(second.body.theme_id, first.body.theme_id);
  assertEquals(second.body.church_name, "Grace Church (North)");
  assertEquals(second.body.config, { background: "#000000" });
  assertEquals((await h.pg.query(`select 1 from public.partner_themes`)).rows.length, 1);
});

Deno.test("themes: GET by uuid or external id; unknown is theme_not_found", async () => {
  const h = await createHarness();
  const acme = await h.createPartner({ slug: "acme" });
  const created = await h.call(acme, "POST", "/themes", THEME);
  assertEquals((await h.call(acme, "GET", "/themes/grace-dark")).body.theme_id, created.body.theme_id);
  assertEquals((await h.call(acme, "GET", `/themes/${created.body.theme_id}`)).body.external_theme_id, "grace-dark");
  const missing = await h.call(acme, "GET", "/themes/nope");
  assertEquals(missing.status, 404);
  assertEquals(missing.body.error.code, "theme_not_found");
});

Deno.test("themes: config is strict and typed", async () => {
  const h = await createHarness();
  const acme = await h.createPartner({ slug: "acme" });
  const extra = await h.call(acme, "POST", "/themes", { ...THEME, config: { ...THEME.config, css: "body{}" } });
  assertEquals(extra.status, 422);
  assertEquals(extra.body.error.message, "config: unknown field(s): css");
  const color = await h.call(acme, "POST", "/themes", { ...THEME, config: { background: "red" } });
  assertEquals(color.body.error.code, "validation_failed");
});
