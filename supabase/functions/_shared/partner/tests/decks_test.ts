// deno test -A --no-lock --node-modules-dir=none supabase/functions/_shared/partner/tests/decks_test.ts
// POST /decks, GET /decks/{id}, POST /decks/{id}/exports, GET /exports/{id}

import JSZip from "npm:jszip@3.10.1";
import { assert, assertEquals } from "./assert.ts";
import { createHarness, scriptureCalls, setBedrockToolInput, unresolvableReferences } from "./harness.ts";
import { Presentation } from "../export/pro7-schema.ts";

const PASTOR = { external_user_id: "ext-1", email: "pat@grace.test" };

const POINTS_DECK = {
  external_user_id: "ext-1",
  title: "Anchored",
  scripture_ref: "Hebrews 6:19",
  service_date: "2026-10-04",
  translation: "NIV",
  big_idea: "Hope holds when everything else moves",
  points: [
    { heading: "Hope is a person", refs: ["John 14:6"] },
    { heading: "Hope is a promise", refs: ["Romans 8:28", "2 Corinthians 1:20"], body: "notes" },
    { heading: "Hope is a practice", refs: [] },
  ],
};

const setup = async (options: { deckLimitPerDay?: number } = {}) => {
  const h = await createHarness();
  const acme = await h.createPartner({ slug: "acme", deckLimitPerDay: options.deckLimitPerDay });
  const seat = await h.call(acme, "POST", "/accounts", PASTOR);
  return { h, acme, userId: seat.body.ssp_user_id as string };
};

Deno.test("decks: structured points produce a ready deck with a deterministic completeness score", async () => {
  const { h, acme, userId } = await setup();
  scriptureCalls.length = 0;
  const created = await h.call(acme, "POST", "/decks", { ...POINTS_DECK, translation: "KJV" });
  assertEquals(created.status, 201, created.text);
  assertEquals(created.body.status, "queued");
  assertEquals(created.body.source, "points");
  assertEquals(created.body.poll_after_ms, 3000);

  const queued = await h.call(acme, "GET", `/decks/${created.body.deck_id}`);
  assert(["queued", "generating"].includes(queued.body.status), queued.body.status);
  assertEquals(queued.body.completeness, null);
  assertEquals(queued.body.poll_after_ms, 3000);

  await h.drain();
  const ready = await h.call(acme, "GET", `/decks/${created.body.deck_id}`);
  assertEquals(ready.body.status, "ready", ready.text);
  assertEquals(ready.body.poll_after_ms, null);
  assertEquals(ready.body.error, null);
  assertEquals(ready.body.thumbnails, []);
  assertEquals(ready.body.completeness.score, 1);
  assertEquals(ready.body.completeness.total_points, 3);
  assertEquals(ready.body.completeness.points_with_slides, 3);
  assertEquals(ready.body.completeness.total_refs, 4);
  assertEquals(ready.body.completeness.resolved_refs, 4);
  assert(typeof ready.body.completeness.formula === "string", "formula is explained");
  // title + big idea + main passage + 3 points + 3 point refs
  assertEquals(ready.body.slide_count, 9);

  // Lookups ran on behalf of the pastor so ESV entitlement is checked against their account.
  assertEquals(new Set(scriptureCalls.map((c) => c.onBehalfOf)), new Set([userId]));
  assertEquals(new Set(scriptureCalls.map((c) => c.translation)), new Set(["KJV"]), "an explicit translation wins over the default");

  const { rows } = await h.pg.query<Record<string, unknown>>(
    `select partner_id, partner_external_user_id, created_by_user_id, presentation_date::text as date, creation_mode, scripture_reference
     from public.sermons where id = $1`,
    [created.body.deck_id],
  );
  assertEquals(rows[0], {
    partner_id: acme.partnerId,
    partner_external_user_id: "ext-1",
    created_by_user_id: userId,
    date: "2026-10-04",
    creation_mode: "structured_builder",
    scripture_reference: "Hebrews 6:19",
  });
});

