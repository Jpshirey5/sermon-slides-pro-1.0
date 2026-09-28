// PARTNER API — hashing, HMAC, and token primitives shared by the partner edge
// functions and scripts/issue-partner-key.ts. node:crypto is used for
// timingSafeEqual and randomBytes (CSPRNG); both run in Deno and the edge runtime.

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const sha256Hex = (value: string): string =>
  createHash("sha256").update(value, "utf8").digest("hex");

export const hmacSha256Hex = (secret: string, message: string): string =>
  createHmac("sha256", secret).update(message, "utf8").digest("hex");

/** Constant-time string comparison. Unequal lengths short-circuit (length is not secret here). */
export const safeEqual = (a: string, b: string): boolean => {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
};

export const randomBase64Url = (bytes: number): string => randomBytes(bytes).toString("base64url");

export const randomHex = (bytes: number): string => randomBytes(bytes).toString("hex");

const PREFIX_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

export const randomKeyPrefix = (): string => {
  const bytes = randomBytes(8);
  return Array.from(bytes, (b) => PREFIX_ALPHABET[b % PREFIX_ALPHABET.length]).join("");
};

export const KEY_PATTERN = /^ssp_(live|test)_([a-z0-9]{8})_([A-Za-z0-9_-]{32,128})$/;

export interface ParsedKey {
  mode: "live" | "test";
  prefix: string;
  fullKey: string;
}

export const parseApiKey = (value: string): ParsedKey | null => {
  const match = KEY_PATTERN.exec(value);
  if (!match) return null;
  return { mode: match[1] as "live" | "test", prefix: match[2], fullKey: value };
};

/** Signature base string: timestamp.METHOD.pathname.rawBody (rawBody empty for GET/DELETE). */
export const signatureBase = (timestamp: string, method: string, pathname: string, rawBody: string): string =>
  `${timestamp}.${method.toUpperCase()}.${pathname}.${rawBody}`;

export const signingSecretEnvName = (prefix: string): string => `PARTNER_SIGNING_SECRET_${prefix.toUpperCase()}`;
