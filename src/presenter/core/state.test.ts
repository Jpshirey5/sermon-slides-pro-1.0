import { describe, expect, it } from "vitest";
import {
  currentSlide,
  initialPresenterState,
  nextSlide,
  outputFrame,
  type PresenterAction,
  presenterReducer,
  type PresenterState,
} from "./state";
import { makeBundle, scripture, T0 } from "./test-fixtures";

const run = (actions: PresenterAction[], start: PresenterState = initialPresenterState) => actions.reduce(presenterReducer, start);
const loaded = () => run([{ type: "load", bundle: makeBundle() }]);
const at = (s: PresenterState) => [s.cursor.item, s.cursor.slide];

describe("presenter state", () => {
  it("starts black on the first slide, so nothing shows until the operator acts", () => {
    const s = loaded();
    expect(s.mode).toBe("black");
    expect(at(s)).toEqual([0, 0]);
    expect(outputFrame(s, T0)).toEqual({ kind: "black" });
  });

  it("next walks every slide in order, skips empty items, and stops at the end", () => {
    let s = loaded();
    const seen: string[] = [];
    for (let i = 0; i < 10; i++) {
      seen.push(currentSlide(s)!.id);
      s = presenterReducer(s, { type: "next" });
    }
    expect(seen.slice(0, 7)).toEqual(["logo", "title", "niv-1", "niv-2", "kjv-1", "blank", "credits"]);
    expect(seen.slice(7)).toEqual(["credits", "credits", "credits"]);
    expect(s.mode).toBe("live");
  });

  it("prev walks back across items and stops at the start", () => {
    let s = run([{ type: "goToItem", item: 3 }], loaded());
    expect(currentSlide(s)!.id).toBe("kjv-1");
    s = presenterReducer(s, { type: "prev" });
    expect(currentSlide(s)!.id).toBe("niv-2");
    s = run([{ type: "prev" }, { type: "prev" }, { type: "prev" }, { type: "prev" }], s);
    expect(currentSlide(s)!.id).toBe("logo");
  });

  it("go to item jumps to its first slide and ignores empty or out of range items", () => {
    const s = loaded();
    expect(at(presenterReducer(s, { type: "goToItem", item: 1 }))).toEqual([1, 0]);
    expect(presenterReducer(s, { type: "goToItem", item: 2 })).toBe(s);
    expect(presenterReducer(s, { type: "goToItem", item: 99 })).toBe(s);
    expect(presenterReducer(s, { type: "goToItem", item: -1 })).toBe(s);
  });

  it("go to slide picks one slide and validates it", () => {
    const s = loaded();
    expect(at(presenterReducer(s, { type: "goToSlide", item: 1, slide: 2 }))).toEqual([1, 2]);
    expect(presenterReducer(s, { type: "goToSlide", item: 1, slide: 3 })).toBe(s);
  });

  it("nextSlide previews what comes next, or null at the end", () => {
    const s = run([{ type: "goToItem", item: 1 }], loaded());
    expect(nextSlide(s)!.id).toBe("niv-1");
    expect(nextSlide(run([{ type: "goToItem", item: 5 }], loaded()))).toBeNull();
  });

  it("black and logo override the current slide; live brings it back", () => {
    const s = run([{ type: "goToItem", item: 3 }], loaded());
    expect(outputFrame(s, T0)).toMatchObject({ kind: "slide", slide: { id: "kjv-1" } });
    expect(outputFrame(presenterReducer(s, { type: "black" }), T0)).toEqual({ kind: "black" });
    expect(outputFrame(presenterReducer(s, { type: "logo" }), T0)).toEqual({ kind: "logo", logoPath: "logos/grace.png" });
    const toggled = run([{ type: "toggleBlack" }, { type: "toggleBlack" }], s);
    expect(toggled.mode).toBe("live");
    expect(run([{ type: "toggleLogo" }], s).mode).toBe("logo");
  });

  it("moving the cursor always returns to live", () => {
    const s = run([{ type: "black" }, { type: "next" }], loaded());
    expect(s.mode).toBe("live");
  });

  it("logo and blank items render as logo and black", () => {
    expect(outputFrame(run([{ type: "live" }], loaded()), T0)).toEqual({ kind: "logo", logoPath: "logos/grace.png" });
    expect(outputFrame(run([{ type: "goToItem", item: 4 }], loaded()), T0)).toEqual({ kind: "black" });
  });

  it("a scripture slide without attribution, or a missing slide, never reaches the projector", () => {
    const bundle = makeBundle();
    bundle.items[3].slides = [scripture("bad", "KJV", { attribution: "" })];
    const s = run([{ type: "load", bundle }, { type: "goToItem", item: 3 }]);
    expect(outputFrame(s, T0)).toEqual({ kind: "black" });

    bundle.items[3].slides = [{ id: "m", kind: "missing", missing_reason: "revoked", style: bundle.items[3].slides[0].style }];
    expect(outputFrame(run([{ type: "load", bundle }, { type: "goToItem", item: 3 }]), T0)).toEqual({ kind: "black" });
  });

  it("scripture goes black once the bundle has expired, even if still on screen", () => {
    const s = run([{ type: "goToItem", item: 3 }], loaded());
    expect(outputFrame(s, T0 + 23 * 3_600_000).kind).toBe("slide");
    expect(outputFrame(s, T0 + 24 * 3_600_000)).toEqual({ kind: "black" });
  });

  it("reloading the bundle keeps the operator on the same item by id", () => {
    const s = run([{ type: "goToSlide", item: 1, slide: 2 }], loaded());
    const reordered = makeBundle();
    reordered.items = [reordered.items[3], reordered.items[1], reordered.items[0]];
    const after = presenterReducer(s, { type: "load", bundle: reordered });
    expect(currentSlide(after)!.id).toBe("niv-2");
  });

  it("reloading clamps the slide when an item got shorter", () => {
    const s = run([{ type: "goToSlide", item: 1, slide: 2 }], loaded());
    const shorter = makeBundle();
    shorter.items[1].slides = shorter.items[1].slides.slice(0, 1);
    expect(at(presenterReducer(s, { type: "load", bundle: shorter }))).toEqual([1, 0]);
  });

  it("does nothing harmful before a bundle loads", () => {
    const s = run([{ type: "next" }, { type: "prev" }, { type: "goToItem", item: 1 }]);
    expect(s.bundle).toBeNull();
    expect(outputFrame(run([{ type: "live" }]), T0)).toEqual({ kind: "black" });
  });
});
