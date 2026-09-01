import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { hashToken, generateToken, sendPaidSignupFinishEmail } from "../_shared/paid-signup.ts";


const logStep = (step: string, details?: any) => {
  console.log(`[STRIPE-WEBHOOK] ${step}${details ? ` - ${JSON.stringify(details)}` : ''}`);
};

const PLAN_BY_PRICE_ID = new Map<string, { planTier: string; billingInterval: "monthly" | "annual"; maxAdditionalUsers: number | null }>(
  [
    [Deno.env.get("STRIPE_PRICE_CORE_MONTHLY"), { planTier: "core", billingInterval: "monthly", maxAdditionalUsers: 2 }],
    [Deno.env.get("STRIPE_PRICE_CORE_ANNUAL"), { planTier: "core", billingInterval: "annual", maxAdditionalUsers: 2 }],
    [Deno.env.get("STRIPE_PRICE_TEAM_MONTHLY"), { planTier: "team", billingInterval: "monthly", maxAdditionalUsers: 9 }],
    [Deno.env.get("STRIPE_PRICE_TEAM_ANNUAL"), { planTier: "team", billingInterval: "annual", maxAdditionalUsers: 9 }],
  ].filter((entry): entry is [string, { planTier: string; billingInterval: "monthly" | "annual"; maxAdditionalUsers: number | null }] => Boolean(entry[0]))
);

const resolvePlanMetadata = (priceId?: string | null) => {
  if (!priceId) return { planTier: "free", billingInterval: null, maxAdditionalUsers: 0 };
  return PLAN_BY_PRICE_ID.get(priceId) || { planTier: "free", billingInterval: null, maxAdditionalUsers: 0 };
};

const createAdminNotification = async (
  supabaseClient: ReturnType<typeof createClient>,
  notification: {
    type?: "subscription_changed" | "payment_issue" | "orphaned_stripe_customer";
    title: string;
    message: string;
    accountId?: string | null;
    externalEventId?: string | null;
    metadata?: Record<string, unknown>;
  },
) => {
  const { error } = await supabaseClient.from("admin_notifications" as any).insert({
    type: notification.type ?? "subscription_changed",
    title: notification.title,
    message: notification.message,
    account_id: notification.accountId ?? null,
    external_event_id: notification.externalEventId ?? null,
    metadata: notification.metadata ?? {},
  });
  if (error) {
    if (notification.externalEventId && error.code === "23505") {
      logStep("Admin notification already exists", { externalEventId: notification.externalEventId });
      return;
    }
    logStep("Admin notification insert failed", { error: error.message });
  }
};

const getAccountForStripeCustomer = async (
  supabaseClient: ReturnType<typeof createClient>,
  customerId: string,
) => {
  const { data } = await supabaseClient
    .from("accounts")
    .select("id, name")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  return data || null;
};

const getStripeCustomerContact = async (
  stripe: Stripe,
  customerId?: string | null,
) => {
  if (!customerId) return { email: null, name: null };

  try {
    const customer = await stripe.customers.retrieve(customerId);
    if ("deleted" in customer && customer.deleted) return { email: null, name: null };
    return {
      email: customer.email ?? null,
      name: customer.name ?? null,
    };
  } catch (error) {
    logStep("Failed retrieving Stripe customer contact", { customerId, error: String(error) });
    return { email: null, name: null };
  }
};

const createPaymentIssueNotification = async (
  stripe: Stripe,
  supabaseClient: ReturnType<typeof createClient>,
  notification: {
    eventId: string;
    customerId?: string | null;
    customerEmail?: string | null;
    customerName?: string | null;
    amount?: number | null;
    date?: string | null;
    status?: string | null;
    stripeInvoiceId?: string | null;
    paymentIntentId?: string | null;
  },
) => {
  const customerId = notification.customerId ?? null;
  const account = customerId ? await getAccountForStripeCustomer(supabaseClient, customerId) : null;
  const customerContact = (!notification.customerEmail || !notification.customerName) && customerId
    ? await getStripeCustomerContact(stripe, customerId)
    : { email: null, name: null };

  await createAdminNotification(supabaseClient, {
    type: "payment_issue",
    title: "Payment Failed",
    message: "A customer payment failed. Action may be required.",
    accountId: account?.id || null,
    externalEventId: notification.eventId,
    metadata: {
      stripeEventId: notification.eventId,
      customerEmail: notification.customerEmail ?? customerContact.email,
      customerName: notification.customerName ?? customerContact.name,
      amount: typeof notification.amount === "number" ? notification.amount : null,
      date: notification.date ?? new Date().toISOString(),
      stripeCustomerId: customerId,
      stripeInvoiceId: notification.stripeInvoiceId ?? null,
      paymentIntentId: notification.paymentIntentId ?? null,
      status: notification.status ?? null,
    },
  });
};

serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";
  const corsHeaders = {
    "Access-Control-Allow-Origin": ["https://sermonslidepro.com", "https://www.sermonslidepro.com", "http://localhost:8080", "http://localhost:5173"].includes(origin) ? origin : "https://sermonslidepro.com",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
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
        const signupFlow = session.metadata?.signup_flow;
        const paidSignupId = session.metadata?.paid_signup_id;
        const paidSignupTokenHash = session.metadata?.paid_signup_token_hash;
        const accountId = session.metadata?.account_id;
        const lineItemPriceId = typeof session.metadata?.price_id === "string" ? session.metadata.price_id : null;
        const planMeta = resolvePlanMetadata(lineItemPriceId);

        logStep("Checkout completed", { customerId, subscriptionId, accountId });

        if (signupFlow === "paid_owner_signup") {
          const checkoutEmail = (session.customer_details?.email || session.customer_email || "").trim().toLowerCase();
          if (!paidSignupId || !paidSignupTokenHash) {
            logStep("WARNING: Paid signup checkout missing metadata", { sessionId: session.id });
            break;
          }

          const { data: conflictingProfiles } = checkoutEmail
            ? await supabaseClient.from("profiles").select("id").ilike("email", checkoutEmail).limit(1)
            : { data: [] };

          const hasConflict = Boolean((conflictingProfiles || []).length);
          const finishToken = generateToken();
          const finishTokenHash = await hashToken(finishToken);

          const updatePayload: Record<string, unknown> = {
            checkout_email: checkoutEmail || null,
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            price_id: lineItemPriceId,
            plan_tier: planMeta.planTier,
            billing_interval: planMeta.billingInterval,
            max_additional_users: planMeta.maxAdditionalUsers ?? 0,
            paid_at: new Date().toISOString(),
            metadata: { stripeEventId: event.id, stripeSessionId: session.id },
          };

          if (hasConflict) {
            updatePayload.status = "email_conflict";
          } else {
            updatePayload.status = "paid";
            updatePayload.finish_token_hash = finishTokenHash;
          }

          const { data: updatedPaidSignup, error: updateError } = await supabaseClient
            .from("paid_signup_sessions" as any)
            .update(updatePayload)
            .eq("id", paidSignupId)
            .eq("token_hash", paidSignupTokenHash)
            .neq("status", "completed")
            .select("id")
            .maybeSingle();

          if (updateError) {
            logStep("Paid signup update failed", { error: updateError.message, paidSignupId });
            break;
          }
          if (!updatedPaidSignup) {
            logStep("Paid signup already completed or not found", { paidSignupId });
            break;
          }

          if (hasConflict) {
            await createAdminNotification(supabaseClient, {
              type: "payment_issue",
              title: "Paid Signup Email Conflict",
              message: "A customer paid for signup using an email that already exists. Support may be required.",
              externalEventId: event.id,
              metadata: { eventId: event.id, customerId, subscriptionId, checkoutEmail, paidSignupId },
            });
            break;
          }

          if (checkoutEmail) {
            const emailResult = await sendPaidSignupFinishEmail(checkoutEmail, finishToken);
            await supabaseClient
              .from("paid_signup_sessions" as any)
              .update({
                finish_email_sent_at: emailResult.sent ? new Date().toISOString() : null,
                finish_email_error: emailResult.error,
              })
              .eq("id", paidSignupId);
          }

          await createAdminNotification(supabaseClient, {
            title: "Paid signup completed checkout",
            message: "A new customer paid and needs to finish creating their account.",
            externalEventId: event.id,
            metadata: { eventId: event.id, customerId, subscriptionId, checkoutEmail, planTier: planMeta.planTier },
          });
          break;
        }

        if (accountId) {
          // Direct update via metadata
          await supabaseClient
            .from("accounts")
            .update({
              plan_tier: planMeta.planTier,
              billing_interval: planMeta.billingInterval,
              max_additional_users: planMeta.maxAdditionalUsers,
              subscription_status: "active",
              signup_status: "active",
              stripe_customer_id: customerId,
              stripe_subscription_id: subscriptionId,
            })
            .eq("id", accountId);
          logStep("Updated account via metadata", { accountId });
          await createAdminNotification(supabaseClient, {
            title: "Subscription activated",
            message: `A subscription was activated for account ${accountId}.`,
            accountId,
            metadata: { eventId: event.id, customerId, subscriptionId, planTier: planMeta.planTier },
          });
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
                signup_status: "active",
                stripe_subscription_id: subscriptionId,
              })
              .eq("id", account.id);
            logStep("Updated account via customer lookup", { accountId: account.id });
            await createAdminNotification(supabaseClient, {
              title: "Subscription activated",
              message: `A subscription was activated for account ${account.id}.`,
              accountId: account.id,
              metadata: { eventId: event.id, customerId, subscriptionId, planTier: planMeta.planTier },
            });
          } else {
            logStep("WARNING: Could not find account for customer", { customerId });
            const contact = await getStripeCustomerContact(stripe, customerId);
            await createAdminNotification(supabaseClient, {
              type: "orphaned_stripe_customer",
              title: "Stripe checkout has no matching account",
              message: `A Stripe checkout completed for customer ${contact.email || customerId}, but no matching account or paid-signup session was found. This customer may need manual account creation.`,
              externalEventId: event.id,
              metadata: {
                stripeEventId: event.id,
                stripeCustomerId: customerId,
                stripeSubscriptionId: subscriptionId,
                customerEmail: contact.email,
                customerName: contact.name,
                priceId: lineItemPriceId,
                planTier: planMeta.planTier,
              },
            });
          }
        }
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const status = sub.status;
        const customerId = sub.customer as string;
        const previous = event.data.previous_attributes as any;
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
            ...(isActive ? { signup_status: "active" } : {}),
            stripe_subscription_id: sub.id,
            subscription_period_end: subscriptionEnd,
          })
          .eq("stripe_customer_id", customerId);

        const notifyStatusChanged = Boolean(previous?.status && previous.status !== status);
        const notifyCancellationChanged = typeof previous?.cancel_at_period_end !== "undefined";
        if (notifyStatusChanged || notifyCancellationChanged || sub.cancel_at_period_end || status === "past_due" || status === "unpaid") {
          const account = await getAccountForStripeCustomer(supabaseClient, customerId);
          const title = sub.cancel_at_period_end
            ? "Subscription cancellation scheduled"
            : status === "past_due" || status === "unpaid"
            ? "Subscription needs attention"
            : isActive
            ? "Subscription active"
            : "Subscription changed";
          const message = `${account?.name || "A customer"} subscription is now ${sub.cancel_at_period_end ? "canceling at period end" : status}.`;
          await createAdminNotification(supabaseClient, {
            title,
            message,
            accountId: account?.id || null,
            metadata: {
              eventId: event.id,
              customerId,
              subscriptionId: sub.id,
              status,
              cancelAtPeriodEnd: sub.cancel_at_period_end,
              subscriptionEnd,
            },
          });
        }
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
        const account = await getAccountForStripeCustomer(supabaseClient, customerId);
        await createAdminNotification(supabaseClient, {
          title: "Subscription canceled",
          message: `${account?.name || "A customer"} subscription was canceled in Stripe.`,
          accountId: account?.id || null,
          metadata: { eventId: event.id, customerId, subscriptionId: sub.id, status: sub.status },
        });
        break;
      }

      case "charge.failed": {
        if (!event.livemode) break;

        const charge = event.data.object as Stripe.Charge;
        await createPaymentIssueNotification(stripe, supabaseClient, {
          eventId: event.id,
          customerId: typeof charge.customer === "string" ? charge.customer : null,
          customerEmail: charge.billing_details?.email ?? null,
          customerName: charge.billing_details?.name ?? null,
          amount: charge.amount ?? null,
          date: new Date(charge.created * 1000).toISOString(),
          status: charge.status ?? null,
          stripeInvoiceId: typeof charge.invoice === "string" ? charge.invoice : null,
          paymentIntentId: typeof charge.payment_intent === "string" ? charge.payment_intent : null,
        });
        break;
      }

      case "invoice.payment_failed": {
        if (!event.livemode) break;

        const invoice = event.data.object as Stripe.Invoice;
        await createPaymentIssueNotification(stripe, supabaseClient, {
          eventId: event.id,
          customerId: typeof invoice.customer === "string" ? invoice.customer : null,
          customerEmail: (invoice as any).customer_email ?? null,
          customerName: (invoice as any).customer_name ?? null,
          amount: invoice.amount_due ?? invoice.amount_paid ?? null,
          date: new Date(invoice.created * 1000).toISOString(),
          status: invoice.status ?? null,
          stripeInvoiceId: invoice.id,
          paymentIntentId: typeof (invoice as any).payment_intent === "string" ? (invoice as any).payment_intent : null,
        });
        break;
      }

      case "payment_intent.payment_failed": {
        if (!event.livemode) break;

        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        await createPaymentIssueNotification(stripe, supabaseClient, {
          eventId: event.id,
          customerId: typeof paymentIntent.customer === "string" ? paymentIntent.customer : null,
          customerEmail: paymentIntent.receipt_email ?? null,
          amount: paymentIntent.amount ?? null,
          date: new Date(paymentIntent.created * 1000).toISOString(),
          status: paymentIntent.status ?? null,
          paymentIntentId: paymentIntent.id,
        });
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
