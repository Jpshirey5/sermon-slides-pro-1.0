// Partner API acceptance test. Acts as a fake partner against a running
// instance and walks the whole integration. Nothing ships until this passes.
//
//   SSP_BASE_URL=https://www.sermonslidepro.com \
//   SSP_API_KEY=ssp_test_... \
//   SSP_SIGNING_SECRET=... \
//   SSP_RETURN_HOST=app.partner.example \
//     deno run --allow-net --allow-env scripts/partner-smoke-test.ts
//
// Before the app worker is deployed, point straight at the edge functions
// (requests are still signed over /api/partner/v1/..., which the API accepts):
//   SSP_API_BASE=https://<ref>.supabase.co/functions/v1/partner-api
//   SSP_HANDOFF_BASE=https://<ref>.supabase.co/functions/v1/partner-handoff
//
// SSP_RETURN_HOST must be on the key's partner allowlist (issue the key with
// --hosts). Use a test partner key: the run provisions a real (passwordless,
// unconfirmed) user at SSP_SMOKE_EMAIL_DOMAIN (default example.com), creates a
// deck and an export, then revokes the seat. Prints PASS/FAIL per check and
// exits nonzero on any failure.

import { createHmac } from "node:crypto";

export interface SmokeConfig {
  baseUrl: string;
  /** Where /v1/... API calls are sent. Defaults to <baseUrl>/api/partner. */
  apiBase?: string;
  /** Replaces <origin>/handoff in minted session URLs (direct function URL). */
  handoffBase?: string;
  apiKey: string;
  signingSecret: string;
  returnHost: string;
  emailDomain: string;
  /** Download each export file and check its bytes (off for the in-process run). */
  downloadFiles: boolean;
  deckTimeoutMs: number;
  exportTimeoutMs: number;
  log: (line: string) => void;
}

