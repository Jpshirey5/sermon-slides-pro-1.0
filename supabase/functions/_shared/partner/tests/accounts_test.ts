// deno test -A --no-lock --node-modules-dir=none supabase/functions/_shared/partner/tests/accounts_test.ts
// POST /accounts, GET /accounts/{id}, DELETE /accounts/{id}/entitlement

import { assert, assertEquals } from "./assert.ts";
import { createHarness } from "./harness.ts";

const PASTOR = {
  external_user_id: "ext-100",
  email: "Pastor.Pat@GraceChurch.test",
  name: "Pat Pastor",
  church_name: "Grace Church",
  role: "Lead Pastor",
};

Deno.test("accounts: provisioning a new pastor creates one passwordless, unconfirmed, partner-billed user", async () => {
  const h = await createHarness();
  const acme = await h.createPartner({ slug: "acme" });
  const res = await h.call(acme, "POST", "/accounts", PASTOR);
  assertEquals(res.status, 201, res.text);
  assertEquals(res.body.created, true);
  assertEquals(res.body.external_user_id, "ext-100");
  assertEquals(res.body.email, "pastor.pat@gracechurch.test");
  assertEquals(res.body.entitlement, "core");
  assertEquals(res.body.entitlement_status, "active");
  assertEquals(Object.keys(res.body).sort(), [
    "created", "email", "entitlement", "entitlement_status", "external_user_id", "provisioned_at", "ssp_user_id", "theme_id",
  ]);

  const { rows: users } = await h.pg.query<Record<string, unknown>>(
    `select email_confirmed_at, encrypted_password, raw_user_meta_data from auth.users where id = $1`,
    [res.body.ssp_user_id],
  );
  assertEquals(users[0].email_confirmed_at, null);
  assertEquals(users[0].encrypted_password, null);
  const meta = users[0].raw_user_meta_data as Record<string, unknown>;
  assertEquals(meta.full_name, "Pat Pastor");
  assertEquals(meta.org_name, "Grace Church");
  assertEquals(meta.church_role, "Lead Pastor");
  assertEquals(meta.provisioned_by_partner, "acme");
  assertEquals(meta.partner_provision_token, null, "one-time token is scrubbed from metadata");

  const { rows: accounts } = await h.pg.query<Record<string, unknown>>(
    `select a.name, a.plan_tier, a.partner_billing_active, a.subscription_status::text as status
     from public.account_members m join public.accounts a on a.id = m.account_id where m.user_id = $1`,
    [res.body.ssp_user_id],
  );
  assertEquals(accounts, [{ name: "Grace Church", plan_tier: "core", partner_billing_active: true, status: "active" }]);
});

Deno.test("accounts: double provisioning yields one seat, 201 then 200, with or without an Idempotency-Key", async () => {
  const h = await createHarness();
  const acme = await h.createPartner({ slug: "acme" });
  const first = await h.call(acme, "POST", "/accounts", PASTOR);
  const second = await h.call(acme, "POST", "/accounts", PASTOR);
  const third = await h.call(acme, "POST", "/accounts", { ...PASTOR, name: "Changed" }, { idempotencyKey: "k-1" });
  assertEquals([first.status, second.status, third.status], [201, 200, 200]);
  assertEquals(second.body.created, false);
  assertEquals(second.body.ssp_user_id, first.body.ssp_user_id);
  assertEquals(third.body.ssp_user_id, first.body.ssp_user_id);

  const seats = await h.pg.query(`select 1 from public.partner_accounts`);
  const users = await h.pg.query(`select 1 from auth.users`);
  assertEquals(seats.rows.length, 1);
  assertEquals(users.rows.length, 1);
});

Deno.test("accounts: concurrent provisioning of the same seat still yields one seat", async () => {
  const h = await createHarness();
  const acme = await h.createPartner({ slug: "acme" });
  const results = await Promise.all([1, 2, 3].map(() => h.call(acme, "POST", "/accounts", PASTOR)));
  const statuses = results.map((r) => r.status).sort();
  assert(statuses.every((s) => s === 200 || s === 201), `statuses ${statuses}`);
  assertEquals(new Set(results.map((r) => r.body.ssp_user_id)).size, 1);
  assertEquals((await h.pg.query(`select 1 from public.partner_accounts`)).rows.length, 1);
});