Deno.test("decks: unresolved verses lower the score and are listed", async () => {
  const { h, acme } = await setup();
  unresolvableReferences.add("Romans 8:28");
  try {
    const created = await h.call(acme, "POST", "/decks", {
      ...POINTS_DECK,
      scripture_ref: undefined,
      points: [
        { heading: "One", refs: ["Romans 8:28", "not a reference"] },
        { heading: "Two", refs: ["John 3:16"] },
      ],
    });
    await h.drain();
    const deck = await h.call(acme, "GET", `/decks/${created.body.deck_id}`);
    // (2 points + 1 resolved) / (2 points + 3 refs) = 0.6
    assertEquals(deck.body.completeness.score, 0.6);
    assertEquals(deck.body.completeness.unresolved_verses.sort(), ["Romans 8:28", "not a reference"]);
    assertEquals(deck.body.completeness.points_without_slides, []);
  } finally {
    unresolvableReferences.clear();
  }
});

Deno.test("decks: raw_text runs through the existing Quick Build parser", async () => {
  const { h, acme } = await setup();
  setBedrockToolInput({
    title: "Rest for the Weary",
    items: [
      { kind: "point", text: "1. Come to Jesus", scripture_references_raw: ["Matthew 11:28"] },
      { kind: "subpoint", text: "a. Bring your burdens", scripture_references_raw: [] },
      { kind: "point", text: "2. Take his yoke", scripture_references_raw: ["Matthew 11:29-30"] },
    ],
  });
  const created = await h.call(acme, "POST", "/decks", {
    external_user_id: "ext-1",
    title: "Rest",
    raw_text: "Come to Jesus (Matthew 11:28). Bring your burdens. Take his yoke (Matthew 11:29-30).",
  });
  assertEquals(created.body.source, "raw_text");
  await h.drain();
  const deck = await h.call(acme, "GET", `/decks/${created.body.deck_id}`);
  assertEquals(deck.body.status, "ready", deck.text);
  assertEquals(deck.body.completeness.total_points, 3, "points and subpoints");
  assertEquals(deck.body.completeness.total_refs, 2);
  assertEquals(deck.body.completeness.score, 1);
  const { rows } = await h.pg.query<{ title: string; creation_mode: string; slides: { formData: { title: string } } }>(
    `select title, creation_mode, slides from public.sermons where id = $1`,
    [created.body.deck_id],
  );
  assertEquals(rows[0].creation_mode, "quick_build");
  assertEquals(rows[0].slides.formData.title, "Rest", "partner title wins over the parsed title");
});

Deno.test("decks: a parser failure marks the deck failed with a partner-safe message", async () => {
  const { h, acme } = await setup();
  setBedrockToolInput({ items: [] }); // no title → convertToolPayload throws "Parser returned no title"
  const created = await h.call(acme, "POST", "/decks", { external_user_id: "ext-1", title: "Broken", raw_text: "..." });
  await h.drain();
  const deck = await h.call(acme, "GET", `/decks/${created.body.deck_id}`);
  assertEquals(deck.body.status, "failed");
  assertEquals(deck.body.poll_after_ms, null);
  assertEquals(deck.body.error, "We couldn't parse raw_text into a sermon outline. Retry, or submit structured points.");
});

Deno.test("decks: a generation that never finishes is reported failed after 10 minutes", async () => {
  const { h, acme } = await setup();
  const created = await h.call(acme, "POST", "/decks", POINTS_DECK);
  // Simulate an evicted background task: the row stays queued.
  await h.pg.exec(`alter table public.sermons disable trigger update_sermons_updated_at`);
  await h.pg.query(`update public.sermons set updated_at = now() - interval '11 minutes' where id = $1`, [created.body.deck_id]);
  await h.pg.exec(`alter table public.sermons enable trigger update_sermons_updated_at`);
  const deck = await h.call(acme, "GET", `/decks/${created.body.deck_id}`);
  assertEquals(deck.body.status, "failed");
  assertEquals(deck.body.error, "Deck generation timed out. Submit the deck again.");
  await h.drain();
});

