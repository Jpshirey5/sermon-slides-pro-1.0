// deno test -A --no-lock --node-modules-dir=none supabase/functions/_shared/presenter/tests/song_features_test.ts

import type { PGlite } from "npm:@electric-sql/pglite@0.5.8";
import { assert, assertEquals, assertRejects } from "../../scripture/tests/assert.ts";
import { createTestDatabase } from "../../scripture/tests/db.ts";
import { createSqlScriptureStore } from "../../scripture/tests/fakes.ts";
import { buildServiceBundle } from "../bundle.ts";
import { songOrder, songStyle } from "../slides.ts";
import { createSqlPresenterStore } from "./sqlStore.ts";

const one = async <T>(db: PGlite, sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0];
const as = async <T>(db: PGlite, userId: string, fn: (tx: PGlite) => Promise<T>): Promise<T> =>
  await db.transaction(async (tx) => {
    await tx.exec(`set local role authenticated`);
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId]);
    return await fn(tx as unknown as PGlite);
  });

const SECTIONS = JSON.stringify([
  { id: "v1", label: "Verse 1", lyrics: "first verse" },
  { id: "c", label: "Chorus", lyrics: "the chorus" },
  { id: "b", label: "Bridge", lyrics: "the bridge" },
]);

async function setup() {
  let a = "";
  let b = "";
  const db = await createTestDatabase(async (pre) => {
    a = (await pre.query<{ id: string }>(`insert into public.accounts (name, subscription_status) values ('A', 'active') returning id`)).rows[0].id;
    b = (await pre.query<{ id: string }>(`insert into public.accounts (name, subscription_status) values ('B', 'active') returning id`)).rows[0].id;
  });
  const userA = (await one<{ id: string }>(db, `insert into auth.users (email) values ('a@a.test') returning id`)).id;
  const userB = (await one<{ id: string }>(db, `insert into auth.users (email) values ('b@b.test') returning id`)).id;
  await db.query(`insert into public.account_members (account_id, user_id) values ($1, $2), ($3, $4)`, [a, userA, b, userB]);
  const song = (await one<{ id: string }>(
    db,
    `insert into public.songs (account_id, title, author, ccli_song_number, copyright, source, sections, arrangement)
     values ($1, 'Morning Light', 'Jane Writer', '1234567', '2021 Example Songs', 'licensed', $2, '["v1","c","b","c"]') returning id`,
    [a, SECTIONS],
  )).id;
  const service = (await one<{ id: string }>(db, `insert into public.services (account_id, title, service_date) values ($1, 'Sunday', '2026-10-25') returning id`, [a])).id;
  return { db, a, b, userA, userB, song, service };
}

const bundleFor = async (w: Awaited<ReturnType<typeof setup>>) => {
  const r = await buildServiceBundle({ store: createSqlPresenterStore(w.db), resolver: { store: createSqlScriptureStore(w.db), api: null } }, { userId: w.userA, serviceId: w.service });
  assert(r.ok, "bundle");
  if (!r.ok) throw new Error("bundle");
  return r.bundle;
};

Deno.test("song backgrounds: the song's own, else the church default, else black", () => {
  const church = { background: "#112233", background_image: "storage:presentation-backgrounds/account/a/church.png" };
  assertEquals([songStyle({}, null).background, songStyle({}, null).backgroundImage], ["#000000", null]);
  assertEquals(songStyle({}, church).backgroundImage, church.background_image);
  const own = songStyle({ background: "#445566" }, church);
  assertEquals([own.background, own.backgroundImage], ["#445566", null], "a song's own color replaces the church picture");
  assertEquals(songStyle({ background: "red; x" }, null).background, "#000000", "bad colors are ignored");
});

