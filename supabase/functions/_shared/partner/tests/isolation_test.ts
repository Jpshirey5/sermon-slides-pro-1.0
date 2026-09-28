// deno test -A --no-lock --node-modules-dir=none supabase/functions/_shared/partner/tests/isolation_test.ts
// Partner A must not be able to read or act on partner B's accounts, themes,
// decks, or exports — and must get the same 404 it would get for an id that
// does not exist, so ids cannot be probed.

import { assertEquals } from "./assert.ts";
import { createHarness } from "./harness.ts";

const setup = async () => {
  const h = await createHarness();
  const a = await h.createPartner({ slug: "partner-a" });
  const b = await h.createPartner({ slug: "partner-b" });

  const seat = await h.call(b, "POST", "/accounts", { external_user_id: "b-user", email: "b@church.test" });
  const theme = await h.call(b, "POST", "/themes", { external_theme_id: "b-theme", church_name: "B Church" });
  const deck = await h.call(b, "POST", "/decks", { external_user_id: "b-user", title: "B deck", points: [{ heading: "One" }] });
  await h.drain();
  const exp = await h.call(b, "POST", `/decks/${deck.body.deck_id}/exports`, { formats: ["pptx"] });
  await h.drain();

  // A also has its own seat, so "exists for A" is never the reason for a 404.
  await h.call(a, "POST", "/accounts", { external_user_id: "a-user", email: "a@church.test" });
  return {
    h,
    a,
    b,
    ids: {
      userId: seat.body.ssp_user_id as string,
      themeId: theme.body.theme_id as string,
      deckId: deck.body.deck_id as string,
      exportId: exp.body.export_id as string,
    },
  };
};

const expect404 = (res: { status: number; body: { error: { code: string } } }, code: string, what: string) => {
  assertEquals(res.status, 404, what);
  assertEquals(res.body.error.code, code, what);
};

Deno.test("isolation: partner A cannot read partner B's account (by external id or SSP uuid)", async () => {
  const { h, a, ids } = await setup();
  expect404(await h.call(a, "GET", "/accounts/b-user"), "account_not_provisioned", "by external id");
  expect404(await h.call(a, "GET", `/accounts/${ids.userId}`), "account_not_provisioned", "by uuid");
  expect404(await h.call(a, "DELETE", "/accounts/b-user/entitlement"), "account_not_provisioned", "revoke");
  expect404(await h.call(a, "DELETE", `/accounts/${ids.userId}/entitlement`), "account_not_provisioned", "revoke by uuid");
});

Deno.test("isolation: partner A cannot read or use partner B's theme", async () => {
  const { h, a, ids } = await setup();
  expect404(await h.call(a, "GET", "/themes/b-theme"), "theme_not_found", "by external id");
  expect404(await h.call(a, "GET", `/themes/${ids.themeId}`), "theme_not_found", "by uuid");
  expect404(await h.call(a, "POST", "/accounts", { external_user_id: "a-2", email: "a2@church.test", theme_id: ids.themeId }), "theme_not_found", "as seat default");
  expect404(await h.call(a, "POST", "/decks", { external_user_id: "a-user", title: "T", theme_id: ids.themeId, points: [{ heading: "H" }] }), "theme_not_found", "on a deck");
  // A theme with the same external id is A's own, not B's.
  const own = await h.call(a, "POST", "/themes", { external_theme_id: "b-theme", church_name: "A's copy" });
  assertEquals(own.status, 201);
  assertEquals(own.body.theme_id === ids.themeId, false);
});

Deno.test("isolation: partner A cannot read, export, or hand off partner B's deck", async () => {
  const { h, a, ids } = await setup();
  const foreign = await h.call(a, "GET", `/decks/${ids.deckId}`);
  const missing = await h.call(a, "GET", `/decks/${crypto.randomUUID()}`);
  expect404(foreign, "deck_not_found", "foreign deck");
  assertEquals(foreign.body.error.message, missing.body.error.message, "indistinguishable from a missing deck");
  expect404(await h.call(a, "POST", `/decks/${ids.deckId}/exports`, { formats: ["pptx"] }), "deck_not_found", "export");
  expect404(await h.call(a, "POST", "/sessions", { external_user_id: "a-user", deck_id: ids.deckId }), "deck_not_found", "session");
});

Deno.test("isolation: partner A cannot read partner B's export", async () => {
  const { h, a, b, ids } = await setup();
  const foreign = await h.call(a, "GET", `/exports/${ids.exportId}`);
  expect404(foreign, "export_not_found", "foreign export");
  assertEquals((await h.call(b, "GET", `/exports/${ids.exportId}`)).status, 200, "control: B can");
});

Deno.test("isolation: an SSP user's own (non-partner) decks are invisible to every partner", async () => {
  const { h, a } = await setup();
  const existing = await h.createExistingSspUser("direct@church.test");
  await h.call(a, "POST", "/accounts", { external_user_id: "direct", email: "direct@church.test" });
  const { rows } = await h.pg.query<{ id: string }>(`select id from public.sermons where created_by_user_id = $1`, [existing.userId]);
  expect404(await h.call(a, "GET", `/decks/${rows[0].id}`), "deck_not_found", "pastor's own deck");
  const account = await h.call(a, "GET", "/accounts/direct");
  assertEquals(account.body.decks_generated_total, 0, "only partner decks are counted");
});
