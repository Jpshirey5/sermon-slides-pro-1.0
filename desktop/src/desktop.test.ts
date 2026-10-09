import path from "node:path";
import { describe, expect, it } from "vitest";
import { isSupabaseUrl, requestOrigin, withAllowedOrigin } from "./cors";
import { type CacheFs, cacheFileName, createOfflineCache, MAX_OFFLINE_MS } from "./offline-cache";
import { contentType, resolveAppFile } from "./paths";
import { chooseDisplay, summarizeDisplays, validatePresenterPath } from "./presenter-windows";

const ROOT = path.resolve("/app/web");
const files = new Set([path.join(ROOT, "index.html"), path.join(ROOT, "assets", "app.js"), path.join(ROOT, "favicon.ico")]);
const exists = (f: string) => files.has(f);

describe("serving the app", () => {
  it("serves real files and falls back to index.html for app routes", () => {
    expect(resolveAppFile("ssp://app/assets/app.js", ROOT, exists)).toBe(path.join(ROOT, "assets", "app.js"));
    expect(resolveAppFile("ssp://app/dashboard/services/abc", ROOT, exists)).toBe(path.join(ROOT, "index.html"));
    expect(resolveAppFile("ssp://app/", ROOT, exists)).toBe(path.join(ROOT, "index.html"));
    expect(resolveAppFile("ssp://app/present/x/output?channel=n", ROOT, exists)).toBe(path.join(ROOT, "index.html"));
  });

  it("missing assets are 404s, not the app", () => {
    expect(resolveAppFile("ssp://app/assets/missing.js", ROOT, exists)).toBeNull();
  });

  it("refuses to leave the app folder or serve other origins", () => {
    // The URL parser collapses ../ first, so this can only land inside the app folder.
    expect(resolveAppFile("ssp://app/../../etc/passwd", ROOT, () => true)?.startsWith(ROOT + path.sep)).toBe(true);
    const encoded = resolveAppFile("ssp://app/%2e%2e/%2e%2e/etc/passwd", ROOT, () => true);
    expect(encoded === null || encoded.startsWith(ROOT + path.sep)).toBe(true);
    expect(resolveAppFile("ssp://other/index.html", ROOT, exists)).toBeNull();
    expect(resolveAppFile("https://app/index.html", ROOT, exists)).toBeNull();
    expect(resolveAppFile("not a url", ROOT, exists)).toBeNull();
    expect(resolveAppFile("ssp://app/%E0%A4%A", ROOT, exists)).toBeNull();
  });

  it("knows content types", () => {
    expect(contentType("a.js")).toContain("javascript");
    expect(contentType("a.woff2")).toBe("font/woff2");
    expect(contentType("a.unknown")).toBe("application/octet-stream");
  });
});

describe("presenter windows", () => {
  const id = "3f2b9c1e-7d44-4a8b-b1e2-9c0a5d6f7e81";
  it("only opens the app's own presenter pages", () => {
    expect(validatePresenterPath("main", `/present/${id}/output?channel=abc-123`)).toBe(true);
    expect(validatePresenterPath("stage", `/present/${id}/stage?channel=abc-123`)).toBe(true);
    expect(validatePresenterPath("main", `/present/${id}/stage?channel=abc`)).toBe(false);
    expect(validatePresenterPath("stage", `/present/${id}/output?channel=abc`)).toBe(false);
    expect(validatePresenterPath("main", "/dashboard")).toBe(false);
    expect(validatePresenterPath("main", `https://evil.test/present/${id}/output?channel=a`)).toBe(false);
    expect(validatePresenterPath("main", `/present/${id}/output?channel=a&x=<script>`)).toBe(false);
    expect(validatePresenterPath("other", `/present/${id}/output?channel=a`)).toBe(false);
  });

  const displays = [
    { id: 1, label: "Built-in Retina", bounds: { x: 0, y: 0, width: 1512, height: 982 }, internal: true },
    { id: 2, label: "", bounds: { x: 1512, y: 0, width: 1920, height: 1080 } },
    { id: 3, label: "Stage TV", bounds: { x: 3432, y: 0, width: 1920, height: 1080 } },
  ];

  it("picks the requested screen, else one that isn't the operator's", () => {
    expect(chooseDisplay(displays, "3", 1, 1)?.id).toBe(3);
    expect(chooseDisplay(displays, null, 1, 1)?.id).toBe(2);
    expect(chooseDisplay(displays, "99", 2, 1)?.id).toBe(1);
    expect(chooseDisplay([], null, null, 1)).toBeNull();
  });

  it("summarizes screens with readable names", () => {
    const s = summarizeDisplays(displays, 1, 1);
    expect(s.map((d) => [d.label, d.isPrimary, d.isCurrent])).toEqual([
      ["Built-in Retina", true, true],
      ["Display 2", false, false],
      ["Stage TV", false, false],
    ]);
  });
});

