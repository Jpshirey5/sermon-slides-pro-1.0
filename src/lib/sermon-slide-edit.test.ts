import { describe, expect, it } from "vitest";
import { applySlideEdit } from "./sermon-slide-edit";
import type { SlideData } from "@/lib/slides/types";

const base = { background: "#000000", fontFamily: "Georgia", textColor: "#ffffff" };
const slides = (): SlideData[] => [
  { id: "t", type: "title", content: { title: "Anchored", subtitle: "Sunday" }, ...base },
  { id: "p", type: "point", content: { title: "Hope", subtitle: "" }, ...base, backgroundImage: "storage:bg.png" },
  { id: "a", type: "scripture", content: { reference: "John 3:16-17 (NIV)", scripture: "\"one\"" }, ...base, notes: "Read slowly" },
  { id: "b", type: "scripture", content: { reference: "John 3:16-17 (NIV)", scripture: "\"two\"" }, ...base },
];

describe("applySlideEdit", () => {
  it("edits a point's text and notes without touching other slides", () => {
    const r = applySlideEdit(slides(), [1], "point", { title: "Hope is a person", subtitle: "Hebrews 6:19", notes: " Tell the story " });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.slides[1].content).toEqual({ title: "Hope is a person", subtitle: "Hebrews 6:19" });
    expect(r.slides[1].notes).toBe("Tell the story");
    expect(r.slides[0]).toEqual(slides()[0]);
  });

  it("a new background color replaces any background image", () => {
    const r = applySlideEdit(slides(), [1], "point", { background: "#14213d" });
    expect(r.ok && r.slides[1].background).toBe("#14213d");
    expect(r.ok && r.slides[1].backgroundImage).toBeUndefined();
    expect(applySlideEdit(slides(), [1], "point", { background: "navy" }).ok).toBe(false);
  });

  it("changing a reference moves the whole split passage and drops the old words", () => {
    const r = applySlideEdit(slides(), [2, 3], "scripture", { reference: " Romans 8:28 (NIV) " });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.slides[2].content).toEqual({ reference: "Romans 8:28 (NIV)" });
    expect(r.slides[3].content).toEqual({ reference: "Romans 8:28 (NIV)" });
  });

  it("verse words can never be edited, even if asked", () => {
    const r = applySlideEdit(slides(), [2, 3], "scripture", { title: "typed words", subtitle: "x" });
    expect(r.ok && r.slides[2].content).toEqual(slides()[2].content);
  });

  it("notes live on the first slide of a passage; clearing removes them", () => {
    const r = applySlideEdit(slides(), [2, 3], "scripture", { notes: "" });
    expect(r.ok && r.slides[2].notes).toBeUndefined();
    const r2 = applySlideEdit(slides(), [2, 3], "scripture", { notes: "New" });
    expect(r2.ok && [r2.slides[2].notes, r2.slides[3].notes]).toEqual(["New", undefined]);
  });

  it("a missing scripture slide can have its reference fixed", () => {
    expect(applySlideEdit(slides(), [2, 3], "missing", { reference: "John 3:16 (KJV)" }).ok).toBe(true);
  });

  it("refuses when the sermon changed underneath", () => {
    expect(applySlideEdit(slides(), [9], "point", { title: "x" })).toEqual({ ok: false, reason: "This sermon changed since it was loaded. Reload and try again." });
    expect(applySlideEdit(slides(), [0], "point", { title: "x" }).ok).toBe(false);
    expect(applySlideEdit(slides(), [], "point", { title: "x" }).ok).toBe(false);
    expect(applySlideEdit(slides(), [1], "point", { reference: "John 1:1" }).ok).toBe(false);
  });

  it("does not modify its input", () => {
    const input = slides();
    applySlideEdit(input, [1], "point", { title: "Changed" });
    expect(input[1].content.title).toBe("Hope");
  });
});
