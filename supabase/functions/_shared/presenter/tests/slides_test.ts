// deno test -A supabase/functions/_shared/presenter/tests/slides_test.ts

import { assert, assertEquals } from "../../scripture/tests/assert.ts";
import { accountCanPresent } from "../access.ts";
import {
  passageKey,
  planScriptureItem,
  planSermon,
  type RenderContext,
  renderSlot,
  type ScriptureSlot,
  splitEvenly,
} from "../slides.ts";

// ── who can present ─────────────────────────────────────────────────────────

Deno.test("accountCanPresent: paying statuses, beta trials, and partner billing only", () => {
  const now = new Date("2026-10-08T12:00:00Z");
  for (const s of ["active", "trialing", "past_due"]) assertEquals(accountCanPresent({ subscription_status: s }, now), true, s);
  for (const s of ["inactive", "canceled", null]) assertEquals(accountCanPresent({ subscription_status: s }, now), false, String(s));
  assertEquals(accountCanPresent({ subscription_status: "inactive", partner_billing_active: true }, now), true);
  assertEquals(accountCanPresent({ subscription_status: "inactive", is_beta_user: true, beta_trial_ends_at: "2026-10-09T00:00:00Z" }, now), true);
  assertEquals(accountCanPresent({ subscription_status: "inactive", is_beta_user: true, beta_trial_ends_at: "2026-10-01T00:00:00Z" }, now), false, "ended trial");
  assertEquals(accountCanPresent({ subscription_status: "inactive", is_beta_user: false, beta_trial_ends_at: "2026-10-09T00:00:00Z" }, now), false);
  assertEquals(accountCanPresent(null, now), false);
});

// ── splitEvenly ─────────────────────────────────────────────────────────────

Deno.test("splitEvenly always returns exactly the requested number of chunks", () => {
  const text = "one two three four five six seven eight nine ten eleven twelve";
  for (let n = 1; n <= 12; n++) {
    const chunks = splitEvenly(text, n);
    assertEquals(chunks.length, n, `n=${n}`);
    assertEquals(chunks.join(" "), text, `n=${n} keeps every word in order`);
    assert(chunks.every((c) => c.length > 0), `n=${n} no empty chunks`);
  }
});

Deno.test("splitEvenly caps chunks at the word count and handles tiny input", () => {
  assertEquals(splitEvenly("a b", 5), ["a", "b"]);
  assertEquals(splitEvenly("word", 3), ["word"]);
  assertEquals(splitEvenly("", 2), [""]);
});

Deno.test("splitEvenly produces roughly equal chunks", () => {
  const text = Array.from({ length: 100 }, (_, i) => `w${i}`).join(" ");
  const lengths = splitEvenly(text, 4).map((c) => c.length);
  assert(Math.max(...lengths) - Math.min(...lengths) <= 8, `lengths ${lengths}`);
});

// ── planning sermons ────────────────────────────────────────────────────────

const editorSermon = {
  id: "s1",
  title: "Anchored",
  slides: {
    formData: { title: "Anchored", translation: "NIV", proPresenterMode: false, points: [] },
    editorSlides: [
      { id: "t", type: "title", content: { title: "Anchored", subtitle: "Sunday" }, background: "transparent", fontFamily: "Inter", textColor: "#fff" },
      { id: "a", type: "scripture", content: { scripture: "OLD SAVED TEXT ONE", reference: "John 3:16-17 (NIV)" }, background: "#112233", fontFamily: "Georgia", textColor: "#eee" },
      { id: "b", type: "scripture", content: { scripture: "OLD SAVED TEXT TWO", reference: "John 3:16-17 (NIV)" }, background: "#445566", fontFamily: "Georgia", textColor: "#eee" },
      { id: "c", type: "point", content: { title: "Hope is a person" }, background: "#000", fontFamily: "Georgia", textColor: "#fff" },
      { id: "d", type: "scripture", content: { scripture: "x", reference: "Romans 8:28 (KJV)" }, background: "#000", fontFamily: "Georgia", textColor: "#fff" },
      { id: "e", type: "scripture", content: { scripture: "x", reference: "Not a reference" }, background: "#000", fontFamily: "Georgia", textColor: "#fff" },
    ],
  },
};

