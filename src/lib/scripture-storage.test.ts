import { describe, expect, it, vi } from "vitest";
import {
  describeStoredScripture,
  hydrateScriptureText,
  isReadableReference,
  type ScriptureLookup,
  splitTranslationTag,
  stripScriptureText,
} from "./scripture-storage";

const style = { background: "#000", fontFamily: "Georgia", textColor: "#fff" };

const saved = () => ({
  formData: {
    title: "Anchored",
    translation: "NIV",
    points: [
      { id: "p1", title: "Hope", scriptures: [{ reference: "John 3:16-17", text: "NIV TEXT", verses: [{ verse: 16, text: "a" }] }] },
      { id: "p2", title: "Custom", scriptures: [{ reference: "my own words", text: "PASTOR TEXT" }] },
    ],
  },
  editorSlides: [
    { id: "t", type: "title", content: { title: "Anchored" }, ...style },
    { id: "a", type: "scripture", content: { scripture: "\"OLD PART ONE\"", reference: "John 3:16-17 (NIV)" }, ...style },
    { id: "b", type: "scripture", content: { scripture: "\"OLD PART TWO\"", reference: "John 3:16-17 (NIV)" }, ...style },
    { id: "c", type: "scripture", content: { scripture: "\"KJV WORDS\"", reference: "Romans 8:28 (KJV)" }, ...style },
    { id: "d", type: "scripture", content: { scripture: "Enter scripture text...", reference: "" }, ...style },
    { id: "e", type: "point", content: { title: "Point", subtitle: "Sub" }, ...style },
  ],
});

const fakeLookup = (): ScriptureLookup & { calls: string[][] } => {
  const calls: string[][] = [];
  const fn = (async (reference: string, translation: string) => {
    calls.push([reference, translation]);
    if (reference === "John 3:16-17") return { text: "one two three four five six", verses: [{ verse: 16, text: "one two three" }, { verse: 17, text: "four five six" }] };
    if (reference === "Romans 8:28") return { text: "all things work together" };
    return null;
  }) as ScriptureLookup & { calls: string[][] };
  fn.calls = calls;
  return fn;
};

describe("translation tags and readable references", () => {
  it("splits a trailing tag", () => {
    expect(splitTranslationTag("John 3:16 (niv)")).toEqual({ base: "John 3:16", tag: "NIV" });
    expect(splitTranslationTag("John 3:16")).toEqual({ base: "John 3:16", tag: null });
  });
  it("knows which references the presenter can resolve", () => {
    expect(isReadableReference("John 3:16 (NIV)")).toBe(true);
    expect(isReadableReference("my own words")).toBe(false);
    expect(isReadableReference("")).toBe(false);
    expect(isReadableReference(undefined)).toBe(false);
  });
});

describe("stripScriptureText", () => {
  it("removes verse text wherever there is a readable reference", () => {
    const stripped = stripScriptureText(saved());
    const json = JSON.stringify(stripped);
    expect(json).not.toContain("NIV TEXT");
    expect(json).not.toContain("OLD PART");
    expect(json).not.toContain("KJV WORDS");
    expect(stripped.formData.points[0].scriptures[0]).toEqual({ reference: "John 3:16-17" });
    expect(stripped.editorSlides[1].content).toEqual({ reference: "John 3:16-17 (NIV)" });
  });

  it("keeps everything else exactly: titles, points, styles, ids, order", () => {
    const stripped = stripScriptureText(saved());
    expect(stripped.editorSlides.map((s) => s.id)).toEqual(["t", "a", "b", "c", "d", "e"]);
    expect(stripped.editorSlides[0]).toEqual(saved().editorSlides[0]);
    expect(stripped.editorSlides[5]).toEqual(saved().editorSlides[5]);
    expect(stripped.editorSlides[1].background).toBe("#000");
    expect(stripped.formData.title).toBe("Anchored");
  });

  it("keeps text on legacy slides with no readable reference, since it could not be fetched again", () => {
    const stripped = stripScriptureText(saved());
    expect(stripped.formData.points[1].scriptures[0]).toEqual({ reference: "my own words", text: "PASTOR TEXT" });
    expect(stripped.editorSlides[4].content.scripture).toBe("Enter scripture text...");
  });

  it("handles the legacy shapes: a bare slide array and bare form data", () => {
    const arr = stripScriptureText(saved().editorSlides);
    expect(Array.isArray(arr)).toBe(true);
    expect(JSON.stringify(arr)).not.toContain("OLD PART");
    const form = stripScriptureText(saved().formData);
    expect(JSON.stringify(form)).not.toContain("NIV TEXT");
    expect(stripScriptureText(null)).toBeNull();
    expect(stripScriptureText("junk")).toBe("junk");
  });

  it("does not modify its input", () => {
    const input = saved();
    stripScriptureText(input);
    expect(input.editorSlides[1].content.scripture).toBe("\"OLD PART ONE\"");
  });

  it("is idempotent", () => {
    const once = stripScriptureText(saved());
    expect(stripScriptureText(once)).toEqual(once);
  });
});

