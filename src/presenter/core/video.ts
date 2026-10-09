// Video playback between the operator and the main screen window. The main
// screen plays the video with sound and reports its status; the operator
// sends commands and shows controls. Pure types and helpers, no React.

import type { TimerState } from "./stage";

export type VideoCommand =
  | { action: "play" }
  | { action: "pause" }
  | { action: "seek"; time: number }
  | { action: "volume"; volume: number }
  | { action: "mute"; muted: boolean }
  | { action: "loop"; loop: boolean };

export interface VideoStatus {
  /** The video slide this status is for. */
  slideId: string;
  currentTime: number;
  duration: number | null;
  paused: boolean;
  ended: boolean;
  volume: number;
  muted: boolean;
  loop: boolean;
  /** The browser refused to start playback with sound until someone clicks the window. */
  blocked?: boolean;
  /** When this status was measured (ms since epoch). */
  at: number;
}

export function clampVolume(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1;
}

export function clampTime(t: number, duration: number | null): number {
  if (!Number.isFinite(t) || t < 0) return 0;
  return duration !== null && Number.isFinite(duration) ? Math.min(t, duration) : t;
}

/** Where playback is now, estimated from the last status (it keeps moving while playing). */
export function estimatedTime(status: VideoStatus, now: number): number {
  if (status.paused || status.ended) return status.currentTime;
  return clampTime(status.currentTime + Math.max(0, now - status.at) / 1000, status.duration);
}

/** "1:05" or "1:02:05". */
export function formatVideoTime(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return "--:--";
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * The stage display's countdown for a playing video, as a timer the stage
 * window can tick by itself between status updates.
 */
export function videoTimer(status: VideoStatus): TimerState | null {
  if (status.duration === null || !Number.isFinite(status.duration) || status.duration <= 0) return null;
  return {
    durationMs: Math.round(status.duration * 1000),
    elapsedBeforeMs: Math.round(status.currentTime * 1000),
    startedAt: status.paused || status.ended ? null : status.at,
  };
}

export function isVideoCommand(value: unknown): value is VideoCommand {
  if (!value || typeof value !== "object") return false;
  const c = value as Record<string, unknown>;
  switch (c.action) {
    case "play":
    case "pause":
      return true;
    case "seek":
      return typeof c.time === "number" && Number.isFinite(c.time);
    case "volume":
      return typeof c.volume === "number" && Number.isFinite(c.volume);
    case "mute":
      return typeof c.muted === "boolean";
    case "loop":
      return typeof c.loop === "boolean";
    default:
      return false;
  }
}
