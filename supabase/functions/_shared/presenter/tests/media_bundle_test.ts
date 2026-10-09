// deno test -A --no-lock --node-modules-dir=none supabase/functions/_shared/presenter/tests/media_bundle_test.ts

import { assert, assertEquals } from "../../scripture/tests/assert.ts";
import { createTestDatabase } from "../../scripture/tests/db.ts";
import { createSqlScriptureStore } from "../../scripture/tests/fakes.ts";
import { buildServiceBundle } from "../bundle.ts";
import { planCustomSlides, planVideo, readCustomSlides } from "../slides.ts";
import { createSqlPresenterStore } from "./sqlStore.ts";

Deno.test("custom slides: kinds map to presenter slides, each pointing back to its place", () => {
  const slots = planCustomSlides("item1", {
    slides: [
      { id: "a", kind: "title", title: "Welcome", body: "We're glad you're here", background: "#14213d" },
      { id: "b", kind: "text", title: "Announcements", body: "Picnic Sunday\nBring a dish", notes: "Mention parking" },
      { id: "c", kind: "graphic", title: "ignored", backgroundImage: "storage:presentation-backgrounds/account/x/y.png" },
      { id: "d", kind: "blank" },
    ],
  });
  const slides = slots.map((s) => (s.kind === "static" ? s.slide : null)!);
  assertEquals(slides.map((s) => s.kind), ["title", "point", "graphic", "blank"]);
  assertEquals([slides[0].title, slides[0].subtitle, slides[0].style.background], ["Welcome", "We're glad you're here", "#14213d"]);
  assertEquals([slides[1].subtitle, slides[1].notes], ["Picnic Sunday\nBring a dish", "Mention parking"]);
  assertEquals([slides[2].title, slides[2].style.backgroundImage], [undefined, "storage:presentation-backgrounds/account/x/y.png"]);
  assertEquals(slides.map((s) => s.source), [0, 1, 2, 3].map((i) => ({ item_id: "item1", slide_indexes: [i] })));
});

Deno.test("custom slides: malformed input is cleaned up, not trusted", () => {
  const s = readCustomSlides({ slides: [{ kind: "evil", background: "red; url(x)", title: "x".repeat(500) }, "junk", null] });
  assertEquals(s.length, 1);
  assertEquals([s[0].kind, s[0].background, s[0].title?.length], ["text", undefined, 300]);
  assertEquals(readCustomSlides(null), []);
});

Deno.test("video: one slide with the file, length, and play settings", () => {
  const [slot] = planVideo("v1", { id: "m1", storage_path: "account/a/m1.mp4", file_name: "Welcome.mp4", duration_seconds: "61.5" }, { loop: true, end_action: "next" });
  assert(slot.kind === "static", "static");
  if (slot.kind !== "static") return;
  assertEquals(slot.slide.kind, "video");
  assertEquals(slot.slide.video, { media_id: "m1", storage_path: "account/a/m1.mp4", duration_seconds: 61.5, loop: true, end_action: "next" });
  const [plain] = planVideo("v1", { id: "m1", storage_path: "p", file_name: "f", duration_seconds: null }, { end_action: "weird" });
  assertEquals(plain.kind === "static" && plain.slide.video?.end_action, "hold");
});

Deno.test("bundle: slides and video items, and a deleted video shows as missing", async () => {
  let accountId = "";
  const db = await createTestDatabase(async (pre) => {
    accountId = (await pre.query<{ id: string }>(`insert into public.accounts (name, subscription_status) values ('A', 'active') returning id`)).rows[0].id;
  });
  const userId = crypto.randomUUID();
  await db.query(`insert into public.account_members (account_id, user_id) values ($1, $2)`, [accountId, userId]);
  const mediaId = (await db.query<{ id: string }>(
    `insert into public.service_media (account_id, kind, storage_path, file_name, mime_type, size_bytes, duration_seconds)
     values ($1, 'video', $2, 'Countdown.mp4', 'video/mp4', 1000, 300) returning id`,
    [accountId, `account/${accountId}/c.mp4`],
  )).rows[0].id;
  const serviceId = (await db.query<{ id: string }>(`insert into public.services (account_id, title) values ($1, 'Sunday') returning id`, [accountId])).rows[0].id;
  await db.query(`insert into public.service_items (service_id, account_id, position, item_type, media_id, payload) values ($1, $2, 1000, 'video', $3, '{}')`, [serviceId, accountId, mediaId]);
  await db.query(`insert into public.service_items (service_id, account_id, position, item_type, payload) values ($1, $2, 2000, 'slides', '{"slides":[{"id":"w","kind":"title","title":"Welcome"}]}')`, [serviceId, accountId]);

  const build = () => buildServiceBundle({ store: createSqlPresenterStore(db), resolver: { store: createSqlScriptureStore(db), api: null } }, { userId, serviceId });
  const result = await build();
  assert(result.ok, "bundle");
  if (!result.ok) return;
  const [video, slides] = result.bundle.items;
  assertEquals([video.type, video.label, video.media_id, video.stage.template], ["video", "Countdown.mp4", mediaId, "video"]);
  assertEquals(video.slides[0].video?.duration_seconds, 300);
  assertEquals([slides.type, slides.slides[0].title, slides.stage.template], ["slides", "Welcome", "simple"]);

  await db.query(`delete from public.service_media where id = $1`, [mediaId]);
  const after = await build();
  assert(after.ok, "bundle after delete");
  if (!after.ok) return;
  assertEquals(after.bundle.items[0].slides.map((s) => [s.kind, s.missing_reason]), [["missing", "video_deleted"]]);
});
