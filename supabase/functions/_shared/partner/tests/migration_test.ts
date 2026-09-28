// deno test -A supabase/functions/_shared/partner/tests/migration_test.ts
//
// Applies the partner migration to an in-process Postgres (PGlite) on top of
// minimal stubs of the Supabase-managed objects it touches (auth.users,
// storage.buckets, extensions.digest, and the app tables it alters), then
// exercises the SQL functions and the signup-trigger partner branch.

import type { PGlite } from "npm:@electric-sql/pglite@0.5.8";
import { assert, assertEquals, assertRejects } from "./assert.ts";
import { createDatabase } from "./pgStubs.ts";

const setup = async () => {
  const db = await createDatabase();
  const { rows } = await db.query<{ id: string }>(
    `insert into public.partners (name, slug, contact_email, allowed_return_hosts)
     values ('Acme', 'acme', 'dev@acme.test', array['app.acme.test']) returning id`,
  );
  return { db, partnerId: rows[0].id };
};

const sha = async (db: PGlite, value: string) =>
  (await db.query<{ h: string }>(`select encode(extensions.digest($1, 'sha256'), 'hex') as h`, [value])).rows[0].h;

Deno.test("migration: every partner table has RLS enabled and no policies", async () => {
  const { db } = await setup();
  const { rows } = await db.query<{ relname: string; relrowsecurity: boolean }>(`
    select c.relname, c.relrowsecurity from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and (c.relname like 'partner%' or c.relname = 'handoff_tokens')
  `);
  assertEquals(rows.length, 10, "expected 10 partner tables");
  for (const row of rows) assert(row.relrowsecurity, `${row.relname} must have RLS enabled`);
  const policies = await db.query(`select 1 from pg_policies where tablename like 'partner%' or tablename = 'handoff_tokens'`);
  assertEquals(policies.rows.length, 0, "partner tables must have no policies");
});

Deno.test("consume_handoff_token: works once, then never again", async () => {
  const { db, partnerId } = await setup();
  const user = (await db.query<{ id: string }>(`insert into auth.users (email, raw_user_meta_data) values ('x@x.test', '{"admin_invite_token":"t"}') returning id`)).rows[0].id;
  const hash = await sha(db, "raw-token");
  await db.query(
    `insert into public.handoff_tokens (token_hash, partner_id, user_id, return_url, expires_at)
     values ($1, $2, $3, 'https://app.acme.test/back', now() + interval '300 seconds')`,
    [hash, partnerId, user],
  );

  const first = await db.query<{ user_id: string; return_url: string; partner_id: string }>(
    `select * from public.consume_handoff_token($1)`,
    [hash],
  );
  assertEquals(first.rows.length, 1);
  assertEquals(first.rows[0].user_id, user);
  assertEquals(first.rows[0].partner_id, partnerId);
  assertEquals(first.rows[0].return_url, "https://app.acme.test/back");

  const second = await db.query(`select * from public.consume_handoff_token($1)`, [hash]);
  assertEquals(second.rows.length, 0, "second consume must return no row");
});

Deno.test("consume_handoff_token: expired and unknown tokens return no row", async () => {
  const { db, partnerId } = await setup();
  const user = (await db.query<{ id: string }>(`insert into auth.users (email, raw_user_meta_data) values ('y@x.test', '{"admin_invite_token":"t"}') returning id`)).rows[0].id;
  const hash = await sha(db, "old-token");
  await db.query(
    `insert into public.handoff_tokens (token_hash, partner_id, user_id, expires_at)
     values ($1, $2, $3, now() - interval '1 second')`,
    [hash, partnerId, user],
  );
  assertEquals((await db.query(`select * from public.consume_handoff_token($1)`, [hash])).rows.length, 0);
  assertEquals((await db.query(`select * from public.consume_handoff_token($1)`, [await sha(db, "nope")])).rows.length, 0);
});

Deno.test("consume_handoff_token and rate/gc functions are not executable by anon or authenticated", async () => {
  const { db } = await setup();
  for (const fn of [
    "public.consume_handoff_token(text)",
    "public.partner_rate_take(uuid, text, int)",
    "public.partner_find_user_id_by_email(text)",
    "public.partner_api_gc()",
  ]) {
    for (const role of ["anon", "authenticated"]) {
      const { rows } = await db.query<{ ok: boolean }>(`select has_function_privilege($1, $2, 'execute') as ok`, [role, fn]);
      assertEquals(rows[0].ok, false, `${role} must not execute ${fn}`);
    }
  }
});

Deno.test("partner_rate_take: allows up to the limit, then refuses", async () => {
  const { db, partnerId } = await setup();
  const results: boolean[] = [];
  for (let i = 0; i < 4; i++) {
    const { rows } = await db.query<{ ok: boolean }>(`select public.partner_rate_take($1, 'b1', 3) as ok`, [partnerId]);
    results.push(rows[0].ok);
  }
  assertEquals(results, [true, true, true, false]);
  const other = await db.query<{ ok: boolean }>(`select public.partner_rate_take($1, 'b2', 3) as ok`, [partnerId]);
  assertEquals(other.rows[0].ok, true, "a new bucket starts fresh");
});

