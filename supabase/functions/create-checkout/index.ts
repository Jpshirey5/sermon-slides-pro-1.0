import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: any) => {
  console.log(`[CREATE-CHECKOUT] ${step}${details ? ` - ${JSON.stringify(details)}` : ''}`);
};

const getAllowedPriceIds = () => {
  const priceIds = [
    Deno.env.get("STRIPE_PRICE_PRO_MONTHLY"),
    Deno.env.get("STRIPE_PRICE_PRO_ANNUAL"),
    Deno.env.get("STRIPE_PRICE_TEAM_MONTHLY"),
    Deno.env.get("STRIPE_PRICE_TEAM_ANNUAL"),
    Deno.env.get("STRIPE_PRICE_ENTERPRISE_MONTHLY"),
    Deno.env.get("STRIPE_PRICE_ENTERPRISE_ANNUAL"),
  ].filter((value): value is string => Boolean(value && value.startsWith("price_")));

  if (priceIds.length === 0) {
    priceIds.push(
      "price_1TEfgIP2Yr0z0IcsX2VXk6wJ",
      "price_1TEfi2P2Yr0z0Icsnod1blF1",
      "price_1TJJjFP2Yr0z0IcsZRFgIQlX",
      "price_1TJJjWP2Yr0z0IcsAV9Y4SV5",
      "price_1TJJlcP2Yr0z0IcsUb9IHJuS",
      "price_1TJJlpP2Yr0z0IcsDJBpCJHa",
      "price_1TEfggP2Yr0z0IcsHHgS6kye",
      "price_1TEfjmP2Yr0z0IcsXW3ZujSG",
      "price_1TEfhaP2Yr0z0IcsGlDJJyu7",
      "price_1TEfkDP2Yr0z0IcsUhXwzh9z"
    );
  }

  return priceIds;
};

const getDefaultCheckoutPriceId = () =>
  Deno.env.get("STRIPE_PRICE_PRO_MONTHLY") || "price_1TEfgIP2Yr0z0IcsX2VXk6wJ";

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
    let requestedPriceId: string | undefined;
    try {
      const body = await req.json();
      if (typeof body?.priceId === "string") {
        const trimmedPriceId = body.priceId.trim();
        if (trimmedPriceId.startsWith("price_")) {
          requestedPriceId = trimmedPriceId;
        }
      }
    } catch {
      // No JSON body provided; use default price.
    }

    const token = authHeader.replace("Bearer ", "");

    // Validate JWT via claims
    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) throw new Error("Authentication failed");

    const email = claimsData.claims.email as string;
    const userId = claimsData.claims.sub as string;
    if (!email) throw new Error("User not authenticated");
    logStep("User authenticated", { userId, email });

    // Look up account
    const { data: accountId } = await supabaseClient.rpc('get_user_account_id', { _user_id: userId });
    if (!accountId) throw new Error("No account found for user");
    logStep("Found account", { accountId });

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Look up or create Stripe customer
    const customers = await stripe.customers.list({ email, limit: 1 });
    let customerId: string;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
      logStep("Existing customer found", { customerId });
    } else {
      const customer = await stripe.customers.create({
        email,
        metadata: { supabase_uid: userId, account_id: accountId },
      });
      customerId = customer.id;
      logStep("New customer created", { customerId });
    }

    // Store stripe_customer_id on account
    await supabaseClient
      .from("accounts")
      .update({ stripe_customer_id: customerId })
      .eq("id", accountId);

    // Check if already has active subscription — prevent duplicate checkout
    const existingSubs = await stripe.subscriptions.list({
      customer: customerId,
      status: "active",
      limit: 1,
    });

    const allowedPriceIds = getAllowedPriceIds();
    const origin = req.headers.get("origin") || "https://sermonslides.app";
    const checkoutPriceId = requestedPriceId || getDefaultCheckoutPriceId();

    if (!allowedPriceIds.includes(checkoutPriceId)) {
      throw new Error("Unsupported subscription price selected");
    }

    logStep("Using checkout price", { checkoutPriceId });

    if (existingSubs.data.length > 0) {
      logStep("Already subscribed, redirecting to dashboard");
      return new Response(JSON.stringify({ url: `${origin}/dashboard` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      line_items: [{ price: checkoutPriceId, quantity: 1 }],
      mode: "subscription",
      success_url: `${origin}/dashboard?checkout=success`,
      cancel_url: `${origin}/account`,
      metadata: { account_id: accountId, price_id: checkoutPriceId },
    });

    logStep("Checkout session created", { sessionId: session.id });

    return new Response(JSON.stringify({ url: session.url }), {
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
