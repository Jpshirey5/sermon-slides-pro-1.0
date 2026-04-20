import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: any) => {
  console.log(`[CANCEL-ACCOUNT-DELETION] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 405,
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) throw new Error("Authentication failed");

    const userId = claimsData.claims.sub as string | undefined;
    if (!userId) throw new Error("Invalid user claims");

    const { data: accountId } = await supabaseAdmin.rpc("get_user_account_id", { _user_id: userId });
    if (!accountId) throw new Error("No account found for requester");

    const { data: requesterMembership } = await supabaseAdmin
      .from("account_members")
      .select("role")
      .eq("account_id", accountId)
      .eq("user_id", userId)
      .maybeSingle();

    if (requesterMembership?.role !== "owner") {
      throw new Error("Only the account owner can cancel an organization deletion request");
    }

    const { data: deletionRequest } = await supabaseAdmin
      .from("account_deletion_requests" as any)
      .select("id, cancelable_until, stripe_subscription_id")
      .eq("account_id", accountId)
      .eq("status", "pending")
      .maybeSingle();

    if (!deletionRequest) {
      throw new Error("No active deletion request was found");
    }

    if (new Date(deletionRequest.cancelable_until).getTime() <= Date.now()) {
      throw new Error("This deletion request can no longer be canceled");
    }

    let stripeRestoreError: string | null = null;
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (stripeKey && deletionRequest.stripe_subscription_id) {
      try {
        const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
        await stripe.subscriptions.update(deletionRequest.stripe_subscription_id, {
          cancel_at_period_end: false,
        });
        logStep("Stripe subscription cancellation reversed", {
          subscriptionId: deletionRequest.stripe_subscription_id,
        });
      } catch (error) {
        stripeRestoreError = error instanceof Error ? error.message : String(error);
        logStep("Failed reversing Stripe cancellation", { error: stripeRestoreError });
      }
    }

    const { error: updateError } = await supabaseAdmin
      .from("account_deletion_requests" as any)
      .update({
        status: "canceled",
        canceled_at: new Date().toISOString(),
        canceled_by: userId,
        last_error: stripeRestoreError,
      })
      .eq("id", deletionRequest.id);

    if (updateError) {
      throw new Error(`Failed canceling deletion request: ${updateError.message}`);
    }

    return new Response(JSON.stringify({
      success: true,
      stripeRestoreError,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    logStep("ERROR", { message });
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
