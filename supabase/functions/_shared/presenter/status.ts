// Cheap check the presenter polls about once a minute: has anything been
// turned off since the bundle loaded, and may this church still present?
// Returns no scripture.

import { checkTranslation, type ResolverDeps } from "../scripture/resolver.ts";
import { accountCanPresent, minuteBucket } from "./access.ts";
import type { PresenterStore } from "./store.ts";
import type { PresenterStatus } from "./types.ts";

export const STATUS_LIMITS = { perUserPerMinute: 10, maxTranslations: 30 };

export type StatusResult =
  | { ok: true; status: PresenterStatus }
  | { ok: false; status: 400 | 404 | 429; error: "bad_request" | "not_found" | "rate_limited" };

export async function buildPresenterStatus(
  deps: { store: PresenterStore; resolver: ResolverDeps; now?: () => Date },
  request: { userId: string; serviceId: string; translationIds: readonly string[] },
): Promise<StatusResult> {
  const now = deps.now?.() ?? new Date();
  const ids = [...new Set(request.translationIds.map((t) => t.trim().toUpperCase()).filter(Boolean))];
  if (ids.length > STATUS_LIMITS.maxTranslations || ids.some((t) => !/^[A-Z0-9]{1,16}$/.test(t))) {
    return { ok: false, status: 400, error: "bad_request" };
  }

  const service = await deps.store.getService(request.serviceId);
  if (!service || !(await deps.store.isMember(request.userId, service.account_id))) {
    return { ok: false, status: 404, error: "not_found" };
  }
  if (!(await deps.store.rateTake(`user:${request.userId}`, minuteBucket("status", now), STATUS_LIMITS.perUserPerMinute))) {
    return { ok: false, status: 429, error: "rate_limited" };
  }

  const unavailable: string[] = [];
  for (const id of ids) {
    const check = await checkTranslation(deps.resolver, service.account_id, id);
    if (!check.ok) unavailable.push(id);
  }

  return {
    ok: true,
    status: {
      revocation_epoch: await deps.store.getRevocationEpoch(),
      unavailable_translations: unavailable.sort(),
      can_present: accountCanPresent(await deps.store.getAccountPlan(service.account_id), now),
      checked_at: now.toISOString(),
    },
  };
}
