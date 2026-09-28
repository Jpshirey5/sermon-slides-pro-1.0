// PARTNER API — withPartner(): the single wrapper every partner route goes
// through. It owns the request id, body cap, API key auth, request signing,
// rate limiting, idempotency, the error contract, and the request log, then
// hands the route a verified context.
//
// Never log: raw API keys, signing secrets, the Authorization header, the
// X-SSP-Signature header, or handoff tokens. Key prefixes only.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";
import {
  parseApiKey,
  hmacSha256Hex,
  safeEqual,
  sha256Hex,
  signatureBase,
  signingSecretEnvName,
} from "./crypto.ts";
import { describeError, errorBody, fail, newRequestId, okRaw, PartnerError } from "./errors.ts";

export const MAX_BODY_BYTES = 1024 * 1024;
export const MAX_TIMESTAMP_SKEW_SECONDS = 300;
export const PUBLIC_PATH_PREFIX = "/api/partner";

export interface Partner {
  id: string;
  name: string;
  slug: string;
  is_test: boolean;
  status: string;
  allowed_return_hosts: string[];
  rate_limit_per_min: number;
  deck_limit_per_day: number;
}

export interface PartnerDeps {
  db: SupabaseClient;
  env: (name: string) => string | undefined;
  now: () => number;
  /** Start work that must outlive the response (EdgeRuntime.waitUntil in prod; deferred in tests). */
  runInBackground: (task: () => Promise<unknown>) => void;
}

export interface PartnerContext {
  partner: Partner;
  requestId: string;
  body: Record<string, unknown>;
  rawBody: string;
  idempotencyKey: string | null;
  db: SupabaseClient;
  params: Record<string, string>;
  req: Request;
  clientIp: string | null;
  deps: PartnerDeps;
  /** Routes set this so the request log can attribute the call to a seat. */
  log: { externalUserId?: string | null };
}

export interface HandlerResult {
  status: number;
  body: unknown;
}

export type PartnerHandler = (ctx: PartnerContext) => Promise<HandlerResult>;

export type PartnerRoute = (
  req: Request,
  params: Record<string, string>,
  deps?: PartnerDeps,
) => Promise<Response>;

