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

const PLAN_BY_PRICE_ID = new Map<string, { planTier: string; planLabel: string; billingInterval: "monthly" | "annual"; maxAdditionalUsers: number | null }>(
  [
    [Deno.env.get("STRIPE_PRICE_PRO_MONTHLY"), { planTier: "pro", planLabel: "Pro", billingInterval: "monthly", maxAdditionalUsers: 0 }],
    [Deno.env.get("STRIPE_PRICE_PRO_ANNUAL"), { planTier: "pro", planLabel: "Pro", billingInterval: "annual", maxAdditionalUsers: 0 }],
    [Deno.env.get("STRIPE_PRICE_TEAM_MONTHLY"), { planTier: "team", planLabel: "Team", billingInterval: "monthly", maxAdditionalUsers: 2 }],
    [Deno.env.get("STRIPE_PRICE_TEAM_ANNUAL"), { planTier: "team", planLabel: "Team", billingInterval: "annual", maxAdditionalUsers: 2 }],
    [Deno.env.get("STRIPE_PRICE_ENTERPRISE_MONTHLY"), { planTier: "enterprise", planLabel: "Enterprise", billingInterval: "monthly", maxAdditionalUsers: 9 }],
    [Deno.env.get("STRIPE_PRICE_ENTERPRISE_ANNUAL"), { planTier: "enterprise", planLabel: "Enterprise", billingInterval: "annual", maxAdditionalUsers: 9 }],
    ["price_1TEfgIP2Yr0z0IcsX2VXk6wJ", { planTier: "pro", planLabel: "Pro", billingInterval: "monthly", maxAdditionalUsers: 0 }],
    ["price_1TEfi2P2Yr0z0Icsnod1blF1", { planTier: "pro", planLabel: "Pro", billingInterval: "annual", maxAdditionalUsers: 0 }],
    ["price_1TEfggP2Yr0z0IcsHHgS6kye", { planTier: "team", planLabel: "Team", billingInterval: "monthly", maxAdditionalUsers: 2 }],
    ["price_1TEfjmP2Yr0z0IcsXW3ZujSG", { planTier: "team", planLabel: "Team", billingInterval: "annual", maxAdditionalUsers: 2 }],
    ["price_1TEfhaP2Yr0z0IcsGlDJJyu7", { planTier: "enterprise", planLabel: "Enterprise", billingInterval: "monthly", maxAdditionalUsers: 9 }],
    ["price_1TEfkDP2Yr0z0IcsUhXwzh9z", { planTier: "enterprise", planLabel: "Enterprise", billingInterval: "annual", maxAdditionalUsers: 9 }],
    ["price_1TJJjFP2Yr0z0IcsZRFgIQlX", { planTier: "team", planLabel: "Team", billingInterval: "monthly", maxAdditionalUsers: 2 }],
    ["price_1TJJjWP2Yr0z0IcsAV9Y4SV5", { planTier: "team", planLabel: "Team", billingInterval: "annual", maxAdditionalUsers: 2 }],
    ["price_1TJJlcP2Yr0z0IcsUb9IHJuS", { planTier: "enterprise", planLabel: "Enterprise", billingInterval: "monthly", maxAdditionalUsers: 9 }],
    ["price_1TJJlpP2Yr0z0IcsDJBpCJHa", { planTier: "enterprise", planLabel: "Enterprise", billingInterval: "annual", maxAdditionalUsers: 9 }],
    ["price_1TJQdEP2Yr0z0IcsjUAm4Xq6", { planTier: "enterprise", planLabel: "Enterprise", billingInterval: "annual", maxAdditionalUsers: 9 }],
  ].filter((entry): entry is [string, { planTier: string; planLabel: string; billingInterval: "monthly" | "annual"; maxAdditionalUsers: number | null }] => Boolean(entry[0]))
);

const resolvePlanMetadata = (priceId: string | null) => {
  if (!priceId) return null;
  return PLAN_BY_PRICE_ID.get(priceId) || null;
};

