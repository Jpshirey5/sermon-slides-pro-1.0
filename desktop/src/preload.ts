// The only bridge between the app's pages and the desktop. Pages get a small,
// fixed API under window.sspDesktop; no Node or Electron access.

import { contextBridge, ipcRenderer } from "electron";

type Kind = "main" | "stage";

contextBridge.exposeInMainWorld("sspDesktop", {
  isDesktop: true,
  info: () => ipcRenderer.invoke("app:info"),
  listDisplays: () => ipcRenderer.invoke("displays:list"),
  openPresenterWindow: (kind: Kind, pathWithQuery: string, displayId: string | null) =>
    ipcRenderer.invoke("presenter:open", kind, pathWithQuery, displayId),
  closePresenterWindow: (kind: Kind) => ipcRenderer.invoke("presenter:close", kind),
  onPresenterClosed: (callback: (kind: Kind) => void) => {
    const listener = (_event: unknown, kind: Kind) => callback(kind);
    ipcRenderer.on("presenter:closed", listener);
    return () => ipcRenderer.removeListener("presenter:closed", listener);
  },
  offlineCache: {
    available: () => ipcRenderer.invoke("cache:available"),
    save: (key: string, json: string, expiresAt: string) => ipcRenderer.invoke("cache:save", key, json, expiresAt),
    load: (key: string) => ipcRenderer.invoke("cache:load", key),
    remove: (key: string) => ipcRenderer.invoke("cache:remove", key),
    clear: () => ipcRenderer.invoke("cache:clear"),
  },
});
