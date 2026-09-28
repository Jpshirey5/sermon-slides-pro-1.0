// deno test -A --no-lock --node-modules-dir=none supabase/functions/_shared/partner/tests/approve_test.ts
// partner-approve: "Approve and send back" from the deck editor.

import { assert, assertEquals } from "./assert.ts";
import { APP_ORIGIN, createHarness, type Harness } from "./harness.ts";
import { handleApprove } from "../../../partner-approve/handler.ts";
import { handleHandoff } from "../../../partner-handoff/handler.ts";

const approve = (h: Harness, userId: string, deckId: string) =>
  handleApprove(
    new Request("https://project.supabase.co/functions/v1/partner-approve", {
      method: "POST",
      headers: { Authorization: `Bearer user-jwt:${userId}`, "Content-Type": "application/json", Origin: "https://sermonslidepro.com" },
      body: JSON.stringify({ deck_id: deckId }),
    }),
    h.deps,
  ).then(async (res) => ({ status: res.status, body: await res.json() }));

const setup = async (returnUrl: string | null = "https://app.acme.test/sermons/42?tab=slides") => {
  const h = await createHarness();
  const acme = await h.createPartner({ slug: "acme", hosts: ["app.acme.test"] });
  const seat = await h.call(acme, "POST", "/accounts", { external_user_id: "ext-1", email: "pat@grace.test" });
  const deck = await h.call(acme, "POST", "/decks", { external_user_id: "ext-1", title: "Sunday", points: [{ heading: "One", refs: ["John 3:16"] }] });
  await h.drain();
  const session = await h.call(acme, "POST", "/sessions", {
    external_user_id: "ext-1",
    deck_id: deck.body.deck_id,
    ...(returnUrl ? { return_url: returnUrl } : {}),
  });
  await handleHandoff(new Request(session.body.url.replace(APP_ORIGIN, "https://project.supabase.co/functions/v1/partner-handoff")), h.deps);
  return { h, acme, userId: seat.body.ssp_user_id as string, deckId: deck.body.deck_id as string };
};

Deno.test("approve: stamps approved_at, queues an export, and returns the stored return URL with ssp_deck_id", async () => {
  const { h, acme, userId, deckId } = await setup();
  const res = await approve(h, userId, deckId);
  assertEquals(res.status, 200, JSON.stringify(res.body));
  assertEquals(res.body.redirect_url, `https://app.acme.test/sermons/42?tab=slides&ssp_deck_id=${deckId}`);

  const deck = await h.call(acme, "GET", `/decks/${deckId}`);
  assert(deck.body.approved_at, "partner sees approved_at when polling");

  const exports = await h.pg.query<{ formats: string[]; status: string }>(`select formats, status from public.partner_exports where deck_id = $1`, [deckId]);
  assertEquals(exports.rows, [{ formats: ["pro7", "pptx"], status: "queued" }]);
  await h.drain();
});

Deno.test("approve: does not re-export when a current export exists, but does after the pastor edits", async () => {
  const { h, acme, userId, deckId } = await setup();
  await h.call(acme, "POST", `/decks/${deckId}/exports`, { formats: ["pptx"] });
  await approve(h, userId, deckId);
  assertEquals((await h.pg.query(`select 1 from public.partner_exports`)).rows.length, 1, "existing export is current");

  await h.pg.query(`update public.partner_exports set created_at = now() - interval '1 hour'`);
  await h.pg.query(`update public.sermons set title = 'Edited' where id = $1`, [deckId]);
  await approve(h, userId, deckId);
  assertEquals((await h.pg.query(`select 1 from public.partner_exports`)).rows.length, 2, "edited deck is re-exported");
  await h.drain();
});

Deno.test("approve: without a return_url on the handoff there is nowhere to send back", async () => {
  const { h, userId, deckId } = await setup(null);
  const res = await approve(h, userId, deckId);
  assertEquals(res.status, 409);
  assertEquals(res.body.error, "no_return_session");
});

Deno.test("approve: a host removed from the allowlist after the handoff is refused", async () => {
  const { h, acme, userId, deckId } = await setup();
  await h.pg.query(`update public.partners set allowed_return_hosts = '{}' where id = $1`, [acme.partnerId]);
  const res = await approve(h, userId, deckId);
  assertEquals(res.status, 409);
  assertEquals(res.body.error, "invalid_return_url");
});

Deno.test("approve: other users, non-partner decks, revoked seats, and anonymous callers are refused", async () => {
  const { h, acme, userId, deckId } = await setup();
  const stranger = await h.createExistingSspUser("stranger@church.test");
  assertEquals((await approve(h, stranger.userId, deckId)).status, 404, "someone else's deck");

  const { rows } = await h.pg.query<{ id: string }>(`select id from public.sermons where created_by_user_id = $1`, [stranger.userId]);
  assertEquals((await approve(h, stranger.userId, rows[0].id)).status, 404, "a non-partner deck");

  const anonymous = await handleApprove(new Request("https://x.test/partner-approve", { method: "POST", body: JSON.stringify({ deck_id: deckId }) }), h.deps);
  assertEquals(anonymous.status, 401);

  await h.call(acme, "DELETE", "/accounts/ext-1/entitlement");
  assertEquals((await approve(h, userId, deckId)).status, 403, "revoked seat");
});
