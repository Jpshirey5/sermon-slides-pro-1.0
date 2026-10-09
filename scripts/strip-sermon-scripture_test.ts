// deno test -A --no-lock --node-modules-dir=none scripts/strip-sermon-scripture_test.ts

import { assert, assertEquals } from "../supabase/functions/_shared/scripture/tests/assert.ts";
import { type BackfillDb, formatReport, runBackfill, type SermonRow } from "./strip-sermon-scripture-lib.ts";

const style = { background: "#000", fontFamily: "Georgia", textColor: "#fff" };
const withText = (id: string): SermonRow => ({
  id,
  account_id: "acct",
  title: `Sermon ${id}`,
  updated_at: "2026-10-01T00:00:00Z",
  slides: {
    formData: { translation: "NIV", points: [{ id: "p", title: "x", scriptures: [{ reference: "John 3:16", text: "SECRET VERSE" }] }] },
    editorSlides: [{ id: "s", type: "scripture", content: { scripture: "\"SECRET VERSE\"", reference: "John 3:16 (NIV)" }, ...style }],
  },
});
const clean = (id: string): SermonRow => ({ ...withText(id), slides: { formData: { points: [] }, editorSlides: [] } });
const legacy = (id: string): SermonRow => ({
  ...withText(id),
  slides: { editorSlides: [{ id: "s", type: "scripture", content: { scripture: "typed words", reference: "" }, ...style }] },
});

function fakeDb(rows: SermonRow[], changedIds: string[] = []) {
  const stored = new Map(rows.map((r) => [r.id, structuredClone(r)]));
  const db: BackfillDb & { stored: typeof stored; writes: number } = {
    stored,
    writes: 0,
    async page(afterId, limit) {
      return [...stored.values()].sort((a, b) => a.id.localeCompare(b.id)).filter((r) => !afterId || r.id > afterId).slice(0, limit).map((r) => structuredClone(r));
    },
    async update(id, slides, expected) {
      const row = stored.get(id)!;
      if (changedIds.includes(id) || row.updated_at !== expected) return false;
      db.writes++;
      stored.set(id, { ...row, slides, updated_at: "2026-10-09T00:00:00Z" });
      return true;
    },
  };
  return db;
}

Deno.test("dry run reports and changes nothing", async () => {
  const db = fakeDb([withText("a"), clean("b"), legacy("c"), withText("d")]);
  const r = await runBackfill(db, { apply: false, pageSize: 2 });
  assertEquals(r.sermonsScanned, 4, "pages through everything");
  assertEquals(r.sermonsWithText, 2);
  assertEquals(r.textBlocksRemoved, 4);
  assertEquals(r.sermonsUpdated, 0);
  assertEquals(db.writes, 0);
  assertEquals(r.unreadable.map((u) => u.sermonId), ["c"]);
  assert(JSON.stringify([...db.stored.values()]).includes("SECRET VERSE"), "untouched");
});

Deno.test("apply strips text, keeps legacy text, and is safe to run twice", async () => {
  const db = fakeDb([withText("a"), clean("b"), legacy("c"), withText("d")]);
  const r = await runBackfill(db, { apply: true, pageSize: 3 });
  assertEquals(r.sermonsUpdated, 2);
  const after = JSON.stringify([...db.stored.values()]);
  assert(!after.includes("SECRET VERSE"), "verse text gone");
  assert(after.includes("typed words"), "legacy text kept");
  const again = await runBackfill(db, { apply: true });
  assertEquals([again.sermonsWithText, again.sermonsUpdated], [0, 0]);
});

Deno.test("a sermon saved during the run is skipped, not overwritten", async () => {
  const db = fakeDb([withText("a"), withText("b")], ["b"]);
  const r = await runBackfill(db, { apply: true });
  assertEquals([r.sermonsUpdated, r.sermonsSkippedChanged], [1, 1]);
  assert(JSON.stringify(db.stored.get("b")).includes("SECRET VERSE"), "b left for the next run");
});

Deno.test("the printed report never contains verse text", async () => {
  const db = fakeDb([withText("a"), legacy("c")]);
  const text = formatReport(await runBackfill(db, { apply: false }));
  assert(!text.includes("SECRET VERSE") && !text.includes("typed words"), text);
  assert(text.startsWith("DRY RUN"), text);
  assert(text.includes("Sermon c (c): 1 slide"), text);
});
