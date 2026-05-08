import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";



const logStep = (step: string, details?: Record<string, unknown>) => {
  console.log(`[CLEANUP-PENDING-SIGNUPS] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);
};

const parsePositiveNumber = (value: unknown, fallback: number, max: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
};

serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";
  const corsHeaders = {
    "Access-Control-Allow-Origin": ["https://sermonslidepro.com", "http://localhost:8080", "http://localhost:5173"].includes(origin) ? origin : "https://sermonslidepro.com",
    "Access-Control-Allow-Headers": "authorization, x-cleanup-secret, x-client-info, apikey, content-type",
  };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const expectedSecret = Deno.env.get("PENDING_SIGNUP_CLEANUP_SECRET") ?? "";
    const suppliedSecret =
      req.headers.get("x-cleanup-secret") ||
      req.headers.get("authorization")?.replace("Bearer ", "") ||
      "";

    if (!expectedSecret || suppliedSecret !== expectedSecret) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceRoleKey) {
      return json({ error: "Supabase cleanup configuration is missing" }, 500);
    }

    let body: Record<string, unknown> = {};
    try {
      const raw = await req.text();
      body = raw.trim() ? JSON.parse(raw) : {};
    } catch {
      body = {};
    }

    const maxAgeHours = parsePositiveNumber(body.maxAgeHours, 24, 168);
    const limit = Math.floor(parsePositiveNumber(body.limit, 50, 200));
    const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000).toISOString();

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: accounts, error: accountsError } = await supabaseAdmin
      .from("accounts")
      .select("id, name, created_at, subscription_status, stripe_subscription_id")
      .eq("signup_status", "pending_checkout")
      .lt("created_at", cutoff)
      .limit(limit);

    if (accountsError) {
      throw new Error(accountsError.message);
    }

    const results: Array<Record<string, unknown>> = [];

    for (const account of accounts || []) {
      const accountId = account.id as string;
      const subscriptionStatus = String(account.subscription_status || "");

      if (subscriptionStatus === "active" || subscriptionStatus === "trialing" || account.stripe_subscription_id) {
        results.push({ accountId, status: "skipped", reason: "subscription_present" });
        continue;
      }

      const { data: owners, error: ownersError } = await supabaseAdmin
        .from("account_members")
        .select("user_id")
        .eq("account_id", accountId)
        .eq("role", "owner");

      if (ownersError) {
        results.push({ accountId, status: "error", error: ownersError.message });
        continue;
      }

      const ownerUserIds = Array.from(new Set((owners || []).map((owner) => owner.user_id).filter(Boolean)));

      const { error: deleteAccountError } = await supabaseAdmin
        .from("accounts")
        .delete()
        .eq("id", accountId)
        .eq("signup_status", "pending_checkout");

      if (deleteAccountError) {
        results.push({ accountId, status: "error", error: deleteAccountError.message });
        continue;
      }

      for (const ownerUserId of ownerUserIds) {
        const { error: profileError } = await supabaseAdmin
          .from("profiles")
          .delete()
          .eq("id", ownerUserId);
        if (profileError) {
          logStep("Profile cleanup failed", { accountId, ownerUserId, error: profileError.message });
        }

        const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(ownerUserId);
        if (authError) {
          logStep("Auth user cleanup failed", { accountId, ownerUserId, error: authError.message });
        }
      }

      results.push({
        accountId,
        status: "deleted",
        ownerUserCount: ownerUserIds.length,
      });
    }

    return json({
      cutoff,
      maxAgeHours,
      processed: results.length,
      results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message });
    return json({ error: message }, 500);
  }
});
