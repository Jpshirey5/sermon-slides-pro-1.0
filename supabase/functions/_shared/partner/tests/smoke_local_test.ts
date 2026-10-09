// deno test -A --no-lock --node-modules-dir=none supabase/functions/_shared/partner/tests/smoke_local_test.ts
//
// Runs scripts/partner-smoke-test.ts, unmodified, over real HTTP against an
// in-process server that routes exactly like production (worker paths
// /api/partner/v1/* and /handoff) onto the real handlers, backed by the
// PGlite test database. It proves the acceptance script and the API agree;
// it does NOT replace running the script against a deployed instance.

import { assertEquals } from "./assert.ts";
import { createHarness } from "./harness.ts";
import { handlePartnerRequest } from "../../../partner-api/router.ts";
import { handleHandoff } from "../../../partner-handoff/handler.ts";
import { runSmokeTest } from "../../../../../scripts/partner-smoke-test.ts";

for (const direct of [false, true]) Deno.test(`smoke test passes end to end over HTTP (${direct ? "direct function URLs" : "app proxy paths"})`, async () => {
  const h = await createHarness({ runBackgroundImmediately: true });
  const partner = await h.createPartner({ slug: "smoke", hosts: ["app.partner.example"], isTest: true });

  const server = Deno.serve({ port: 0, hostname: "127.0.0.1", onListen: () => {} }, (req) => {
    const { pathname } = new URL(req.url);
    if (pathname.startsWith("/api/partner/v1/") || pathname.startsWith("/functions/v1/partner-api/v1/")) {
      return handlePartnerRequest(req, h.deps);
    }
    if (pathname === "/handoff" || pathname === "/functions/v1/partner-handoff") return handleHandoff(req, h.deps);
    return new Response("not found", { status: 404 });
  });
  const origin = `http://127.0.0.1:${server.addr.port}`;
  const previousSiteUrl = Deno.env.get("SITE_URL");
  Deno.env.set("SITE_URL", origin);

  const lines: string[] = [];
  try {
    const result = await runSmokeTest({
      baseUrl: origin,
      apiBase: direct ? `${origin}/functions/v1/partner-api` : undefined,
      handoffBase: direct ? `${origin}/functions/v1/partner-handoff` : undefined,
      apiKey: partner.apiKey,
      signingSecret: partner.secret,
      returnHost: "app.partner.example",
      emailDomain: "example.com",
      downloadFiles: false,
      deckTimeoutMs: 20_000,
      exportTimeoutMs: 20_000,
      log: (line) => lines.push(line),
    });
    console.log(lines.join("\n"));
    assertEquals(result.failed, 0, "every smoke check passes");
  } finally {
    if (previousSiteUrl) Deno.env.set("SITE_URL", previousSiteUrl);
    await server.shutdown();
  }
});