Deno.test("planSermon keeps the pastor's own slides and styles", () => {
  const slots = planSermon(editorSermon, "KJV");
  assertEquals(slots.map((s) => s.kind), ["static", "scripture", "static", "scripture", "scripture"]);
  const title = slots[0];
  assert(title.kind === "static", "title is static");
  if (title.kind !== "static") return;
  assertEquals(title.slide.kind, "title");
  assertEquals(title.slide.title, "Anchored");
  assertEquals(title.slide.style.background, "#000000", "transparent renders as black on output");
  assertEquals(title.slide.style.fontFamily, "Inter");
});

Deno.test("planSermon groups split slides of one passage and keeps each slide's style", () => {
  const slot = planSermon(editorSermon, "KJV")[1] as ScriptureSlot;
  assertEquals(slot.ref, { book: "JHN", chapter: 3, verse_start: 16, verse_end: 17 });
  assertEquals(slot.translation_id, "NIV");
  assertEquals(slot.layout, { kind: "fixed", slides: 2 });
  assertEquals(slot.styles.map((s) => s.background), ["#112233", "#445566"]);
});

Deno.test("planSermon reads the translation tag on each slide, then the sermon's translation", () => {
  const slots = planSermon(editorSermon, "WEB");
  assertEquals((slots[3] as ScriptureSlot).translation_id, "KJV");
  const untagged = planSermon({
    id: "s2",
    title: "x",
    slides: { formData: { translation: "csb" }, editorSlides: [{ type: "scripture", content: { reference: "John 1:1" } }] },
  }, "WEB");
  assertEquals((untagged[0] as ScriptureSlot).translation_id, "CSB");
  const none = planSermon({ id: "s3", title: "x", slides: [{ type: "scripture", content: { reference: "John 1:1" } }] }, "WEB");
  assertEquals((none[0] as ScriptureSlot).translation_id, "WEB", "falls back to the service default");
});

Deno.test("planSermon never carries saved verse text forward", () => {
  const serialized = JSON.stringify(planSermon(editorSermon, "KJV"));
  assert(!serialized.includes("OLD SAVED TEXT"), "saved scripture text must be ignored");
});

Deno.test("planSermon marks unreadable references instead of dropping them", () => {
  const slot = planSermon(editorSermon, "KJV")[4] as ScriptureSlot;
  assertEquals(slot.ref, null);
  assertEquals(slot.raw_reference, "Not a reference");
});

Deno.test("planSermon builds slides from form data when there are no editor slides", () => {
  const slots = planSermon({
    id: "s4",
    title: "Fallback title",
    slides: {
      formData: {
        translation: "KJV",
        verseBreakdown: "verse-by-verse",
        points: [
          { id: "p1", title: "Point one", scriptures: [{ reference: "Romans 8:28", text: "SAVED" }] },
          { id: "p2", type: "verse", title: "", scriptures: [{ reference: "John 3:16" }] },
          { id: "p3", title: "", scriptures: [{ reference: "John 1:1" }] },
        ],
      },
    },
  }, "WEB");
  assertEquals(slots.map((s) => (s.kind === "static" ? s.slide.kind : `scripture:${(s as ScriptureSlot).layout.kind}`)), [
    "title",
    "point",
    "scripture:verse_by_verse",
    "scripture:verse_by_verse",
  ]);
  const title = slots[0];
  assertEquals(title.kind === "static" ? title.slide.title : "", "Fallback title");
});

Deno.test("planSermon tolerates empty and malformed sermon data", () => {
  assertEquals(planSermon({ id: "x", title: "x", slides: null }, "KJV"), []);
  assertEquals(planSermon({ id: "x", title: "x", slides: "junk" }, "KJV"), []);
  assertEquals(planSermon({ id: "x", title: "x", slides: { editorSlides: [null, 3, "x"] } }, "KJV"), []);
});

