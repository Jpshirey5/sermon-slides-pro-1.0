// deno test -A --node-modules-dir=none supabase/functions/_shared/scripture/tests/migration_test.ts
//
// Applies the presenter migration to an in-process Postgres (PGlite) on top of
// minimal stubs of the Supabase objects it depends on, then checks RLS as a
// member, a non-member, and anon, plus the expiry and revocation behavior.

import type { PGlite } from "npm:@electric-sql/pglite@0.5.8";
import { createTestDatabase } from "./db.ts";
import { assert, assertEquals, assertRejects } from "./assert.ts";

interface World {
  db: PGlite;
  accountA: string;
  accountB: string;
  userA: string;
  userB: string;
  sermonA: string;
  sermonB: string;
  campusA: string;
  campusB: string;
}

const one = async <T>(db: PGlite, sql: string, params: unknown[] = []) =>
  (await db.query<T>(sql, params)).rows[0];

const setup = async (opts: { esvAccount?: boolean } = {}): Promise<World> => {
  let accountA = "";
  let accountB = "";
  const db = await createTestDatabase(async (pre) => {
    accountA = (await one<{ id: string }>(pre, `insert into public.accounts (name, can_use_esv) values ('A', $1) returning id`, [Boolean(opts.esvAccount)])).id;
    accountB = (await one<{ id: string }>(pre, `insert into public.accounts (name) values ('B') returning id`)).id;
  });

  const userA = (await one<{ id: string }>(db, `insert into auth.users (email) values ('a@a.test') returning id`)).id;
  const userB = (await one<{ id: string }>(db, `insert into auth.users (email) values ('b@b.test') returning id`)).id;
  await db.query(`insert into public.account_members (account_id, user_id) values ($1, $2), ($3, $4)`, [accountA, userA, accountB, userB]);
  const sermonA = (await one<{ id: string }>(db, `insert into public.sermons (account_id, title) values ($1, 'A sermon') returning id`, [accountA])).id;
  const sermonB = (await one<{ id: string }>(db, `insert into public.sermons (account_id, title) values ($1, 'B sermon') returning id`, [accountB])).id;
  const campusA = (await one<{ id: string }>(db, `insert into public.campuses (account_id, name) values ($1, 'Main') returning id`, [accountA])).id;
  const campusB = (await one<{ id: string }>(db, `insert into public.campuses (account_id, name) values ($1, 'Main') returning id`, [accountB])).id;
  return { db, accountA, accountB, userA, userB, sermonA, sermonB, campusA, campusB };
};

/** Run `fn` as an API caller: role authenticated (or anon) with auth.uid() = userId. */
const as = async <T>(db: PGlite, userId: string | null, fn: (tx: PGlite) => Promise<T>): Promise<T> => {
  return await db.transaction(async (tx) => {
    await tx.exec(userId ? `set local role authenticated` : `set local role anon`);
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId ?? ""]);
    return await fn(tx as unknown as PGlite);
  });
};

const epoch = async (db: PGlite) =>
  Number((await one<{ epoch: number }>(db, `select epoch from public.scripture_revocation_state`)).epoch);

const cacheRow = (db: PGlite, translation: string, passage: string, expiresIn = "1 day") =>
  db.query(
    `insert into public.scripture_cache (translation_id, passage_id, verses, expires_at)
     values ($1, $2, '[{"verse":16,"text":"x"}]', now() + $3::interval)`,
    [translation, passage, expiresIn],
  );

const cacheCount = async (db: PGlite, translation?: string) =>
  Number((await one<{ n: number }>(
    db,
    translation
      ? `select count(*)::int as n from public.scripture_cache where translation_id = $1`
      : `select count(*)::int as n from public.scripture_cache`,
    translation ? [translation] : [],
  )).n);

// ── structure ───────────────────────────────────────────────────────────────

