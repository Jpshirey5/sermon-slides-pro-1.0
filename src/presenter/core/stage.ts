// Stage display: what the pastor and worship team see on their own screen.
// Pure logic, no React, so the desktop shell can reuse it.
//
// Templates (our own layouts):
//   worship  current lyrics large, next lyrics below
//   message  current slide, speaker notes, clock, countdown
//   video    clock and a large countdown
//   simple   current and next slide
// Every template can show a stage message typed by the operator.

import { STAGE_TEMPLATES, type StageTemplate } from "../../../supabase/functions/_shared/presenter/types.ts";
import { currentSlide, nextSlide, type PresenterState } from "./state";
import type { OutputMode, PresenterSlide } from "./types";
import { type VideoStatus, videoTimer } from "./video";

export { STAGE_TEMPLATES };
export type { StageTemplate };

export const STAGE_TEMPLATE_LABELS: Record<StageTemplate, string> = {
  worship: "Worship",
  message: "Message",
  video: "Video",
  simple: "Simple",
};

// ── timer ───────────────────────────────────────────────────────────────────

/** A countdown. Running when startedAt is set. Elapsed time survives pauses. */
export interface TimerState {
  durationMs: number;
  startedAt: number | null;
  elapsedBeforeMs: number;
}

export const emptyTimer: TimerState = { durationMs: 0, startedAt: null, elapsedBeforeMs: 0 };

export function timerElapsedMs(timer: TimerState, now: number): number {
  return timer.elapsedBeforeMs + (timer.startedAt !== null ? Math.max(0, now - timer.startedAt) : 0);
}

/** Time left. Negative once the countdown runs over. */
export function timerRemainingMs(timer: TimerState, now: number): number {
  return timer.durationMs - timerElapsedMs(timer, now);
}

/** "12:30", "1:02:05", or "-0:45" when over time. Rounds toward the next whole second while counting down. */
export function formatCountdown(ms: number): string {
  const negative = ms < 0;
  const total = negative ? Math.floor(-ms / 1000) : Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const body = h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
  return negative ? `-${body}` : body;
}

export function formatClock(now: number, locale?: string): string {
  return new Date(now).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
}

// ── operator controls ───────────────────────────────────────────────────────

export interface StageControls {
  /** Operator's live choice; null follows the current item's template. */
  templateOverride: StageTemplate | null;
  message: string;
  showMessage: boolean;
  timer: TimerState;
}

export const initialStageControls: StageControls = {
  templateOverride: null,
  message: "",
  showMessage: false,
  timer: emptyTimer,
};

export type StageAction =
  | { type: "setTemplate"; template: StageTemplate | null }
  | { type: "setMessage"; text: string }
  | { type: "showMessage"; show: boolean }
  /** Set the countdown length without starting it (done when an item is selected). */
  | { type: "timerLoad"; seconds: number }
  | { type: "timerStart"; now: number }
  | { type: "timerPause"; now: number }
  | { type: "timerReset" }
  | { type: "timerAdjust"; seconds: number };

export const MAX_STAGE_MESSAGE = 140;

export function stageReducer(state: StageControls, action: StageAction): StageControls {
  const t = state.timer;
  switch (action.type) {
    case "setTemplate":
      return { ...state, templateOverride: action.template && STAGE_TEMPLATES.includes(action.template) ? action.template : null };
    case "setMessage":
      return { ...state, message: action.text.slice(0, MAX_STAGE_MESSAGE) };
    case "showMessage":
      return { ...state, showMessage: action.show && state.message.trim().length > 0 };
    case "timerLoad":
      // Loading a new length never interrupts a countdown that is running.
      if (t.startedAt !== null) return state;
      return { ...state, timer: { durationMs: Math.max(0, Math.round(action.seconds)) * 1000, startedAt: null, elapsedBeforeMs: 0 } };
    case "timerStart":
      return t.startedAt !== null || t.durationMs <= 0 ? state : { ...state, timer: { ...t, startedAt: action.now } };
    case "timerPause":
      return t.startedAt === null ? state : { ...state, timer: { ...t, startedAt: null, elapsedBeforeMs: timerElapsedMs(t, action.now) } };
    case "timerReset":
      return { ...state, timer: { ...t, startedAt: null, elapsedBeforeMs: 0 } };
    case "timerAdjust":
      return { ...state, timer: { ...t, durationMs: Math.max(0, t.durationMs + Math.round(action.seconds) * 1000) } };
  }
}

// ── the frame sent to the stage window ──────────────────────────────────────

export interface StageText {
  /** Main words: lyrics, scripture text, or the slide title. */
  text: string;
  /** Second line: reference, section label, or subtitle. */
  caption?: string;
}

export interface StageFrame {
  template: StageTemplate;
  itemLabel: string;
  current: StageText | null;
  next: StageText | null;
  notes: string | null;
  /** The stage window ticks the countdown itself from this. */
  timer: TimerState | null;
  /** True when the countdown is a video's remaining time rather than the operator's timer. */
  timerIsVideo?: boolean;
  message: string | null;
  /** What the main screen is doing, so the stage can say "Main screen is black". */
  mainMode: OutputMode;
}

export function stageText(slide: PresenterSlide | null): StageText | null {
  if (!slide) return null;
  switch (slide.kind) {
    case "scripture":
      return slide.text ? { text: slide.text, caption: slide.reference } : null;
    case "lyrics":
      return slide.text ? { text: slide.text, caption: slide.label } : null;
    case "title":
    case "point":
      return slide.title ? { text: slide.title, caption: slide.subtitle || undefined } : null;
    case "credits":
      return { text: "Scripture credits" };
    case "video":
      return { text: slide.title ?? "Video", caption: "Video" };
    case "graphic":
      return { text: "Graphic" };
    case "logo":
      return { text: "Logo" };
    case "blank":
      return { text: "Black screen" };
    default:
      return null;
  }
}

export function buildStageFrame(state: PresenterState, controls: StageControls, video?: VideoStatus | null): StageFrame {
  const item = state.bundle?.items[state.cursor.item] ?? null;
  const template = controls.templateOverride ?? item?.stage.template ?? "simple";
  const current = currentSlide(state);
  const showTimer = template === "message" || template === "video";
  // While a video is live, the countdown is the video's own remaining time.
  const liveVideo = current?.kind === "video" && video && video.slideId === current.id ? videoTimer(video) : null;
  if (showTimer && liveVideo) {
    return {
      template,
      itemLabel: item?.label ?? "",
      current: stageText(current),
      next: stageText(nextSlide(state)),
      notes: current?.notes?.trim() || null,
      timer: liveVideo,
      timerIsVideo: true,
      message: controls.showMessage && controls.message.trim() ? controls.message.trim() : null,
      mainMode: state.mode,
    };
  }
  return {
    template,
    itemLabel: item?.label ?? "",
    current: stageText(current),
    next: stageText(nextSlide(state)),
    notes: current?.notes?.trim() || null,
    timer: showTimer && controls.timer.durationMs > 0 ? controls.timer : null,
    message: controls.showMessage && controls.message.trim() ? controls.message.trim() : null,
    mainMode: state.mode,
  };
}
