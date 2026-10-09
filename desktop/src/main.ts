// Sermon Slide Pro desktop app: main process.
//
// Loads the same React app as the website from local files (ssp://app), so it
// starts without internet. Adds what a browser can't do well on Sunday:
// native screen placement for the main screen and stage display, and an
// encrypted offline copy of each service.

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { app, BrowserWindow, ipcMain, Menu, net, protocol, safeStorage, screen, session, shell } from "electron";
import { autoUpdater } from "electron-updater";
import { isSupabaseUrl, requestOrigin, withAllowedOrigin } from "./cors";
import { type CacheFs, createOfflineCache } from "./offline-cache";
import { contentType, ORIGIN, resolveAppFile, SCHEME } from "./paths";
import { chooseDisplay, type PresenterWindowKind, summarizeDisplays, validatePresenterPath } from "./presenter-windows";

const DEV_URL = process.env.SSP_DEV_URL?.replace(/\/$/, "") || null;
const APP_URL = DEV_URL ?? ORIGIN;
const WEB_ROOT = app.isPackaged ? path.join(process.resourcesPath, "web") : path.join(__dirname, "..", "web");
// Packaged builds get their icon from the installer; running from source uses this one.
const DEV_ICON = app.isPackaged ? undefined : path.join(__dirname, "..", "resources", "icon.png");

protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, codeCache: true } },
]);

if (!app.requestSingleInstanceLock()) app.quit();

let mainWindow: BrowserWindow | null = null;
const presenterWindows = new Map<PresenterWindowKind, BrowserWindow>();

const isOurUrl = (url: string) => url.startsWith(`${APP_URL}/`) || url === APP_URL;

function secureWebPreferences(preload: boolean): Electron.WebPreferences {
  return {
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
    // Service videos start on cue without a click in the window first.
    autoplayPolicy: "no-user-gesture-required",
    // Licensed scripture is shown in these windows; no inspector in release builds.
    devTools: !app.isPackaged,
    ...(preload ? { preload: path.join(__dirname, "preload.js") } : {}),
  };
}

/** Links to anything that is not the app open in the person's normal browser. */
function guardNavigation(win: BrowserWindow) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!isOurUrl(url) && /^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (isOurUrl(url)) return;
    event.preventDefault();
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
  });
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: "#0a0a0a",
    title: "Sermon Slide Pro",
    show: false,
    ...(DEV_ICON ? { icon: DEV_ICON } : {}),
    webPreferences: secureWebPreferences(true),
  });
  guardNavigation(mainWindow);
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("closed", () => {
    mainWindow = null;
    for (const w of presenterWindows.values()) if (!w.isDestroyed()) w.close();
    presenterWindows.clear();
  });
  // Sign-in first; signed-in people are sent on to their dashboard.
  void mainWindow.loadURL(`${APP_URL}/login`);
}

function openPresenterWindow(kind: PresenterWindowKind, pathWithQuery: string, displayId: unknown): boolean {
  if (!validatePresenterPath(kind, pathWithQuery)) return false;
  const displays = screen.getAllDisplays();
  const operatorDisplay = mainWindow ? screen.getDisplayMatching(mainWindow.getBounds()).id : null;
  const target = chooseDisplay(displays, displayId, operatorDisplay, screen.getPrimaryDisplay().id);
  if (!target) return false;

  const existing = presenterWindows.get(kind);
  if (existing && !existing.isDestroyed()) existing.close();

  const win = new BrowserWindow({
    ...target.bounds,
    backgroundColor: "#000000",
    frame: false,
    show: false,
    title: kind === "main" ? "Sermon Slide Pro main screen" : "Sermon Slide Pro stage display",
    webPreferences: secureWebPreferences(false),
  });
  guardNavigation(win);
  presenterWindows.set(kind, win);
  win.once("ready-to-show", () => {
    win.setBounds(target.bounds);
    // A second screen gets true full screen. On the operator's own screen (one
    // monitor, rehearsing) it stays a window so the workspace is reachable.
    if (target.id !== operatorDisplay) win.setFullScreen(true);
    win.show();
  });
  win.on("closed", () => {
    if (presenterWindows.get(kind) === win) presenterWindows.delete(kind);
    mainWindow?.webContents.send("presenter:closed", kind);
  });
  void win.loadURL(`${APP_URL}${pathWithQuery}`);
  return true;
}

