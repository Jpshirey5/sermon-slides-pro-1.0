// GET /handoff?t=<token> — public. Served at <APP_URL>/handoff by the app
// worker (proxied here), and directly at /functions/v1/partner-handoff.
//
// Consumes the single-use handoff token, mints a one-time Supabase magic-link
// token_hash for the pastor, and immediately redirects the browser to the SPA's
// /handoff/complete route, which exchanges it for a session with
// supabase.auth.verifyOtp({ token_hash, type: "magiclink" }). The app keeps
// sessions in sessionStorage (src/integrations/supabase/client.ts), not
// cookies, so the session must be created in the browser: a server-side
// cookie session would never be seen by the app.
//
// The token_hash travels in the URL fragment: fragments are never sent to a
// server or in a Referer, the SPA strips it from history before doing
// anything else, and it is single-use.
//
// return_url is NOT put in a cookie: the SPA could not read an httpOnly one.
// It stays on the consumed handoff_tokens row, and partner-approve reads it
// server-side, so the browser can never choose where "send back" goes.

import { defaultDeps, type PartnerDeps } from "../_shared/partner/auth.ts";
import { sha256Hex } from "../_shared/partner/crypto.ts";
import { describeError, newRequestId } from "../_shared/partner/errors.ts";
import { getConfiguredAppOrigin } from "../_shared/app-url.ts";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

interface ConsumedHandoff {
  user_id: string;
  deck_id: string | null;
  return_url: string | null;
  partner_id: string;
}

export const handleHandoff = async (req: Request, injectedDeps?: PartnerDeps): Promise<Response> => {
  const deps = injectedDeps ?? defaultDeps();
  const requestId = newRequestId();
  const startedAt = deps.now();
  const appOrigin = getConfiguredAppOrigin();
  let partnerId: string | null = null;
  let errorCode: string | null = null;
  let status = 302;

  const redirect = (location: string) =>
    new Response(null, {
      status: 302,
      headers: {
        Location: location,
        "Referrer-Policy": "no-referrer",
        "Cache-Control": "no-store",
        "X-Request-Id": requestId,
      },
    });
  const toLogin = (reason: "expired" | "error") => redirect(`${appOrigin}/login?handoff=${reason}`);

  try {
    if (req.method !== "GET") {
      status = 405;
      errorCode = "method_not_allowed";
      return new Response(null, { status: 405, headers: { Allow: "GET", "Referrer-Policy": "no-referrer", "X-Request-Id": requestId } });
    }

    const token = new URL(req.url).searchParams.get("t") ?? "";
    if (!TOKEN_PATTERN.test(token)) {
      errorCode = "handoff_expired";
      return toLogin("expired");
    }

    // Validation and consumption are one UPDATE ... WHERE consumed_at IS NULL
    // AND expires_at > now(): a used, expired, or unknown token returns no row.
    const { data, error } = await deps.db.rpc("consume_handoff_token", { p_token_hash: sha256Hex(token) });
    if (error) throw error;
    const handoff = (Array.isArray(data) ? data[0] : null) as ConsumedHandoff | null;
    if (!handoff) {
      errorCode = "handoff_expired";
      return toLogin("expired");
    }
    partnerId = handoff.partner_id;

    const { data: seat, error: seatError } = await deps.db
      .from("partner_accounts")
      .select("entitlement_status")
      .eq("partner_id", handoff.partner_id)
      .eq("user_id", handoff.user_id)
      .maybeSingle();
    if (seatError) throw seatError;
    if (seat?.entitlement_status !== "active") {
      errorCode = "entitlement_inactive";
      return toLogin("expired");
    }

    const { data: userData, error: userError } = await deps.db.auth.admin.getUserById(handoff.user_id);
    if (userError || !userData?.user?.email) throw userError ?? new Error("Handoff user has no email");

    // auth-js 2.71 (edge) generateLink → properties.hashed_token; the browser
    // (auth-js 2.95) redeems it with verifyOtp({ token_hash, type: "magiclink" }).
    const { data: link, error: linkError } = await deps.db.auth.admin.generateLink({
      type: "magiclink",
      email: userData.user.email,
    });
    const tokenHash = link?.properties?.hashed_token;
    if (linkError || !tokenHash) throw linkError ?? new Error("generateLink returned no hashed_token");

    const { data: partner } = await deps.db.from("partners").select("name").eq("id", handoff.partner_id).maybeSingle();

    const fragment = new URLSearchParams({
      token_hash: tokenHash,
      next: handoff.deck_id ? `/editor/${handoff.deck_id}` : "/dashboard",
      partner: partner?.name ?? "",
    });
    if (handoff.deck_id) fragment.set("deck", handoff.deck_id);
    if (handoff.return_url) fragment.set("can_return", "1");

    return redirect(`${appOrigin}/handoff/complete#${fragment.toString()}`);
  } catch (error) {
    // Never a 500 page for the pastor: send them somewhere that explains what to do.
    console.error(`[PARTNER-HANDOFF] Handoff failed - ${JSON.stringify({ request_id: requestId, error: describeError(error) })}`);
    errorCode = "internal_error";
    return toLogin("error");
  } finally {
    try {
      await deps.db.from("partner_api_log").insert({
        request_id: requestId,
        partner_id: partnerId,
        method: "GET",
        path: "/handoff",
        status,
        duration_ms: deps.now() - startedAt,
        error_code: errorCode,
      });
    } catch {
      // audit log is best effort
    }
  }
};
