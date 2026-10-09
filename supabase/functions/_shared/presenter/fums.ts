// FUMS: every display of scripture is reported. The presenter queues one event
// per FUMS token each time a scripture slide goes on screen, and sends them in
// batches. We record every event in fums_events (idempotent by
// client_event_id) and forward it to API.Bible.
//
// OPEN QUESTION (flagged in the plan): API.Bible's FUMS v3 endpoint and
// parameters still need confirming. Until FUMS_ENDPOINT is set, events are
// recorded and left unforwarded (forwarded_at null), so nothing is lost and
// they can be sent once the endpoint is confirmed.

import { minuteBucket } from "./access.ts";
import type { FumsEventRow, PresenterStore } from "./store.ts";

export const FUMS_LIMITS = {
  maxEventsPerBatch: 200,
  perUserPerMinute: 30,
  /** Offline presenters may send old events. Older than this is refused. */
  maxAgeMs: 30 * 24 * 60 * 60 * 1000,
  /** Small allowance for client clock drift. */
  maxFutureMs: 5 * 60 * 1000,
};

export interface FumsEventInput {
  client_event_id: string;
  fums_token: string;
  translation_id: string;
  device_id: string;
  session_id: string;
  displayed_at: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHORT_ID = /^[A-Za-z0-9._:-]{1,128}$/;

export type ValidateResult = { ok: true; events: FumsEventInput[] } | { ok: false; error: string };

export function validateFumsBatch(body: unknown, now: Date = new Date()): ValidateResult {
  if (!body || typeof body !== "object" || !Array.isArray((body as { events?: unknown }).events)) {
    return { ok: false, error: "events must be an array" };
  }
  const raw = (body as { events: unknown[] }).events;
  if (raw.length === 0) return { ok: true, events: [] };
  if (raw.length > FUMS_LIMITS.maxEventsPerBatch) return { ok: false, error: "too many events" };

  const events: FumsEventInput[] = [];
  for (const [i, e] of raw.entries()) {
    if (!e || typeof e !== "object") return { ok: false, error: `event ${i} is not an object` };
    const ev = e as Record<string, unknown>;
    const s = (k: string) => (typeof ev[k] === "string" ? (ev[k] as string).trim() : "");
    const event: FumsEventInput = {
      client_event_id: s("client_event_id"),
      fums_token: s("fums_token"),
      translation_id: s("translation_id").toUpperCase(),
      device_id: s("device_id"),
      session_id: s("session_id"),
      displayed_at: s("displayed_at"),
    };
    if (!UUID.test(event.client_event_id)) return { ok: false, error: `event ${i}: bad client_event_id` };
    if (!event.fums_token || event.fums_token.length > 512) return { ok: false, error: `event ${i}: bad fums_token` };
    if (!/^[A-Z0-9]{1,16}$/.test(event.translation_id)) return { ok: false, error: `event ${i}: bad translation_id` };
    if (!SHORT_ID.test(event.device_id) || !SHORT_ID.test(event.session_id)) {
      return { ok: false, error: `event ${i}: bad device or session id` };
    }
    const shown = new Date(event.displayed_at).getTime();
    if (Number.isNaN(shown)) return { ok: false, error: `event ${i}: bad displayed_at` };
    if (shown > now.getTime() + FUMS_LIMITS.maxFutureMs || shown < now.getTime() - FUMS_LIMITS.maxAgeMs) {
      return { ok: false, error: `event ${i}: displayed_at out of range` };
    }
    events.push({ ...event, displayed_at: new Date(shown).toISOString() });
  }
  return { ok: true, events };
}

export type Forwarder = (event: FumsEventRow) => Promise<{ ok: boolean; error?: string }>;

/**
 * Forwarder for API.Bible's FUMS endpoint, built from FUMS_ENDPOINT. Uses the
 * parameter names in API.Bible's FUMS v3 docs as we understand them
 * (t, dId, sId, uId); confirm before setting the secret.
 */
export function createFumsForwarder(endpoint: string, doFetch: typeof fetch = fetch): Forwarder {
  return async (event) => {
    const url = new URL(endpoint);
    url.searchParams.set("t", event.fums_token);
    url.searchParams.set("dId", event.device_id);
    url.searchParams.set("sId", event.session_id);
    url.searchParams.set("uId", event.user_id);
    try {
      const response = await doFetch(url, { method: "GET", signal: AbortSignal.timeout(5000) });
      await response.body?.cancel();
      return response.ok ? { ok: true } : { ok: false, error: `status_${response.status}` };
    } catch {
      return { ok: false, error: "network" };
    }
  };
}

export type ReportResult =
  | { ok: true; accepted: number; duplicates: number; forwarded: number }
  | { ok: false; status: 400 | 403 | 429; error: string };

export async function reportFumsEvents(
  deps: { store: PresenterStore; forward: Forwarder | null; now?: () => Date },
  request: { userId: string; body: unknown },
): Promise<ReportResult> {
  const now = deps.now?.() ?? new Date();
  const validated = validateFumsBatch(request.body, now);
  if (!validated.ok) return { ok: false, status: 400, error: validated.error };
  if (validated.events.length === 0) return { ok: true, accepted: 0, duplicates: 0, forwarded: 0 };

  // A presenter belongs to one church; report against the caller's account.
  const accounts = await deps.store.getMemberAccountIds(request.userId);
  if (accounts.length === 0) return { ok: false, status: 403, error: "no_account" };
  if (!(await deps.store.rateTake(`user:${request.userId}`, minuteBucket("fums", now), FUMS_LIMITS.perUserPerMinute))) {
    return { ok: false, status: 429, error: "rate_limited" };
  }

  const rows: FumsEventRow[] = validated.events.map((e) => ({ ...e, account_id: accounts[0], user_id: request.userId }));
  const inserted = await deps.store.insertFumsEvents(rows);

  let forwarded = 0;
  if (deps.forward && inserted.length > 0) {
    const byClientId = new Map(rows.map((r) => [r.client_event_id, r]));
    const results = [];
    for (const row of inserted) {
      const result = await deps.forward(byClientId.get(row.client_event_id)!);
      if (result.ok) forwarded++;
      results.push({ id: row.id, ...result });
    }
    await deps.store.markFumsForwarded(results);
  }

  return { ok: true, accepted: inserted.length, duplicates: rows.length - inserted.length, forwarded };
}