Deno.test("every new table has RLS on; server-only tables have no policies", async () => {
  const { db } = await setup();
  const tables = [
    "bible_translations", "account_translation_access", "scripture_revocation_state",
    "scripture_cache", "services", "service_items", "fums_events", "rate_counters",
  ];
  const { rows } = await db.query<{ relname: string; relrowsecurity: boolean }>(
    `select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relname = any($1)`,
    [tables],
  );
  assertEquals(rows.length, tables.length);
  for (const row of rows) assert(row.relrowsecurity, `${row.relname} must have RLS enabled`);

  const serverOnly = ["scripture_revocation_state", "scripture_cache", "fums_events", "rate_counters"];
  const policies = await db.query(`select 1 from pg_policies where tablename = any($1)`, [serverOnly]);
  assertEquals(policies.rows.length, 0, "server-only tables must have no policies");
});

Deno.test("seed: public domain translations have a source; copyrighted ones carry no invented copyright text", async () => {
  const { db } = await setup();
  const { rows } = await db.query<{ id: string; is_public_domain: boolean; provider_bible_id: string | null; copyright_short: string | null }>(
    `select id, is_public_domain, provider_bible_id, copyright_short from public.bible_translations order by id`,
  );
  assertEquals(rows.length, 13);
  for (const row of rows) {
    if (row.is_public_domain) assert(row.provider_bible_id, `${row.id} needs a Bible id`);
    else assertEquals(row.copyright_short, null, `${row.id} copyright must come from the provider`);
  }
  assertEquals(rows.filter((r) => r.is_public_domain).map((r) => r.id), ["ASV", "KJV", "WEB"]);
});

// ── client access to server-only data ───────────────────────────────────────

Deno.test("signed-in users cannot read cached verse text, FUMS records, rate counters, or the epoch row", async () => {
  const { db, userA, accountA } = await setup();
  await cacheRow(db, "KJV", "JHN.3.16");
  await db.query(
    `insert into public.fums_events (client_event_id, account_id, device_id, session_id, translation_id, fums_token, displayed_at)
     values (gen_random_uuid(), $1, 'd', 's', 'KJV', 't', now())`,
    [accountA],
  );
  for (const table of ["scripture_cache", "fums_events", "rate_counters", "scripture_revocation_state"]) {
    await assertRejects(() => as(db, userA, (tx) => tx.query(`select * from public.${table}`)), `authenticated select ${table}`);
    await assertRejects(() => as(db, null, (tx) => tx.query(`select * from public.${table}`)), `anon select ${table}`);
  }
  await assertRejects(
    () => as(db, userA, (tx) => tx.query(`insert into public.scripture_cache (translation_id, passage_id, verses, expires_at) values ('KJV','X','[]', now() + interval '1 day')`)),
    "authenticated insert into cache",
  );
});

Deno.test("server-only functions cannot be called by clients", async () => {
  const { db, userA } = await setup();
  for (const call of [
    `select public.purge_translation_cache('KJV')`,
    `select public.bump_scripture_revocation_epoch()`,
    `select public.rate_take('k', 'b', 5)`,
    `select public.presenter_housekeeping()`,
  ]) {
    await assertRejects(() => as(db, userA, (tx) => tx.query(call)), call);
  }
});

Deno.test("translations are readable by signed-in users only, and not writable", async () => {
  const { db, userA } = await setup();
  const rows = await as(db, userA, (tx) => tx.query(`select id from public.bible_translations`));
  assertEquals(rows.rows.length, 13);
  await assertRejects(() => as(db, null, (tx) => tx.query(`select id from public.bible_translations`)), "anon read");
  await assertRejects(
    () => as(db, userA, (tx) => tx.query(`update public.bible_translations set status = 'active' where id = 'NIV'`)),
    "authenticated update",
  );
});

// ── services RLS ────────────────────────────────────────────────────────────