describe("encrypted offline cache", () => {
  const T0 = Date.parse("2026-10-11T12:00:00Z");
  function setup(opts: { available?: boolean } = {}) {
    let clock = T0;
    const store = new Map<string, Buffer>();
    const fs: CacheFs = {
      read: (f) => store.get(f) ?? null,
      write: (f, d) => void store.set(f, d),
      remove: (f) => void store.delete(f),
      list: () => [...store.keys()],
    };
    // A reversible stand-in for the OS keychain-backed cipher.
    const crypto = {
      isAvailable: () => opts.available ?? true,
      encrypt: (s: string) => Buffer.from([...Buffer.from(s, "utf8")].map((b) => b ^ 0x5a)),
      decrypt: (d: Buffer) => Buffer.from([...d].map((b) => b ^ 0x5a)).toString("utf8"),
    };
    const cache = createOfflineCache({ crypto, fs, now: () => clock });
    return { cache, store, advance: (ms: number) => (clock += ms) };
  }
  const bundle = JSON.stringify({ items: [{ text: "For God so loved the world" }] });
  const in2h = new Date(T0 + 2 * 3600_000).toISOString();

  it("saves and loads a copy until it expires, then deletes it", () => {
    const { cache, store, advance } = setup();
    expect(cache.save("service:abc", bundle, in2h)).toBe(true);
    expect(cache.load("service:abc")).toBe(bundle);
    advance(2 * 3600_000);
    expect(cache.load("service:abc")).toBeNull();
    expect(store.size).toBe(0);
  });

  it("never stores readable text on disk", () => {
    const { cache, store } = setup();
    cache.save("service:abc", bundle, in2h);
    const onDisk = [...store.values()][0].toString("utf8");
    expect(onDisk).not.toContain("For God so loved");
  });

  it("caps any copy at 24 hours, whatever the bundle says", () => {
    const { cache, advance } = setup();
    cache.save("service:abc", bundle, new Date(T0 + 30 * 24 * 3600_000).toISOString());
    advance(MAX_OFFLINE_MS - 1);
    expect(cache.load("service:abc")).toBe(bundle);
    advance(1);
    expect(cache.load("service:abc")).toBeNull();
  });

  it("refuses to store anything when the OS cannot encrypt", () => {
    const { cache, store } = setup({ available: false });
    expect(cache.save("service:abc", bundle, in2h)).toBe(false);
    expect(store.size).toBe(0);
  });

  it("refuses bad keys, past expiries, and garbage", () => {
    const { cache } = setup();
    expect(cache.save("../../etc", bundle, in2h)).toBe(false);
    expect(cache.save("service:abc", bundle, new Date(T0 - 1).toISOString())).toBe(false);
    expect(cache.save("service:abc", bundle, "not a date")).toBe(false);
    expect(cache.load("../../etc")).toBeNull();
  });

  it("purge on launch removes expired and unreadable copies only", () => {
    const { cache, store, advance } = setup();
    cache.save("service:old", bundle, new Date(T0 + 3600_000).toISOString());
    cache.save("service:new", bundle, new Date(T0 + 5 * 3600_000).toISOString());
    store.set("junk.ssp", Buffer.from("not json"));
    advance(2 * 3600_000);
    expect(cache.purgeExpired()).toBe(2);
    expect(cache.load("service:new")).toBe(bundle);
    expect(store.has(cacheFileName("service:old"))).toBe(false);
  });

  it("remove and clear", () => {
    const { cache, store } = setup();
    cache.save("service:a", bundle, in2h);
    cache.save("service:b", bundle, in2h);
    cache.remove("service:a");
    expect(cache.load("service:a")).toBeNull();
    cache.clear();
    expect(store.size).toBe(0);
  });
});

describe("Supabase responses for our pages", () => {
  it("only Supabase hosts", () => {
    expect(isSupabaseUrl("https://abc.supabase.co/functions/v1/service-bundle")).toBe(true);
    expect(isSupabaseUrl("https://evil.test/?x=supabase.co")).toBe(false);
    expect(isSupabaseUrl("http://abc.supabase.co/")).toBe(false);
  });

  it("replaces the allowed origin, keeping other headers", () => {
    const out = withAllowedOrigin({ "access-control-allow-origin": ["https://sermonslidepro.com"], "content-type": ["application/json"] }, "ssp://app");
    expect(out).toEqual({ "content-type": ["application/json"], "Access-Control-Allow-Origin": ["ssp://app"] });
  });

  it("reads the requesting page's origin, including our custom scheme", () => {
    expect(requestOrigin("ssp://app/dashboard/services/x", undefined)).toBe("ssp://app");
    expect(requestOrigin(undefined, "ssp://app/dashboard")).toBe("ssp://app");
    expect(requestOrigin("http://localhost:8080/dashboard", undefined)).toBe("http://localhost:8080");
    expect(requestOrigin("about:blank", undefined)).toBeNull();
    expect(requestOrigin(undefined, undefined)).toBeNull();
  });
});
