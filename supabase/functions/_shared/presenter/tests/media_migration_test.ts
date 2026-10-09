// deno test -A --no-lock --node-modules-dir=none supabase/functions/_shared/presenter/tests/media_migration_test.ts

import type { PGlite } from "npm:@electric-sql/pglite@0.5.8";
import { assertEquals, assertRejects } from "../../scripture/tests/assert.ts";
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
  const serviceA = (await one<{ id: string }>(db, `insert into public.services (account_id, title) values ($1, 'Sunday') returning id`, [a])).id;
  return { db, a, b, userA, userB, serviceA };
}

const addMedia = (db: PGlite, account: string, name = "welcome.mp4") =>
  one<{ id: string }>(
    db,
    `insert into public.service_media (account_id, kind, storage_path, file_name, mime_type, size_bytes, duration_seconds)
     values ($1, 'video', $2, $3, 'video/mp4', 1000, 61.5) returning id`,
    [account, `account/${account}/${crypto.randomUUID()}.mp4`, name],
  );

Deno.test("media is private to each church and must live in its own folder", async () => {
  const w = await setup();
  await as(w.db, w.userA, (tx) => addMedia(tx, w.a));
  assertEquals((await as(w.db, w.userA, (tx) => tx.query(`select 1 from public.service_media`))).rows.length, 1);
  assertEquals((await as(w.db, w.userB, (tx) => tx.query(`select 1 from public.service_media`))).rows.length, 0);
  await assertRejects(() => as(w.db, w.userB, (tx) => addMedia(tx, w.a)), "another church's library");
  await assertRejects(
    () => as(w.db, w.userA, (tx) => tx.query(
      `insert into public.service_media (account_id, kind, storage_path, file_name, mime_type, size_bytes) values ($1, 'video', $2, 'x.mp4', 'video/mp4', 1)`,
      [w.a, `account/${w.b}/x.mp4`],
    )),
    "file in another church's folder",
  );
  await assertRejects(() => as(w.db, null, (tx) => tx.query(`select * from public.service_media`)), "anon");
});

Deno.test("storage: members upload and read only in their church's folder", async () => {
  const w = await setup();
  await as(w.db, w.userA, (tx) => tx.query(`insert into storage.objects (bucket_id, name) values ('service-media', $1)`, [`account/${w.a}/v.mp4`]));
  await assertRejects(
    () => as(w.db, w.userB, (tx) => tx.query(`insert into storage.objects (bucket_id, name) values ('service-media', $1)`, [`account/${w.a}/x.mp4`])),
    "upload into another church's folder",
  );
  assertEquals((await as(w.db, w.userB, (tx) => tx.query(`select 1 from storage.objects where bucket_id = 'service-media'`))).rows.length, 0);
  assertEquals((await as(w.db, w.userA, (tx) => tx.query(`select 1 from storage.objects where bucket_id = 'service-media'`))).rows.length, 1);
  const bucket = await one<{ public: boolean; file_size_limit: number }>(w.db, `select public, file_size_limit from storage.buckets where id = 'service-media'`);
  assertEquals([bucket.public, Number(bucket.file_size_limit)], [false, 1073741824]);
});

Deno.test("video items need a video from the same church; slides items need nothing", async () => {
  const w = await setup();
  const mine = await addMedia(w.db, w.a);
  const theirs = await addMedia(w.db, w.b);
  await w.db.query(`insert into public.service_items (service_id, account_id, position, item_type, media_id) values ($1, $2, 1, 'video', $3)`, [w.serviceA, w.a, mine.id]);
  await w.db.query(`insert into public.service_items (service_id, account_id, position, item_type, payload) values ($1, $2, 2, 'slides', '{"slides":[]}')`, [w.serviceA, w.a]);
  await assertRejects(() => w.db.query(`insert into public.service_items (service_id, account_id, position, item_type, media_id) values ($1, $2, 3, 'video', $3)`, [w.serviceA, w.a, theirs.id]), "another church's video");
  await assertRejects(() => w.db.query(`insert into public.service_items (service_id, account_id, position, item_type) values ($1, $2, 3, 'video')`, [w.serviceA, w.a]), "video item without a video");
  await assertRejects(() => w.db.query(`insert into public.service_items (service_id, account_id, position, item_type, media_id) values ($1, $2, 3, 'slides', $3)`, [w.serviceA, w.a, mine.id]), "non-video item pointing at media");
});

Deno.test("deleting a video keeps the item, with the reference cleared", async () => {
  const w = await setup();
  const m = await addMedia(w.db, w.a);
  await w.db.query(`insert into public.service_items (service_id, account_id, position, item_type, media_id) values ($1, $2, 1, 'video', $3)`, [w.serviceA, w.a, m.id]);
  await w.db.query(`delete from public.service_media where id = $1`, [m.id]);
  const item = await one<{ media_id: string | null }>(w.db, `select media_id from public.service_items where service_id = $1`, [w.serviceA]);
  assertEquals(item.media_id, null);
});

Deno.test("song and sermon rules still hold after the item rules were replaced", async () => {
  const w = await setup();
  await assertRejects(() => w.db.query(`insert into public.service_items (service_id, account_id, position, item_type) values ($1, $2, 1, 'song')`, [w.serviceA, w.a]), "song without song");
  await assertRejects(() => w.db.query(`insert into public.service_items (service_id, account_id, position, item_type) values ($1, $2, 1, 'sermon')`, [w.serviceA, w.a]), "sermon without sermon");
});