Deno.test("members manage their own services and items; other accounts see nothing", async () => {
  const { db, userA, userB, accountA, sermonA } = await setup();

  const serviceId = await as(db, userA, async (tx) => {
    const s = await one<{ id: string }>(tx, `insert into public.services (account_id, title) values ($1, 'Sunday') returning id`, [accountA]);
    await tx.query(
      `insert into public.service_items (service_id, account_id, position, item_type, sermon_id) values ($1, $2, 1000, 'sermon', $3)`,
      [s.id, accountA, sermonA],
    );
    await tx.query(
      `insert into public.service_items (service_id, account_id, position, item_type, payload)
       values ($1, $2, 2000, 'scripture', '{"passages":[{"book":"JHN","chapter":3,"verse_start":16,"verse_end":17}],"translation_id":"NIV"}')`,
      [s.id, accountA],
    );
    return s.id;
  });

  const mine = await as(db, userA, (tx) => tx.query(`select id from public.service_items where service_id = $1`, [serviceId]));
  assertEquals(mine.rows.length, 2);

  const theirs = await as(db, userB, (tx) => tx.query(`select id from public.services`));
  assertEquals(theirs.rows.length, 0, "non-member sees no services");
  const theirItems = await as(db, userB, (tx) => tx.query(`select id from public.service_items`));
  assertEquals(theirItems.rows.length, 0, "non-member sees no items");

  const updated = await as(db, userB, (tx) => tx.query(`update public.services set title = 'hacked' where id = $1`, [serviceId]));
  assertEquals(updated.affectedRows ?? 0, 0, "non-member cannot update");
  const deleted = await as(db, userB, (tx) => tx.query(`delete from public.service_items where service_id = $1`, [serviceId]));
  assertEquals(deleted.affectedRows ?? 0, 0, "non-member cannot delete");

  await assertRejects(
    () => as(db, userB, (tx) => tx.query(`insert into public.services (account_id, title) values ($1, 'x')`, [accountA])),
    "non-member cannot create a service in another account",
  );
  await assertRejects(
    () => as(db, null, (tx) => tx.query(`select * from public.services`)),
    "anon cannot read services",
  );
});

Deno.test("item account_id always comes from the service, so it cannot be spoofed", async () => {
  const { db, userB, accountA, accountB } = await setup();
  const serviceB = (await one<{ id: string }>(db, `insert into public.services (account_id, title) values ($1, 'B') returning id`, [accountB])).id;
  const item = await as(db, userB, (tx) =>
    one<{ account_id: string }>(
      tx,
      `insert into public.service_items (service_id, account_id, position, item_type) values ($1, $2, 1, 'blank') returning account_id`,
      [serviceB, accountA],
    ));
  assertEquals(item.account_id, accountB);
});

Deno.test("a member cannot attach items to another account's service", async () => {
  const { db, userB, accountA, accountB } = await setup();
  const serviceA = (await one<{ id: string }>(db, `insert into public.services (account_id, title) values ($1, 'A') returning id`, [accountA])).id;
  await assertRejects(
    () => as(db, userB, (tx) => tx.query(
      `insert into public.service_items (service_id, account_id, position, item_type) values ($1, $2, 1, 'blank')`,
      [serviceA, accountB],
    )),
    "cross-account item insert",
  );
});

Deno.test("items may only reference sermons and campuses from their own account", async () => {
  const { db, accountA, sermonB, campusA, campusB } = await setup();
  const serviceA = (await one<{ id: string }>(db, `insert into public.services (account_id, title, campus_id) values ($1, 'A', $2) returning id`, [accountA, campusA])).id;
  await assertRejects(
    () => db.query(`insert into public.service_items (service_id, account_id, position, item_type, sermon_id) values ($1, $2, 1, 'sermon', $3)`, [serviceA, accountA, sermonB]),
    "foreign sermon",
  );
  await assertRejects(
    () => db.query(`insert into public.services (account_id, title, campus_id) values ($1, 'x', $2)`, [accountA, campusB]),
    "foreign campus",
  );
  await assertRejects(
    () => db.query(`insert into public.service_items (service_id, account_id, position, item_type) values ($1, $2, 1, 'sermon')`, [serviceA, accountA]),
    "sermon item without a sermon",
  );
  await assertRejects(
    () => db.query(`insert into public.service_items (service_id, account_id, position, item_type, sermon_id) values ($1, $2, 1, 'blank', (select id from public.sermons where account_id = $2 limit 1))`, [serviceA, accountA]),
    "non-sermon item pointing at a sermon",
  );
  await assertRejects(
    () => db.query(`insert into public.service_items (service_id, account_id, position, item_type) values ($1, $2, 1, 'song')`, [serviceA, accountA]),
    "unknown item type",
  );
});