// ── offline cache on disk ──
const cacheDir = () => path.join(app.getPath("userData"), "presenter-cache");
const diskFs: CacheFs = {
  read: (file) => {
    try {
      return fs.readFileSync(path.join(cacheDir(), path.basename(file)));
    } catch {
      return null;
    }
  },
  write: (file, data) => {
    fs.mkdirSync(cacheDir(), { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(cacheDir(), path.basename(file)), data, { mode: 0o600 });
  },
  remove: (file) => fs.rmSync(path.join(cacheDir(), path.basename(file)), { force: true }),
  list: () => {
    try {
      return fs.readdirSync(cacheDir()).filter((f) => f.endsWith(".ssp"));
    } catch {
      return [];
    }
  },
};
const offlineCache = createOfflineCache({
  crypto: {
    isAvailable: () => safeStorage.isEncryptionAvailable(),
    encrypt: (plain) => safeStorage.encryptString(plain),
    decrypt: (data) => safeStorage.decryptString(data),
  },
  fs: diskFs,
});

function registerIpc() {
  const fromMain = (event: Electron.IpcMainInvokeEvent) => mainWindow !== null && event.sender === mainWindow.webContents;

  ipcMain.handle("app:info", () => ({ version: app.getVersion(), platform: process.platform, packaged: app.isPackaged }));

  ipcMain.handle("displays:list", (event) => {
    if (!fromMain(event)) return [];
    const operator = mainWindow ? screen.getDisplayMatching(mainWindow.getBounds()).id : null;
    return summarizeDisplays(screen.getAllDisplays(), screen.getPrimaryDisplay().id, operator);
  });

  ipcMain.handle("presenter:open", (event, kind: PresenterWindowKind, pathWithQuery: string, displayId: unknown) =>
    fromMain(event) ? openPresenterWindow(kind, pathWithQuery, displayId) : false);

  ipcMain.handle("presenter:close", (event, kind: PresenterWindowKind) => {
    if (!fromMain(event)) return;
    const w = presenterWindows.get(kind);
    if (w && !w.isDestroyed()) w.close();
  });

  ipcMain.handle("cache:available", () => offlineCache.available());
  ipcMain.handle("cache:save", (event, key: string, json: string, expiresAt: string) => (fromMain(event) ? offlineCache.save(key, json, expiresAt) : false));
  ipcMain.handle("cache:load", (event, key: string) => (fromMain(event) ? offlineCache.load(key) : null));
  ipcMain.handle("cache:remove", (event, key: string) => {
    if (fromMain(event)) offlineCache.remove(key);
  });
  ipcMain.handle("cache:clear", (event) => {
    if (fromMain(event)) offlineCache.clear();
  });
}

function serveApp() {
  protocol.handle(SCHEME, async (request) => {
    const file = resolveAppFile(request.url, WEB_ROOT, (f) => {
      try {
        return fs.statSync(f).isFile();
      } catch {
        return false;
      }
    });
    if (!file) return new Response("Not found", { status: 404 });
    const response = await net.fetch(pathToFileURL(file).toString());
    return new Response(response.body, { status: 200, headers: { "Content-Type": contentType(file), "Cache-Control": "no-cache" } });
  });
}

/** Let our own pages read Supabase responses (see cors.ts). */
function allowSupabaseForOurPages() {
  const pageOrigin = DEV_URL ? new URL(DEV_URL).origin : ORIGIN;
  session.defaultSession.webRequest.onHeadersReceived({ urls: ["https://*.supabase.co/*", "https://*.supabase.in/*"] }, (details, callback) => {
    const origin = requestOrigin(details.webContents?.getURL(), details.referrer);
    if (!isSupabaseUrl(details.url) || origin !== pageOrigin) return callback({});
    callback({ responseHeaders: withAllowedOrigin(details.responseHeaders, pageOrigin) });
  });
}

function setUpUpdates() {
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = true;
  // Updates install when the app is quit, never in the middle of a service.
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.checkForUpdatesAndNotify().catch(() => undefined);
  setInterval(() => autoUpdater.checkForUpdatesAndNotify().catch(() => undefined), 6 * 60 * 60 * 1000);
}

app.on("second-instance", () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

app.whenReady().then(() => {
  if (DEV_ICON && process.platform === "darwin") app.dock?.setIcon(DEV_ICON);
  // Expired offline copies are deleted on every launch.
  offlineCache.purgeExpired();
  if (!DEV_URL) serveApp();
  allowSupabaseForOurPages();
  registerIpc();
  if (process.platform !== "darwin") Menu.setApplicationMenu(null);
  createMainWindow();
  setUpUpdates();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