const logStep = (step: string, details?: Record<string, unknown>) => {
  console.log(`[PARTNER-API] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);
};

// deno-lint-ignore no-explicit-any
declare const EdgeRuntime: any;

let cachedDeps: PartnerDeps | null = null;

export const defaultDeps = (): PartnerDeps => {
  if (cachedDeps) return cachedDeps;
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  cachedDeps = {
    db: createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
    env: (name) => Deno.env.get(name),
    now: () => Date.now(),
    runInBackground: (task) => {
      const promise = task().catch((error) => console.error("[PARTNER-API] background task failed", describeError(error)));
      if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(promise);
    },
  };
  return cachedDeps;
};

/**
 * The pathname partners sign. Requests reach the function either through the
 * app's /api/partner/v1/* proxy or directly at /functions/v1/partner-api/v1/*;
 * both canonicalize to /api/partner/v1/... so one signature works for either.
 */
const ROUTE_PREFIX = /^(?:\/api\/partner|(?:\/functions\/v1)?\/partner-api)(\/v1(?:\/.*)?)$/;

export const canonicalPathname = (url: string): string => {
  const pathname = new URL(url).pathname.replace(/\/+$/, "");
  const match = ROUTE_PREFIX.exec(pathname);
  return match ? `${PUBLIC_PATH_PREFIX}${match[1]}` : pathname;
};

export const clientIpOf = (req: Request): string | null =>
  req.headers.get("cf-connecting-ip") ||
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
  null;

const readCappedBody = async (req: Request): Promise<string> => {
  const declared = Number(req.headers.get("content-length") || "0");
  if (declared > MAX_BODY_BYTES) {
    throw new PartnerError("payload_too_large", "Request body exceeds 1 MB.");
  }
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => {});
      throw new PartnerError("payload_too_large", "Request body exceeds 1 MB.");
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
};

interface KeyRow {
  partner_id: string;
  key_prefix: string;
  key_hash: string;
  signing_secret_hash: string;
}

const authenticate = async (
  req: Request,
  deps: PartnerDeps,
): Promise<{ partner: Partner; key: KeyRow }> => {
  const header = req.headers.get("authorization") || "";
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  const parsed = match ? parseApiKey(match[1]) : null;
  if (!parsed) {
    throw new PartnerError("unauthorized", "Missing or malformed API key. Send Authorization: Bearer ssp_live_...");
  }

  const { data: key, error: keyError } = await deps.db
    .from("partner_api_keys")
    .select("partner_id, key_prefix, key_hash, signing_secret_hash")
    .eq("key_prefix", parsed.prefix)
    .is("revoked_at", null)
    .maybeSingle();
  if (keyError) throw keyError;
  if (!key || !safeEqual(sha256Hex(parsed.fullKey), key.key_hash)) {
    throw new PartnerError("unauthorized", "API key is invalid or revoked.");
  }

  const { data: partner, error: partnerError } = await deps.db
    .from("partners")
    .select("id, name, slug, is_test, status, allowed_return_hosts, rate_limit_per_min, deck_limit_per_day")
    .eq("id", key.partner_id)
    .maybeSingle();
  if (partnerError) throw partnerError;
  if (!partner || partner.status !== "active") {
    throw new PartnerError("unauthorized", "API key is invalid or revoked.");
  }
  // A test key only authenticates a test partner and vice versa.
  if ((parsed.mode === "test") !== Boolean(partner.is_test)) {
    throw new PartnerError("unauthorized", "API key mode does not match this partner.");
  }

  return { partner: partner as Partner, key: key as KeyRow };
};

const verifySignature = (
  req: Request,
  key: KeyRow,
  pathname: string,
  rawBody: string,
  deps: PartnerDeps,
) => {
  const timestamp = req.headers.get("x-ssp-timestamp") || "";
  if (!/^\d{1,12}$/.test(timestamp)) {
    throw new PartnerError("timestamp_skew", "X-SSP-Timestamp must be the current unix time in seconds.");
  }
  const skew = Math.abs(Math.floor(deps.now() / 1000) - Number(timestamp));
  if (skew > MAX_TIMESTAMP_SKEW_SECONDS) {
    throw new PartnerError("timestamp_skew", "X-SSP-Timestamp is more than 300 seconds from server time.");
  }

  const provided = (req.headers.get("x-ssp-signature") || "").trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(provided)) {
    throw new PartnerError("invalid_signature", "X-SSP-Signature must be a hex HMAC-SHA256.");
  }

  // The plaintext signing secret only lives in the function env. Check it
  // against the stored hash so a stale or mistyped secret fails loudly.
  const secret = deps.env(signingSecretEnvName(key.key_prefix));
  if (!secret || !safeEqual(sha256Hex(secret), key.signing_secret_hash)) {
    logStep("Signing secret missing or mismatched", { key_prefix: key.key_prefix });
    throw new PartnerError("internal_error", "Request signing is not configured for this key. Contact support.");
  }

  const expected = hmacSha256Hex(secret, signatureBase(timestamp, req.method, pathname, rawBody));
  if (!safeEqual(expected, provided)) {
    throw new PartnerError("invalid_signature", "Signature does not match the request.");
  }
};

const takeRateLimit = async (partner: Partner, deps: PartnerDeps) => {
  const bucket = String(Math.floor(deps.now() / 60_000));
  try {
    const { data, error } = await deps.db.rpc("partner_rate_take", {
      p_partner: partner.id,
      p_bucket: bucket,
      p_limit: partner.rate_limit_per_min,
    });
    if (error) throw error;
    if (data === false) {
      throw new PartnerError("rate_limited", `Rate limit of ${partner.rate_limit_per_min} requests per minute exceeded.`, {
        "Retry-After": "60",
      });
    }
  } catch (error) {
    if (error instanceof PartnerError) throw error;
    // Fail open: a counter outage must not take the API down.
    logStep("Rate limiter unavailable, failing open", { partner: partner.slug, error: describeError(error) });
  }
};

const parseJsonBody = (rawBody: string): Record<string, unknown> => {
  if (!rawBody.trim()) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new PartnerError("validation_failed", "Request body is not valid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new PartnerError("validation_failed", "Request body must be a JSON object.");
  }
  return parsed as Record<string, unknown>;
};

const IDEMPOTENCY_KEY_PATTERN = /^[\x21-\x7e]{1,255}$/;

export const requestFingerprint = (method: string, pathname: string, rawBody: string) =>
  sha256Hex(`${method.toUpperCase()} ${pathname}\n${rawBody}`);

export const withPartner = (
  handler: PartnerHandler,
  options: { idempotent?: boolean } = {},
): PartnerRoute => {
  return async (req, params, injectedDeps) => {
    const deps = injectedDeps ?? defaultDeps();
    const requestId = newRequestId();
    const startedAt = deps.now();
    const pathname = canonicalPathname(req.url);
    const method = req.method.toUpperCase();
    const hasBody = method !== "GET" && method !== "DELETE";
    const idempotencyHeader = req.headers.get("idempotency-key");
    const idempotencyKey = options.idempotent && idempotencyHeader ? idempotencyHeader : null;

    let partner: Partner | null = null;
    let status = 500;
    let errorCode: string | null = null;
    const logFields: PartnerContext["log"] = {};

    try {
      const rawBody = hasBody ? await readCappedBody(req) : "";
      const auth = await authenticate(req, deps);
      partner = auth.partner;
      verifySignature(req, auth.key, pathname, rawBody, deps);
      await takeRateLimit(partner, deps);

      void deps.db
        .from("partner_api_keys")
        .update({ last_used_at: new Date(deps.now()).toISOString() })
        .eq("key_prefix", auth.key.key_prefix)
        .then(() => {}, () => {});

      const body = hasBody ? parseJsonBody(rawBody) : {};
      if (typeof body.external_user_id === "string") logFields.externalUserId = body.external_user_id;

      if (idempotencyKey !== null && !IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
        throw new PartnerError("validation_failed", "Idempotency-Key must be 1-255 printable ASCII characters.");
      }

      const fingerprint = requestFingerprint(method, pathname, rawBody);
      if (idempotencyKey) {
        const { data: prior, error: priorError } = await deps.db
          .from("partner_idempotency")
          .select("request_fingerprint, response_status, response_body")
          .eq("partner_id", partner.id)
          .eq("idempotency_key", idempotencyKey)
          .maybeSingle();
        if (priorError) throw priorError;
        if (prior) {
          if (prior.request_fingerprint !== fingerprint) {
            throw new PartnerError(
              "validation_failed",
              "Idempotency-Key was already used with a different request. Use a new key for a new request.",
            );
          }
          status = prior.response_status;
          return okRaw(requestId, prior.response_body, prior.response_status, { "Idempotent-Replayed": "true" });
        }
      }

      const ctx: PartnerContext = {
        partner,
        requestId,
        body,
        rawBody,
        idempotencyKey,
        db: deps.db,
        params,
        req,
        clientIp: clientIpOf(req),
        deps,
        log: logFields,
      };

      let result: HandlerResult;
      try {
        result = await handler(ctx);
      } catch (error) {
        if (!(error instanceof PartnerError)) throw error;
        // Deterministic 4xx outcomes are stored too, so a retry sees the same answer.
        result = { status: error.status, body: errorBody(error.code, error.message, requestId) };
        errorCode = error.code;
      }

      const bodyText = JSON.stringify(result.body);
      if (idempotencyKey && result.status < 500) {
        const { error: storeError } = await deps.db.from("partner_idempotency").upsert(
          {
            partner_id: partner.id,
            idempotency_key: idempotencyKey,
            request_fingerprint: fingerprint,
            response_status: result.status,
            response_body: bodyText,
          },
          { onConflict: "partner_id,idempotency_key", ignoreDuplicates: true },
        );
        if (storeError) logStep("Idempotency store failed", { request_id: requestId, error: storeError.message });
      }

      status = result.status;
      return okRaw(requestId, bodyText, result.status);
    } catch (error) {
      const partnerError = error instanceof PartnerError
        ? error
        : new PartnerError("internal_error", "An unexpected error occurred. Retry with the same Idempotency-Key.");
      if (!(error instanceof PartnerError)) {
        console.error(`[PARTNER-API] Unhandled error - ${JSON.stringify({ request_id: requestId, path: pathname, error: describeError(error) })}`);
      }
      status = partnerError.status;
      errorCode = partnerError.code;
      return fail(requestId, partnerError);
    } finally {
      const durationMs = deps.now() - startedAt;
      try {
        await deps.db.from("partner_api_log").insert({
          request_id: requestId,
          partner_id: partner?.id ?? null,
          method,
          path: pathname,
          status,
          external_user_id: logFields.externalUserId ?? null,
          idempotency_key: idempotencyKey,
          duration_ms: durationMs,
          error_code: errorCode,
        });
      } catch (logError) {
        logStep("Request log insert failed", { request_id: requestId, error: describeError(logError) });
      }
      logStep("Request", {
        request_id: requestId,
        partner: partner?.slug ?? null,
        method,
        path: pathname,
        status,
        error_code: errorCode,
        duration_ms: durationMs,
      });
    }
  };
};
