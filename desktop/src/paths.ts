// Serving the built web app from inside the desktop app, under the private
// ssp://app origin. Any path that is not a real file gets index.html, so the
// app's own routes (/dashboard, /present/...) work like they do on the web.

import path from "node:path";

export const SCHEME = "ssp";
export const HOST = "app";
export const ORIGIN = `${SCHEME}://${HOST}`;

/**
 * Map a request URL to a file under `root`. Returns null for anything that
 * would escape `root` (path traversal) or is not our origin.
 */
export function resolveAppFile(requestUrl: string, root: string, exists: (file: string) => boolean): string | null {
  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    return null;
  }
  if (url.protocol !== `${SCHEME}:` || url.host !== HOST) return null;
  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
  const resolvedRoot = path.resolve(root);
  const candidate = path.resolve(resolvedRoot, `.${pathname}`);
  if (candidate !== resolvedRoot && !candidate.startsWith(resolvedRoot + path.sep)) return null;
  if (pathname !== "/" && exists(candidate)) return candidate;
  // Asset paths that do not exist are real 404s, not app routes.
  if (/\.[a-z0-9]{1,8}$/i.test(pathname)) return null;
  return path.join(resolvedRoot, "index.html");
}

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".mp4": "video/mp4",
  ".wasm": "application/wasm",
  ".txt": "text/plain; charset=utf-8",
};

export function contentType(file: string): string {
  return TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream";
}
