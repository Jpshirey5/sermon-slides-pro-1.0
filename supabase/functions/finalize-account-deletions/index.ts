import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-finalize-secret, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  console.log(`[FINALIZE-ACCOUNT-DELETIONS] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);
};

const cancelAndDeleteStripeCustomer = async (
  stripe: Stripe,
  customerId: string,
  subscriptionId: string | null
) => {
  const subscriptionIds = new Set<string>();
  if (subscriptionId) subscriptionIds.add(subscriptionId);

  try {
    const subscriptions = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 });
    for (const sub of subscriptions.data) {
      subscriptionIds.add(sub.id);
    }
  } catch (error) {
    logStep("Failed listing Stripe subscriptions before final delete", { customerId, error: String(error) });
  }

  for (const id of subscriptionIds) {
    try {
      const subscription = await stripe.subscriptions.retrieve(id);
      if (subscription.status !== "canceled" && subscription.status !== "incomplete_expired") {
        await stripe.subscriptions.cancel(id);
        logStep("Canceled Stripe subscription during finalization", { subscriptionId: id });
      }
    } catch (error) {
      logStep("Failed canceling Stripe subscription during finalization", { subscriptionId: id, error: String(error) });
    }
  }

  try {
    await stripe.customers.del(customerId);
    logStep("Deleted Stripe customer during finalization", { customerId });
  } catch (error) {
    logStep("Failed deleting Stripe customer during finalization", { customerId, error: String(error) });
  }
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

  try {
    const finalizeSecret = Deno.env.get("FINALIZE_ACCOUNT_DELETIONS_SECRET") ?? "";
    const suppliedSecret =
      req.headers.get("x-finalize-secret") ||
      req.headers.get("authorization")?.replace("Bearer ", "") ||
      "";

    if (!finalizeSecret || suppliedSecret !== finalizeSecret) {
      throw new Error("Unauthorized finalization request");
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    const { data: dueRequests, error: requestError } = await supabaseAdmin
      .from("account_deletion_requests" as any)
      .select("id, account_id, stripe_customer_id, stripe_subscription_id")
      .eq("status", "pending")
      .lte("scheduled_delete_at", new Date().toISOString())
      .limit(25);

    if (requestError) {
      throw new Error(`Failed loading due deletion requests: ${requestError.message}`);
    }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
    const stripe = stripeKey ? new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" }) : null;
    const results: Array<{ id: string; accountId: string; status: string; error?: string }> = [];

    for (const deletionRequest of dueRequests || []) {
      const requestId = deletionRequest.id as string;
      const accountId = deletionRequest.account_id as string;

      try {
        const { data: members } = await supabaseAdmin
          .from("account_members")
          .select("user_id")
          .eq("account_id", accountId);

        const memberUserIds = Array.from(new Set((members || []).map((m: any) => m.user_id).filter(Boolean)));

        const { error: deleteAccountError } = await supabaseAdmin
          .from("accounts")
          .delete()
          .eq("id", accountId);

        if (deleteAccountError) {
          throw new Error(`Failed deleting account data: ${deleteAccountError.message}`);
        }

        for (const memberUserId of memberUserIds) {
          const { error } = await supabaseAdmin.auth.admin.deleteUser(memberUserId);
          if (error) {
            logStep("Failed deleting team auth user during finalization", { memberUserId, error: error.message });
          }
        }

        if (stripe && deletionRequest.stripe_customer_id) {
          await cancelAndDeleteStripeCustomer(
            stripe,
            deletionRequest.stripe_customer_id,
            deletionRequest.stripe_subscription_id || null
          );
        }

        const { error: updateError } = await supabaseAdmin
          .from("account_deletion_requests" as any)
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
            last_error: null,
          })
          .eq("id", requestId);

        if (updateError) {
          throw new Error(`Deleted account but failed marking request completed: ${updateError.message}`);
        }

        results.push({ id: requestId, accountId, status: "completed" });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logStep("Deletion request finalization failed", { requestId, accountId, error: message });
        await supabaseAdmin
          .from("account_deletion_requests" as any)
          .update({ status: "failed", last_error: message })
          .eq("id", requestId);
        results.push({ id: requestId, accountId, status: "failed", error: message });
      }
    }

    return new Response(JSON.stringify({ success: true, processed: results.length, results }), {
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
