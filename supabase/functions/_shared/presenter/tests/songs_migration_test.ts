// deno test -A --no-lock --node-modules-dir=none supabase/functions/_shared/presenter/tests/songs_migration_test.ts

import type { PGlite } from "npm:@electric-sql/pglite@0.5.8";
import { assert, assertEquals, assertRejects } from "../../scripture/tests/assert.ts";
import { createTestDatabase } from "../../scripture/tests/db.ts";

const one = async <T>(db: PGlite, sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0];

const as = async <T>(db: PGlite, userId: string | null, fn: (tx: PGlite) => Promise<T>): Promise<T> =>
  await db.transaction(async (tx) => {
    await tx.exec(userId ? `set local role authenticated` : `set local role anon`);
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId ?? ""]);
    return await fn(tx as unknown as PGlite);
  });

async function setup() {
  const db = await createTestDatabase();
  const a = (await one<{ id: string }>(db, `insert into public.accounts (name) values ('A') returning id`)).id;
  const b = (await one<{ id: string }>(db, `insert into public.accounts (name) values ('B') returning id`)).id;
  const userA = (await one<{ id: string }>(db, `insert into auth.users (email) values ('a@a.test') returning id`)).id;
  const userB = (await one<{ id: string }>(db, `insert into auth.users (email) values ('b@b.test') returning id`)).id;
  await db.query(`insert into public.account_members (account_id, user_id) values ($1, $2), ($3, $4)`, [a, userA, b, userB]);
  const songA = (await one<{ id: string }>(
    db,
    `insert into public.songs (account_id, title, ccli_song_number, sections) values ($1, 'Doxology', '123', '[{"id":"v1","label":"Verse","lyrics":"Praise God"}]') returning id`,
    [a],
  )).id;
  const songB = (await one<{ id: string }>(db, `insert into public.songs (account_id, title) values ($1, 'B song') returning id`, [b])).id;
  const serviceA = (await one<{ id: string }>(db, `insert into public.services (account_id, title) values ($1, 'Sunday') returning id`, [a])).id;
  return { db, a, b, userA, userB, songA, songB, serviceA };
}

Deno.test("songs are private to each church", async () => {
  const w = await setup();
  const mine = await as(w.db, w.userA, (tx) => tx.query<{ title: string }>(`select title from public.songs`));
  assertEquals(mine.rows.map((r) => r.title), ["Doxology"]);
  const theirs = await as(w.db, w.userB, (tx) => tx.query<{ title: string }>(`select title from public.songs`));
  assertEquals(theirs.rows.map((r) => r.title), ["B song"]);
  await assertRejects(() => as(w.db, null, (tx) => tx.query(`select * from public.songs`)), "anon cannot read songs");
  await assertRejects(
    () => as(w.db, w.userB, (tx) => tx.query(`insert into public.songs (account_id, title) values ($1, 'x')`, [w.a])),
    "cannot add songs to another church",
  );
  const updated = await as(w.db, w.userB, (tx) => tx.query(`update public.songs set title = 'hacked' where id = $1`, [w.songA]));
  assertEquals(updated.affectedRows ?? 0, 0);
});

Deno.test("members can create, edit, and delete their own songs", async () => {
  const w = await setup();
  const id = await as(w.db, w.userA, async (tx) => {
    const s = await one<{ id: string }>(tx, `insert into public.songs (account_id, title, source) values ($1, 'Amazing Grace', 'public_domain') returning id`, [w.a]);
    await tx.query(`update public.songs set author = 'John Newton' where id = $1`, [s.id]);
    return s.id;
  });
  assertEquals((await one<{ author: string }>(w.db, `select author from public.songs where id = $1`, [id])).author, "John Newton");
  await as(w.db, w.userA, (tx) => tx.query(`delete from public.songs where id = $1`, [id]));
  assertEquals((await w.db.query(`select 1 from public.songs where id = $1`, [id])).rows.length, 0);
});

Deno.test("song fields are validated", async () => {
  const w = await setup();
  for (const [sql, label] of [
    [`insert into public.songs (account_id, title) values ($1, '  ')`, "blank title"],
    [`insert into public.songs (account_id, title, source) values ($1, 'x', 'pirated')`, "unknown source"],
    [`insert into public.songs (account_id, title, ccli_song_number) values ($1, 'x', 'abc')`, "non-numeric CCLI number"],
    [`insert into public.songs (account_id, title, sections) values ($1, 'x', '{}')`, "sections must be a list"],
  ] as const) {
    await assertRejects(() => w.db.query(sql, [w.a]), label);
  }
  await assertRejects(() => w.db.query(`update public.accounts set ccli_license_number = 'x1' where id = $1`, [w.a]), "license number digits only");
  await w.db.query(`update public.accounts set ccli_license_number = '1234567' where id = $1`, [w.a]);
});

Deno.test("song items: own church's songs only, and a song is required", async () => {
  const w = await setup();
  await as(w.db, w.userA, (tx) =>
    tx.query(`insert into public.service_items (service_id, account_id, position, item_type, song_id) values ($1, $2, 1000, 'song', $3)`, [w.serviceA, w.a, w.songA]));
  await assertRejects(
    () => w.db.query(`insert into public.service_items (service_id, account_id, position, item_type, song_id) values ($1, $2, 2000, 'song', $3)`, [w.serviceA, w.a, w.songB]),
    "another church's song",
  );
  await assertRejects(
    () => w.db.query(`insert into public.service_items (service_id, account_id, position, item_type) values ($1, $2, 2000, 'song')`, [w.serviceA, w.a]),
    "song item without a song",
  );
  await assertRejects(
    () => w.db.query(`insert into public.service_items (service_id, account_id, position, item_type, song_id) values ($1, $2, 2000, 'blank', $3)`, [w.serviceA, w.a, w.songA]),
    "non-song item pointing at a song",
  );
});

Deno.test("deleting a song keeps the service item, with the reference cleared", async () => {
  const w = await setup();
  await w.db.query(`insert into public.service_items (service_id, account_id, position, item_type, song_id) values ($1, $2, 1000, 'song', $3)`, [w.serviceA, w.a, w.songA]);
  await w.db.query(`delete from public.songs where id = $1`, [w.songA]);
  const item = await one<{ song_id: string | null; item_type: string }>(w.db, `select song_id, item_type from public.service_items where service_id = $1`, [w.serviceA]);
  assertEquals([item.item_type, item.song_id], ["song", null]);
});

Deno.test("existing item types and rules still hold", async () => {
  const w = await setup();
  for (const t of ["blank", "logo", "scripture"]) {
    await w.db.query(`insert into public.service_items (service_id, account_id, position, item_type) values ($1, $2, $3, $4)`, [w.serviceA, w.a, 100 + t.length, t]);
  }
  await assertRejects(
    () => w.db.query(`insert into public.service_items (service_id, account_id, position, item_type) values ($1, $2, 9, 'video')`, [w.serviceA, w.a]),
    "video is not an item type yet",
  );
  const { rows } = await w.db.query(`select 1 from pg_policies where tablename = 'songs'`);
  assert(rows.length === 4, "four song policies");
});
