// deno test -A --no-lock --node-modules-dir=none supabase/functions/_shared/presenter/tests/workspace_bundle_test.ts
//
// Songs, speaker notes, slide sources, and stage settings in the bundle.

import { assert, assertEquals } from "../../scripture/tests/assert.ts";
import { createTestDatabase } from "../../scripture/tests/db.ts";
import { createFakeApi, createSqlScriptureStore, passage } from "../../scripture/tests/fakes.ts";
import { buildServiceBundle } from "../bundle.ts";
import { planSermon, planSong, type ScriptureSlot, songCredit, songOrder, type SongRow } from "../slides.ts";
import { stageSettings } from "../bundle.ts";
import { createSqlPresenterStore } from "./sqlStore.ts";

const NOW = new Date("2026-10-09T15:00:00Z");

const song = (over: Partial<SongRow> = {}): SongRow => ({
  id: "song1",
  title: "Come Thou Fount",
  author: "Robert Robinson",
  ccli_song_number: null,
  copyright: null,
  source: "public_domain",
  sections: [
    { id: "v1", label: "Verse 1", lyrics: "Come thou fount\nof every blessing\n\nTune my heart\nto sing thy grace" },
    { id: "c", label: "Chorus", lyrics: "Here I raise\nmy Ebenezer" },
  ],
  arrangement: [],
  ...over,
});

// ── songs ───────────────────────────────────────────────────────────────────

Deno.test("songOrder follows the arrangement, repeats allowed, unknown ids ignored", () => {
  assertEquals(songOrder(song()).map((s) => s.label), ["Verse 1", "Chorus"]);
  assertEquals(songOrder(song({ arrangement: ["c", "v1", "c", "nope"] })).map((s) => s.label), ["Chorus", "Verse 1", "Chorus"]);
  assertEquals(songOrder(song({ sections: "junk" })), []);
});

Deno.test("planSong: a blank line starts a new slide; credit only on the first slide", () => {
  const slots = planSong("item1", song(), null);
  const slides = slots.map((s) => (s.kind === "static" ? s.slide : null)!);
  assertEquals(slides.map((s) => [s.kind, s.label, s.text]), [
    ["lyrics", "Verse 1", "Come thou fount\nof every blessing"],
    ["lyrics", "Verse 1", "Tune my heart\nto sing thy grace"],
    ["lyrics", "Chorus", "Here I raise\nmy Ebenezer"],
  ]);
  assertEquals(slides[0].credit, '"Come Thou Fount". Robert Robinson. Public domain.');
  assert(slides.slice(1).every((s) => !s.credit), "credit once");
  assertEquals(new Set(slides.map((s) => s.id)).size, 3, "unique ids");
});

Deno.test("songCredit for licensed songs includes CCLI song and license numbers", () => {
  const licensed = song({ source: "licensed", copyright: "2011 Example Music", ccli_song_number: "6016351" });
  assertEquals(songCredit(licensed, "1234567"), '"Come Thou Fount". Robert Robinson. 2011 Example Music. CCLI Song # 6016351. CCLI License # 1234567.');
  assertEquals(songCredit(licensed, null), '"Come Thou Fount". Robert Robinson. 2011 Example Music. CCLI Song # 6016351.');
  assertEquals(songCredit(song({ source: "original", author: null, copyright: "Grace Church" }), "999"), '"Come Thou Fount". Grace Church.');
});

// ── sermon notes and sources ────────────────────────────────────────────────

Deno.test("sermon slides carry speaker notes and point back to their editor slides", () => {
  const slots = planSermon({
    id: "ser",
    title: "x",
    slides: {
      formData: { translation: "KJV" },
      editorSlides: [
        { id: "t", type: "title", content: { title: "Anchored" }, notes: "Welcome everyone" },
        { id: "a", type: "scripture", content: { reference: "John 3:16 (KJV)" }, notes: "Read slowly" },
        { id: "b", type: "scripture", content: { reference: "John 3:16 (KJV)" } },
      ],
    },
  }, "KJV");
  const title = slots[0];
  assert(title.kind === "static", "static");
  if (title.kind !== "static") return;
  assertEquals([title.slide.notes, title.slide.source], ["Welcome everyone", { sermon_id: "ser", slide_indexes: [0] }]);
  const scripture = slots[1] as ScriptureSlot;
  assertEquals(scripture.source, { sermon_id: "ser", slide_indexes: [1, 2] });
  assertEquals(scripture.notes, ["Read slowly", undefined]);
});

// ── stage settings ──────────────────────────────────────────────────────────