Deno.test("planScriptureItem validates structured passages", () => {
  const slots = planScriptureItem("i1", {
    translation_id: "web",
    layout: "verse_by_verse",
    passages: [{ book: "PSA", chapter: 23, verse_start: 1, verse_end: 6 }, { book: "nope", chapter: 1, verse_start: 1 }],
  }, "KJV") as ScriptureSlot[];
  assertEquals(slots.length, 2);
  assertEquals(slots[0].translation_id, "WEB");
  assertEquals(slots[0].ref, { book: "PSA", chapter: 23, verse_start: 1, verse_end: 6 });
  assertEquals(slots[1].ref, null, "invalid passage becomes a missing slide, not an error");
  assertEquals(planScriptureItem("i2", {}, "KJV"), []);
});

// ── rendering ───────────────────────────────────────────────────────────────

const JOHN = { book: "JHN", chapter: 3, verse_start: 16, verse_end: 17 };
const ctx = (over: Partial<RenderContext> = {}): RenderContext => ({
  passages: new Map([[passageKey("NIV", JOHN), {
    verses: [{ verse: 16, text: "For God so loved the world" }, { verse: 17, text: "For God did not send his Son" }],
    fums_token: "tok",
    expires_at: "2026-11-01T00:00:00.000Z",
  }]]),
  attributions: new Map([["NIV", "NIV notice"]]),
  unavailable: new Map(),
  ...over,
});
const slot = (layout: ScriptureSlot["layout"], over: Partial<ScriptureSlot> = {}): ScriptureSlot => ({
  kind: "scripture",
  id: "x",
  ref: JOHN,
  translation_id: "NIV",
  layout,
  styles: [{ background: "#000", fontFamily: "Georgia", textColor: "#fff" }],
  quote: false,
  ...over,
});

Deno.test("every rendered scripture slide carries attribution and FUMS token", () => {
  for (const layout of [{ kind: "verse_by_verse" }, { kind: "passage" }, { kind: "fixed", slides: 2 }] as ScriptureSlot["layout"][]) {
    const { slides, expires_at } = renderSlot(slot(layout), ctx());
    assert(slides.length > 0, layout.kind);
    for (const s of slides) {
      assertEquals(s.kind, "scripture");
      assertEquals(s.attribution, "NIV notice", `${layout.kind} attribution`);
      assertEquals(s.fums_tokens, ["tok"]);
    }
    assertEquals(expires_at, "2026-11-01T00:00:00.000Z");
  }
});

Deno.test("verse by verse gives one slide per verse with its own reference", () => {
  const { slides } = renderSlot(slot({ kind: "verse_by_verse" }), ctx());
  assertEquals(slides.map((s) => s.reference), ["John 3:16 (NIV)", "John 3:17 (NIV)"]);
});

Deno.test("fixed layout keeps the pastor's slide count", () => {
  const { slides } = renderSlot(slot({ kind: "fixed", slides: 2 }, { quote: true }), ctx());
  assertEquals(slides.length, 2);
  assert(slides.every((s) => s.text?.startsWith('"') && s.text.endsWith('"')), "quoted like the editor shows it");
  assertEquals(slides[0].reference, "John 3:16-17 (NIV)");
});

Deno.test("unavailable translation or missing text renders a missing slide with a reason, and no text", () => {
  const revoked = renderSlot(slot({ kind: "passage" }), ctx({ unavailable: new Map([["NIV", "revoked"]]) }));
  assertEquals(revoked.slides.map((s) => [s.kind, s.missing_reason, s.text]), [["missing", "revoked", undefined]]);
  assertEquals(revoked.expires_at, null);

  const notFound = renderSlot(slot({ kind: "passage" }), ctx({ passages: new Map() }));
  assertEquals(notFound.slides[0].missing_reason, "not_found");

  const noAttribution = renderSlot(slot({ kind: "passage" }), ctx({ attributions: new Map() }));
  assertEquals(noAttribution.slides[0].kind, "missing", "no attribution means no text");

  const unreadable = renderSlot(slot({ kind: "passage" }, { ref: null, raw_reference: "??" }), ctx());
  assertEquals([unreadable.slides[0].missing_reason, unreadable.slides[0].reference], ["unreadable_reference", "??"]);
});