Deno.test("accounts: an email with an existing SSP account links rather than duplicates, leaving it untouched", async () => {
  const h = await createHarness();
  const acme = await h.createPartner({ slug: "acme" });
  const existing = await h.createExistingSspUser("longtime@church.test");

  const res = await h.call(acme, "POST", "/accounts", { external_user_id: "ext-7", email: "LongTime@church.test" });
  assertEquals(res.status, 201, res.text);
  assertEquals(res.body.ssp_user_id, existing.userId);

  assertEquals((await h.pg.query(`select 1 from auth.users`)).rows.length, 1, "no duplicate user");
  const { rows } = await h.pg.query<Record<string, unknown>>(
    `select u.encrypted_password, a.stripe_customer_id, a.partner_billing_active, a.plan_tier,
            (select count(*)::int from public.sermons s where s.created_by_user_id = u.id) as decks
     from auth.users u join public.account_members m on m.user_id = u.id join public.accounts a on a.id = m.account_id
     where u.id = $1`,
    [existing.userId],
  );
  assertEquals(rows[0].encrypted_password, "bcrypt-hash", "password untouched");
  assertEquals(rows[0].stripe_customer_id, "cus_existing", "billing history untouched");
  assertEquals(rows[0].decks, 1, "existing decks untouched");
  assertEquals(rows[0].partner_billing_active, true);
  assertEquals(rows[0].plan_tier, "core");
});

Deno.test("accounts: the same email under a different external_user_id is email_conflict", async () => {
  const h = await createHarness();
  const acme = await h.createPartner({ slug: "acme" });
  await h.call(acme, "POST", "/accounts", PASTOR);
  const res = await h.call(acme, "POST", "/accounts", { ...PASTOR, external_user_id: "ext-999" });
  assertEquals(res.status, 409);
  assertEquals(res.body.error.code, "email_conflict");
});

Deno.test("accounts: two partners can each provision the same pastor", async () => {
  const h = await createHarness();
  const acme = await h.createPartner({ slug: "acme" });
  const other = await h.createPartner({ slug: "other" });
  const a = await h.call(acme, "POST", "/accounts", PASTOR);
  const b = await h.call(other, "POST", "/accounts", { ...PASTOR, external_user_id: "their-id" });
  assertEquals([a.status, b.status], [201, 201]);
  assertEquals(a.body.ssp_user_id, b.body.ssp_user_id);
});

Deno.test("accounts: theme_id resolves by external id or uuid, and unknown themes 404", async () => {
  const h = await createHarness();
  const acme = await h.createPartner({ slug: "acme" });
  const theme = await h.call(acme, "POST", "/themes", { external_theme_id: "grace", church_name: "Grace" });
  const byExternal = await h.call(acme, "POST", "/accounts", { ...PASTOR, theme_id: "grace" });
  assertEquals(byExternal.body.theme_id, theme.body.theme_id);
  const byUuid = await h.call(acme, "POST", "/accounts", { external_user_id: "ext-2", email: "b@c.test", theme_id: theme.body.theme_id });
  assertEquals(byUuid.body.theme_id, theme.body.theme_id);
  const missing = await h.call(acme, "POST", "/accounts", { external_user_id: "ext-3", email: "c@c.test", theme_id: "nope" });
  assertEquals(missing.status, 404);
  assertEquals(missing.body.error.code, "theme_not_found");
});

Deno.test("accounts: send_welcome_email sends the set-password email for new users only", async () => {
  const h = await createHarness();
  const acme = await h.createPartner({ slug: "acme" });
  await h.createExistingSspUser("old@church.test");
  await h.call(acme, "POST", "/accounts", { ...PASTOR, send_welcome_email: true });
  await h.call(acme, "POST", "/accounts", { external_user_id: "ext-old", email: "old@church.test", send_welcome_email: true });
  assertEquals(h.fake.sentEmails, [{ kind: "recovery", email: "pastor.pat@gracechurch.test" }]);
});

