import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: any) => {
  console.log(`[CHECK-SUBSCRIPTION] ${step}${details ? ` - ${JSON.stringify(details)}` : ''}`);
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
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");

    // Validate JWT via claims
    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      logStep("Claims validation failed", { error: claimsError?.message });
      return new Response(JSON.stringify({ subscribed: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const email = claimsData.claims.email as string;
    const userId = claimsData.claims.sub as string;
    if (!email || !userId) {
      logStep("No email/userId in claims");
      return new Response(JSON.stringify({ subscribed: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }
    logStep("User authenticated", { userId, email });

    // Look up account for this user
    const { data: accountId } = await supabaseClient.rpc('get_user_account_id', { _user_id: userId });
    if (!accountId) {
      logStep("No account found for user");
      return new Response(JSON.stringify({ subscribed: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }
    logStep("Found account", { accountId });

    // Check if account already has a stripe_customer_id
    const { data: account } = await supabaseClient
      .from("accounts")
      .select("stripe_customer_id, subscription_status")
      .eq("id", accountId)
      .single();

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    let customerId = account?.stripe_customer_id;

    // If no customer on account, look up by email
    if (!customerId) {
      const customers = await stripe.customers.list({ email, limit: 1 });
      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
        logStep("Found customer by email", { customerId });
      }
    } else {
      logStep("Found customer on account", { customerId });
    }

    if (!customerId) {
      logStep("No Stripe customer found");
      await supabaseClient
        .from("accounts")
        .update({ subscription_status: "inactive" })
        .eq("id", accountId);
      return new Response(JSON.stringify({ subscribed: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "active",
      limit: 1,
    });

    const hasActiveSub = subscriptions.data.length > 0;
    let productId = null;
    let subscriptionEnd = null;

    if (hasActiveSub) {
      const sub = subscriptions.data[0];
      const endTimestamp = sub.current_period_end;
      if (endTimestamp && typeof endTimestamp === "number") {
        subscriptionEnd = new Date(endTimestamp * 1000).toISOString();
      }
      productId = sub.items.data[0].price.product;
      logStep("Active subscription found", { subscriptionId: sub.id, productId, endDate: subscriptionEnd });

      // Update accounts table
      await supabaseClient
        .from("accounts")
        .update({
          subscription_status: "active",
          stripe_customer_id: customerId,
          stripe_subscription_id: sub.id,
          subscription_period_end: subscriptionEnd,
        })
        .eq("id", accountId);
    } else {
      logStep("No active subscription");
      await supabaseClient
        .from("accounts")
        .update({ subscription_status: "inactive" })
        .eq("id", accountId);
    }

    return new Response(JSON.stringify({
      subscribed: hasActiveSub,
      product_id: productId,
      subscription_end: subscriptionEnd,
    }), {
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