describe("describeStoredScripture", () => {
  it("counts text that would be stripped and text that would stay", () => {
    expect(describeStoredScripture(saved())).toEqual({ textBlocks: 4, unreadableWithText: 2 });
    expect(describeStoredScripture(stripScriptureText(saved()))).toEqual({ textBlocks: 0, unreadableWithText: 2 });
  });
});

describe("hydrateScriptureText", () => {
  it("fetches each passage once, with the right translation", async () => {
    const lookup = fakeLookup();
    await hydrateScriptureText(stripScriptureText(saved()), lookup);
    expect(lookup.calls.sort()).toEqual([["John 3:16-17", "NIV"], ["Romans 8:28", "KJV"]]);
  });

  it("splits a passage across its slides the way the presenter does, with quotes", async () => {
    const { slides } = await hydrateScriptureText(stripScriptureText(saved()), fakeLookup());
    expect(slides.editorSlides[1].content.scripture).toBe("\"one two three\"");
    expect(slides.editorSlides[2].content.scripture).toBe("\"four five six\"");
    expect(slides.editorSlides[3].content.scripture).toBe("\"all things work together\"");
  });

  it("fills form data text and verses", async () => {
    const { slides } = await hydrateScriptureText(stripScriptureText(saved()), fakeLookup());
    expect(slides.formData.points[0].scriptures[0]).toMatchObject({ reference: "John 3:16-17", text: "one two three four five six" });
    expect((slides.formData.points[0].scriptures[0] as { verses?: unknown[] }).verses).toHaveLength(2);
  });

  it("replaces stale stored text with fresh text", async () => {
    const { slides } = await hydrateScriptureText(saved(), fakeLookup());
    expect(JSON.stringify(slides)).not.toContain("OLD PART");
    expect(JSON.stringify(slides)).not.toContain("NIV TEXT");
  });

  it("leaves legacy unreadable slides alone", async () => {
    const { slides } = await hydrateScriptureText(stripScriptureText(saved()), fakeLookup());
    expect(slides.editorSlides[4].content.scripture).toBe("Enter scripture text...");
    expect(slides.formData.points[1].scriptures[0].text).toBe("PASTOR TEXT");
  });

  it("no quotes when the sermon was built without them", async () => {
    const s = stripScriptureText(saved());
    (s.formData as { proPresenterMode?: boolean }).proPresenterMode = true;
    const { slides } = await hydrateScriptureText(s, fakeLookup());
    expect(slides.editorSlides[3].content.scripture).toBe("all things work together");
  });

  it("reports what it could not load and leaves those slides empty", async () => {
    const lookup: ScriptureLookup = vi.fn(async (reference) => (reference === "Romans 8:28" ? { text: "x" } : null));
    const { slides, missing } = await hydrateScriptureText(stripScriptureText(saved()), lookup);
    expect(missing).toEqual(["John 3:16-17 (NIV)"]);
    expect(slides.editorSlides[1].content).toEqual({ reference: "John 3:16-17 (NIV)" });
    expect(slides.formData.points[0].scriptures[0]).toEqual({ reference: "John 3:16-17" });
  });

  it("a lookup that throws counts as missing, not a crash", async () => {
    const { missing } = await hydrateScriptureText(stripScriptureText(saved()), async () => {
      throw new Error("offline");
    });
    expect(missing.sort()).toEqual(["John 3:16-17 (NIV)", "Romans 8:28 (KJV)"]);
  });

  it("strip after hydrate gives back the stored form", async () => {
    const stored = stripScriptureText(saved());
    const { slides } = await hydrateScriptureText(stored, fakeLookup());
    expect(stripScriptureText(slides)).toEqual(stored);
  });
});
