// PARTNER API — the error contract. Every error response is
//   { "error": { "code": "...", "message": "...", "request_id": "req_..." } }
// and every response (success or error) carries X-Request-Id.

import { randomBytes } from "node:crypto";

export const ERROR_STATUS = {
  unauthorized: 401,
  invalid_signature: 401,
  timestamp_skew: 401,
  rate_limited: 429,
  validation_failed: 422,
  account_not_provisioned: 404,
  account_already_exists: 409,
  email_conflict: 409,
  entitlement_inactive: 403,
  deck_not_found: 404,
  deck_not_ready: 409,
  export_not_found: 404,
  theme_not_found: 404,
  invalid_return_url: 400,
  payload_too_large: 413,
  quota_exceeded: 429,
  internal_error: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

export class PartnerError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly headers: Record<string, string>;

  constructor(code: ErrorCode, message: string, headers: Record<string, string> = {}) {
    super(message);
    this.name = "PartnerError";
    this.code = code;
    this.status = ERROR_STATUS[code];
    this.headers = headers;
  }
}

export const newRequestId = (): string => `req_${randomBytes(12).toString("hex")}`;

const baseHeaders = (requestId: string, extra: Record<string, string> = {}) => ({
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "X-Request-Id": requestId,
  ...extra,
});

export const ok = (
  requestId: string,
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response => okRaw(requestId, JSON.stringify(body), status, headers);

/** Respond with an already-serialized JSON body (idempotent replays). */
export const okRaw = (
  requestId: string,
  bodyText: string,
  status = 200,
  headers: Record<string, string> = {},
): Response => new Response(bodyText, { status, headers: baseHeaders(requestId, headers) });

export const errorBody = (code: ErrorCode, message: string, requestId: string) => ({
  error: { code, message, request_id: requestId },
});

export const fail = (requestId: string, error: PartnerError): Response =>
  new Response(JSON.stringify(errorBody(error.code, error.message, requestId)), {
    status: error.status,
    headers: baseHeaders(requestId, error.headers),
  });

/** Readable one-line description for logs (Supabase errors are plain objects, not Errors). */
export const describeError = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const { message, code } = error as { message?: unknown; code?: unknown };
    return code ? `${String(message)} (${String(code)})` : String(message);
  }
  return String(error);
};
