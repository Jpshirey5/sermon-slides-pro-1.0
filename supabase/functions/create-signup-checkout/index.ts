import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { getTrustedAppOrigin } from "../_shared/app-url.ts";



const logStep = (step: string, details?: Record<string, unknown>) => {
  console.log(`[CREATE-SIGNUP-CHECKOUT] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);
};

const clean = (value: unknown) => String(value ?? "").trim();
const normalizeEmail = (value: unknown) => clean(value).toLowerCase();
const CURRENT_TERMS_VERSION = "2026-05-07";
const CURRENT_PRIVACY_VERSION = "2026-05-07";

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

const PLAN_BY_PRICE_ID = new Map<string, { planTier: string; billingInterval: "monthly" | "annual"; maxAdditionalUsers: number | null }>(
  [
    [Deno.env.get("STRIPE_PRICE_PRO_MONTHLY"), { planTier: "pro", billingInterval: "monthly", maxAdditionalUsers: 0 }],
    [Deno.env.get("STRIPE_PRICE_PRO_ANNUAL"), { planTier: "pro", billingInterval: "annual", maxAdditionalUsers: 0 }],
    [Deno.env.get("STRIPE_PRICE_TEAM_MONTHLY"), { planTier: "team", billingInterval: "monthly", maxAdditionalUsers: 2 }],
    [Deno.env.get("STRIPE_PRICE_TEAM_ANNUAL"), { planTier: "team", billingInterval: "annual", maxAdditionalUsers: 2 }],
    [Deno.env.get("STRIPE_PRICE_ENTERPRISE_MONTHLY"), { planTier: "enterprise", billingInterval: "monthly", maxAdditionalUsers: 9 }],
    [Deno.env.get("STRIPE_PRICE_ENTERPRISE_ANNUAL"), { planTier: "enterprise", billingInterval: "annual", maxAdditionalUsers: 9 }],
    ["price_1TVyQnP2Yr0z0IcsKcAHhYX8", { planTier: "pro", billingInterval: "monthly", maxAdditionalUsers: 0 }],
    ["price_1TVyQqP2Yr0z0IcsKQ6KN3xA", { planTier: "pro", billingInterval: "annual", maxAdditionalUsers: 0 }],
    ["price_1TVyQtP2Yr0z0IcsfNMO4n3o", { planTier: "team", billingInterval: "monthly", maxAdditionalUsers: 2 }],
    ["price_1TVyQxP2Yr0z0IcsMr2gCkbm", { planTier: "team", billingInterval: "annual", maxAdditionalUsers: 2 }],
    ["price_1TVyQzP2Yr0z0Ics7qONt0Fm", { planTier: "enterprise", billingInterval: "monthly", maxAdditionalUsers: 9 }],
    ["price_1TVyR1P2Yr0z0IcsBZck11XI", { planTier: "enterprise", billingInterval: "annual", maxAdditionalUsers: 9 }],
    ["price_1TEfgIP2Yr0z0IcsX2VXk6wJ", { planTier: "pro", billingInterval: "monthly", maxAdditionalUsers: 0 }],
    ["price_1TEfi2P2Yr0z0Icsnod1blF1", { planTier: "pro", billingInterval: "annual", maxAdditionalUsers: 0 }],
    ["price_1TEfggP2Yr0z0IcsHHgS6kye", { planTier: "team", billingInterval: "monthly", maxAdditionalUsers: 2 }],
    ["price_1TEfjmP2Yr0z0IcsXW3ZujSG", { planTier: "team", billingInterval: "annual", maxAdditionalUsers: 2 }],
    ["price_1TEfhaP2Yr0z0IcsGlDJJyu7", { planTier: "enterprise", billingInterval: "monthly", maxAdditionalUsers: 9 }],
    ["price_1TEfkDP2Yr0z0IcsUhXwzh9z", { planTier: "enterprise", billingInterval: "annual", maxAdditionalUsers: 9 }],
    ["price_1TJJjFP2Yr0z0IcsZRFgIQlX", { planTier: "team", billingInterval: "monthly", maxAdditionalUsers: 2 }],
    ["price_1TJJjWP2Yr0z0IcsAV9Y4SV5", { planTier: "team", billingInterval: "annual", maxAdditionalUsers: 2 }],
    ["price_1TJJlcP2Yr0z0IcsUb9IHJuS", { planTier: "enterprise", billingInterval: "monthly", maxAdditionalUsers: 9 }],
    ["price_1TJJlpP2Yr0z0IcsDJBpCJHa", { planTier: "enterprise", billingInterval: "annual", maxAdditionalUsers: 9 }],
    ["price_1TJQdEP2Yr0z0IcsjUAm4Xq6", { planTier: "enterprise", billingInterval: "annual", maxAdditionalUsers: 9 }],
  ].filter((entry): entry is [string, { planTier: string; billingInterval: "monthly" | "annual"; maxAdditionalUsers: number | null }] => Boolean(entry[0]))
);

const getAllowedPriceIds = () => {
  const configuredPriceIds = [
    Deno.env.get("STRIPE_PRICE_PRO_MONTHLY"),
    Deno.env.get("STRIPE_PRICE_PRO_ANNUAL"),
    Deno.env.get("STRIPE_PRICE_TEAM_MONTHLY"),
    Deno.env.get("STRIPE_PRICE_TEAM_ANNUAL"),
    Deno.env.get("STRIPE_PRICE_ENTERPRISE_MONTHLY"),
    Deno.env.get("STRIPE_PRICE_ENTERPRISE_ANNUAL"),
  ].filter((value): value is string => Boolean(value && value.startsWith("price_")));

  return Array.from(new Set([...configuredPriceIds, ...CANONICAL_PRICE_IDS, ...LEGACY_PRICE_IDS]));
};

const resolvePlanMetadata = (priceId: string) =>
  PLAN_BY_PRICE_ID.get(priceId) || { planTier: "pro", billingInterval: "monthly" as const, maxAdditionalUsers: 0 };

const hashToken = async (token: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
};

const generateToken = () => `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "");

const _rlMap = new Map<string, { count: number; windowStart: number }>();
const _rlCheck = (ip: string, limit: number, windowMs: number): boolean => {
  const now = Date.now();
  const entry = _rlMap.get(ip);
  if (!entry || now - entry.windowStart > windowMs) {
    _rlMap.set(ip, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  return entry.count > limit;
};

serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";
  const corsHeaders = {
    "Access-Control-Allow-Origin": ["https://sermonslidepro.com", "https://www.sermonslidepro.com", "http://localhost:8080", "http://localhost:5173"].includes(origin) ? origin : "https://sermonslidepro.com",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? req.headers.get("cf-connecting-ip") ?? "unknown";
  if (_rlCheck(ip, 10, 60_000)) return json({ error: "Too many requests. Please try again later." }, 429);

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    const body = await req.json().catch(() => ({}));
    const action = clean(body?.action) || "create";

    if (action === "validate") {
      const token = clean(body?.token);
      const sessionId = clean(body?.sessionId);
      if (!token) throw new Error("Signup token is required");

      const tokenHash = await hashToken(token);
      const { data: signup, error } = await supabaseAdmin
        .from("paid_signup_sessions" as any)
        .select("*")
        .or(`token_hash.eq.${tokenHash},finish_token_hash.eq.${tokenHash}`)
        .maybeSingle();

      if (error) throw new Error(error.message);
      if (!signup) throw new Error("This signup link is invalid.");

      if (new Date(signup.expires_at).getTime() <= Date.now() && signup.status !== "completed") {
        await supabaseAdmin
          .from("paid_signup_sessions" as any)
          .update({ status: "expired" })
          .eq("id", signup.id);
        throw new Error("This signup link has expired.");
      }

      let currentSignup = signup;
      if (signup.status === "checkout_started" && sessionId && sessionId === signup.stripe_checkout_session_id) {
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        if (session.status === "complete" && session.payment_status === "paid") {
          const checkoutEmail = normalizeEmail(session.customer_details?.email || session.customer_email);
          const updates = {
            status: "paid",
            paid_at: new Date().toISOString(),
            checkout_email: checkoutEmail,
            stripe_customer_id: typeof session.customer === "string" ? session.customer : null,
            stripe_subscription_id: typeof session.subscription === "string" ? session.subscription : null,
          };
          const { data: updated, error: updateError } = await supabaseAdmin
            .from("paid_signup_sessions" as any)
            .update(updates)
            .eq("id", signup.id)
            .select("*")
            .single();
          if (updateError) throw new Error(updateError.message);
          currentSignup = updated;
        }
      }

      if (currentSignup.status === "completed") {
        throw new Error("This signup link has already been used.");
      }
      if (currentSignup.status === "email_conflict") {
        return json({
          status: "email_conflict",
          email: currentSignup.checkout_email,
          message: "This email is already connected to an account. Please log in or contact support.",
        });
      }
      if (currentSignup.status !== "paid") {
        throw new Error("Payment has not been completed yet.");
      }

      const email = normalizeEmail(currentSignup.checkout_email);
      if (!email) throw new Error("Stripe did not provide a checkout email. Please contact support.");

      const { data: conflictingProfiles, error: conflictError } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .ilike("email", email)
        .limit(1);
      if (conflictError) throw new Error(conflictError.message);
      if ((conflictingProfiles || []).length > 0) {
        await supabaseAdmin
          .from("paid_signup_sessions" as any)
          .update({ status: "email_conflict" })
          .eq("id", currentSignup.id);
        return json({
          status: "email_conflict",
          email,
          message: "This email is already connected to an account. Please log in or contact support.",
        });
      }

      return json({
        status: currentSignup.status,
        email,
        priceId: currentSignup.price_id,
        planTier: currentSignup.plan_tier,
        billingInterval: currentSignup.billing_interval,
      });
    }

    const priceId = clean(body?.priceId);
    const acceptedLegal = body?.acceptedLegal === true;
    const termsVersion = clean(body?.termsVersion) || CURRENT_TERMS_VERSION;
    const privacyVersion = clean(body?.privacyVersion) || CURRENT_PRIVACY_VERSION;

    if (!priceId || !priceId.startsWith("price_")) throw new Error("A subscription plan is required");
    if (!acceptedLegal) throw new Error("You must agree to the Terms and Conditions and acknowledge the Privacy Policy");
    if (!getAllowedPriceIds().includes(priceId)) throw new Error("Unsupported subscription price selected");

    const planMeta = resolvePlanMetadata(priceId);
    const token = generateToken();
    const tokenHash = await hashToken(token);
    const origin = getTrustedAppOrigin(req);

    const { data: signup, error: insertError } = await supabaseAdmin
      .from("paid_signup_sessions" as any)
      .insert({
        token_hash: tokenHash,
        price_id: priceId,
        plan_tier: planMeta.planTier,
        billing_interval: planMeta.billingInterval,
        max_additional_users: planMeta.maxAdditionalUsers ?? 0,
        status: "checkout_started",
        expires_at: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
        metadata: {
          priceId,
          termsAcceptedAt: new Date().toISOString(),
          privacyAcknowledgedAt: new Date().toISOString(),
          termsVersion,
          privacyVersion,
        },
      })
      .select("id")
      .single();
    if (insertError) throw new Error(insertError.message);

    const session = await stripe.checkout.sessions.create({
      // Enables promo code input field on Stripe Checkout
      allow_promotion_codes: true,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/signup/complete?token=${encodeURIComponent(token)}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/signup?checkout=cancelled`,
      client_reference_id: signup.id,
      metadata: {
        signup_flow: "paid_owner_signup",
        paid_signup_id: signup.id,
        paid_signup_token_hash: tokenHash,
        price_id: priceId,
      },
    });

    const { error: updateError } = await supabaseAdmin
      .from("paid_signup_sessions" as any)
      .update({ stripe_checkout_session_id: session.id })
      .eq("id", signup.id);
    if (updateError) throw new Error(updateError.message);

    logStep("Signup checkout created", { sessionId: session.id, signupId: signup.id, priceId });
    return json({ url: session.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    logStep("ERROR", { message });
    return json({ error: message }, 400);
  }
});