Deno.test("decks: the theme from the request, else the seat default, styles every slide", async () => {
  const { h, acme } = await setup();
  await h.call(acme, "POST", "/themes", { external_theme_id: "dark", church_name: "Grace", config: { background: "#101820", text_color: "#F2AA4C", font_family: "Verdana", default_translation: "KJV" } });
  await h.call(acme, "POST", "/accounts", { external_user_id: "ext-2", email: "b@grace.test", theme_id: "dark" });

  scriptureCalls.length = 0;
  const viaSeat = await h.call(acme, "POST", "/decks", { external_user_id: "ext-2", title: "T", points: [{ heading: "H", refs: ["John 1:1"] }] });
  await h.drain();
  const { rows } = await h.pg.query<{ slides: { editorSlides: { background: string; textColor: string; fontFamily: string }[] } }>(
    `select slides from public.sermons where id = $1`,
    [viaSeat.body.deck_id],
  );
  for (const slide of rows[0].slides.editorSlides) {
    assertEquals([slide.background, slide.textColor, slide.fontFamily], ["#101820", "#F2AA4C", "Verdana"]);
  }
  assertEquals(scriptureCalls[0].translation, "KJV", "theme default_translation applies when the request has none");

  const missing = await h.call(acme, "POST", "/decks", { external_user_id: "ext-1", title: "T", theme_id: "nope", points: [{ heading: "H" }] });
  assertEquals(missing.body.error.code, "theme_not_found");
});

Deno.test("decks: translation defaults to NIV", async () => {
  const { h, acme } = await setup();
  scriptureCalls.length = 0;
  await h.call(acme, "POST", "/decks", { external_user_id: "ext-1", title: "T", points: [{ heading: "H", refs: ["John 1:1"] }] });
  await h.drain();
  assertEquals(scriptureCalls[0].translation, "NIV");
});

Deno.test("decks: deck_limit_per_day is enforced over the last 24 hours", async () => {
  const { h, acme } = await setup({ deckLimitPerDay: 2 });
  const deck = { external_user_id: "ext-1", title: "T", points: [{ heading: "H" }] };
  assertEquals((await h.call(acme, "POST", "/decks", deck)).status, 201);
  assertEquals((await h.call(acme, "POST", "/decks", deck)).status, 201);
  const third = await h.call(acme, "POST", "/decks", deck);
  assertEquals(third.status, 429);
  assertEquals(third.body.error.code, "quota_exceeded");
  await h.pg.query(`update public.sermons set created_at = now() - interval '25 hours'`);
  assertEquals((await h.call(acme, "POST", "/decks", deck)).status, 201);
  await h.drain();
});

Deno.test("decks: revoked and unknown seats cannot create decks", async () => {
  const { h, acme } = await setup();
  await h.call(acme, "DELETE", "/accounts/ext-1/entitlement");
  const revoked = await h.call(acme, "POST", "/decks", POINTS_DECK);
  assertEquals(revoked.body.error.code, "entitlement_inactive");
  const unknown = await h.call(acme, "POST", "/decks", { ...POINTS_DECK, external_user_id: "nobody" });
  assertEquals(unknown.body.error.code, "account_not_provisioned");
});

Deno.test("decks: POST /decks honours Idempotency-Key (one deck for a retried request)", async () => {
  const { h, acme } = await setup();
  const first = await h.call(acme, "POST", "/decks", POINTS_DECK, { idempotencyKey: "deck-1" });
  const retry = await h.call(acme, "POST", "/decks", POINTS_DECK, { idempotencyKey: "deck-1" });
  assertEquals(retry.text, first.text);
  assertEquals((await h.pg.query(`select 1 from public.sermons`)).rows.length, 1);
  await h.drain();
});

Deno.test("decks: non-uuid and unknown ids are deck_not_found", async () => {
  const { h, acme } = await setup();
  assertEquals((await h.call(acme, "GET", "/decks/not-a-uuid")).body.error.code, "deck_not_found");
  assertEquals((await h.call(acme, "GET", `/decks/${crypto.randomUUID()}`)).body.error.code, "deck_not_found");
});

