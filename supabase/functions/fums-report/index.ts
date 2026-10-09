// POST { events: [...] } -> { accepted, duplicates, forwarded }. Records every
// scripture display and forwards it to API.Bible once FUMS_ENDPOINT is set.
// See _shared/presenter/fums.ts for the open question about the endpoint.

import { createFumsForwarder, reportFumsEvents } from "../_shared/presenter/fums.ts";
import { json, presenterHandler } from "../_shared/presenter/http.ts";
import { createSupabasePresenterStore } from "../_shared/presenter/store.ts";

Deno.serve(presenterHandler("fums_report", async ({ req, userId, admin, body }) => {
  const endpoint = Deno.env.get("FUMS_ENDPOINT")?.trim();
  const result = await reportFumsEvents(
    { store: createSupabasePresenterStore(admin), forward: endpoint ? createFumsForwarder(endpoint) : null },
    { userId, body },
  );
  return result.ok ? json(req, result) : json(req, { error: result.error }, result.status);
}));
