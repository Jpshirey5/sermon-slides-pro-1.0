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
import { assignScreen, findSavedScreen, parseAssignments, rememberScreen, type ScreenAssignments, screenSetup, windowsOnScreen } from "./screens";

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
/** The screen each presenter window was put on, so we know what an unplugged cable affects. */
const presenterPlacement = new Map<PresenterWindowKind, string>();

// ── which screen is main and which is stage, saved on this computer ──
const screensFile = () => path.join(app.getPath("userData"), "screens.json");
let assignments: ScreenAssignments = { main: null, stage: null };
function loadAssignments() {
  try {
    assignments = parseAssignments(fs.readFileSync(screensFile(), "utf8"));
  } catch {
    assignments = parseAssignments(null);
  }
}
function saveAssignments(next: ScreenAssignments) {
  assignments = next;
  fs.writeFileSync(screensFile(), JSON.stringify(next), { mode: 0o600 });
}
const operatorDisplayId = () => (mainWindow ? screen.getDisplayMatching(mainWindow.getBounds()).id : null);
const currentSetup = () => screenSetup(screen.getAllDisplays(), assignments, screen.getPrimaryDisplay().id, operatorDisplayId());
const sendToMain = (channel: string, ...args: unknown[]) => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, ...args);
};

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
  const operatorDisplay = operatorDisplayId();
  // No screen asked for: use the one saved in Screens setup, if it's plugged in.
  const requested = displayId ?? findSavedScreen(currentSetup().displays, assignments[kind])?.id ?? null;
  const target = chooseDisplay(displays, requested, operatorDisplay, screen.getPrimaryDisplay().id);
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
  presenterPlacement.set(kind, String(target.id));
  win.once("ready-to-show", () => placeOn(win, target, operatorDisplay));
  win.on("closed", () => {
    if (presenterWindows.get(kind) === win) {
      presenterWindows.delete(kind);
      presenterPlacement.delete(kind);
    }
    mainWindow?.webContents.send("presenter:closed", kind);
  });
  void win.loadURL(`${APP_URL}${pathWithQuery}`);
  return true;
}

function placeOn(win: BrowserWindow, target: Electron.Display, operatorDisplay: number | null) {
  win.setBounds(target.bounds);
  // A second screen gets true full screen. On the operator's own screen (one
  // monitor, rehearsing) it stays a window so the workspace is reachable.
  if (target.id !== operatorDisplay) win.setFullScreen(true);
  win.show();
}

// A cable pulled or a TV turned off: hide that window instead of letting the
// system drop it onto the operator's screen. When the saved screen comes
// back, put the window back on it.
function watchScreens() {
  screen.on("display-removed", (_event, display) => {
    for (const kind of windowsOnScreen(presenterPlacement, String(display.id))) {
      const win = presenterWindows.get(kind);
      if (!win || win.isDestroyed()) continue;
      win.setFullScreen(false);
      win.hide();
      presenterPlacement.delete(kind);
      sendToMain("screens:changed", { kind, state: "disconnected" });
    }
    sendToMain("screens:changed", { kind: null, state: "updated" });
  });
  screen.on("display-added", () => {
    const setup = currentSetup();
    for (const kind of ["main", "stage"] as const) {
      const win = presenterWindows.get(kind);
      if (!win || win.isDestroyed() || win.isVisible()) continue;
      const back = setup[kind].connectedId ? screen.getAllDisplays().find((d) => String(d.id) === setup[kind].connectedId) : undefined;
      if (!back) continue;
      presenterPlacement.set(kind, String(back.id));
      placeOn(win, back, operatorDisplayId());
      sendToMain("screens:changed", { kind, state: "reconnected" });
    }
    sendToMain("screens:changed", { kind: null, state: "updated" });
  });
}

// Shows a big label on every screen for a few seconds, so people can see
// which cable goes where.
function identifyScreens() {
  const setup = currentSetup();
  for (const display of screen.getAllDisplays()) {
    const id = String(display.id);
    const role = setup.main.connectedId === id ? "Main screen" : setup.stage.connectedId === id ? "Stage display" : "Not used";
    const name = setup.displays.find((d) => d.id === id)?.label ?? "Screen";
    const w = 560;
    const h = 300;
    const win = new BrowserWindow({
      x: Math.round(display.bounds.x + (display.bounds.width - w) / 2),
      y: Math.round(display.bounds.y + (display.bounds.height - h) / 2),
      width: w,
      height: h,
      frame: false,
      resizable: false,
      focusable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      backgroundColor: "#111111",
      webPreferences: { ...secureWebPreferences(false), javascript: false },
    });
    const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
    const color = role === "Main screen" ? "#F6B128" : role === "Stage display" ? "#60A5FA" : "#9CA3AF";
    const html = `<!doctype html><meta charset="utf-8"><body style="margin:0;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:-apple-system,Segoe UI,sans-serif;background:#111;color:#fff;border:6px solid ${color};box-sizing:border-box">
<div style="font-size:56px;font-weight:700;color:${color}">${esc(role)}</div>
<div style="margin-top:12px;font-size:20px;opacity:.75">${esc(name)} · ${display.bounds.width}×${display.bounds.height}</div></body>`;
    void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    setTimeout(() => !win.isDestroyed() && win.close(), 4000);
  }
}

// ── app menu: File, Edit, View, Screens, Window ──
function buildMenu() {
  const isMac = process.platform === "darwin";
  const toMain = (command: string) => () => sendToMain("menu:command", command);
  const closeWindow = (kind: PresenterWindowKind) => () => {
    const w = presenterWindows.get(kind);
    if (w && !w.isDestroyed()) w.close();
  };
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: "appMenu" as const }] : []),
    { role: "fileMenu" },
    { role: "editMenu" },
    { role: "viewMenu" },
    {
      label: "Screens",
      submenu: [
        { label: "Set Up Screens...", accelerator: "CmdOrCtrl+Shift+S", click: toMain("screens:setup") },
        { label: "Identify Screens", click: identifyScreens },
        { type: "separator" },
        { label: "Open Main Screen", accelerator: "CmdOrCtrl+1", click: toMain("screens:open-main") },
        { label: "Open Stage Display", accelerator: "CmdOrCtrl+2", click: toMain("screens:open-stage") },
        { type: "separator" },
        { label: "Close Main Screen", click: closeWindow("main") },
        { label: "Close Stage Display", click: closeWindow("stage") },
      ],
    },
    { role: "windowMenu" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
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

  ipcMain.handle("screens:get", (event) => (fromMain(event) ? currentSetup() : null));
  ipcMain.handle("screens:set", (event, kind: unknown, displayId: unknown) => {
    if (!fromMain(event) || (kind !== "main" && kind !== "stage")) return null;
    const setup = currentSetup();
    const chosen = displayId === null ? null : setup.displays.find((d) => d.id === String(displayId));
    if (displayId !== null && !chosen) return setup;
    saveAssignments(assignScreen(assignments, kind, chosen ? rememberScreen(chosen) : null));
    return currentSetup();
  });
  ipcMain.handle("screens:identify", (event) => {
    if (fromMain(event)) identifyScreens();
  });

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
  loadAssignments();
  registerIpc();
  buildMenu();
  watchScreens();
  createMainWindow();
  setUpUpdates();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