interface ApiResponse {
  status: number;
  // deno-lint-ignore no-explicit-any
  body: any;
  headers: Headers;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const runSmokeTest = async (config: SmokeConfig): Promise<{ passed: number; failed: number }> => {
  const base = config.baseUrl.replace(/\/+$/, "");
  const apiBase = (config.apiBase ?? `${base}/api/partner`).replace(/\/+$/, "");
  const handoffUrl = (url: string) => {
    if (!config.handoffBase) return url;
    const minted = new URL(url);
    return `${config.handoffBase.replace(/\/+$/, "")}${minted.search}`;
  };
  let passed = 0;
  let failed = 0;

  const check = (name: string, ok: boolean, detail?: unknown) => {
    if (ok) passed++;
    else failed++;
    config.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && detail !== undefined ? `\n        ${JSON.stringify(detail)}` : ""}`);
    return ok;
  };

  const sign = (timestamp: string, method: string, pathname: string, rawBody: string) =>
    createHmac("sha256", config.signingSecret).update(`${timestamp}.${method}.${pathname}.${rawBody}`).digest("hex");

  const api = async (
    method: "GET" | "POST" | "DELETE",
    path: string,
    body?: unknown,
    options: { signature?: string; idempotencyKey?: string } = {},
  ): Promise<ApiResponse> => {
    const pathname = `/api/partner/v1${path}`;
    const rawBody = method === "POST" ? JSON.stringify(body ?? {}) : "";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const headers: Record<string, string> = {
      Authorization: `Bearer ${config.apiKey}`,
      "X-SSP-Timestamp": timestamp,
      "X-SSP-Signature": options.signature ?? sign(timestamp, method, pathname, rawBody),
    };
    if (method === "POST") headers["Content-Type"] = "application/json";
    if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;
    const response = await fetch(`${apiBase}/v1${path}`, { method, headers, body: method === "POST" ? rawBody : undefined });
    const text = await response.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    return { status: response.status, body: parsed, headers: response.headers };
  };

  const poll = async (path: string, done: (body: ApiResponse["body"]) => boolean, timeoutMs: number) => {
    const deadline = Date.now() + timeoutMs;
    let last: ApiResponse = await api("GET", path);
    while (!done(last.body) && Date.now() < deadline) {
      await sleep(Math.min(Math.max(Number(last.body?.poll_after_ms) || 3000, 250), 10_000));
      last = await api("GET", path);
    }
    return last;
  };

  const run = Date.now().toString(36);
  const externalUserId = `smoke-${run}`;
  const email = `ssp-smoke+${run}@${config.emailDomain}`;
  const returnUrl = `https://${config.returnHost}/ssp-smoke/${run}`;

  config.log(`Partner API smoke test — ${base} — run ${run}\n`);

  // Themes
  const theme = await api("POST", "/themes", {
    external_theme_id: `smoke-theme-${run}`,
    church_name: "Smoke Test Church",
    config: { background: "#101820", text_color: "#F2AA4C", font_family: "Georgia", default_translation: "KJV" },
  });
  check("create theme → 201", theme.status === 201 && Boolean(theme.body?.theme_id), theme.body);
  const themeRead = await api("GET", `/themes/smoke-theme-${run}`);
  check("read theme → 200 with the same id", themeRead.status === 200 && themeRead.body?.theme_id === theme.body?.theme_id, themeRead.body);

  // Accounts
  const seat = await api("POST", "/accounts", {
    external_user_id: externalUserId,
    email,
    name: "Smoke Test Pastor",
    church_name: "Smoke Test Church",
    role: "Lead Pastor",
    theme_id: `smoke-theme-${run}`,
  });
  check("provision seat → 201 created", seat.status === 201 && seat.body?.created === true, seat.body);
  const again = await api("POST", "/accounts", { external_user_id: externalUserId, email });
  check(
    "re-provision is idempotent → 200, same user, created=false",
    again.status === 200 && again.body?.ssp_user_id === seat.body?.ssp_user_id && again.body?.created === false,
    again.body,
  );
  const seatRead = await api("GET", `/accounts/${externalUserId}`);
  check("read seat → 200", seatRead.status === 200 && seatRead.body?.entitlement_status === "active", seatRead.body);
  const unknown = await api("GET", `/accounts/smoke-nobody-${run}`);
  check("unknown seat → 404 account_not_provisioned", unknown.status === 404 && unknown.body?.error?.code === "account_not_provisioned", unknown.body);

  // Signing
  const forged = await api("GET", `/accounts/${externalUserId}`, undefined, { signature: "0".repeat(64) });
  check("bad signature → 401 invalid_signature", forged.status === 401 && forged.body?.error?.code === "invalid_signature", forged.body);
  check("errors carry X-Request-Id", /^req_/.test(forged.headers.get("x-request-id") ?? "") && forged.body?.error?.request_id === forged.headers.get("x-request-id"));

  // Decks
  const deck = await api("POST", "/decks", {
    external_user_id: externalUserId,
    title: "Smoke Test Sermon",
    scripture_ref: "John 3:16",
    service_date: new Date().toISOString().slice(0, 10),
    big_idea: "God so loved the world",
    points: [
      { heading: "God loves", refs: ["John 3:16"] },
      { heading: "God gives", refs: ["Romans 6:23"] },
    ],
  }, { idempotencyKey: `smoke-deck-${run}` });
  check("submit deck → 201 queued", deck.status === 201 && deck.body?.status === "queued" && Boolean(deck.body?.deck_id), deck.body);
  const deckId = deck.body?.deck_id;

  const ready = deckId
    ? await poll(`/decks/${deckId}`, (b) => b?.status === "ready" || b?.status === "failed", config.deckTimeoutMs)
    : null;
  check("deck reaches ready", ready?.body?.status === "ready", ready?.body);
  check(
    "completeness has a numeric score in 0..1 with its formula",
    typeof ready?.body?.completeness?.score === "number" &&
      ready.body.completeness.score >= 0 && ready.body.completeness.score <= 1 &&
      typeof ready.body.completeness.formula === "string",
    ready?.body?.completeness,
  );

  // Sessions and handoff
  const session = await api("POST", "/sessions", { external_user_id: externalUserId, deck_id: deckId, return_url: returnUrl });
  check("mint session URL → 201", session.status === 201 && typeof session.body?.url === "string" && session.body?.expires_in === 300, session.body);
  const offList = await api("POST", "/sessions", { external_user_id: externalUserId, return_url: "https://not-allowlisted.invalid/back" });
  check("return_url off the allowlist → 400 invalid_return_url", offList.status === 400 && offList.body?.error?.code === "invalid_return_url", offList.body);

  if (typeof session.body?.url === "string") {
    const first = await fetch(handoffUrl(session.body.url), { redirect: "manual" });
    await first.body?.cancel();
    const firstLocation = first.headers.get("location") ?? "";
    check(
      "handoff URL redirects into the app",
      first.status >= 300 && first.status < 400 && firstLocation.includes("/handoff/complete#") && firstLocation.includes("token_hash="),
      { status: first.status, location: firstLocation.replace(/token_hash=[^&]+/, "token_hash=…") },
    );
    check("handoff sets Referrer-Policy: no-referrer", first.headers.get("referrer-policy") === "no-referrer");
    const second = await fetch(handoffUrl(session.body.url), { redirect: "manual" });
    await second.body?.cancel();
    check(
      "handoff URL used twice → redirected as expired",
      second.status >= 300 && second.status < 400 && (second.headers.get("location") ?? "").includes("/login?handoff=expired"),
      { status: second.status, location: second.headers.get("location") },
    );
  } else {
    check("handoff URL redirects into the app", false, "no session URL");
    check("handoff URL used twice → redirected as expired", false, "no session URL");
  }

  // Exports
  const exp = deckId ? await api("POST", `/decks/${deckId}/exports`, { formats: ["pro7", "pptx"] }) : null;
  check("request export → 201 queued", exp?.status === 201 && exp.body?.status === "queued", exp?.body);
  const exportReady = exp?.body?.export_id
    ? await poll(`/exports/${exp.body.export_id}`, (b) => b?.status === "ready" || b?.status === "failed", config.exportTimeoutMs)
    : null;
  const formats = (exportReady?.body?.files ?? []).map((f: { format: string }) => f.format).sort();
  check("export ready with pro7 and pptx", exportReady?.body?.status === "ready" && formats.join(",") === "pptx,pro7", exportReady?.body);
  if (config.downloadFiles) {
    for (const file of exportReady?.body?.files ?? []) {
      const download = await fetch(file.url);
      const bytes = new Uint8Array(await download.arrayBuffer());
      check(
        `${file.format} download is a zip of the advertised size`,
        download.ok && bytes.length === file.bytes && bytes[0] === 0x50 && bytes[1] === 0x4b,
        { status: download.status, bytes: bytes.length, advertised: file.bytes },
      );
    }
  }

  // Revocation
  const revoke = await api("DELETE", `/accounts/${externalUserId}/entitlement`);
  check("revoke seat → 200 revoked", revoke.status === 200 && revoke.body?.entitlement_status === "revoked", revoke.body);
  const blocked = await api("POST", "/sessions", { external_user_id: externalUserId });
  check("revoked seat cannot mint a session → 403 entitlement_inactive", blocked.status === 403 && blocked.body?.error?.code === "entitlement_inactive", blocked.body);
  const stillThere = await api("GET", `/accounts/${externalUserId}`);
  check("revoked seat still resolves (account kept) → 200", stillThere.status === 200 && stillThere.body?.entitlement_status === "revoked", stillThere.body);

  config.log(`\n${passed} passed, ${failed} failed`);
  return { passed, failed };
};

if (import.meta.main) {
  const required = (name: string) => {
    const value = Deno.env.get(name);
    if (!value) {
      console.error(`error: ${name} is not set`);
      Deno.exit(2);
    }
    return value;
  };
  const result = await runSmokeTest({
    baseUrl: required("SSP_BASE_URL"),
    apiBase: Deno.env.get("SSP_API_BASE") || undefined,
    handoffBase: Deno.env.get("SSP_HANDOFF_BASE") || undefined,
    apiKey: required("SSP_API_KEY"),
    signingSecret: required("SSP_SIGNING_SECRET"),
    returnHost: required("SSP_RETURN_HOST"),
    emailDomain: Deno.env.get("SSP_SMOKE_EMAIL_DOMAIN") || "example.com",
    downloadFiles: Deno.env.get("SSP_SMOKE_SKIP_DOWNLOAD") !== "1",
    deckTimeoutMs: Number(Deno.env.get("SSP_SMOKE_DECK_TIMEOUT_MS") || 180_000),
    exportTimeoutMs: Number(Deno.env.get("SSP_SMOKE_EXPORT_TIMEOUT_MS") || 180_000),
    log: (line) => console.log(line),
  });
  Deno.exit(result.failed === 0 ? 0 : 1);
}
