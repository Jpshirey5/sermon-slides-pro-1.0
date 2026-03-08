import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  console.log(`[STRIPE-WEBHOOK] ${step}${details ? ` - ${JSON.stringify(details)}` : ''}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!stripeKey || !webhookSecret) {
    return new Response("Server misconfigured", { status: 500 });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature!, webhookSecret);
  } catch (err) {
    logStep("Webhook signature verification failed", { error: String(err) });
    return new Response("Webhook signature verification failed", { status: 400 });
  }

  logStep("Event received", { type: event.type, id: event.id });

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;
        const accountId = session.metadata?.account_id;

        logStep("Checkout completed", { customerId, subscriptionId, accountId });

        if (accountId) {
          // Direct update via metadata
          await supabaseClient
            .from("accounts")
            .update({
              subscription_status: "active",
              stripe_customer_id: customerId,
              stripe_subscription_id: subscriptionId,
            })
            .eq("id", accountId);
          logStep("Updated account via metadata", { accountId });
        } else {
          // Fallback: look up account by stripe_customer_id
          const { data: account } = await supabaseClient
            .from("accounts")
            .select("id")
            .eq("stripe_customer_id", customerId)
            .single();

          if (account) {
            await supabaseClient
              .from("accounts")
              .update({
                subscription_status: "active",
                stripe_subscription_id: subscriptionId,
              })
              .eq("id", account.id);
            logStep("Updated account via customer lookup", { accountId: account.id });
          } else {
            logStep("WARNING: Could not find account for customer", { customerId });
          }
        }
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const status = sub.status;
        const customerId = sub.customer as string;
        const isActive = status === "active" || status === "trialing";
        const endTimestamp = sub.current_period_end;
        const subscriptionEnd = endTimestamp && typeof endTimestamp === "number"
          ? new Date(endTimestamp * 1000).toISOString()
          : null;

        logStep("Subscription updated", { customerId, status });

        await supabaseClient
          .from("accounts")
          .update({
            subscription_status: isActive ? "active" : status as any,
            stripe_subscription_id: sub.id,
            subscription_period_end: subscriptionEnd,
          })
          .eq("stripe_customer_id", customerId);
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = sub.customer as string;

        logStep("Subscription canceled", { customerId });
        await supabaseClient
          .from("accounts")
          .update({
            subscription_status: "canceled",
          })
          .eq("stripe_customer_id", customerId);
        break;
      }
    }
  } catch (err) {
    logStep("Error processing event", { error: String(err) });
    return new Response("Error processing event", { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
});
