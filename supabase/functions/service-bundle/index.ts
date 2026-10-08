// POST { service_id } -> ServiceBundle for one service. See
// _shared/presenter/bundle.ts for the checks (membership, paying plan, rate
// limits, caps) and why there is no way to request arbitrary scripture here.

import { buildServiceBundle } from "../_shared/presenter/bundle.ts";
import { json, presenterHandler, resolverDeps, UUID_RE } from "../_shared/presenter/http.ts";
import { createSupabasePresenterStore } from "../_shared/presenter/store.ts";

Deno.serve(presenterHandler("service_bundle", async ({ req, userId, admin, body }) => {
  const serviceId = String((body as { service_id?: unknown }).service_id ?? "");
  if (!UUID_RE.test(serviceId)) return json(req, { error: "bad_request" }, 400);

  const result = await buildServiceBundle(
    { store: createSupabasePresenterStore(admin), resolver: resolverDeps(admin) },
    { userId, serviceId },
  );
  return result.ok ? json(req, result.bundle) : json(req, { error: result.error }, result.status);
}));
