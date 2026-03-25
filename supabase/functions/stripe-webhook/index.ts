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

const PLAN_BY_PRICE_ID = new Map<string, { planTier: string; billingInterval: "monthly" | "annual"; maxAdditionalUsers: number | null }>(
  [
    [Deno.env.get("STRIPE_PRICE_PRO_MONTHLY"), { planTier: "pro", billingInterval: "monthly", maxAdditionalUsers: 0 }],
    [Deno.env.get("STRIPE_PRICE_PRO_ANNUAL"), { planTier: "pro", billingInterval: "annual", maxAdditionalUsers: 0 }],
    [Deno.env.get("STRIPE_PRICE_TEAM_MONTHLY"), { planTier: "team", billingInterval: "monthly", maxAdditionalUsers: 2 }],
    [Deno.env.get("STRIPE_PRICE_TEAM_ANNUAL"), { planTier: "team", billingInterval: "annual", maxAdditionalUsers: 2 }],
    [Deno.env.get("STRIPE_PRICE_ENTERPRISE_MONTHLY"), { planTier: "enterprise", billingInterval: "monthly", maxAdditionalUsers: null }],
    [Deno.env.get("STRIPE_PRICE_ENTERPRISE_ANNUAL"), { planTier: "enterprise", billingInterval: "annual", maxAdditionalUsers: null }],
    ["price_1TEfgIP2Yr0z0IcsX2VXk6wJ", { planTier: "pro", billingInterval: "monthly", maxAdditionalUsers: 0 }],
    ["price_1TEfi2P2Yr0z0Icsnod1blF1", { planTier: "pro", billingInterval: "annual", maxAdditionalUsers: 0 }],
    ["price_1TEfggP2Yr0z0IcsHHgS6kye", { planTier: "team", billingInterval: "monthly", maxAdditionalUsers: 2 }],
    ["price_1TEfjmP2Yr0z0IcsXW3ZujSG", { planTier: "team", billingInterval: "annual", maxAdditionalUsers: 2 }],
    ["price_1TEfhaP2Yr0z0IcsGlDJJyu7", { planTier: "enterprise", billingInterval: "monthly", maxAdditionalUsers: null }],
    ["price_1TEfkDP2Yr0z0IcsUhXwzh9z", { planTier: "enterprise", billingInterval: "annual", maxAdditionalUsers: null }],
  ].filter((entry): entry is [string, { planTier: string; billingInterval: "monthly" | "annual"; maxAdditionalUsers: number | null }] => Boolean(entry[0]))
);

const resolvePlanMetadata = (priceId?: string | null) => {
  if (!priceId) return { planTier: "free", billingInterval: null, maxAdditionalUsers: 0 };
  return PLAN_BY_PRICE_ID.get(priceId) || { planTier: "pro", billingInterval: null, maxAdditionalUsers: 0 };
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
        const lineItemPriceId = typeof session.metadata?.price_id === "string" ? session.metadata.price_id : null;
        const planMeta = resolvePlanMetadata(lineItemPriceId);

        logStep("Checkout completed", { customerId, subscriptionId, accountId });

        if (accountId) {
          // Direct update via metadata
          await supabaseClient
            .from("accounts")
            .update({
              plan_tier: planMeta.planTier,
              billing_interval: planMeta.billingInterval,
              max_additional_users: planMeta.maxAdditionalUsers,
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
                plan_tier: planMeta.planTier,
                billing_interval: planMeta.billingInterval,
                max_additional_users: planMeta.maxAdditionalUsers,
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
        const priceId = sub.items.data[0]?.price?.id ?? null;
        const planMeta = resolvePlanMetadata(priceId);
        const subscriptionEnd = endTimestamp && typeof endTimestamp === "number"
          ? new Date(endTimestamp * 1000).toISOString()
          : null;

        logStep("Subscription updated", { customerId, status });

        await supabaseClient
          .from("accounts")
          .update({
            plan_tier: isActive ? planMeta.planTier : "free",
            billing_interval: isActive ? planMeta.billingInterval : null,
            max_additional_users: isActive ? planMeta.maxAdditionalUsers : 0,
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
            plan_tier: "free",
            billing_interval: null,
            max_additional_users: 0,
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