Deno.test("handle_new_user: partner branch provisions an active partner-billed account", async () => {
  const { db, partnerId } = await setup();
  await db.query(
    `insert into public.partner_provision_tokens (token_hash, partner_id, email, entitlement, expires_at)
     values ($1, $2, 'pastor@church.test', 'core', now() + interval '2 minutes')`,
    [await sha(db, "prov-1"), partnerId],
  );
  const user = (await db.query<{ id: string }>(
    `insert into auth.users (email, raw_user_meta_data)
     values ('Pastor@Church.test', '{"signup_intent":"partner_provisioned","partner_provision_token":"prov-1","full_name":"Pat","org_name":"Grace"}')
     returning id`,
  )).rows[0].id;

  const { rows } = await db.query<{ name: string; plan_tier: string; partner_billing_active: boolean; subscription_status: string; role: string }>(
    `select a.name, a.plan_tier, a.partner_billing_active, a.subscription_status::text, m.role
     from public.account_members m join public.accounts a on a.id = m.account_id where m.user_id = $1`,
    [user],
  );
  assertEquals(rows.length, 1);
  assertEquals(rows[0].name, "Grace");
  assertEquals(rows[0].plan_tier, "core");
  assertEquals(rows[0].partner_billing_active, true);
  assertEquals(rows[0].subscription_status, "active");
  assertEquals(rows[0].role, "owner");
});

Deno.test("handle_new_user: partner metadata without a valid token is refused", async () => {
  const { db, partnerId } = await setup();
  await assertRejects(
    () => db.query(`insert into auth.users (email, raw_user_meta_data) values ('a@b.test', '{"signup_intent":"partner_provisioned","partner_provision_token":"forged"}')`),
    "forged token",
  );
  // A real token cannot be replayed, and cannot be used for a different email.
  await db.query(
    `insert into public.partner_provision_tokens (token_hash, partner_id, email, expires_at)
     values ($1, $2, 'only@this.test', now() + interval '2 minutes')`,
    [await sha(db, "prov-2"), partnerId],
  );
  await assertRejects(
    () => db.query(`insert into auth.users (email, raw_user_meta_data) values ('other@this.test', '{"signup_intent":"partner_provisioned","partner_provision_token":"prov-2"}')`),
    "email mismatch",
  );
  await db.query(`insert into auth.users (email, raw_user_meta_data) values ('only@this.test', '{"signup_intent":"partner_provisioned","partner_provision_token":"prov-2"}')`);
  await assertRejects(
    () => db.query(`insert into auth.users (email, raw_user_meta_data) values ('only@this.test', '{"signup_intent":"partner_provisioned","partner_provision_token":"prov-2"}')`),
    "replay",
  );
});

Deno.test("handle_new_user: ordinary signups still require paid checkout", async () => {
  const { db } = await setup();
  await assertRejects(
    () => db.query(`insert into auth.users (email, raw_user_meta_data) values ('free@x.test', '{}')`),
    "no paid signup",
  );
});

Deno.test("partner_find_user_id_by_email is case-insensitive", async () => {
  const { db } = await setup();
  const user = (await db.query<{ id: string }>(`insert into auth.users (email, raw_user_meta_data) values ('Mixed@Case.test', '{"admin_invite_token":"t"}') returning id`)).rows[0].id;
  const { rows } = await db.query<{ id: string }>(`select public.partner_find_user_id_by_email('mixed@case.TEST') as id`);
  assertEquals(rows[0].id, user);
});

Deno.test("partner_api_gc removes expired and stale rows only", async () => {
  const { db, partnerId } = await setup();
  const user = (await db.query<{ id: string }>(`insert into auth.users (email, raw_user_meta_data) values ('g@x.test', '{"admin_invite_token":"t"}') returning id`)).rows[0].id;
  await db.query(
    `insert into public.handoff_tokens (token_hash, partner_id, user_id, expires_at) values
       ('old', $1, $2, now() - interval '2 days'), ('fresh', $1, $2, now() + interval '5 minutes')`,
    [partnerId, user],
  );
  await db.query(
    `insert into public.partner_idempotency (partner_id, idempotency_key, request_fingerprint, response_status, response_body, created_at) values
       ($1, 'old', 'f', 201, '{}', now() - interval '31 days'), ($1, 'new', 'f', 201, '{}', now())`,
    [partnerId],
  );
  await db.query(
    `insert into public.partner_api_log (request_id, partner_id, method, path, status, created_at) values
       ('r1', $1, 'GET', '/x', 200, now() - interval '91 days'), ('r2', $1, 'GET', '/x', 200, now())`,
    [partnerId],
  );
  await db.query(`select public.partner_api_gc()`);
  const tokens = await db.query<{ token_hash: string }>(`select token_hash from public.handoff_tokens`);
  assertEquals(tokens.rows.map((r) => r.token_hash), ["fresh"]);
  const keys = await db.query<{ idempotency_key: string }>(`select idempotency_key from public.partner_idempotency`);
  assertEquals(keys.rows.map((r) => r.idempotency_key), ["new"]);
  const logs = await db.query<{ request_id: string }>(`select request_id from public.partner_api_log`);
  assertEquals(logs.rows.map((r) => r.request_id), ["r2"]);
});
