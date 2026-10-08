// POST { service_id, translation_ids } -> PresenterStatus. Polled by the
// presenter about once a minute. Returns no scripture.

import { json, presenterHandler, resolverDeps, UUID_RE } from "../_shared/presenter/http.ts";
import { buildPresenterStatus } from "../_shared/presenter/status.ts";
import { createSupabasePresenterStore } from "../_shared/presenter/store.ts";

Deno.serve(presenterHandler("presenter_status", async ({ req, userId, admin, body }) => {
  const b = body as { service_id?: unknown; translation_ids?: unknown };
  const serviceId = String(b.service_id ?? "");
  const translationIds = Array.isArray(b.translation_ids) ? b.translation_ids.filter((t): t is string => typeof t === "string") : [];
  if (!UUID_RE.test(serviceId)) return json(req, { error: "bad_request" }, 400);

  const result = await buildPresenterStatus(
    { store: createSupabasePresenterStore(admin), resolver: resolverDeps(admin) },
    { userId, serviceId, translationIds },
  );
  return result.ok ? json(req, result.status) : json(req, { error: result.error }, result.status);
}));
