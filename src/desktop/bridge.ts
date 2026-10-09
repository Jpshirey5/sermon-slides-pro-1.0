// The desktop app (Electron) exposes window.sspDesktop through its preload
// script. In a normal browser it is undefined and every caller falls back to
// the web behavior. Keep this in sync with desktop/src/preload.ts.

import type { DisplayInfo } from "@/presenter/core/displays";

export type PresenterWindowKind = "main" | "stage";

export interface SspDesktop {
  isDesktop: true;
  info(): Promise<{ version: string; platform: string; packaged: boolean }>;
  listDisplays(): Promise<DisplayInfo[]>;
  openPresenterWindow(kind: PresenterWindowKind, pathWithQuery: string, displayId: string | null): Promise<boolean>;
  closePresenterWindow(kind: PresenterWindowKind): Promise<void>;
  onPresenterClosed(callback: (kind: PresenterWindowKind) => void): () => void;
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