Deno.test("accounts: GET by external id or SSP uuid, with activity; unknown ids 404", async () => {
  const h = await createHarness();
  const acme = await h.createPartner({ slug: "acme" });
  const created = await h.call(acme, "POST", "/accounts", PASTOR);

  const byExternal = await h.call(acme, "GET", "/accounts/ext-100");
  assertEquals(byExternal.status, 200);
  assertEquals(byExternal.body.ssp_user_id, created.body.ssp_user_id);
  assertEquals(byExternal.body.decks_generated_total, 0);
  assertEquals(byExternal.body.last_active_at, null);

  const byUuid = await h.call(acme, "GET", `/accounts/${created.body.ssp_user_id}`);
  assertEquals(byUuid.body.external_user_id, "ext-100");

  const missing = await h.call(acme, "GET", "/accounts/ext-unknown");
  assertEquals(missing.status, 404);
  assertEquals(missing.body.error.code, "account_not_provisioned");
});

Deno.test("accounts: revoking keeps the user, account, and decks; the pastor can still sign in directly", async () => {
  const h = await createHarness();
  const acme = await h.createPartner({ slug: "acme" });
  const existing = await h.createExistingSspUser("keeps@church.test");
  await h.call(acme, "POST", "/accounts", { external_user_id: "ext-k", email: "keeps@church.test" });

  const revoked = await h.call(acme, "DELETE", "/accounts/ext-k/entitlement");
  assertEquals(revoked.status, 200, revoked.text);
  assertEquals(revoked.body.entitlement_status, "revoked");

  const { rows } = await h.pg.query<Record<string, unknown>>(
    `select u.encrypted_password, a.partner_billing_active, a.plan_tier,
            (select count(*)::int from public.sermons s where s.created_by_user_id = u.id) as decks
     from auth.users u join public.account_members m on m.user_id = u.id join public.accounts a on a.id = m.account_id
     where u.id = $1`,
    [existing.userId],
  );
  assertEquals(rows.length, 1, "auth user and membership still exist");
  assertEquals(rows[0].encrypted_password, "bcrypt-hash", "password still set, so direct sign-in still works");
  assertEquals(rows[0].decks, 1, "decks kept");
  assertEquals(rows[0].partner_billing_active, false);
  assertEquals(rows[0].plan_tier, "free");

  const session = await h.call(acme, "POST", "/sessions", { external_user_id: "ext-k" });
  assertEquals(session.status, 403);
  assertEquals(session.body.error.code, "entitlement_inactive");
});

Deno.test("accounts: revoking twice is a 200 no-op; re-provisioning reactivates", async () => {
  const h = await createHarness();
  const acme = await h.createPartner({ slug: "acme" });
  await h.call(acme, "POST", "/accounts", PASTOR);
  const first = await h.call(acme, "DELETE", "/accounts/ext-100/entitlement");
  const second = await h.call(acme, "DELETE", "/accounts/ext-100/entitlement");
  assertEquals([first.status, second.status], [200, 200]);
  assertEquals(second.body.revoked_at, undefined, "serialized seat shape is stable");
  assertEquals(second.body.entitlement_status, "revoked");

  const again = await h.call(acme, "POST", "/accounts", PASTOR);
  assertEquals(again.status, 200);
  assertEquals(again.body.entitlement_status, "active");
  const { rows } = await h.pg.query<{ partner_billing_active: boolean }>(
    `select a.partner_billing_active from public.accounts a join public.account_members m on m.account_id = a.id where m.user_id = $1`,
    [again.body.ssp_user_id],
  );
  assertEquals(rows[0].partner_billing_active, true);
});

Deno.test("accounts: validation errors name the field", async () => {
  const h = await createHarness();
  const acme = await h.createPartner({ slug: "acme" });
  const res = await h.call(acme, "POST", "/accounts", { external_user_id: "ext-1" });
  assertEquals(res.status, 422);
  assertEquals(res.body.error.message, "email: is required");
});
