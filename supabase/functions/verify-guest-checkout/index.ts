import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const readJsonBody = async (req: Request): Promise<Record<string, unknown> | null> => {
  const rawBody = await req.text();
  if (!rawBody.trim()) return null;

  try {
    const parsed = JSON.parse(rawBody);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const body = await readJsonBody(req);
    const sessionId = typeof body?.session_id === "string" ? body.session_id.trim() : "";
    const sermonId = typeof body?.sermonId === "string" ? body.sermonId.trim() : "";

    if (!sessionId.startsWith("cs_") || !sermonId) {
      return json({ paid: false, error: "Invalid checkout verification request" }, 400);
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const sessionSermonId = session.metadata?.sermon_id || "";
    const paid =
      session.mode === "payment" &&
      session.status === "complete" &&
      session.payment_status === "paid" &&
      sessionSermonId === sermonId;

    if (!paid) {
      return json({ paid: false, error: "Checkout session is not paid for this sermon" }, 403);
    }

    return json({ paid: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[VERIFY-GUEST-CHECKOUT] ERROR:", message);
    return json({ paid: false, error: "Checkout verification failed" }, 500);
  }
});