Deno.test("stage settings: defaults by type, valid overrides only", () => {
  assertEquals(stageSettings("song", {}), { template: "worship", timer_seconds: null });
  assertEquals(stageSettings("sermon", null), { template: "message", timer_seconds: null });
  assertEquals(stageSettings("scripture", {}), { template: "simple", timer_seconds: null });
  assertEquals(stageSettings("sermon", { stage_template: "video", timer_seconds: 1800 }), { template: "video", timer_seconds: 1800 });
  assertEquals(stageSettings("sermon", { stage_template: "disco", timer_seconds: -5 }), { template: "message", timer_seconds: null });
  assertEquals(stageSettings("sermon", { timer_seconds: 99999 }).timer_seconds, null, "over 6 hours refused");
  assertEquals(stageSettings("sermon", { timer_seconds: 12.5 }).timer_seconds, null, "whole seconds only");
});

// ── end to end through the bundle ───────────────────────────────────────────

Deno.test("bundle: song items, notes, sources, and stage settings", async () => {
  let accountId = "";
  const db = await createTestDatabase(async (pre) => {
    accountId = (await pre.query<{ id: string }>(`insert into public.accounts (name, subscription_status) values ('A', 'active') returning id`)).rows[0].id;
  });
  await db.query(`update public.accounts set ccli_license_number = '7654321' where id = $1`, [accountId]);
  const userId = crypto.randomUUID();
  await db.query(`insert into public.account_members (account_id, user_id) values ($1, $2)`, [accountId, userId]);
  const songId = (await db.query<{ id: string }>(
    `insert into public.songs (account_id, title, author, ccli_song_number, copyright, source, sections)
     values ($1, 'Doxology', 'Thomas Ken', '1234', null, 'licensed', $2) returning id`,
    [accountId, JSON.stringify([{ id: "v", label: "Verse", lyrics: "Praise God\nfrom whom all blessings flow" }])],
  )).rows[0].id;
  const sermonId = (await db.query<{ id: string }>(
    `insert into public.sermons (account_id, title, slides) values ($1, 'Anchored', $2) returning id`,
    [accountId, JSON.stringify({ formData: { translation: "KJV" }, editorSlides: [{ id: "p", type: "point", content: { title: "Hope" }, notes: "Tell the story" }] })],
  )).rows[0].id;
  const serviceId = (await db.query<{ id: string }>(`insert into public.services (account_id, title) values ($1, 'Sunday') returning id`, [accountId])).rows[0].id;
  await db.query(
    `insert into public.service_items (service_id, account_id, position, item_type, song_id, payload) values ($1, $2, 1000, 'song', $3, '{}')`,
    [serviceId, accountId, songId],
  );
  await db.query(
    `insert into public.service_items (service_id, account_id, position, item_type, sermon_id, payload) values ($1, $2, 2000, 'sermon', $3, '{"timer_seconds": 2100}')`,
    [serviceId, accountId, sermonId],
  );

  const result = await buildServiceBundle(
    {
      store: createSqlPresenterStore(db),
      resolver: { store: createSqlScriptureStore(db), api: createFakeApi({ passages: { "JHN.3.16": passage([[16, "x"]]) } }), now: () => NOW },
      now: () => NOW,
    },
    { userId, serviceId },
  );
  assert(result.ok, "bundle");
  if (!result.ok) return;
  const [songItem, sermonItem] = result.bundle.items;

  assertEquals([songItem.type, songItem.label, songItem.song_id, songItem.stage], ["song", "Doxology", songId, { template: "worship", timer_seconds: null }]);
  assertEquals(songItem.slides[0].text, "Praise God\nfrom whom all blessings flow");
  assertEquals(songItem.slides[0].credit, '"Doxology". Thomas Ken. CCLI Song # 1234. CCLI License # 7654321.');

  assertEquals(sermonItem.stage, { template: "message", timer_seconds: 2100 });
  assertEquals(sermonItem.sermon_id, sermonId);
  assertEquals(sermonItem.slides[0].notes, "Tell the story");
  assertEquals(sermonItem.slides[0].source, { sermon_id: sermonId, slide_indexes: [0] });

  // A deleted song shows as a missing item instead of breaking the service.
  await db.query(`delete from public.songs where id = $1`, [songId]);
  const after = await buildServiceBundle(
    { store: createSqlPresenterStore(db), resolver: { store: createSqlScriptureStore(db), api: null }, now: () => new Date(NOW.getTime() + 60_000) },
    { userId, serviceId },
  );
  assert(after.ok, "bundle after delete");
  if (!after.ok) return;
  assertEquals(after.bundle.items[0].slides.map((s) => [s.kind, s.missing_reason]), [["missing", "song_deleted"]]);
});
