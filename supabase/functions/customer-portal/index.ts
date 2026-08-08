import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { getTrustedAppOrigin } from "../_shared/app-url.ts";


const logStep = (step: string, details?: any) => {
  console.log(`[CUSTOMER-PORTAL] ${step}${details ? ` - ${JSON.stringify(details)}` : ''}`);
};

const getAllowedPriceIds = () => {
  const configuredPriceIds = [
    Deno.env.get("STRIPE_PRICE_CORE_MONTHLY"),
    Deno.env.get("STRIPE_PRICE_CORE_ANNUAL"),
    Deno.env.get("STRIPE_PRICE_TEAM_MONTHLY"),
    Deno.env.get("STRIPE_PRICE_TEAM_ANNUAL"),
  ].filter((value): value is string => Boolean(value && value.startsWith("price_")));

  return Array.from(new Set(configuredPriceIds));
};

const PLAN_BY_PRICE_ID = new Map<string, { planId: string; planTier: string; billingInterval: "monthly" | "annual" }>(
  [
    [Deno.env.get("STRIPE_PRICE_CORE_MONTHLY"), { planId: "core_monthly", planTier: "core", billingInterval: "monthly" }],
    [Deno.env.get("STRIPE_PRICE_CORE_ANNUAL"), { planId: "core_annual", planTier: "core", billingInterval: "annual" }],
    [Deno.env.get("STRIPE_PRICE_TEAM_MONTHLY"), { planId: "team_monthly", planTier: "team", billingInterval: "monthly" }],
    [Deno.env.get("STRIPE_PRICE_TEAM_ANNUAL"), { planId: "team_annual", planTier: "team", billingInterval: "annual" }],
  ].filter((entry): entry is [string, { planId: string; planTier: string; billingInterval: "monthly" | "annual" }] => Boolean(entry[0]))
);

const resolvePlanMetadata = (priceId: string | null) => {
  if (!priceId) return null;
  return PLAN_BY_PRICE_ID.get(priceId) || null;
};

const readJsonBody = async (req: Request) => {
  const rawBody = await req.text();
  if (!rawBody.trim()) return null;

  try {
    return JSON.parse(rawBody);
  } catch {
    throw new Error("Invalid JSON body");
  }
};

serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";
  const corsHeaders = {
    "Access-Control-Allow-Origin": ["https://sermonslidepro.com", "https://www.sermonslidepro.com", "http://localhost:8080", "http://localhost:5173"].includes(origin) ? origin : "https://sermonslidepro.com",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 405,
    });
  }

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    const body = await readJsonBody(req);
    const requestedAction =
      body?.action === "change_plan" || body?.action === "cancel"
        ? body.action as "change_plan" | "cancel"
        : "cancel";
    const targetPriceId =
      typeof body?.targetPriceId === "string" && body.targetPriceId.trim().startsWith("price_")
        ? body.targetPriceId.trim()
        : null;

    const token = authHeader.replace("Bearer ", "");
    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) throw new Error("Authentication failed");

    const userId = claimsData.claims.sub as string;
    const email = claimsData.claims.email as string;
    if (!userId || !email) throw new Error("User not authenticated");
    logStep("User authenticated", { userId, email });

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const { data: accountId } = await supabaseClient.rpc("get_user_account_id", { _user_id: userId });
    let customerId: string | null = null;

    if (!accountId) {
      throw new Error("No account found for user");
    }

    const [{ data: account }, { data: membership }, { data: activeDeletionRequest }] = await Promise.all([
      supabaseClient
        .from("accounts")
        .select("stripe_customer_id")
        .eq("id", accountId)
        .maybeSingle(),
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
    ]);

    if (membership?.role !== "owner") {
      throw new Error("Only the account owner can manage billing for this organization");
    }

    if (activeDeletionRequest) {
      throw new Error("Cancel the organization deletion request before changing billing");
    }

    customerId = account?.stripe_customer_id || null;
    if (customerId) {
      logStep("Using account stripe customer", { accountId, customerId });
    }

    if (!customerId) {
      const customers = await stripe.customers.list({ email, limit: 1 });
      if (customers.data.length === 0) throw new Error("No Stripe customer found");
      customerId = customers.data[0].id;
      logStep("Using email stripe customer", { customerId });
    }

    const origin = getTrustedAppOrigin(req);
    const allowedPriceIds = getAllowedPriceIds();
    let portalSession;
    let mode: "default" | "change_plan" = "default";

    if (requestedAction === "change_plan") {
      try {
        if (!targetPriceId || !allowedPriceIds.includes(targetPriceId)) {
          throw new Error("Unsupported subscription price selected");
        }

        const subscriptions = await stripe.subscriptions.list({
          customer: customerId,
          status: "all",
          limit: 10,
        });

        const currentSubscription = subscriptions.data.find((sub) =>
          sub.status === "active" || sub.status === "trialing"
        );

        if (!currentSubscription) {
          throw new Error("No active subscription found");
        }

        const currentItem = currentSubscription.items.data[0];
        if (!currentItem?.id) {
          throw new Error("Subscription is not eligible for plan changes");
        }

        if (currentItem.price.id === targetPriceId) {
          throw new Error("That plan is already active");
        }

        const currentPlan = resolvePlanMetadata(currentItem.price.id);
        const targetPlan = resolvePlanMetadata(targetPriceId);
        if (currentPlan && targetPlan && currentPlan.planId === targetPlan.planId) {
          throw new Error("That plan is already active");
        }

        portalSession = await stripe.billingPortal.sessions.create({
          customer: customerId,
          return_url: `${origin}/account`,
          flow_data: {
            type: "subscription_update_confirm",
            after_completion: {
              type: "redirect",
              redirect: {
                return_url: `${origin}/account?subscription=updated`,
              },
            },
            subscription_update_confirm: {
              subscription: currentSubscription.id,
              items: [
                {
                  id: currentItem.id,
                  price: targetPriceId,
                  quantity: currentItem.quantity || 1,
                },
              ],
            },
          },
        });
        mode = "change_plan";
      } catch (changePlanError) {
        const changePlanMessage = changePlanError instanceof Error ? changePlanError.message : String(changePlanError);
        logStep("Change-plan deep link failed", {
          message: changePlanMessage,
          targetPriceId,
        });
        throw new Error(changePlanMessage);
      }
    } else {
      portalSession = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${origin}/account`,
      });
    }

    logStep("Portal session created", { url: portalSession.url });

    return new Response(JSON.stringify({ url: portalSession.url, mode }), {
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