const getBetaInfo = (account: any) => {
  const trialEndsAt = account?.beta_trial_ends_at || null;
  const trialEndsMs = trialEndsAt ? new Date(trialEndsAt).getTime() : NaN;
  const daysRemaining = Number.isNaN(trialEndsMs)
    ? null
    : Math.max(0, Math.ceil((trialEndsMs - Date.now()) / (24 * 60 * 60 * 1000)));
  const trialActive = Boolean(account?.is_beta_user && trialEndsAt && trialEndsMs >= Date.now());

  return {
    is_beta_user: Boolean(account?.is_beta_user),
    beta_trial_active: trialActive,
    beta_trial_ends_at: trialEndsAt,
    beta_trial_days_remaining: daysRemaining,
    beta_plan_tier: account?.beta_plan_tier || "pro",
  };
};

const noBetaInfo = {
  is_beta_user: false,
  beta_trial_active: false,
  beta_trial_ends_at: null,
  beta_trial_days_remaining: null,
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
      return new Response(JSON.stringify({
        subscribed: false,
        product_id: null,
        price_id: null,
        billing_interval: null,
        plan_label: null,
        subscription_end: null,
        cancel_at_period_end: false,
        subscription_status: "inactive",
        ...noBetaInfo,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const email = claimsData.claims.email as string;
    const userId = claimsData.claims.sub as string;
    if (!email || !userId) {
      logStep("No email/userId in claims");
      return new Response(JSON.stringify({
        subscribed: false,
        product_id: null,
        price_id: null,
        billing_interval: null,
        plan_label: null,
        subscription_end: null,
        cancel_at_period_end: false,
        subscription_status: "inactive",
        ...noBetaInfo,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }
    logStep("User authenticated", { userId, email });

    // Look up account for this user
    const { data: accountId } = await supabaseClient.rpc('get_user_account_id', { _user_id: userId });
    if (!accountId) {
      logStep("No account found for user");
      return new Response(JSON.stringify({
        subscribed: false,
        product_id: null,
        price_id: null,
        billing_interval: null,
        plan_label: null,
        subscription_end: null,
        cancel_at_period_end: false,
        subscription_status: "inactive",
        ...noBetaInfo,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }
    logStep("Found account", { accountId });

    // Check if account already has a stripe_customer_id
    const { data: account } = await supabaseClient
      .from("accounts")
      .select("stripe_customer_id, subscription_status, is_beta_user, beta_started_at, beta_trial_ends_at, beta_plan_tier")
      .eq("id", accountId)
      .single();
    const betaInfo = getBetaInfo(account);

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
      if (betaInfo.beta_trial_active) {
        await supabaseClient
          .from("accounts")
          .update({
            plan_tier: betaInfo.beta_plan_tier,
            billing_interval: null,
            subscription_status: "trialing",
            subscription_period_end: betaInfo.beta_trial_ends_at,
          })
          .eq("id", accountId);
        return new Response(JSON.stringify({
          subscribed: true,
          product_id: null,
          price_id: null,
          billing_interval: null,
          plan_label: "Beta",
          subscription_end: betaInfo.beta_trial_ends_at,
          cancel_at_period_end: false,
          subscription_status: "trialing",
          plan_tier: betaInfo.beta_plan_tier,
          ...betaInfo,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }
      await supabaseClient
        .from("accounts")
        .update({ subscription_status: "inactive" })
        .eq("id", accountId);
      return new Response(JSON.stringify({
        subscribed: false,
        product_id: null,
        price_id: null,
        billing_interval: null,
        plan_label: null,
        subscription_end: null,
        cancel_at_period_end: false,
        subscription_status: "inactive",
        ...betaInfo,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 10,
    });

    const currentSubscription = subscriptions.data.find((sub) =>
      sub.status === "active" || sub.status === "trialing"
    );
    const hasActiveSub = Boolean(currentSubscription);
    let productId = null;
    let priceId = null;
    let billingInterval: "monthly" | "annual" | null = null;
    let planLabel = null;
    let planTier = "free";
    let maxAdditionalUsers: number | null = 0;
    let subscriptionEnd = null;
    let cancelAtPeriodEnd = false;
    let subscriptionStatus = account?.subscription_status || "inactive";

    if (hasActiveSub) {
      const sub = currentSubscription!;
      const endTimestamp = sub.current_period_end;
      productId = sub.items.data[0].price.product;
      priceId = sub.items.data[0].price.id;
      const resolvedPlan = resolvePlanMetadata(priceId);
      if (resolvedPlan) {
        billingInterval = resolvedPlan.billingInterval;
        planLabel = resolvedPlan.planLabel;
        planTier = resolvedPlan.planTier;
        maxAdditionalUsers = resolvedPlan.maxAdditionalUsers;
      } else {
        const recurringInterval = sub.items.data[0].price.recurring?.interval;
        billingInterval = recurringInterval === "year" ? "annual" : recurringInterval === "month" ? "monthly" : null;
        planLabel = "Pro";
        planTier = "pro";
        maxAdditionalUsers = 0;
      }
      cancelAtPeriodEnd = Boolean(sub.cancel_at_period_end);
      subscriptionStatus = cancelAtPeriodEnd ? "canceled" : sub.status;

      if (cancelAtPeriodEnd) {
        const explicitCancelTimestamp =
          typeof sub.cancel_at === "number"
            ? sub.cancel_at
            : typeof sub.ended_at === "number"
            ? sub.ended_at
            : endTimestamp && typeof endTimestamp === "number"
            ? endTimestamp
            : null;

        if (explicitCancelTimestamp) {
          subscriptionEnd = new Date(explicitCancelTimestamp * 1000).toISOString();
        }
      } else {
        try {
          const upcomingInvoice = await stripe.invoices.createPreview({
            customer: customerId,
            subscription: sub.id,
          });

          const nextInvoiceTimestamp =
            typeof upcomingInvoice.period_end === "number"
              ? upcomingInvoice.period_end
              : typeof upcomingInvoice.next_payment_attempt === "number"
              ? upcomingInvoice.next_payment_attempt
              : null;

          if (nextInvoiceTimestamp) {
            subscriptionEnd = new Date(nextInvoiceTimestamp * 1000).toISOString();
          }
        } catch (invoiceError) {
          logStep("Upcoming invoice preview failed", { error: String(invoiceError), subscriptionId: sub.id });
        }

        if (!subscriptionEnd && endTimestamp && typeof endTimestamp === "number") {
          subscriptionEnd = new Date(endTimestamp * 1000).toISOString();
        }
      }

      logStep("Current subscription found", {
        subscriptionId: sub.id,
        productId,
        priceId,
        billingInterval,
        endDate: subscriptionEnd,
        cancelAtPeriodEnd,
        subscriptionStatus,
      });

      // Update accounts table
      await supabaseClient
        .from("accounts")
        .update({
          plan_tier: planTier,
          billing_interval: billingInterval,
          max_additional_users: maxAdditionalUsers,
          subscription_status: sub.status === "trialing" ? "trialing" : "active",
          stripe_customer_id: customerId,
          stripe_subscription_id: sub.id,
          subscription_period_end: subscriptionEnd,
        })
        .eq("id", accountId);
    } else if (betaInfo.beta_trial_active) {
      logStep("Active beta trial found");
      planTier = betaInfo.beta_plan_tier;
      planLabel = "Beta";
      subscriptionEnd = betaInfo.beta_trial_ends_at;
      subscriptionStatus = "trialing";
      maxAdditionalUsers = planTier === "enterprise" ? 9 : planTier === "team" ? 2 : 0;
      await supabaseClient
        .from("accounts")
        .update({
          plan_tier: planTier,
          billing_interval: null,
          max_additional_users: maxAdditionalUsers,
          subscription_status: "trialing",
          subscription_period_end: subscriptionEnd,
        })
        .eq("id", accountId);
    } else {
      logStep("No active subscription");
      await supabaseClient
        .from("accounts")
        .update({
          plan_tier: "free",
          billing_interval: null,
          max_additional_users: 0,
          subscription_status: "inactive",
        })
        .eq("id", accountId);
      subscriptionStatus = "inactive";
    }

    return new Response(JSON.stringify({
      subscribed: hasActiveSub || betaInfo.beta_trial_active,
      product_id: productId,
      price_id: priceId,
      billing_interval: billingInterval,
      plan_label: planLabel,
      plan_tier: planTier,
      subscription_end: subscriptionEnd,
      cancel_at_period_end: cancelAtPeriodEnd,
      subscription_status: subscriptionStatus,
      ...betaInfo,
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
