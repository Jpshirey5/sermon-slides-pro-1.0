// Presenter state as a pure reducer: where we are in the service, and what
// the projector is showing. No timers, no DOM, no network, so the same logic
// drives the browser presenter now and the desktop shell later.

import { isShowable } from "./expiry";
import type { Cursor, OutputFrame, OutputMode, PresenterSlide, ServiceBundle } from "./types";

export interface PresenterState {
  bundle: ServiceBundle | null;
  cursor: Cursor;
  mode: OutputMode;
}

export type PresenterAction =
  | { type: "load"; bundle: ServiceBundle }
  | { type: "next" }
  | { type: "prev" }
  | { type: "goToItem"; item: number }
  | { type: "goToSlide"; item: number; slide: number }
  | { type: "black" }
  | { type: "logo" }
  /** Back to showing the current slide. */
  | { type: "live" }
  /** Toggle helpers for single-key shortcuts. */
  | { type: "toggleBlack" }
  | { type: "toggleLogo" };

export const initialPresenterState: PresenterState = {
  bundle: null,
  cursor: { item: 0, slide: 0 },
  mode: "black",
};

const slideCount = (bundle: ServiceBundle, item: number) => bundle.items[item]?.slides.length ?? 0;

/** First position at or after `from` (inclusive) that has a slide. */
function firstFrom(bundle: ServiceBundle, item: number): Cursor | null {
  for (let i = item; i < bundle.items.length; i++) if (slideCount(bundle, i) > 0) return { item: i, slide: 0 };
  return null;
}

/** Last slide of the nearest non-empty item at or before `item`. */
function lastBefore(bundle: ServiceBundle, item: number): Cursor | null {
  for (let i = item; i >= 0; i--) {
    const n = slideCount(bundle, i);
    if (n > 0) return { item: i, slide: n - 1 };
  }
  return null;
}

export function stepForward(bundle: ServiceBundle, cursor: Cursor): Cursor {
  if (cursor.slide + 1 < slideCount(bundle, cursor.item)) return { item: cursor.item, slide: cursor.slide + 1 };
  return firstFrom(bundle, cursor.item + 1) ?? cursor;
}

export function stepBack(bundle: ServiceBundle, cursor: Cursor): Cursor {
  if (cursor.slide > 0) return { item: cursor.item, slide: cursor.slide - 1 };
  return lastBefore(bundle, cursor.item - 1) ?? cursor;
}

/** Keep the cursor on the same item (by id) after a reload, clamped to what exists. */
function reconcileCursor(previous: ServiceBundle | null, next: ServiceBundle, cursor: Cursor): Cursor {
  if (next.items.length === 0) return { item: 0, slide: 0 };
  const previousId = previous?.items[cursor.item]?.id;
  const sameIndex = previousId ? next.items.findIndex((i) => i.id === previousId) : -1;
  const item = sameIndex >= 0 ? sameIndex : Math.min(cursor.item, next.items.length - 1);
  const n = slideCount(next, item);
  if (n === 0) return firstFrom(next, item) ?? lastBefore(next, item) ?? { item, slide: 0 };
  return { item, slide: Math.min(cursor.slide, n - 1) };
}

export function presenterReducer(state: PresenterState, action: PresenterAction): PresenterState {
  if (action.type === "load") {
    const cursor = state.bundle
      ? reconcileCursor(state.bundle, action.bundle, state.cursor)
      : firstFrom(action.bundle, 0) ?? { item: 0, slide: 0 };
    return { ...state, bundle: action.bundle, cursor };
  }

  const { bundle } = state;
  switch (action.type) {
    case "black":
      return { ...state, mode: "black" };
    case "logo":
      return { ...state, mode: "logo" };
    case "live":
      return { ...state, mode: "live" };
    case "toggleBlack":
      return { ...state, mode: state.mode === "black" ? "live" : "black" };
    case "toggleLogo":
      return { ...state, mode: state.mode === "logo" ? "live" : "logo" };
  }

  if (!bundle) return state;
  switch (action.type) {
    case "next":
      return { ...state, cursor: stepForward(bundle, state.cursor), mode: "live" };
    case "prev":
      return { ...state, cursor: stepBack(bundle, state.cursor), mode: "live" };
    case "goToItem": {
      if (action.item < 0 || action.item >= bundle.items.length) return state;
      if (slideCount(bundle, action.item) === 0) return state;
      return { ...state, cursor: { item: action.item, slide: 0 }, mode: "live" };
    }
    case "goToSlide": {
      if (action.slide < 0 || action.slide >= slideCount(bundle, action.item)) return state;
      return { ...state, cursor: { item: action.item, slide: action.slide }, mode: "live" };
    }
  }
  return state;
}

export function currentSlide(state: PresenterState): PresenterSlide | null {
  return state.bundle?.items[state.cursor.item]?.slides[state.cursor.slide] ?? null;
}

export function nextSlide(state: PresenterState): PresenterSlide | null {
  if (!state.bundle) return null;
  const next = stepForward(state.bundle, state.cursor);
  if (next.item === state.cursor.item && next.slide === state.cursor.slide) return null;
  return state.bundle.items[next.item].slides[next.slide] ?? null;
}

/**
 * What the projector shows. Black unless live; a slide that may not be shown
 * (missing text, no attribution, expired) shows black instead.
 */
export function outputFrame(state: PresenterState, now: Date | number = Date.now()): OutputFrame {
  if (state.mode === "logo") return { kind: "logo", logoPath: state.bundle?.service.logo_path ?? null };
  if (state.mode === "black" || !state.bundle) return { kind: "black" };
  const slide = currentSlide(state);
  if (!slide || slide.kind === "missing" || !isShowable(slide, state.bundle, now)) return { kind: "black" };
  if (slide.kind === "logo") return { kind: "logo", logoPath: state.bundle.service.logo_path };
  if (slide.kind === "blank") return { kind: "black" };
  return { kind: "slide", slide };
}
