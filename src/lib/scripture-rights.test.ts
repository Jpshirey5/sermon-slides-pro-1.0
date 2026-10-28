import { describe, expect, it } from "vitest";
import type { SlideData } from "@/lib/export-pptx";
import { generateSlidesFromPresentation } from "@/lib/slide-generation";
import { needsChurchScripture, PASTE_PLACEHOLDER, slidesForExport, translationOfReference } from "./scripture-rights";

const verse = (scripture: string, reference: string, scriptureSource?: "church" | "lookup"): SlideData => ({
  id: reference,
  type: "scripture",
  content: { scripture, reference, ...(scriptureSource ? { scriptureSource } : {}) },
  background: "#000",
  fontFamily: "Georgia",
  textColor: "#fff",
});

describe("scripture in exports", () => {
  it("public domain text always exports", () => {
    const { slides, needPasting } = slidesForExport([verse("In the beginning", "Genesis 1:1 (KJV)", "lookup")]);
    expect(slides[0].content.scripture).toBe("In the beginning");
    expect(needPasting).toBe(0);
  });

  it("copyrighted text the church pasted exports, with its credit", () => {
    const { slides } = slidesForExport([verse("Church words", "John 3:16 (NIV)", "church")]);
    expect(slides[0].content).toMatchObject({ scripture: "Church words", reference: "John 3:16 (NIV)" });
  });

  it("copyrighted text from the old lookup, or no source at all, exports as the reference only", () => {
    const { slides, needPasting } = slidesForExport([verse("Looked up", "John 3:16 (NIV)", "lookup"), verse("Old sermon", "Romans 8:28 (CSB)")]);
    expect(slides.map((s) => s.content.scripture)).toEqual([PASTE_PLACEHOLDER, PASTE_PLACEHOLDER]);
    expect(slides.map((s) => s.content.reference)).toEqual(["John 3:16 (NIV)", "Romans 8:28 (CSB)"]);
    expect(needPasting).toBe(2);
  });

  it("a verse with no text needs pasting; other slides are untouched", () => {
    const point: SlideData = { id: "p", type: "point", content: { title: "Hope" }, background: "#000", fontFamily: "Georgia", textColor: "#fff" };
    expect(needsChurchScripture(verse("", "John 3:16 (KJV)"))).toBe(true);
    expect(needsChurchScripture(point)).toBe(false);
    expect(slidesForExport([point]).slides[0]).toBe(point);
  });

  it("reads the translation from the reference", () => {
    expect(translationOfReference("1 John 1:9 (NKJV)")).toBe("NKJV");
    expect(translationOfReference("John 3:16")).toBeNull();
  });

  it("a verse with no text still becomes a slide with its reference and translation", () => {
    const slides = generateSlidesFromPresentation({
      id: "s", title: "Hope", date: "2026-11-01", slides: 0, lastModified: "",
      data: {
        title: "Hope", date: "2026-11-01", translation: "NIV",
        points: [{ id: "v", type: "verse", title: "", scriptures: [{ reference: "John 3:16", text: "", needsScripture: true }] }],
      },
    } as never);
    const scripture = slides.find((s) => s.type === "scripture")!;
    expect(scripture.content).toMatchObject({ scripture: "", reference: "John 3:16 (NIV)" });
    expect(needsChurchScripture(scripture)).toBe(true);
  });

  it("pasted text keeps its source through slide building, so it exports", () => {
    const slides = generateSlidesFromPresentation({
      id: "s", title: "Hope", date: "2026-11-01", slides: 0, lastModified: "",
      data: {
        title: "Hope", date: "2026-11-01", translation: "NIV", verseBreakdown: "full",
        points: [{ id: "v", type: "verse", title: "", scriptures: [{ reference: "John 3:16", text: "Church words", source: "church" }] }],
      },
    } as never);
    const { slides: exported } = slidesForExport(slides);
    const content = exported.find((s) => s.type === "scripture")!.content;
    expect(content.scripture).toContain("Church words");
    expect(content.reference).toBe("John 3:16 (NIV)");
  });
});
