// Choosing the projector. Uses the Window Management API (Chrome and Edge)
// to list screens and open the output on the chosen one. Everywhere else, or
// if permission is refused, we open a normal window and the operator drags it
// to the projector.

export interface DisplayInfo {
  id: string;
  label: string;
  isPrimary: boolean;
  isCurrent: boolean;
  left: number;
  top: number;
  width: number;
  height: number;
}

export type DisplayListResult =
  | { supported: true; displays: DisplayInfo[] }
  | { supported: false; reason: "unsupported" | "denied" | "error" };

interface ScreenDetailed {
  label?: string;
  isPrimary?: boolean;
  availLeft?: number;
  availTop?: number;
  left?: number;
  top?: number;
  width: number;
  height: number;
}

interface ScreenDetails {
  screens: ScreenDetailed[];
  currentScreen?: ScreenDetailed;
}

type WindowWithScreens = Pick<Window, "open"> & {
  getScreenDetails?: () => Promise<ScreenDetails>;
  screen?: { width: number; height: number };
};

export function supportsWindowManagement(win: WindowWithScreens): boolean {
  return typeof win.getScreenDetails === "function";
}

/** Asks permission the first time. Must be called from a click. */
export async function listDisplays(win: WindowWithScreens): Promise<DisplayListResult> {
  if (!supportsWindowManagement(win)) return { supported: false, reason: "unsupported" };
  try {
    const details = await win.getScreenDetails!();
    return {
      supported: true,
      displays: details.screens.map((s, i) => ({
        id: String(i),
        label: s.label?.trim() || (s.isPrimary ? "Main display" : `Display ${i + 1}`),
        isPrimary: Boolean(s.isPrimary),
        isCurrent: s === details.currentScreen,
        left: s.availLeft ?? s.left ?? 0,
        top: s.availTop ?? s.top ?? 0,
        width: s.width,
        height: s.height,
      })),
    };
  } catch (error) {
    const name = (error as { name?: string })?.name;
    return { supported: false, reason: name === "NotAllowedError" ? "denied" : "error" };
  }
}

/** A sensible default: the first screen that is not the one the operator is on. */
export function pickDefaultDisplay(displays: readonly DisplayInfo[]): DisplayInfo | null {
  return displays.find((d) => !d.isCurrent && !d.isPrimary) ?? displays.find((d) => !d.isCurrent) ?? displays[0] ?? null;
}

export function windowFeatures(display: DisplayInfo | null): string {
  if (!display) return "popup,width=1280,height=720";
  return `popup,left=${display.left},top=${display.top},width=${display.width},height=${display.height}`;
}

export const OUTPUT_WINDOW_NAME = "ssp-presenter-output";

/** Opens (or reuses) the output window. Returns null if a popup blocker stopped it. */
export function openOutputWindow(win: WindowWithScreens, url: string, display: DisplayInfo | null): Window | null {
  return win.open(url, OUTPUT_WINDOW_NAME, windowFeatures(display));
}
