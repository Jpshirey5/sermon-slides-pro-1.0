import { describe, expect, it } from "vitest";
import { holdSessionWhilePresenting, isPresentingHoldActive, isProjectorWindowPath } from "@/lib/session-security";
import { keyToAction } from "./useKeyboardShortcuts";

describe("keyboard shortcuts", () => {
  const press = (key: string, digits = "") => keyToAction(key, { digits });

  it("maps navigation and screen keys", () => {
    for (const key of ["ArrowRight", "ArrowDown", " ", "PageDown"]) expect(press(key).action).toEqual({ type: "next" });
    for (const key of ["ArrowLeft", "ArrowUp", "PageUp"]) expect(press(key).action).toEqual({ type: "prev" });
    expect(press("b").action).toEqual({ type: "toggleBlack" });
    expect(press("B").action).toEqual({ type: "toggleBlack" });
    expect(press(".").action).toEqual({ type: "toggleBlack" });
    expect(press("l").action).toEqual({ type: "toggleLogo" });
    expect(press("Escape").action).toEqual({ type: "live" });
    expect(press("x").action).toBeNull();
  });

  it("number then Enter goes to that item (1-based)", () => {
    let r = press("1");
    r = keyToAction("2", { digits: r.digits });
    expect(r).toEqual({ action: null, digits: "12" });
    expect(keyToAction("Enter", { digits: r.digits })).toEqual({ action: { type: "goToItem", item: 11 }, digits: "" });
    expect(press("Enter", "0").action).toBeNull();
    expect(press("Enter").action).toBeNull();
  });

  it("another key clears a half-typed number", () => {
    expect(press("ArrowRight", "4").digits).toBe("");
    expect(press("5", "1234").digits).toBe("345");
  });
});

describe("session safety while presenting", () => {
  it("the presenting hold is active only while held, and release is safe to call twice", () => {
    expect(isPresentingHoldActive()).toBe(false);
    const releaseA = holdSessionWhilePresenting();
    const releaseB = holdSessionWhilePresenting();
    expect(isPresentingHoldActive()).toBe(true);
    releaseA();
    releaseA();
    expect(isPresentingHoldActive()).toBe(true);
    releaseB();
    expect(isPresentingHoldActive()).toBe(false);
  });

  it("only the projector window path skips the idle timer", () => {
    expect(isProjectorWindowPath("/present/abc/output")).toBe(true);
    expect(isProjectorWindowPath("/present/abc/output/")).toBe(true);
    expect(isProjectorWindowPath("/present/abc/stage")).toBe(true);
    expect(isProjectorWindowPath("/present/abc")).toBe(false);
    expect(isProjectorWindowPath("/dashboard")).toBe(false);
    expect(isProjectorWindowPath("/present/abc/output/extra")).toBe(false);
  });
});