Deno.test("deleting a sermon keeps its service item, with the reference cleared", async () => {
  const { db, accountA, sermonA } = await setup();
  const serviceA = (await one<{ id: string }>(db, `insert into public.services (account_id, title) values ($1, 'A') returning id`, [accountA])).id;
  await db.query(`insert into public.service_items (service_id, account_id, position, item_type, sermon_id) values ($1, $2, 1, 'sermon', $3)`, [serviceA, accountA, sermonA]);
  await db.query(`delete from public.sermons where id = $1`, [sermonA]);
  const item = await one<{ sermon_id: string | null }>(db, `select sermon_id from public.service_items where service_id = $1`, [serviceA]);
  assertEquals(item.sermon_id, null);
});

Deno.test("swapping two item positions in one transaction is allowed", async () => {
  const { db, accountA } = await setup();
  const s = (await one<{ id: string }>(db, `insert into public.services (account_id, title) values ($1, 'A') returning id`, [accountA])).id;
  await db.query(`insert into public.service_items (service_id, account_id, position, item_type) values ($1, $2, 1, 'blank'), ($1, $2, 2, 'logo')`, [s, accountA]);
  await db.transaction(async (tx) => {
    await tx.query(`update public.service_items set position = 2 where service_id = $1 and item_type = 'blank'`, [s]);
    await tx.query(`update public.service_items set position = 1 where service_id = $1 and item_type = 'logo'`, [s]);
  });
  const { rows } = await db.query<{ item_type: string }>(`select item_type from public.service_items where service_id = $1 order by position`, [s]);
  assertEquals(rows.map((r) => r.item_type), ["logo", "blank"]);
});

Deno.test("reorder_service_items reorders in one step and only for members", async () => {
  const { db, userA, userB, accountA } = await setup();
  const s = (await one<{ id: string }>(db, `insert into public.services (account_id, title) values ($1, 'A') returning id`, [accountA])).id;
  const ids = (await db.query<{ id: string }>(
    `insert into public.service_items (service_id, account_id, position, item_type)
     values ($1, $2, 1000, 'blank'), ($1, $2, 2000, 'logo'), ($1, $2, 3000, 'blank') returning id`,
    [s, accountA],
  )).rows.map((r) => r.id);
  const order = async () => (await db.query<{ id: string }>(`select id from public.service_items where service_id = $1 order by position`, [s])).rows.map((r) => r.id);

  await as(db, userA, (tx) => tx.query(`select public.reorder_service_items($1, $2)`, [s, [ids[2], ids[0], ids[1]]]));
  assertEquals(await order(), [ids[2], ids[0], ids[1]]);

  await assertRejects(() => as(db, userA, (tx) => tx.query(`select public.reorder_service_items($1, $2)`, [s, [ids[0], ids[1]]])), "missing an item");
  await assertRejects(() => as(db, userA, (tx) => tx.query(`select public.reorder_service_items($1, $2)`, [s, [ids[0], ids[0], ids[1]]])), "duplicate item");
  await assertRejects(() => as(db, userB, (tx) => tx.query(`select public.reorder_service_items($1, $2)`, [s, [ids[1], ids[0], ids[2]]])), "non-member");
  await assertRejects(() => as(db, null, (tx) => tx.query(`select public.reorder_service_items($1, $2)`, [s, ids])), "anon");
  assertEquals(await order(), [ids[2], ids[0], ids[1]], "failed attempts change nothing");
});

