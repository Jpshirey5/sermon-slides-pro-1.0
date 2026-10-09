// Encrypted offline copy of a service, so Sunday works without internet.
//
// Licensing rules (CLAUDE.md, API.Bible): the copy is only readable by Sermon
// Slide Pro (encrypted with a key held by the operating system's keychain via
// Electron safeStorage), it never outlives the bundle's expiry (24 hours at
// most, and never past the scripture's 30 day limit), and expired copies are
// deleted on every launch. If the OS cannot encrypt, nothing is stored.

import { createHash } from "node:crypto";

export interface Encryptor {
  isAvailable(): boolean;
  encrypt(plain: string): Buffer;
  decrypt(data: Buffer): string;
}

export interface CacheFs {
  read(file: string): Buffer | null;
  write(file: string, data: Buffer): void;
  remove(file: string): void;
  list(): string[];
}

interface Envelope {
  v: 1;
  expires_at: string;
  data: string;
}

/** Longest any offline copy may be kept, whatever the bundle says. */
export const MAX_OFFLINE_MS = 24 * 60 * 60 * 1000;

const KEY = /^[A-Za-z0-9:_-]{1,128}$/;

export function cacheFileName(key: string): string {
  return `${createHash("sha256").update(key).digest("hex").slice(0, 40)}.ssp`;
}

function parseEnvelope(raw: Buffer | null): Envelope | null {
  if (!raw) return null;
  try {
    const e = JSON.parse(raw.toString("utf8")) as Envelope;
    return e && e.v === 1 && typeof e.expires_at === "string" && typeof e.data === "string" ? e : null;
  } catch {
    return null;
  }
}

function expired(expiresAt: string, now: number): boolean {
  const t = new Date(expiresAt).getTime();
  return Number.isNaN(t) || now >= t;
}

export function createOfflineCache(deps: { crypto: Encryptor; fs: CacheFs; now?: () => number }) {
  const now = deps.now ?? Date.now;

  return {
    available: () => deps.crypto.isAvailable(),

    /** Store `json` until `expiresAt` (capped at 24 hours). Returns false if it could not be stored safely. */
    save(key: string, json: string, expiresAt: string): boolean {
      if (!KEY.test(key) || typeof json !== "string" || json.length > 20 * 1024 * 1024) return false;
      if (!deps.crypto.isAvailable()) return false;
      const requested = new Date(expiresAt).getTime();
      if (Number.isNaN(requested) || requested <= now()) return false;
      const capped = new Date(Math.min(requested, now() + MAX_OFFLINE_MS)).toISOString();
      const envelope: Envelope = { v: 1, expires_at: capped, data: deps.crypto.encrypt(json).toString("base64") };
      deps.fs.write(cacheFileName(key), Buffer.from(JSON.stringify(envelope), "utf8"));
      return true;
    },

    /** The stored copy, or null if missing, expired (and then deleted), or unreadable. */
    load(key: string): string | null {
      if (!KEY.test(key)) return null;
      const file = cacheFileName(key);
      const envelope = parseEnvelope(deps.fs.read(file));
      if (!envelope) return null;
      if (expired(envelope.expires_at, now())) {
        deps.fs.remove(file);
        return null;
      }
      try {
        return deps.crypto.decrypt(Buffer.from(envelope.data, "base64"));
      } catch {
        deps.fs.remove(file);
        return null;
      }
    },

    remove(key: string): void {
      if (KEY.test(key)) deps.fs.remove(cacheFileName(key));
    },

    /** Delete every expired or unreadable copy. Run on launch. Returns how many were deleted. */
    purgeExpired(): number {
      let removed = 0;
      for (const file of deps.fs.list()) {
        const envelope = parseEnvelope(deps.fs.read(file));
        if (!envelope || expired(envelope.expires_at, now())) {
          deps.fs.remove(file);
          removed++;
        }
      }
      return removed;
    },

    clear(): void {
      for (const file of deps.fs.list()) deps.fs.remove(file);
    },
  };
}
