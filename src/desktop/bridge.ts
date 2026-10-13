// The desktop app (Electron) exposes window.sspDesktop through its preload
// script. In a normal browser it is undefined and every caller falls back to
// the web behavior. Keep this in sync with desktop/src/preload.ts.

import type { DisplayInfo } from "@/presenter/core/displays";

export type PresenterWindowKind = "main" | "stage";

export interface SavedScreen {
  id: string;
  label: string;
  width: number;
  height: number;
}

/** The connected screens and which one is main and which is stage (saved on this computer). */
export interface ScreenSetup {
  displays: DisplayInfo[];
  main: { saved: SavedScreen | null; connectedId: string | null };
  stage: { saved: SavedScreen | null; connectedId: string | null };
}

export interface ScreenChange {
  kind: PresenterWindowKind | null;
  state: "disconnected" | "reconnected" | "updated";
}

/** Menu commands passed on to whichever page can act on them (the service screen). */
export const SCREEN_COMMAND_EVENT = "ssp:screen-command";
export interface ScreenCommandDetail {
  kind: PresenterWindowKind;
  handled: boolean;
}

export interface SspDesktop {
  isDesktop: true;
  info(): Promise<{ version: string; platform: string; packaged: boolean }>;
  listDisplays(): Promise<DisplayInfo[]>;
  openPresenterWindow(kind: PresenterWindowKind, pathWithQuery: string, displayId: string | null): Promise<boolean>;
  closePresenterWindow(kind: PresenterWindowKind): Promise<void>;
  onPresenterClosed(callback: (kind: PresenterWindowKind) => void): () => void;
  screens: {
    get(): Promise<ScreenSetup | null>;
    set(kind: PresenterWindowKind, displayId: string | null): Promise<ScreenSetup | null>;
    identify(): Promise<void>;
    onChanged(callback: (change: ScreenChange) => void): () => void;
  };
  /** Commands from the app menu (Screens > Set Up Screens, Open Main Screen, ...). */
  onMenuCommand(callback: (command: string) => void): () => void;
  offlineCache: {
    available(): Promise<boolean>;
    save(key: string, json: string, expiresAt: string): Promise<boolean>;
    load(key: string): Promise<string | null>;
    remove(key: string): Promise<void>;
    clear(): Promise<void>;
  };
}

declare global {
  interface Window {
    sspDesktop?: SspDesktop;
  }
}

export function getDesktop(): SspDesktop | null {
  return typeof window !== "undefined" && window.sspDesktop?.isDesktop ? window.sspDesktop : null;
}