// ── cache expiry ────────────────────────────────────────────────────────────

Deno.test("cache rows cannot be stored for more than 30 days", async () => {
  const { db } = await setup();
  await cacheRow(db, "KJV", "JHN.3.16", "30 days");
  await assertRejects(() => cacheRow(db, "KJV", "JHN.3.17", "30 days 1 second"), "31st day");
  await assertRejects(() => cacheRow(db, "KJV", "JHN.3.18", "0 seconds"), "expires at fetch time");
});

Deno.test("housekeeping deletes expired rows and keeps fresh ones", async () => {
  const { db } = await setup();
  await cacheRow(db, "KJV", "JHN.3.16", "1 day");
  await db.query(
    `insert into public.scripture_cache (translation_id, passage_id, verses, fetched_at, expires_at)
     values ('KJV', 'GEN.1.1', '[]', now() - interval '31 days', now() - interval '1 day')`,
  );
  await db.query(`select public.presenter_housekeeping()`);
  const { rows } = await db.query<{ passage_id: string }>(`select passage_id from public.scripture_cache`);
  assertEquals(rows.map((r) => r.passage_id), ["JHN.3.16"]);
});

Deno.test("housekeeping clears old FUMS records and rate counters only", async () => {
  const { db, accountA } = await setup();
  await db.query(
    `insert into public.fums_events (client_event_id, account_id, device_id, session_id, translation_id, fums_token, displayed_at, received_at)
     values (gen_random_uuid(), $1, 'd', 's', 'KJV', 'old', now(), now() - interval '91 days'),
            (gen_random_uuid(), $1, 'd', 's', 'KJV', 'new', now(), now())`,
    [accountA],
  );
  await db.query(`insert into public.rate_counters (key, bucket, created_at) values ('k', 'old', now() - interval '3 days'), ('k', 'new', now())`);
  await db.query(`select public.presenter_housekeeping()`);
  assertEquals((await db.query<{ fums_token: string }>(`select fums_token from public.fums_events`)).rows.map((r) => r.fums_token), ["new"]);
  assertEquals((await db.query<{ bucket: string }>(`select bucket from public.rate_counters`)).rows.map((r) => r.bucket), ["new"]);
});

// ── revocation ──────────────────────────────────────────────────────────────

Deno.test("revoking a translation deletes its cached text at once and bumps the epoch", async () => {
  const { db } = await setup();
  await cacheRow(db, "KJV", "JHN.3.16");
  await cacheRow(db, "KJV", "ROM.8.28");
  await cacheRow(db, "WEB", "JHN.3.16");
  const before = await epoch(db);

  await db.query(`update public.bible_translations set status = 'revoked', status_reason = 'license ended' where id = 'KJV'`);

  assertEquals(await cacheCount(db, "KJV"), 0, "revoked translation's text is gone");
  assertEquals(await cacheCount(db, "WEB"), 1, "other translations untouched");
  assertEquals(await epoch(db), before + 1);
  const t = await one<{ status_changed_at: string | null }>(db, `select status_changed_at from public.bible_translations where id = 'KJV'`);
  assert(t.status_changed_at, "status_changed_at is stamped");
});

Deno.test("suspending also purges; reactivating bumps the epoch but stores nothing", async () => {
  const { db } = await setup();
  await cacheRow(db, "WEB", "JHN.3.16");
  const e0 = await epoch(db);
  await db.query(`update public.bible_translations set status = 'suspended' where id = 'WEB'`);
  assertEquals(await cacheCount(db, "WEB"), 0);
  assertEquals(await epoch(db), e0 + 1);
  await db.query(`update public.bible_translations set status = 'active' where id = 'WEB'`);
  assertEquals(await epoch(db), e0 + 2);
  assertEquals(await cacheCount(db, "WEB"), 0);
});

