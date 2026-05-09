import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";



serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";
  const corsHeaders = {
    "Access-Control-Allow-Origin": ["https://sermonslidepro.com", "https://www.sermonslidepro.com", "http://localhost:8080", "http://localhost:5173"].includes(origin) ? origin : "https://sermonslidepro.com",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Authentication required" }, 401);

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const anonClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } },
  );

  try {
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      return json({ error: "Authentication failed" }, 401);
    }

    const userId = String(claimsData.claims.sub);
    const { data: membership } = await supabaseAdmin
      .from("account_members")
      .select("account_id, role")
      .eq("user_id", userId)
      .eq("role", "owner")
      .maybeSingle();

    if (!membership?.account_id) {
      return json({ error: "No pending owner signup was found" }, 400);
    }

    const { data: account } = await supabaseAdmin
      .from("accounts")
      .select("id, signup_status, subscription_status, stripe_subscription_id")
      .eq("id", membership.account_id)
      .maybeSingle();

    if (!account || account.signup_status !== "pending_checkout") {
      return json({ error: "This signup is no longer pending" }, 400);
    }

    if (account.subscription_status === "active" || account.subscription_status === "trialing" || account.stripe_subscription_id) {
      return json({ error: "This account already has an active subscription" }, 400);
    }

    await supabaseAdmin.from("accounts").delete().eq("id", account.id);
    await supabaseAdmin.from("profiles").delete().eq("id", userId);
    const { error: deleteUserError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (deleteUserError) throw deleteUserError;

    return json({ success: true });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Internal server error" }, 500);
  }
});
