import { useEffect, useRef } from "react";
import type { PresenterAction } from "../core/state";

/** The shortcut list shown in the operator view. */
export const SHORTCUTS: { keys: string; action: string }[] = [
  { keys: "Right, Space, Page Down", action: "Next slide" },
  { keys: "Left, Page Up", action: "Previous slide" },
  { keys: "B", action: "Black screen on or off" },
  { keys: "L", action: "Logo screen on or off" },
  { keys: "Esc", action: "Back to the current slide" },
  { keys: "Number, then Enter", action: "Go to that item" },
];

export interface KeyState {
  /** Digits typed so far for "go to item". */
  digits: string;
}

/**
 * Map one key press to an action. Pure, so it is easy to test.
 * Returns the action (if any) and the new digit buffer.
 */
export function keyToAction(key: string, state: KeyState): { action: PresenterAction | null; digits: string } {
  if (/^[0-9]$/.test(key)) return { action: null, digits: (state.digits + key).slice(-3) };
  if (key === "Enter" && state.digits) {
    const n = parseInt(state.digits, 10);
    return { action: n > 0 ? { type: "goToItem", item: n - 1 } : null, digits: "" };
  }
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
    case " ":
    case "PageDown":
      return { action: { type: "next" }, digits: "" };
    case "ArrowLeft":
    case "ArrowUp":
    case "PageUp":
      return { action: { type: "prev" }, digits: "" };
    case "b":
    case "B":
    case ".":
      return { action: { type: "toggleBlack" }, digits: "" };
    case "l":
    case "L":
      return { action: { type: "toggleLogo" }, digits: "" };
    case "Escape":
      return { action: { type: "live" }, digits: "" };
    default:
      return { action: null, digits: state.digits };
  }
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

export function useKeyboardShortcuts(dispatch: (action: PresenterAction) => void, enabled = true) {
  const digits = useRef("");
  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;
      const result = keyToAction(event.key, { digits: digits.current });
      digits.current = result.digits;
      if (result.action) {
        event.preventDefault();
        dispatch(result.action);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dispatch, enabled]);
}