Deno.test("edits that do not affect what can be shown leave the epoch alone", async () => {
  const { db } = await setup();
  const e0 = await epoch(db);
  await db.query(`update public.bible_translations set name = 'King James' where id = 'KJV'`);
  assertEquals(await epoch(db), e0);
  await db.query(`update public.bible_translations set copyright_short = 'new line' where id = 'NIV'`);
  assertEquals(await epoch(db), e0 + 1, "copyright line change reloads attribution");
});

Deno.test("housekeeping is a backstop: it removes rows left for a non-active translation", async () => {
  const { db } = await setup();
  await db.query(`update public.bible_translations set status = 'revoked' where id = 'ASV'`);
  // Simulate a row that slipped in after revocation (for example, a race).
  await cacheRow(db, "ASV", "PSA.23.1");
  await db.query(`select public.presenter_housekeeping()`);
  assertEquals(await cacheCount(db, "ASV"), 0);
});

Deno.test("purge_translation_cache removes one translation and reports the count", async () => {
  const { db } = await setup();
  await cacheRow(db, "KJV", "A");
  await cacheRow(db, "KJV", "B");
  await cacheRow(db, "WEB", "A");
  const r = await one<{ n: number }>(db, `select public.purge_translation_cache('KJV') as n`);
  assertEquals(Number(r.n), 2);
  assertEquals(await cacheCount(db), 1);
});

Deno.test("ESV grants follow accounts.can_use_esv and bump the epoch", async () => {
  const { db, accountA, accountB } = await setup({ esvAccount: true });
  const seeded = await db.query(`select 1 from public.account_translation_access where account_id = $1 and translation_id = 'ESV' and revoked_at is null`, [accountA]);
  assertEquals(seeded.rows.length, 1, "existing ESV account carried over");

  const e0 = await epoch(db);
  await db.query(`update public.accounts set can_use_esv = false where id = $1`, [accountA]);
  const revoked = await one<{ revoked_at: string | null }>(db, `select revoked_at from public.account_translation_access where account_id = $1`, [accountA]);
  assert(revoked.revoked_at, "grant revoked");
  assert((await epoch(db)) > e0, "epoch bumped on revoke");

  await db.query(`update public.accounts set can_use_esv = true where id = $1`, [accountA]);
  const restored = await one<{ revoked_at: string | null }>(db, `select revoked_at from public.account_translation_access where account_id = $1`, [accountA]);
  assertEquals(restored.revoked_at, null, "grant restored");

  await db.query(`update public.accounts set can_use_esv = true where id = $1`, [accountB]);
  const granted = await db.query(`select 1 from public.account_translation_access where account_id = $1 and revoked_at is null`, [accountB]);
  assertEquals(granted.rows.length, 1, "new grant created");
});

Deno.test("members see only their own account's translation grants", async () => {
  const { db, userA, userB } = await setup({ esvAccount: true });
  const a = await as(db, userA, (tx) => tx.query(`select translation_id from public.account_translation_access`));
  assertEquals(a.rows.length, 1);
  const b = await as(db, userB, (tx) => tx.query(`select translation_id from public.account_translation_access`));
  assertEquals(b.rows.length, 0);
});

// ── rate limiting ───────────────────────────────────────────────────────────

Deno.test("rate_take allows up to the limit per key and bucket", async () => {
  const { db } = await setup();
  const take = async (key: string, bucket: string) =>
    (await one<{ ok: boolean }>(db, `select public.rate_take($1, $2, 2) as ok`, [key, bucket])).ok;
  assertEquals(await take("user:1", "m1"), true);
  assertEquals(await take("user:1", "m1"), true);
  assertEquals(await take("user:1", "m1"), false);
  assertEquals(await take("user:1", "m2"), true, "new window resets");
  assertEquals(await take("user:2", "m1"), true, "keys are independent");
});
