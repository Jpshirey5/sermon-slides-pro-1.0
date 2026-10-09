import { describe, expect, it } from "vitest";
import { duplicateGroup, insertAt, moveGroup, newCustomSlide, newSermonSlide, removeGroup } from "./slide-ops";

const L = ["a", "b", "c", "d", "e"];

describe("moveGroup", () => {
  it("moves one slide earlier or later", () => {
    expect(moveGroup(L, [3], 1)).toEqual(["a", "d", "b", "c", "e"]);
    expect(moveGroup(L, [1], 4)).toEqual(["a", "c", "d", "b", "e"]);
    expect(moveGroup(L, [0], L.length)).toEqual(["b", "c", "d", "e", "a"]);
  });

  it("moves a split passage as one group, keeping its order", () => {
    expect(moveGroup(L, [2, 3], 0)).toEqual(["c", "d", "a", "b", "e"]);
    expect(moveGroup(L, [3, 2], 5)).toEqual(["a", "b", "e", "c", "d"]);
  });

  it("dropping onto itself changes nothing; bad indexes are ignored", () => {
    expect(moveGroup(L, [2], 2)).toEqual(L);
    expect(moveGroup(L, [2], 3)).toEqual(L);
    expect(moveGroup(L, [9], 0)).toEqual(L);
    expect(moveGroup(L, [], 0)).toEqual(L);
  });
});

describe("remove, duplicate, insert", () => {
  it("removes a group", () => {
    expect(removeGroup(L, [1, 2])).toEqual(["a", "d", "e"]);
  });

  it("duplicates right after the group, with new ids", () => {
    const list = [{ id: "x", t: 1 }, { id: "y", t: 2 }, { id: "z", t: 3 }];
    const out = duplicateGroup(list, [0, 1]);
    expect(out.map((s) => s.t)).toEqual([1, 2, 1, 2, 3]);
    expect(new Set(out.map((s) => s.id)).size).toBe(5);
    out[2].t = 99;
    expect(list[0].t).toBe(1);
  });

  it("inserts at a clamped position", () => {
    expect(insertAt(L, 2, ["n"])).toEqual(["a", "b", "n", "c", "d", "e"]);
    expect(insertAt(L, 99, ["n"]).at(-1)).toBe("n");
    expect(insertAt(L, -3, ["n"])[0]).toBe("n");
  });
});

describe("new slides", () => {
  it("sermon slides take their neighbor's look; scripture starts with no reference or text", () => {
    const like = { id: "p", type: "point" as const, content: {}, background: "#14213d", fontFamily: "Inter", textColor: "#eeeeee", lineSpacing: 1.3, backgroundImage: "storage:x" };
    const s = newSermonSlide("scripture", like);
    expect([s.type, s.content, s.background, s.fontFamily, s.backgroundImage]).toEqual(["scripture", { reference: "" }, "#14213d", "Inter", "storage:x"]);
    expect(newSermonSlide("point").content.title).toBe("New point");
    expect(newSermonSlide("blank").background).toBe("#000000");
  });

  it("custom slides have sensible starting text", () => {
    expect(newCustomSlide("title").title).toBe("Welcome");
    expect(newCustomSlide("graphic", { backgroundImage: "storage:g" })).toMatchObject({ kind: "graphic", backgroundImage: "storage:g" });
    expect(newCustomSlide("text").id).not.toBe(newCustomSlide("text").id);
  });
});

import { applyCustomSlideEdit } from "./slide-ops";

describe("applyCustomSlideEdit", () => {
  const list = [newCustomSlide("title"), newCustomSlide("text", { notes: "old" })];
  it("edits text, notes, and background on one slide only", () => {
    const r = applyCustomSlideEdit(list, 1, { title: "Picnic", body: "Sunday at noon", notes: " ", background: "#112233" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.slides[1]).toMatchObject({ title: "Picnic", body: "Sunday at noon", background: "#112233", backgroundImage: null });
    expect(r.slides[1].notes).toBeUndefined();
    expect(r.slides[0]).toEqual(list[0]);
  });
  it("sets and removes a background picture", () => {
    const set = applyCustomSlideEdit(list, 0, { backgroundImage: "storage:x" });
    expect(set.ok && set.slides[0].backgroundImage).toBe("storage:x");
    const cleared = applyCustomSlideEdit(set.ok ? set.slides : list, 0, { backgroundImage: null });
    expect(cleared.ok && cleared.slides[0].backgroundImage).toBeNull();
  });
  it("refuses bad colors and missing slides", () => {
    expect(applyCustomSlideEdit(list, 0, { background: "red" }).ok).toBe(false);
    expect(applyCustomSlideEdit(list, 9, { title: "x" }).ok).toBe(false);
  });
});
