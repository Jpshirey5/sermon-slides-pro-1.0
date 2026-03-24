import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: any) => {
  console.log(`[DELETE-ACCOUNT] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) throw new Error("Authentication failed");

    const userId = claimsData.claims.sub as string;
    const email = claimsData.claims.email as string | null;
    if (!userId) throw new Error("Invalid user claims");

    const body = await req.json();
    const reason = String(body?.reason || "").trim();
    const additionalFeedback = String(body?.additional_feedback || "").trim();

    if (!reason) throw new Error("Exit reason is required");
    if (!additionalFeedback) throw new Error("Additional feedback is required");

    const { data: accountId } = await supabaseClient.rpc("get_user_account_id", { _user_id: userId });
    if (!accountId) throw new Error("No account found for user");

    const { data: membership } = await supabaseClient
      .from("account_members")
      .select("role")
      .eq("account_id", accountId)
      .eq("user_id", userId)
      .maybeSingle();

    const isOwner = membership?.role === "owner";

    const { data: account } = await supabaseClient
      .from("accounts")
      .select("stripe_customer_id, stripe_subscription_id")
      .eq("id", accountId)
      .maybeSingle();

    // Do not block account deletion if survey persistence fails (e.g. migration not yet applied).
    try {
      const { error: surveyError } = await supabaseClient.from("exit_surveys" as any).insert({
        requester_user_id: userId,
        requester_email: email,
        account_id: accountId,
        was_owner: isOwner,
        reason,
        additional_feedback: additionalFeedback,
      } as any);
      if (surveyError) {
        logStep("Survey insert failed, continuing deletion", { error: surveyError.message });
      }
    } catch (surveyInsertErr) {
      logStep("Survey insert threw, continuing deletion", { error: String(surveyInsertErr) });
    }

    if (isOwner) {
      const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
      if (stripeKey) {
        const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

        const customerId = account?.stripe_customer_id || null;
        const subscriptionId = account?.stripe_subscription_id || null;
        const customerIdsToDelete = new Set<string>();

        if (subscriptionId) {
          try {
            const subscription = await stripe.subscriptions.retrieve(subscriptionId);
            if (subscription && subscription.status !== "canceled" && subscription.status !== "incomplete_expired") {
              await stripe.subscriptions.cancel(subscriptionId);
              logStep("Canceled subscription by id", { subscriptionId });
            }
            if (subscription?.customer && typeof subscription.customer === "string") {
              customerIdsToDelete.add(subscription.customer);
            }
          } catch (err) {
            logStep("Failed cancel by subscription id", { subscriptionId, error: String(err) });
          }
        }

        if (customerId) {
          customerIdsToDelete.add(customerId);
          try {
            const subscriptions = await stripe.subscriptions.list({ customer: customerId, limit: 100 });
            for (const sub of subscriptions.data) {
              if (sub.status !== "canceled" && sub.status !== "incomplete_expired") {
                try {
                  await stripe.subscriptions.cancel(sub.id);
                  logStep("Canceled subscription by customer", { subscriptionId: sub.id });
                } catch (err) {
                  logStep("Failed cancel subscription", { subscriptionId: sub.id, error: String(err) });
                }
              }
            }
          } catch (err) {
            logStep("Failed subscription list by customer", { customerId, error: String(err) });
          }
        }

        // Fallback: if account row does not have a customer id, attempt lookup by owner email.
        if (customerIdsToDelete.size === 0 && email) {
          try {
            const customers = await stripe.customers.list({ email, limit: 100 });
            for (const customer of customers.data) {
              customerIdsToDelete.add(customer.id);
            }
          } catch (err) {
            logStep("Failed customer lookup by email", { email, error: String(err) });
          }
        }

        for (const stripeCustomerId of customerIdsToDelete) {
          try {
            // Safety pass: cancel any remaining active subscriptions before deleting the customer.
            const subscriptions = await stripe.subscriptions.list({ customer: stripeCustomerId, limit: 100 });
            for (const sub of subscriptions.data) {
              if (sub.status !== "canceled" && sub.status !== "incomplete_expired") {
                try {
                  await stripe.subscriptions.cancel(sub.id);
                  logStep("Canceled subscription before customer delete", { subscriptionId: sub.id });
                } catch (err) {
                  logStep("Failed cancel before customer delete", { subscriptionId: sub.id, error: String(err) });
                }
              }
            }
          } catch (err) {
            logStep("Failed pre-delete subscription list", { customerId: stripeCustomerId, error: String(err) });
          }

          try {
            await stripe.customers.del(stripeCustomerId);
            logStep("Deleted stripe customer", { customerId: stripeCustomerId });
          } catch (err) {
            logStep("Failed deleting stripe customer", { customerId: stripeCustomerId, error: String(err) });
          }
        }
      }

      const { data: members } = await supabaseClient
        .from("account_members")
        .select("user_id")
        .eq("account_id", accountId);

      const memberUserIds = Array.from(new Set((members || []).map((m: any) => m.user_id).filter(Boolean)));

      const { error: deleteAccountError } = await supabaseClient
        .from("accounts")
        .delete()
        .eq("id", accountId);

      if (deleteAccountError) {
        throw new Error(`Failed deleting account data: ${deleteAccountError.message}`);
      }

      for (const memberUserId of memberUserIds) {
        const { error } = await supabaseClient.auth.admin.deleteUser(memberUserId);
        if (error) {
          logStep("Failed deleting team auth user", { memberUserId, error: error.message });
        }
      }

      logStep("Owner account deletion completed", { accountId, memberCount: memberUserIds.length });
    } else {
      await supabaseClient
        .from("account_members")
        .delete()
        .eq("account_id", accountId)
        .eq("user_id", userId);

      const { error } = await supabaseClient.auth.admin.deleteUser(userId);
      if (error) {
        throw new Error(`Failed deleting user: ${error.message}`);
      }

      logStep("Member account deletion completed", { accountId, userId });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: msg });
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
