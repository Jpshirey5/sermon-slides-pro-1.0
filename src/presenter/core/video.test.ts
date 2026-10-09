import { describe, expect, it } from "vitest";
import { clampTime, clampVolume, estimatedTime, formatVideoTime, isVideoCommand, type VideoStatus, videoTimer } from "./video";

const status = (over: Partial<VideoStatus> = {}): VideoStatus => ({
  slideId: "v", currentTime: 10, duration: 60, paused: false, ended: false, volume: 1, muted: false, loop: false, at: 1_000_000, ...over,
});

describe("video helpers", () => {
  it("formats times", () => {
    expect(formatVideoTime(65)).toBe("1:05");
    expect(formatVideoTime(3725.9)).toBe("1:02:05");
    expect(formatVideoTime(0)).toBe("0:00");
    expect(formatVideoTime(null)).toBe("--:--");
    expect(formatVideoTime(NaN)).toBe("--:--");
  });

  it("clamps volume and seek times", () => {
    expect([clampVolume(2), clampVolume(-1), clampVolume(0.4), clampVolume(NaN)]).toEqual([1, 0, 0.4, 1]);
    expect([clampTime(-5, 60), clampTime(90, 60), clampTime(30, null), clampTime(NaN, 60)]).toEqual([0, 60, 30, 0]);
  });

  it("estimates the current time between status updates", () => {
    expect(estimatedTime(status(), 1_003_000)).toBe(13);
    expect(estimatedTime(status({ paused: true }), 1_003_000)).toBe(10);
    expect(estimatedTime(status(), 1_999_000)).toBe(60);
  });

  it("turns status into a stage countdown the stage window can tick", () => {
    expect(videoTimer(status())).toEqual({ durationMs: 60_000, elapsedBeforeMs: 10_000, startedAt: 1_000_000 });
    expect(videoTimer(status({ paused: true }))?.startedAt).toBeNull();
    expect(videoTimer(status({ duration: null }))).toBeNull();
  });

  it("recognizes only valid commands", () => {
    expect(isVideoCommand({ action: "play" })).toBe(true);
    expect(isVideoCommand({ action: "seek", time: 12 })).toBe(true);
    expect(isVideoCommand({ action: "seek", time: "12" })).toBe(false);
    expect(isVideoCommand({ action: "mute", muted: 1 })).toBe(false);
    expect(isVideoCommand({ action: "explode" })).toBe(false);
    expect(isVideoCommand(null)).toBe(false);
  });
});