Deno.test("exports: rejected until the deck is ready; pdf is not offered yet", async () => {
  const { h, acme } = await setup();
  const created = await h.call(acme, "POST", "/decks", POINTS_DECK);
  const early = await h.call(acme, "POST", `/decks/${created.body.deck_id}/exports`, { formats: ["pptx"] });
  assertEquals(early.status, 409);
  assertEquals(early.body.error.code, "deck_not_ready");
  await h.drain();
  const pdf = await h.call(acme, "POST", `/decks/${created.body.deck_id}/exports`, { formats: ["pdf"] });
  assertEquals(pdf.status, 422);
  assertEquals(pdf.body.error.code, "validation_failed");
  const bad = await h.call(acme, "POST", `/decks/${created.body.deck_id}/exports`, { formats: ["key"] });
  assertEquals(bad.body.error.code, "validation_failed");
});

Deno.test("exports: pro7 and pptx are built from the current slides and served as fresh signed URLs", async () => {
  const { h, acme } = await setup();
  const created = await h.call(acme, "POST", "/decks", POINTS_DECK);
  await h.drain();

  const queued = await h.call(acme, "POST", `/decks/${created.body.deck_id}/exports`, { formats: ["pro7", "pptx"] });
  assertEquals(queued.status, 201, queued.text);
  assertEquals(queued.body.status, "queued");
  assertEquals(queued.body.poll_after_ms, 5000);

  const pending = await h.call(acme, "GET", `/exports/${queued.body.export_id}`);
  assertEquals(pending.body.poll_after_ms, 5000);
  assertEquals(pending.body.files, []);

  await h.drain();
  const first = await h.call(acme, "GET", `/exports/${queued.body.export_id}`);
  assertEquals(first.body.status, "ready", first.text);
  assertEquals(first.body.deck_id, created.body.deck_id);
  assertEquals(first.body.poll_after_ms, null);
  assertEquals(first.body.files.map((f: { format: string }) => f.format), ["pro7", "pptx"]);
  for (const file of first.body.files) {
    assert(file.bytes > 1000, `${file.format} has content`);
    assert(file.url.includes("expires_in=604800"), "signed for 7 days");
    const ttlDays = (new Date(file.expires_at).getTime() - Date.now()) / 86_400_000;
    assert(ttlDays > 6.9 && ttlDays <= 7, `expires_at ~7 days out (${ttlDays})`);
  }
  const second = await h.call(acme, "GET", `/exports/${queued.body.export_id}`);
  assert(second.body.files[0].url !== first.body.files[0].url, "URLs are re-signed per read, not persisted");
  const { rows } = await h.pg.query<{ files: string }>(`select files::text from public.partner_exports`);
  assert(!rows[0].files.includes("token="), "no signed URL stored");

  // The files are real: a pptx zip, and a probundle whose .pro decodes as a ProPresenter 7 presentation.
  const stored = [...h.fake.storageObjects.entries()];
  const pptx = stored.find(([path]) => path.endsWith(".pptx"))![1].bytes;
  const pptxZip = await JSZip.loadAsync(pptx);
  assert(pptxZip.file("ppt/presentation.xml") !== null, "pptx has a presentation part");
  assertEquals(Object.keys(pptxZip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).length, 9);

  const bundle = await JSZip.loadAsync(stored.find(([path]) => path.endsWith(".probundle"))![1].bytes);
  const proName = Object.keys(bundle.files).find((n) => n.endsWith(".pro"))!;
  assertEquals(proName, "Anchored.pro");
  const presentation = Presentation.decode(await bundle.file(proName)!.async("uint8array")) as unknown as { cues: unknown[]; name: string };
  assertEquals(presentation.name, "Anchored");
  assertEquals(presentation.cues.length, 9);
});

Deno.test("exports: an unknown export id is export_not_found", async () => {
  const { h, acme } = await setup();
  assertEquals((await h.call(acme, "GET", `/exports/${crypto.randomUUID()}`)).body.error.code, "export_not_found");
  assertEquals((await h.call(acme, "GET", "/exports/nope")).body.error.code, "export_not_found");
});