Deno.test("arrangement: this service's order wins over the song's, and unknown sections are skipped", () => {
  const song = { sections: JSON.parse(SECTIONS), arrangement: ["v1", "c", "b", "c"] };
  assertEquals(songOrder(song).map((s) => s.id), ["v1", "c", "b", "c"]);
  assertEquals(songOrder(song, ["c", "v1", "gone", "c"]).map((s) => s.id), ["c", "v1", "c"]);
  assertEquals(songOrder(song, []).map((s) => s.id), ["v1", "c", "b", "c"], "empty means use the song's");
});

Deno.test("bundle: song slides use the backgrounds and this service's arrangement", async () => {
  const w = await setup();
  await w.db.query(`update public.accounts set song_background_image = 'storage:presentation-backgrounds/account/x/church.png' where id = $1`, [w.a]);
  await w.db.query(
    `insert into public.service_items (service_id, account_id, position, item_type, song_id, payload) values ($1, $2, 1000, 'song', $3, '{"arrangement":["v1","c"]}')`,
    [w.service, w.a, w.song],
  );
  let bundle = await bundleFor(w);
  assertEquals(bundle.items[0].slides.map((s) => s.text), ["first verse", "the chorus"]);
  assertEquals(bundle.items[0].slides[0].style.backgroundImage, "storage:presentation-backgrounds/account/x/church.png");

  await w.db.query(`update public.songs set background = '#203040' where id = $1`, [w.song]);
  bundle = await bundleFor(w);
  assertEquals([bundle.items[0].slides[1].style.background, bundle.items[0].slides[1].style.backgroundImage], ["#203040", null]);
});

Deno.test("usage: once per song per service per day, with the song's details copied", async () => {
  const w = await setup();
  const record = (user: string, service = w.service, song = w.song, day = "today") =>
    as(w.db, user, (tx) => one<{ ok: boolean }>(tx, `select public.record_song_use($1, $2, ${day === "today" ? "current_date" : `'${day}'::date`}) as ok`, [service, song]));
  assertEquals((await record(w.userA)).ok, true);
  assertEquals((await record(w.userA)).ok, false, "second time in the same service the same day is not counted");

  const row = await one<{ title: string; ccli_song_number: string; author: string; source: string }>(w.db, `select title, ccli_song_number, author, source from public.song_usage`);
  assertEquals(row, { title: "Morning Light", ccli_song_number: "1234567", author: "Jane Writer", source: "licensed" });

  // Deleting the song keeps the report row.
  await w.db.query(`delete from public.songs where id = $1`, [w.song]);
  assertEquals((await one<{ n: number }>(w.db, `select count(*)::int as n from public.song_usage where title = 'Morning Light'`)).n, 1);
});

Deno.test("usage: only your own church, only real services, only today", async () => {
  const w = await setup();
  await assertRejects(() => as(w.db, w.userB, (tx) => tx.query(`select public.record_song_use($1, $2, current_date)`, [w.service, w.song])), "other church");
  await assertRejects(() => as(w.db, w.userA, (tx) => tx.query(`select public.record_song_use($1, $2, current_date - 30)`, [w.service, w.song])), "old date");
  const template = (await one<{ id: string }>(w.db, `insert into public.services (account_id, title, is_template) values ($1, 'Tpl', true) returning id`, [w.a])).id;
  await assertRejects(() => as(w.db, w.userA, (tx) => tx.query(`select public.record_song_use($1, $2, current_date)`, [template, w.song])), "template");
  await assertRejects(() => as(w.db, w.userA, (tx) => tx.query(`insert into public.song_usage (account_id, used_on, title, source) values ($1, current_date, 'x', 'licensed')`, [w.a])), "no direct inserts");

  await as(w.db, w.userA, (tx) => tx.query(`select public.record_song_use($1, $2, current_date)`, [w.service, w.song]));
  assertEquals((await as(w.db, w.userB, (tx) => tx.query(`select 1 from public.song_usage`))).rows.length, 0, "other church can't see it");
  assertEquals((await as(w.db, w.userA, (tx) => tx.query(`select 1 from public.song_usage`))).rows.length, 1);
});
