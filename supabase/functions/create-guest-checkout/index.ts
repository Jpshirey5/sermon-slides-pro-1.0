import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { getTrustedAppOrigin } from "../_shared/app-url.ts";


serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";
  const corsHeaders = {
    "Access-Control-Allow-Origin": ["https://sermonslidepro.com", "https://www.sermonslidepro.com", "http://localhost:8080", "http://localhost:5173"].includes(origin) ? origin : "https://sermonslidepro.com",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");
    const payPerPriceId =
      Deno.env.get("STRIPE_PRICE_ONE_TIME_EXPORT") ||
      Deno.env.get("STRIPE_PAY_PER_SERMON_PRICE_ID") ||
      Deno.env.get("STRIPE_PAY_PER_EXPORT_PRICE_ID");

    if (!payPerPriceId || !payPerPriceId.startsWith("price_")) {
      throw new Error("Pay-per-export Stripe price is not configured");
    }

    const { origin, sermonId } = await req.json();
    const siteOrigin = getTrustedAppOrigin(req, origin);
    const successUrl = `${siteOrigin}/payment-success?sermonId=${encodeURIComponent(sermonId || "")}&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = sermonId
      ? `${siteOrigin}/editor/${encodeURIComponent(sermonId)}`
      : `${siteOrigin}/create`;

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const metadata = sermonId ? { sermon_id: sermonId } : undefined;

    const session = await stripe.checkout.sessions.create({
      // Enables promo code input field on Stripe Checkout
      allow_promotion_codes: true,
      mode: "payment",
      line_items: [{ price: payPerPriceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata,
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[CREATE-GUEST-CHECKOUT] ERROR:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
