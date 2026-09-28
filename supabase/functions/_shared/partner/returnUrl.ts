// PARTNER API — return_url validation. This is where an open redirect would
// live, so it is deliberately strict: https only, no credentials, no explicit
// port, no whitespace/control characters/backslashes in the raw string (the URL
// parser silently strips or rewrites those), and an EXACT, case-insensitive
// hostname match against the partner's allowed_return_hosts. No wildcards, no
// suffix matching: allowing "acme.com" does not allow "evil-acme.com" or
// "app.acme.com".

import { PartnerError } from "./errors.ts";

const MAX_RETURN_URL_LENGTH = 2048;

export const validateReturnUrl = (raw: string, allowedHosts: string[]): string => {
  const reject = (reason: string): never => {
    throw new PartnerError("invalid_return_url", `return_url ${reason}`);
  };

  if (raw.length === 0 || raw.length > MAX_RETURN_URL_LENGTH) reject("must be 1-2048 characters.");
  // deno-lint-ignore no-control-regex
  if (/[\s\x00-\x1f\x7f\\]/.test(raw)) reject("must not contain whitespace, control characters, or backslashes.");
  if (!raw.toLowerCase().startsWith("https://")) reject("must use https.");

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return reject("is not a valid URL.");
  }

  if (url.protocol !== "https:") reject("must use https.");
  if (url.username || url.password) reject("must not contain credentials.");
  if (url.port) reject("must not specify a port.");

  const host = url.hostname.toLowerCase();
  const allowed = new Set(allowedHosts.map((entry) => entry.trim().toLowerCase()).filter(Boolean));
  if (!allowed.has(host)) reject(`host "${host}" is not on this partner's allowlist.`);

  return url.href;
};
