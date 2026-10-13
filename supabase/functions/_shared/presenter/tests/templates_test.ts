// deno test -A --no-lock --node-modules-dir=none supabase/functions/_shared/presenter/tests/templates_test.ts

import type { PGlite } from "npm:@electric-sql/pglite@0.5.8";
import { assert, assertEquals, assertRejects } from "../../scripture/tests/assert.ts";
import { createTestDatabase } from "../../scripture/tests/db.ts";
import { createSqlScriptureStore } from "../../scripture/tests/fakes.ts";
import { buildServiceBundle } from "../bundle.ts";
import { createSqlPresenterStore } from "./sqlStore.ts";

const one = async <T>(db: PGlite, sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0];
const as = async <T>(db: PGlite, userId: string, fn: (tx: PGlite) => Promise<T>): Promise<T> =>
  await db.transaction(async (tx) => {
    await tx.exec(`set local role authenticated`);
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId]);
    return await fn(tx as unknown as PGlite);
  });

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
  const sermonId = (await one<{ id: string }>(db, `insert into public.sermons (account_id, title, slides) values ($1, 'Anchored', '{}') returning id`, [a])).id;
  const songId = (await one<{ id: string }>(db, `insert into public.songs (account_id, title, sections, arrangement) values ($1, 'Doxology', '[]', '[]') returning id`, [a])).id;
  const serviceId = (await one<{ id: string }>(db, `insert into public.services (account_id, title, service_date) values ($1, 'Sunday', '2026-10-18') returning id`, [a])).id;
  const slides = { slides: [{ id: "w", kind: "graphic", backgroundImage: "storage:presentation-backgrounds/logo.png" }] };
  await db.query(
    `insert into public.service_items (service_id, account_id, position, item_type, label, payload) values ($1, $2, 1000, 'slides', 'Walk-in logo', $3)`,
    [serviceId, a, JSON.stringify(slides)],
  );
  await db.query(
    `insert into public.service_items (service_id, account_id, position, item_type, song_id, payload) values ($1, $2, 2000, 'song', $3, '{"stage_template":"worship","arrangement":["v1"]}')`,
    [serviceId, a, songId],
  );
  await db.query(
    `insert into public.service_items (service_id, account_id, position, item_type, sermon_id, label, payload) values ($1, $2, 3000, 'sermon', $3, 'Message', '{"timer_seconds":1800}')`,
    [serviceId, a, sermonId],
  );
  return { db, a, b, userA, userB, serviceId };
}

const copy = (tx: PGlite, source: string, title: string, date: string | null, asTemplate: boolean) =>
  one<{ id: string }>(tx, `select public.copy_service_structure($1, $2, $3, $4) as id`, [source, title, date, asTemplate]);

Deno.test("templates: saving keeps the order and names, empties sermons and songs, keeps blank slides", async () => {
  const w = await setup();
  const template = (await as(w.db, w.userA, (tx) => copy(tx, w.serviceId, "Sunday Morning", "2026-10-18", true))).id;
  const svc = await one<{ is_template: boolean; service_date: string | null; title: string }>(w.db, `select is_template, service_date, title from public.services where id = $1`, [template]);
  assertEquals([svc.is_template, svc.service_date, svc.title], [true, null, "Sunday Morning"]);

  const items = (await w.db.query<{ item_type: string; label: string | null; sermon_id: string | null; song_id: string | null; payload: Record<string, unknown> }>(
    `select item_type, label, sermon_id, song_id, payload from public.service_items where service_id = $1 order by position`,
    [template],
  )).rows;
  assertEquals(items.map((i) => [i.item_type, i.label, i.sermon_id, i.song_id]), [
    ["slides", "Walk-in logo", null, null],
    ["song", null, null, null],
    ["sermon", "Message", null, null],
  ]);
  assertEquals(items[0].payload, { slides: [{ id: "w", kind: "graphic", backgroundImage: "storage:presentation-backgrounds/logo.png" }] });
  assertEquals(items[1].payload, { stage_template: "worship" }, "song picks are not carried, stage settings are");
  assertEquals(items[2].payload, { timer_seconds: 1800 });
});

Deno.test("templates: a new service from a template has empty sections to fill in", async () => {
  const w = await setup();
  const template = (await as(w.db, w.userA, (tx) => copy(tx, w.serviceId, "Sunday Morning", null, true))).id;
  const fresh = (await as(w.db, w.userA, (tx) => copy(tx, template, "October 25", "2026-10-25", false))).id;
  const svc = await one<{ is_template: boolean; service_date: string }>(w.db, `select is_template, service_date::text from public.services where id = $1`, [fresh]);
  assertEquals([svc.is_template, svc.service_date], [false, "2026-10-25"]);

  const result = await buildServiceBundle({ store: createSqlPresenterStore(w.db), resolver: { store: createSqlScriptureStore(w.db), api: null } }, { userId: w.userA, serviceId: fresh });
  assert(result.ok, "bundle");
  if (!result.ok) return;
  assertEquals(result.bundle.items.map((i) => [i.type, i.label, i.slides.length]), [
    ["slides", "Walk-in logo", 1],
    ["song", "Song", 0],
    ["sermon", "Message", 0],
  ]);
  assertEquals(result.bundle.items[1].stage.template, "worship");

  // Picking this week's sermon fills the section.
  await as(w.db, w.userA, (tx) => tx.query(`update public.service_items set sermon_id = (select id from public.sermons limit 1) where service_id = $1 and item_type = 'sermon'`, [fresh]));
  const filled = await one<{ n: number }>(w.db, `select count(*)::int as n from public.service_items where service_id = $1 and sermon_id is not null`, [fresh]);
  assertEquals(filled.n, 1);
});

Deno.test("templates: another church can't copy your service or template", async () => {
  const w = await setup();
  await assertRejects(() => as(w.db, w.userB, (tx) => copy(tx, w.serviceId, "Stolen", null, true)), "other church");
  const count = await one<{ n: number }>(w.db, `select count(*)::int as n from public.services where account_id = $1`, [w.b]);
  assertEquals(count.n, 0);
});
