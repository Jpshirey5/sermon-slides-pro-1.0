import { describe, expect, it } from "vitest";
import {
  buildStageFrame,
  formatCountdown,
  initialStageControls,
  MAX_STAGE_MESSAGE,
  type StageAction,
  type StageControls,
  stageReducer,
  stageText,
  timerRemainingMs,
} from "./stage";
import { initialPresenterState, type PresenterAction, presenterReducer } from "./state";
import { makeBundle, scripture, T0 } from "./test-fixtures";

const run = (actions: StageAction[], start: StageControls = initialStageControls) => actions.reduce(stageReducer, start);
const presenter = (actions: PresenterAction[]) => [{ type: "load" as const, bundle: makeBundle() }, ...actions].reduce(presenterReducer, initialPresenterState);

describe("countdown timer", () => {
  it("loads, starts, pauses, resumes, and keeps time across pauses", () => {
    let s = run([{ type: "timerLoad", seconds: 600 }]);
    expect(timerRemainingMs(s.timer, T0)).toBe(600_000);
    s = stageReducer(s, { type: "timerStart", now: T0 });
    expect(timerRemainingMs(s.timer, T0 + 60_000)).toBe(540_000);
    s = stageReducer(s, { type: "timerPause", now: T0 + 60_000 });
    expect(timerRemainingMs(s.timer, T0 + 999_000)).toBe(540_000);
    s = stageReducer(s, { type: "timerStart", now: T0 + 1_000_000 });
    expect(timerRemainingMs(s.timer, T0 + 1_030_000)).toBe(510_000);
  });

  it("runs past zero into overtime", () => {
    const s = run([{ type: "timerLoad", seconds: 10 }, { type: "timerStart", now: T0 }]);
    expect(timerRemainingMs(s.timer, T0 + 15_000)).toBe(-5_000);
  });

  it("loading a new length never interrupts a running countdown", () => {
    const s = run([{ type: "timerLoad", seconds: 60 }, { type: "timerStart", now: T0 }, { type: "timerLoad", seconds: 999 }]);
    expect(s.timer.durationMs).toBe(60_000);
  });

  it("reset, adjust, and no start without a length", () => {
    let s = run([{ type: "timerStart", now: T0 }]);
    expect(s.timer.startedAt).toBeNull();
    s = run([{ type: "timerLoad", seconds: 60 }, { type: "timerStart", now: T0 }, { type: "timerReset" }]);
    expect([s.timer.startedAt, s.timer.elapsedBeforeMs, s.timer.durationMs]).toEqual([null, 0, 60_000]);
    s = run([{ type: "timerAdjust", seconds: 120 }], s);
    expect(s.timer.durationMs).toBe(180_000);
    s = run([{ type: "timerAdjust", seconds: -9999 }], s);
    expect(s.timer.durationMs).toBe(0);
  });

  it("formats countdowns the way people read them", () => {
    expect(formatCountdown(750_000)).toBe("12:30");
    expect(formatCountdown(749_200)).toBe("12:30");
    expect(formatCountdown(0)).toBe("0:00");
    expect(formatCountdown(3_725_000)).toBe("1:02:05");
    expect(formatCountdown(-45_000)).toBe("-0:45");
    expect(formatCountdown(-45_900)).toBe("-0:45");
  });
});

describe("stage message and template", () => {
  it("caps the message length and only shows a non-empty message", () => {
    let s = run([{ type: "showMessage", show: true }]);
    expect(s.showMessage).toBe(false);
    s = run([{ type: "setMessage", text: "x".repeat(500) }, { type: "showMessage", show: true }]);
    expect(s.message).toHaveLength(MAX_STAGE_MESSAGE);
    expect(s.showMessage).toBe(true);
  });

  it("a template override is cleared with null and rejects unknown values", () => {
    expect(run([{ type: "setTemplate", template: "video" }]).templateOverride).toBe("video");
    expect(run([{ type: "setTemplate", template: "video" }, { type: "setTemplate", template: null }]).templateOverride).toBeNull();
    expect(run([{ type: "setTemplate", template: "disco" as never }]).templateOverride).toBeNull();
  });
});

describe("stage frame", () => {
  it("follows the current item's template, with current, next, and notes", () => {
    const state = presenter([{ type: "goToSlide", item: 1, slide: 1 }]);
    const withNotes = { ...state };
    withNotes.bundle = makeBundle();
    withNotes.bundle.items[1].slides[1] = scripture("niv-1", "NIV", { notes: "  Pause here  " });
    const frame = buildStageFrame(withNotes, run([{ type: "timerLoad", seconds: 1800 }]));
    expect(frame.template).toBe("message");
    expect(frame.itemLabel).toBe("Anchored");
    expect(frame.current).toEqual({ text: "Text of niv-1", caption: "John 3:16 (NIV)" });
    expect(frame.next).toEqual({ text: "Text of niv-2", caption: "John 3:16 (NIV)" });
    expect(frame.notes).toBe("Pause here");
    expect(frame.timer?.durationMs).toBe(1_800_000);
  });

  it("worship and simple templates carry no countdown; an override wins", () => {
    const state = presenter([{ type: "goToItem", item: 3 }]);
    const controls = run([{ type: "timerLoad", seconds: 300 }]);
    expect(buildStageFrame(state, controls).template).toBe("simple");
    expect(buildStageFrame(state, controls).timer).toBeNull();
    const video = buildStageFrame(state, run([{ type: "setTemplate", template: "video" }], controls));
    expect(video.template).toBe("video");
    expect(video.timer?.durationMs).toBe(300_000);
  });

  it("shows the stage message only when the operator turns it on", () => {
    const state = presenter([]);
    const typed = run([{ type: "setMessage", text: "Wrap up in 2" }]);
    expect(buildStageFrame(state, typed).message).toBeNull();
    expect(buildStageFrame(state, run([{ type: "showMessage", show: true }], typed)).message).toBe("Wrap up in 2");
  });

  it("tells the stage what the main screen is doing", () => {
    expect(buildStageFrame(presenter([]), initialStageControls).mainMode).toBe("black");
    expect(buildStageFrame(presenter([{ type: "next" }]), initialStageControls).mainMode).toBe("live");
  });

  it("stageText covers every slide kind", () => {
    const style = { background: "#000", fontFamily: "Georgia", textColor: "#fff" };
    expect(stageText({ id: "l", kind: "lyrics", text: "Praise God", label: "Verse 1", style })).toEqual({ text: "Praise God", caption: "Verse 1" });
    expect(stageText({ id: "p", kind: "point", title: "Hope", subtitle: "", style })).toEqual({ text: "Hope", caption: undefined });
    expect(stageText({ id: "m", kind: "missing", style })).toBeNull();
    expect(stageText(null)).toBeNull();
  });
});
