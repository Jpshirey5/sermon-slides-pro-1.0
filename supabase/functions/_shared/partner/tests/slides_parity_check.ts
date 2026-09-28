// deno test -A --no-lock --no-check --node-modules-dir=none \
//   --import-map=supabase/functions/_shared/partner/tests/parity_import_map.json \
//   supabase/functions/_shared/partner/tests/slides_parity_check.ts
//
// The server ports must produce exactly what the browser code produces.

import { generateSlidesFromPresentation as browserGenerate } from "@/lib/slide-generation.ts";
import { generateSlidesFromPresentation as serverGenerate, type FormData } from "../slides.ts";
import { assertEquals } from "./assert.ts";

const withoutTimestampIds = (slides: { id: string }[]) =>
  slides.map((slide) => ({ ...slide, id: slide.id.startsWith("title-") ? "title" : slide.id }));

const formData = (overrides: Partial<FormData>): FormData => ({
  title: "Anchored",
  date: "2026-10-04",
  translation: "NIV",
  points: [
    { id: "1", type: "verse", title: "Hebrews 6:19", scriptures: [{ reference: "hebrews 6:19", text: "We have this hope as an anchor for the soul." }] },
    { id: "2", type: "point", title: "Hope is a person", scriptures: [{ reference: "John 14:6-7", text: "6 I am the way. 7 If you really know me." }] },
    { id: "3", type: "point", title: "", scriptures: [{ reference: "Romans 8:28", text: "ignored because the point has no title" }] },
    { id: "4", type: "point", title: "Long", scriptures: [{ reference: "Psalm 119:1-8", text: "word ".repeat(400) }] },
  ],
  ...overrides,
});

const cases: Array<[string, Partial<FormData>]> = [
  ["balanced / clean / full passage", {}],
  ["verse-by-verse", { verseBreakdown: "verse-by-verse" }],
  ["verse-by-verse with explicit verses", {
    verseBreakdown: "verse-by-verse",
    points: [{ id: "9", type: "verse", title: "John 3:16-17", scriptures: [{ reference: "John 3:16-17", text: "x", verses: [{ verse: 16, text: "For God" }, { verse: 17, text: "For God did not" }] }] }],
  }],
  ["minimal + ProPresenter mode", { slideStyle: "minimal", proPresenterMode: true }],
  ["speaker-friendly / bold", { slideStyle: "speaker-friendly", themeStyle: "bold" }],
  ["scripture-focused", { themeStyle: "scripture-focused" }],
];

for (const [name, overrides] of cases) {
  Deno.test(`slides parity: ${name}`, () => {
    const data = formData(overrides);
    const presentation = { id: "p", title: "Anchored", date: "2026-10-04", slides: 0, lastModified: "", data };
    // deno-lint-ignore no-explicit-any
    const browser = browserGenerate(presentation as any);
    const server = serverGenerate({ title: "Anchored", date: "2026-10-04", data });
    assertEquals(withoutTimestampIds(server), withoutTimestampIds(browser));
  });
}
