// Presenter windows (main screen and stage display) on the screen the
// operator picks. Only the app's own presenter pages may be opened this way.

export type PresenterWindowKind = "main" | "stage";

export interface DisplayLike {
  id: number;
  label?: string;
  bounds: { x: number; y: number; width: number; height: number };
  workArea?: { x: number; y: number; width: number; height: number };
  internal?: boolean;
}

export interface DisplaySummary {
  id: string;
  label: string;
  isPrimary: boolean;
  isCurrent: boolean;
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Only /present/<id>/output or /present/<id>/stage, with a channel nonce. Nothing else. */
const PRESENTER_PATH = /^\/present\/[0-9a-fA-F-]{1,64}\/(output|stage)\?channel=[A-Za-z0-9-]{1,64}$/;

export function validatePresenterPath(kind: unknown, pathWithQuery: unknown): pathWithQuery is string {
  if (kind !== "main" && kind !== "stage") return false;
  if (typeof pathWithQuery !== "string" || !PRESENTER_PATH.test(pathWithQuery)) return false;
  const wants = kind === "main" ? "/output?" : "/stage?";
  return pathWithQuery.includes(wants);
}

export function summarizeDisplays(displays: readonly DisplayLike[], primaryId: number, currentId: number | null): DisplaySummary[] {
  return displays.map((d, i) => ({
    id: String(d.id),
    label: d.label?.trim() || (d.id === primaryId ? "Main display" : d.internal ? "Built-in display" : `Display ${i + 1}`),
    isPrimary: d.id === primaryId,
    isCurrent: d.id === currentId,
    left: d.bounds.x,
    top: d.bounds.y,
    width: d.bounds.width,
    height: d.bounds.height,
  }));
}

/** The display to use: the one asked for, else the first that isn't the operator's, else the primary. */
export function chooseDisplay<T extends DisplayLike>(displays: readonly T[], requestedId: unknown, operatorDisplayId: number | null, primaryId: number): T | null {
  if (displays.length === 0) return null;
  const requested = displays.find((d) => String(d.id) === String(requestedId));
  if (requested) return requested;
  return displays.find((d) => d.id !== operatorDisplayId) ?? displays.find((d) => d.id === primaryId) ?? displays[0];
}
