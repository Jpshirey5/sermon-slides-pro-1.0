// POST /functions/v1/partner-approve { deck_id } — called by the signed-in
// pastor from the deck editor's "Approve and send back" control.
//
// Stamps approved_at, queues an export if the partner does not already have
// one of the current slides, and returns the partner's return URL with
// ?ssp_deck_id=<id>. The return URL is read server-side from the consumed
// handoff that brought this pastor in and re-checked against the partner's
// CURRENT allowlist, so the browser never supplies a redirect target.
// No callback is made to the partner; they learn about approval by polling.

import { defaultDeps, type PartnerDeps } from "../_shared/partner/auth.ts";
import { createAndQueueExport } from "../_shared/partner/adapters.ts";
import { describeError, newRequestId } from "../_shared/partner/errors.ts";
import { validateReturnUrl } from "../_shared/partner/returnUrl.ts";
import { UUID_PATTERN } from "../_shared/partner/seats.ts";

const HANDOFF_RETURN_WINDOW_MS = 12 * 60 * 60 * 1000;
const DEFAULT_APPROVAL_FORMATS = ["pro7", "pptx"] as const;

const ALLOWED_ORIGINS = [
  "https://sermonslidepro.com",
  "https://www.sermonslidepro.com",
  "http://localhost:8080",
  "http://localhost:5173",
];

export const handleApprove = async (req: Request, injectedDeps?: PartnerDeps): Promise<Response> => {
  const deps = injectedDeps ?? defaultDeps();
  const origin = req.headers.get("origin") ?? "";
  const corsHeaders = {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : "https://sermonslidepro.com",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };
  const requestId = newRequestId();
  const startedAt = deps.now();
  let partnerId: string | null = null;
  let errorCode: string | null = null;
  let status = 200;

  const json = (body: unknown, code = 200) => {
    status = code;
    return new Response(JSON.stringify(body), {
      status: code,
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store", "X-Request-Id": requestId },
    });
  };
  const failWith = (code: number, error: string, message: string) => {
    errorCode = error;
    return json({ error, message }, code);
  };

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (req.method !== "POST") return failWith(405, "method_not_allowed", "Use POST.");

    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    const { data: userData, error: userError } = token ? await deps.db.auth.getUser(token) : { data: null, error: true };
    const userId = userData?.user?.id;
    if (userError || !userId) return failWith(401, "unauthorized", "Sign in again to approve this deck.");

    const body = await req.json().catch(() => ({}));
    const deckId = typeof body?.deck_id === "string" ? body.deck_id.toLowerCase() : "";
    if (!UUID_PATTERN.test(deckId)) return failWith(422, "validation_failed", "deck_id must be a uuid.");

    const { data: deck, error: deckError } = await deps.db
      .from("sermons")
      .select("id, partner_id, account_id, created_by_user_id, updated_at, generation_status")
      .eq("id", deckId)
      .maybeSingle();
    if (deckError) throw deckError;
    const notFound = () => failWith(404, "deck_not_found", "This deck was not created through a partner app.");
    if (!deck || !deck.partner_id) return notFound();
    partnerId = deck.partner_id;

    if (deck.created_by_user_id !== userId) {
      const { data: member } = await deps.db
        .from("account_members")
        .select("id")
        .eq("account_id", deck.account_id)
        .eq("user_id", userId)
        .maybeSingle();
      if (!member) return notFound();
    }

    const { data: seat } = await deps.db
      .from("partner_accounts")
      .select("entitlement_status")
      .eq("partner_id", deck.partner_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (seat?.entitlement_status !== "active") {
      return failWith(403, "entitlement_inactive", "Your access through this partner has ended.");
    }

    const { data: handoff, error: handoffError } = await deps.db
      .from("handoff_tokens")
      .select("return_url, consumed_at")
      .eq("user_id", userId)
      .eq("partner_id", deck.partner_id)
      .not("return_url", "is", null)
      .gte("consumed_at", new Date(deps.now() - HANDOFF_RETURN_WINDOW_MS).toISOString())
      .order("consumed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (handoffError) throw handoffError;
    if (!handoff?.return_url) {
      return failWith(409, "no_return_session", "Open this deck from your church software again to send it back.");
    }

    const { data: partner, error: partnerError } = await deps.db
      .from("partners")
      .select("allowed_return_hosts, status")
      .eq("id", deck.partner_id)
      .single();
    if (partnerError) throw partnerError;
    let returnUrl: string;
    try {
      if (partner.status !== "active") throw new Error("partner inactive");
      returnUrl = validateReturnUrl(handoff.return_url, partner.allowed_return_hosts ?? []);
    } catch {
      return failWith(409, "invalid_return_url", "Your church software's return address is no longer allowed.");
    }

    const { error: approveError } = await deps.db
      .from("sermons")
      .update({ approved_at: new Date(deps.now()).toISOString() })
      .eq("id", deck.id);
    if (approveError) throw approveError;

    // Export the approved slides unless an export of these exact slides exists.
    // (deck.updated_at was read before approved_at bumped it.)
    const { data: latestExport } = await deps.db
      .from("partner_exports")
      .select("created_at, status")
      .eq("deck_id", deck.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const exportIsCurrent = latestExport && latestExport.status !== "failed" &&
      new Date(latestExport.created_at).getTime() >= new Date(deck.updated_at).getTime();
    if (!exportIsCurrent) {
      await createAndQueueExport(deck.id, [...DEFAULT_APPROVAL_FORMATS], deps);
    }

    const redirect = new URL(returnUrl);
    redirect.searchParams.set("ssp_deck_id", deck.id);
    return json({ redirect_url: redirect.href });
  } catch (error) {
    console.error(`[PARTNER-APPROVE] Approve failed - ${JSON.stringify({ request_id: requestId, error: describeError(error) })}`);
    return failWith(500, "internal_error", "Something went wrong. Try again.");
  } finally {
    try {
      await deps.db.from("partner_api_log").insert({
        request_id: requestId,
        partner_id: partnerId,
        method: req.method,
        path: "/approve",
        status,
        duration_ms: deps.now() - startedAt,
        error_code: errorCode,
      });
    } catch {
      // audit log is best effort
    }
  }
};
