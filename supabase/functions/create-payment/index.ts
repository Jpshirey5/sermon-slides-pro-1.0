import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CREATE-PAYMENT] ${step}${detailsStr}`);
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      throw new Error("STRIPE_SECRET_KEY is not set");
    }
    logStep("Stripe key verified");

    // Parse request body for optional sermon_id (used for return URL)
    let sermonId: string | null = null;
    try {
      const body = await req.json();
      sermonId = body?.sermon_id || null;
      logStep("Request body parsed", { sermonId });
    } catch {
      logStep("No request body or invalid JSON");
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Get the origin for redirect URLs
    const origin = req.headers.get("origin") || "https://id-preview--4106109b-8adc-4e56-b2c6-847326cb6d74.lovable.app";
    logStep("Origin determined", { origin });

    // Build return URL for embedded checkout
    const returnUrl = sermonId 
      ? `${origin}/editor/${sermonId}?payment=success`
      : `${origin}?payment=success`;

    // Create embedded checkout session
    const session = await stripe.checkout.sessions.create({
      line_items: [
        {
          price: "price_1SqEznP2Yr0z0IcsXrxP90T7",
          quantity: 1,
        },
      ],
      mode: "payment",
      ui_mode: "embedded",
      return_url: returnUrl,
    });

    logStep("Embedded checkout session created", { sessionId: session.id, hasClientSecret: !!session.client_secret });

    return new Response(JSON.stringify({ clientSecret: session.client_secret }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR in create-payment", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
