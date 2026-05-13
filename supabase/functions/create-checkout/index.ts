import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { getTrustedAppOrigin } from "../_shared/app-url.ts";


const logStep = (step: string, details?: any) => {
  console.log(`[CREATE-CHECKOUT] ${step}${details ? ` - ${JSON.stringify(details)}` : ''}`);
};

const CANONICAL_PRICE_IDS = [
  "price_1TVyQnP2Yr0z0IcsKcAHhYX8",
  "price_1TVyQqP2Yr0z0IcsKQ6KN3xA",
  "price_1TVyQtP2Yr0z0IcsfNMO4n3o",
  "price_1TVyQxP2Yr0z0IcsMr2gCkbm",
  "price_1TVyQzP2Yr0z0Ics7qONt0Fm",
  "price_1TVyR1P2Yr0z0IcsBZck11XI",
];

const LEGACY_PRICE_IDS = [
  "price_1TEfgIP2Yr0z0IcsX2VXk6wJ",
  "price_1TEfi2P2Yr0z0Icsnod1blF1",
  "price_1TJJjFP2Yr0z0IcsZRFgIQlX",
  "price_1TJJjWP2Yr0z0IcsAV9Y4SV5",
  "price_1TJJlcP2Yr0z0IcsUb9IHJuS",
  "price_1TJQdEP2Yr0z0IcsjUAm4Xq6",
  "price_1TEfggP2Yr0z0IcsHHgS6kye",
  "price_1TEfjmP2Yr0z0IcsXW3ZujSG",
  "price_1TEfhaP2Yr0z0IcsGlDJJyu7",
  "price_1TEfkDP2Yr0z0IcsUhXwzh9z",
  "price_1TJJlpP2Yr0z0IcsDJBpCJHa",
];

const getAllowedPriceIds = () => {
  const configuredPriceIds = [
    Deno.env.get("STRIPE_PRICE_PRO_MONTHLY"),
    Deno.env.get("STRIPE_PRICE_PRO_ANNUAL"),
    Deno.env.get("STRIPE_PRICE_TEAM_MONTHLY"),
    Deno.env.get("STRIPE_PRICE_TEAM_ANNUAL"),
    Deno.env.get("STRIPE_PRICE_ENTERPRISE_MONTHLY"),
    Deno.env.get("STRIPE_PRICE_ENTERPRISE_ANNUAL"),
  ].filter((value): value is string => Boolean(value && value.startsWith("price_")));

  return Array.from(new Set([
    ...configuredPriceIds,
    ...CANONICAL_PRICE_IDS,
    ...LEGACY_PRICE_IDS,
  ]));
};

const getDefaultCheckoutPriceId = () =>
  Deno.env.get("STRIPE_PRICE_PRO_MONTHLY") || "price_1TVyQnP2Yr0z0IcsKcAHhYX8";

serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";
  const corsHeaders = {
    "Access-Control-Allow-Origin": ["https://sermonslidepro.com", "https://www.sermonslidepro.com", "http://localhost:8080", "http://localhost:5173"].includes(origin) ? origin : "https://sermonslidepro.com",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };
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

    const [{ data: membership }, { data: activeDeletionRequest }, { data: account }] = await Promise.all([
      supabaseClient
        .from("account_members")
        .select("role")
        .eq("account_id", accountId)
        .eq("user_id", userId)
        .maybeSingle(),
      supabaseClient
        .from("account_deletion_requests" as any)
        .select("id")
        .eq("account_id", accountId)
        .eq("status", "pending")
        .maybeSingle(),
      supabaseClient
        .from("accounts")
        .select("signup_status")
        .eq("id", accountId)
        .maybeSingle(),
    ]);

    if (membership?.role !== "owner") {
      throw new Error("Only the account owner can manage billing for this organization");
    }

    if (activeDeletionRequest) {
      throw new Error("Cancel the organization deletion request before changing billing");
    }

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
    const origin = getTrustedAppOrigin(req);
    const checkoutPriceId = requestedPriceId || getDefaultCheckoutPriceId();

    if (!allowedPriceIds.includes(checkoutPriceId)) {
      throw new Error("Unsupported subscription price selected");
    }

    logStep("Using checkout price", { checkoutPriceId });
    const isPendingSignup = account?.signup_status === "pending_checkout";

    if (existingSubs.data.length > 0) {
      logStep("Already subscribed, redirecting to dashboard");
      return new Response(JSON.stringify({ url: `${origin}/dashboard` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const session = await stripe.checkout.sessions.create({
      // Enables promo code input field on Stripe Checkout
      allow_promotion_codes: true,
      customer: customerId,
      line_items: [{ price: checkoutPriceId, quantity: 1 }],
      mode: "subscription",
      success_url: `${origin}/dashboard?checkout=success`,
      cancel_url: isPendingSignup
        ? `${origin}/signup-incomplete?priceId=${encodeURIComponent(checkoutPriceId)}`
        : `${origin}/account`,
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
