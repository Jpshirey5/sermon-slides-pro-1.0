// Partner API v1 router. Reachable at /api/partner/v1/* (proxied by the app
// worker) and directly at /functions/v1/partner-api/v1/*; see canonicalPathname.
// Server-to-server only: no CORS, and keys must never ship to a browser.

import { canonicalPathname, defaultDeps, type PartnerDeps, type PartnerRoute } from "../_shared/partner/auth.ts";
import { newRequestId } from "../_shared/partner/errors.ts";
import { createAccount, getAccount, revokeEntitlement } from "./routes/accounts.ts";
import { createDeck, createExport, getDeck } from "./routes/decks.ts";
import { getExport } from "./routes/exports.ts";
import { createSession } from "./routes/sessions.ts";
import { getTheme, upsertTheme } from "./routes/themes.ts";

interface RouteDef {
  method: string;
  pattern: RegExp;
  keys: string[];
  handler: PartnerRoute;
}

const route = (method: string, path: string, handler: PartnerRoute): RouteDef => {
  const keys: string[] = [];
  const pattern = new RegExp(
    `^/api/partner/v1${path.replace(/\{(\w+)\}/g, (_, key) => {
      keys.push(key);
      return "([^/]+)";
    })}$`,
  );
  return { method, pattern, keys, handler };
};

const ROUTES: RouteDef[] = [
  route("POST", "/accounts", createAccount),
  route("GET", "/accounts/{id}", getAccount),
  route("DELETE", "/accounts/{id}/entitlement", revokeEntitlement),
  route("POST", "/themes", upsertTheme),
  route("GET", "/themes/{id}", getTheme),
  route("POST", "/sessions", createSession),
  route("POST", "/decks", createDeck),
  route("GET", "/decks/{id}", getDeck),
  route("POST", "/decks/{id}/exports", createExport),
  route("GET", "/exports/{id}", getExport),
];

/** Unmatched paths never reach withPartner, so they are logged (unauthenticated) here. */
const routeNotFound = async (req: Request, pathname: string, status: 404 | 405, deps: PartnerDeps) => {
  const requestId = newRequestId();
  const message = status === 404
    ? `No partner API route matches ${pathname}.`
    : `${req.method} is not supported on ${pathname}.`;
  try {
    await deps.db.from("partner_api_log").insert({
      request_id: requestId,
      partner_id: null,
      method: req.method.toUpperCase(),
      path: pathname,
      status,
      duration_ms: 0,
      error_code: "route_not_found",
    });
  } catch {
    // logging is best effort
  }
  return new Response(
    JSON.stringify({ error: { code: "route_not_found", message, request_id: requestId } }),
    { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Request-Id": requestId } },
  );
};

export const handlePartnerRequest = (req: Request, deps?: PartnerDeps): Promise<Response> | Response => {
  const pathname = canonicalPathname(req.url);
  let pathMatched = false;
  for (const def of ROUTES) {
    const match = def.pattern.exec(pathname);
    if (!match) continue;
    pathMatched = true;
    if (def.method !== req.method.toUpperCase()) continue;
    const params: Record<string, string> = {};
    def.keys.forEach((key, index) => {
      try {
        params[key] = decodeURIComponent(match[index + 1]);
      } catch {
        params[key] = match[index + 1];
      }
    });
    return def.handler(req, params, deps);
  }
  return routeNotFound(req, pathname, pathMatched ? 405 : 404, deps ?? defaultDeps());
};
