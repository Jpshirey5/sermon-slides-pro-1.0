// Which physical screen is the main screen and which is the stage display.
// The choice is saved on this computer so next Sunday the windows go straight
// to the right screens. Pure functions only; main.ts does the Electron work.

import { type DisplayLike, type DisplaySummary, type PresenterWindowKind, summarizeDisplays } from "./presenter-windows";

/** What we remember about a screen, so we can find it again after a restart. */
export interface SavedScreen {
  id: string;
  label: string;
  width: number;
  height: number;
}

export type ScreenAssignments = Record<PresenterWindowKind, SavedScreen | null>;

export const NO_ASSIGNMENTS: ScreenAssignments = { main: null, stage: null };

export interface ScreenSetup {
  displays: DisplaySummary[];
  main: { saved: SavedScreen | null; connectedId: string | null };
  stage: { saved: SavedScreen | null; connectedId: string | null };
}

const isSaved = (v: unknown): v is SavedScreen => {
  if (!v || typeof v !== "object") return false;
  const s = v as Record<string, unknown>;
  return typeof s.id === "string" && s.id.length <= 64 && typeof s.label === "string" && s.label.length <= 200 &&
    Number.isFinite(s.width) && Number.isFinite(s.height);
};

/** Read the saved file. Anything malformed is treated as "nothing saved". */
export function parseAssignments(json: string | null): ScreenAssignments {
  if (!json) return { ...NO_ASSIGNMENTS };
  try {
    const raw = JSON.parse(json) as Record<string, unknown>;
    return { main: isSaved(raw.main) ? raw.main : null, stage: isSaved(raw.stage) ? raw.stage : null };
  } catch {
    return { ...NO_ASSIGNMENTS };
  }
}

export function rememberScreen(summary: DisplaySummary): SavedScreen {
  return { id: summary.id, label: summary.label, width: summary.width, height: summary.height };
}

/**
 * The connected screen for a saved choice: the same screen id, or else the
 * only connected screen with the same name and size (ids can change when a
 * computer restarts or a cable moves to another port).
 */
export function findSavedScreen<T extends DisplaySummary>(displays: readonly T[], saved: SavedScreen | null): T | null {
  if (!saved) return null;
  const byId = displays.find((d) => d.id === saved.id);
  if (byId) return byId;
  const alike = displays.filter((d) => d.label === saved.label && d.width === saved.width && d.height === saved.height);
  return alike.length === 1 ? alike[0] : null;
}

export function screenSetup(displays: readonly DisplayLike[], assignments: ScreenAssignments, primaryId: number, operatorId: number | null): ScreenSetup {
  const list = summarizeDisplays(displays, primaryId, operatorId);
  const entry = (kind: PresenterWindowKind) => ({
    saved: assignments[kind],
    connectedId: findSavedScreen(list, assignments[kind])?.id ?? null,
  });
  return { displays: list, main: entry("main"), stage: entry("stage") };
}

/**
 * Save a choice. Picking the screen already used by the other window moves
 * that window's choice off it, so main and stage never share a screen.
 */
export function assignScreen(current: ScreenAssignments, kind: PresenterWindowKind, screen: SavedScreen | null): ScreenAssignments {
  const other: PresenterWindowKind = kind === "main" ? "stage" : "main";
  const next: ScreenAssignments = { ...current, [kind]: screen };
  if (screen && current[other]?.id === screen.id) next[other] = null;
  return next;
}

/** Which presenter windows sit on a screen that was just unplugged or turned off. */
export function windowsOnScreen(placements: ReadonlyMap<PresenterWindowKind, string>, screenId: string): PresenterWindowKind[] {
  return [...placements].filter(([, id]) => id === screenId).map(([kind]) => kind);
}
