import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");
    const payPerPriceId =
      Deno.env.get("STRIPE_PRICE_ONE_TIME_EXPORT") ||
      Deno.env.get("STRIPE_PAY_PER_SERMON_PRICE_ID") ||
      Deno.env.get("STRIPE_PAY_PER_EXPORT_PRICE_ID") ||
      "price_1TEffiP2Yr0z0IcsWOHYJaUt";

    const { origin, sermonId } = await req.json();
    const siteOrigin = origin || req.headers.get("origin") || "http://localhost:8080";
    const successUrl = `${siteOrigin}/payment-success?sermonId=${encodeURIComponent(sermonId || "")}&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = sermonId
      ? `${siteOrigin}/editor/${encodeURIComponent(sermonId)}`
      : `${siteOrigin}/create`;

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const metadata = sermonId ? { sermon_id: sermonId } : undefined;

    let session: Stripe.Checkout.Session;
    try {
      if (payPerPriceId) {
        session = await stripe.checkout.sessions.create({
          mode: "payment",
          line_items: [{ price: payPerPriceId, quantity: 1 }],
          success_url: successUrl,
          cancel_url: cancelUrl,
          metadata,
        });
      } else {
        throw new Error("No pay-per price secret set, using inline fallback.");
      }
    } catch (priceError) {
      console.error("[CREATE-GUEST-CHECKOUT] Price checkout failed, using inline price fallback:", priceError);
      // Fallback to inline one-time $15 payment so flow still works.
      session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [{
          price_data: {
            currency: "usd",
            unit_amount: 1500,
            product_data: {
              name: "Sermon Slide Pro - Pay Per Sermon Export",
              description: "One-time unlock for this presentation export",
            },
          },
          quantity: 1,
        }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata,
      });
    }

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
