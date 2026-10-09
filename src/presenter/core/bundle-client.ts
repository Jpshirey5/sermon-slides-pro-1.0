// Talking to the presenter endpoints. The call function is injected (the
// Supabase client's functions.invoke in the browser), so this module has no
// framework or SDK dependency.
//
// The bundle lives in memory only. It is never written to localStorage or
// IndexedDB in this phase, because it contains licensed text.

import type { FumsEvent, SendOutcome } from "./fums-queue";
import type { PresenterStatus, ServiceBundle } from "./types";

export type InvokeResult = { data: unknown; error: null } | { data: null; error: { status?: number; message: string } };
export type Invoke = (fn: string, body: unknown) => Promise<InvokeResult>;

export type BundleFetchError = "not_found" | "plan_required" | "rate_limited" | "too_large" | "network" | "server";

export type BundleFetch = { ok: true; bundle: ServiceBundle } | { ok: false; error: BundleFetchError };

function classify(status: number | undefined): BundleFetchError {
  if (status === 404) return "not_found";
  if (status === 403) return "plan_required";
  if (status === 429) return "rate_limited";
  if (status === 422) return "too_large";
  if (status === undefined || status === 0) return "network";
  return "server";
}

function looksLikeBundle(value: unknown): value is ServiceBundle {
  const v = value as ServiceBundle;
  return Boolean(v && v.service && Array.isArray(v.items) && typeof v.bundle_expires_at === "string");
}

/** Fill in fields an older server may not send yet, so the presenter never crashes on them. */
export function normalizeBundle(bundle: ServiceBundle): ServiceBundle {
  return {
    ...bundle,
    items: bundle.items.map((item) => ({
      ...item,
      stage: item.stage ?? { template: item.type === "sermon" ? "message" : "simple", timer_seconds: null },
      slides: Array.isArray(item.slides) ? item.slides : [],
      translation_ids: Array.isArray(item.translation_ids) ? item.translation_ids : [],
    })),
  };
}

export async function fetchBundle(invoke: Invoke, serviceId: string): Promise<BundleFetch> {
  try {
    const res = await invoke("service-bundle", { service_id: serviceId });
    if (res.error) return { ok: false, error: classify(res.error.status) };
    return looksLikeBundle(res.data) ? { ok: true, bundle: normalizeBundle(res.data) } : { ok: false, error: "server" };
  } catch {
    return { ok: false, error: "network" };
  }
}

export async function fetchStatus(
  invoke: Invoke,
  serviceId: string,
  translationIds: readonly string[],
): Promise<PresenterStatus | null> {
  try {
    const res = await invoke("presenter-status", { service_id: serviceId, translation_ids: translationIds });
    if (res.error || !res.data || typeof (res.data as PresenterStatus).revocation_epoch !== "number") return null;
    return res.data as PresenterStatus;
  } catch {
    return null;
  }
}

/** Sender for the FUMS queue. 400 means the batch is malformed; drop it rather than retry forever. */
export function createFumsSender(invoke: Invoke): (events: FumsEvent[]) => Promise<SendOutcome> {
  return async (events) => {
    try {
      const res = await invoke("fums-report", { events });
      if (!res.error) return "accepted";
      return res.error.status === 400 ? "rejected" : "retry";
    } catch {
      return "retry";
    }
  };
}

/** Every translation whose text is in the bundle, for status polling. */
export function bundleTranslationIds(bundle: ServiceBundle): string[] {
  return [...new Set(bundle.items.flatMap((i) => i.translation_ids))].sort();
}

export interface StatusChange {
  /** Translations that became unavailable since the last check. */
  newlyUnavailable: string[];
  epochChanged: boolean;
  canPresent: boolean;
}

/** Compare a fresh status to what we knew. Pure, so the poll loop stays trivial. */
export function diffStatus(previous: { epoch: number; unavailable: ReadonlySet<string> }, status: PresenterStatus): StatusChange {
  return {
    newlyUnavailable: status.unavailable_translations.filter((t) => !previous.unavailable.has(t)),
    epochChanged: status.revocation_epoch !== previous.epoch,
    canPresent: status.can_present,
  };
}
