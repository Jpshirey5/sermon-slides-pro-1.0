import { describe, expect, it } from "vitest";
import { summarizeDisplays } from "./presenter-windows";
import { assignScreen, findSavedScreen, parseAssignments, rememberScreen, screenSetup, windowsOnScreen } from "./screens";

const laptop = { id: 1, label: "Built-in Retina Display", internal: true, bounds: { x: 0, y: 0, width: 1512, height: 982 } };
const tv = { id: 2, label: "SAMSUNG", bounds: { x: 1512, y: 0, width: 1920, height: 1080 } };
const confidence = { id: 3, label: "LG TV", bounds: { x: 3432, y: 0, width: 1920, height: 1080 } };

describe("screen setup", () => {
  it("remembers the main and stage screens and finds them again", () => {
    const list = summarizeDisplays([laptop, tv, confidence], 1, 1);
    let a = assignScreen(parseAssignments(null), "main", rememberScreen(list[1]));
    a = assignScreen(a, "stage", rememberScreen(list[2]));
    const reread = parseAssignments(JSON.stringify(a));
    const setup = screenSetup([laptop, tv, confidence], reread, 1, 1);
    expect([setup.main.connectedId, setup.stage.connectedId]).toEqual(["2", "3"]);
  });

  it("finds a screen by name and size when its id changed, but never guesses between two alike", () => {
    const saved = { id: "2", label: "SAMSUNG", width: 1920, height: 1080 };
    const moved = summarizeDisplays([laptop, { ...tv, id: 9 }], 1, 1);
    expect(findSavedScreen(moved, saved)?.id).toBe("9");
    const twins = summarizeDisplays([laptop, { ...tv, id: 8 }, { ...tv, id: 9 }], 1, 1);
    expect(findSavedScreen(twins, saved)).toBeNull();
  });

  it("an unplugged screen shows as not connected", () => {
    const a = { main: { id: "2", label: "SAMSUNG", width: 1920, height: 1080 }, stage: null };
    expect(screenSetup([laptop], a, 1, 1).main).toEqual({ saved: a.main, connectedId: null });
  });

  it("main and stage never share a screen", () => {
    const s = { id: "2", label: "SAMSUNG", width: 1920, height: 1080 };
    const a = assignScreen({ main: s, stage: null }, "stage", s);
    expect(a).toEqual({ main: null, stage: s });
  });

  it("ignores a damaged settings file", () => {
    expect(parseAssignments("{not json")).toEqual({ main: null, stage: null });
    expect(parseAssignments(JSON.stringify({ main: { id: 5 }, stage: "x" }))).toEqual({ main: null, stage: null });
  });

  it("knows which windows were on an unplugged screen", () => {
    const placed = new Map([["main", "2"], ["stage", "3"]] as const);
    expect(windowsOnScreen(placed, "3")).toEqual(["stage"]);
    expect(windowsOnScreen(placed, "1")).toEqual([]);
  });
});
