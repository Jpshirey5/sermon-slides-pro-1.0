import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: any) => {
  console.log(`[DELETE-ACCOUNT] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);
};

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const clean = (value: unknown) => String(value ?? "").trim();

const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
const maxDate = (a: Date, b: Date | null) => (b && b.getTime() > a.getTime() ? b : a);
const toIsoOrNull = (date: Date | null) => date ? date.toISOString() : null;

type AlertDetails = {
  fullName: string;
  email: string;
  accountName: string;
  accountId: string;
  role: string;
  wasOwner: boolean;
  reason: string;
  additionalFeedback: string;
  planTier?: string | null;
  billingInterval?: string | null;
  subscriptionPeriodEnd?: string | null;
  cancelableUntil?: string | null;
  scheduledDeleteAt?: string | null;
  stripeSchedulingError?: string | null;
};

async function sendDeletionAlert(details: AlertDetails) {
  const resendApiKey = Deno.env.get("RESEND_API_KEY") ?? "";
  const resendFromEmail = Deno.env.get("RESEND_FROM_EMAIL") ?? "";
  const resendFromName = Deno.env.get("RESEND_FROM_NAME") || "Sermon Slide Pro Support";
  const supportEmail = Deno.env.get("SUPPORT_CONTACT_EMAIL") || "support@sermonslidepro.com";

  if (!resendApiKey || !resendFromEmail) {
    throw new Error("Deletion alert email service is not configured");
  }

  const submittedAt = new Date().toISOString();
  const subject = details.wasOwner
    ? "Account Deletion Requested - Save Opportunity"
    : "Member Account Deleted - Sermon Slide Pro";
  const title = details.wasOwner
    ? "Sermon Slide Pro Account Deletion Requested"
    : "Sermon Slide Pro Member Account Deleted";
  const safeFullName = escapeHtml(details.fullName || "Not provided");
  const safeEmail = escapeHtml(details.email || "Not provided");
  const safeAccountName = escapeHtml(details.accountName || "Unknown organization");
  const safeAccountId = escapeHtml(details.accountId);
  const safeRole = escapeHtml(details.wasOwner ? "Owner" : details.role || "Member");
  const safeReason = escapeHtml(details.reason);
  const safeFeedback = escapeHtml(details.additionalFeedback).replaceAll("\n", "<br />");
  const safePlan = escapeHtml(details.planTier || "Unavailable");
  const safeInterval = escapeHtml(details.billingInterval || "Unavailable");
  const safePeriodEnd = escapeHtml(details.subscriptionPeriodEnd || "Unavailable");
  const safeCancelableUntil = escapeHtml(details.cancelableUntil || "Not applicable");
  const safeScheduledDeleteAt = escapeHtml(details.scheduledDeleteAt || "Not applicable");
  const safeStripeError = escapeHtml(details.stripeSchedulingError || "");

  const ownerFields = details.wasOwner
    ? `
      <p><strong>Plan:</strong> ${safePlan}</p>
      <p><strong>Billing interval:</strong> ${safeInterval}</p>
      <p><strong>Subscription period end:</strong> ${safePeriodEnd}</p>
      <p><strong>Cancelable until:</strong> ${safeCancelableUntil}</p>
      <p><strong>Scheduled deletion:</strong> ${safeScheduledDeleteAt}</p>
      ${safeStripeError ? `<p><strong>Stripe scheduling issue:</strong> ${safeStripeError}</p>` : ""}
    `
    : "";

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
      <h2 style="margin-bottom: 16px;">${title}</h2>
      ${details.wasOwner ? "<p><strong>Save opportunity:</strong> reach out during the 7-day grace period before deletion is locked in.</p>" : ""}
      <p><strong>Name:</strong> ${safeFullName}</p>
      <p><strong>Email:</strong> ${safeEmail}</p>
      <p><strong>Organization:</strong> ${safeAccountName}</p>
      <p><strong>Account ID:</strong> ${safeAccountId}</p>
      <p><strong>Role:</strong> ${safeRole}</p>
      <p><strong>Submitted at:</strong> ${escapeHtml(submittedAt)}</p>
      ${ownerFields}
      <hr style="margin: 24px 0; border: 0; border-top: 1px solid #e5e7eb;" />
      <p><strong>Reason:</strong> ${safeReason}</p>
      <p><strong>Additional feedback:</strong></p>
      <p>${safeFeedback}</p>
    </div>
  `;
  const text = `${title}

${details.wasOwner ? "Save opportunity: reach out during the 7-day grace period before deletion is locked in.\n\n" : ""}Name: ${details.fullName || "Not provided"}
Email: ${details.email || "Not provided"}
Organization: ${details.accountName || "Unknown organization"}
Account ID: ${details.accountId}
Role: ${details.wasOwner ? "Owner" : details.role || "Member"}
Submitted at: ${submittedAt}
${details.wasOwner ? `Plan: ${details.planTier || "Unavailable"}
Billing interval: ${details.billingInterval || "Unavailable"}
Subscription period end: ${details.subscriptionPeriodEnd || "Unavailable"}
Cancelable until: ${details.cancelableUntil || "Not applicable"}
Scheduled deletion: ${details.scheduledDeleteAt || "Not applicable"}
${details.stripeSchedulingError ? `Stripe scheduling issue: ${details.stripeSchedulingError}\n` : ""}` : ""}
Reason:
${details.reason}

Additional feedback:
${details.additionalFeedback}`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `${resendFromName} <${resendFromEmail}>`,
      to: [supportEmail],
      subject,
      html,
      text,
      reply_to: details.email || undefined,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Resend email failed: ${response.status} ${errorBody}`);
  }
}

const createAdminNotification = async (
  supabaseClient: ReturnType<typeof createClient>,
  notification: {
    type: "account_deletion_requested" | "account_saving_needed" | "support_request" | "subscription_changed";
    title: string;
    message: string;
    accountId?: string | null;
    supportRequestId?: string | null;
    accountDeletionRequestId?: string | null;
    metadata?: Record<string, unknown>;
  },
) => {
  const { error } = await supabaseClient.from("admin_notifications" as any).insert({
    type: notification.type,
    title: notification.title,
    message: notification.message,
    account_id: notification.accountId ?? null,
    support_request_id: notification.supportRequestId ?? null,
    account_deletion_request_id: notification.accountDeletionRequestId ?? null,
    metadata: notification.metadata ?? {},
  });
  if (error) logStep("Admin notification insert failed", { error: error.message, type: notification.type });
};

const createCancellationSupportTicket = async (
  supabaseClient: ReturnType<typeof createClient>,
  options: {
    accountId: string;
    accountName: string;
    userId: string;
    requesterName: string;
    requesterEmail: string;
  },
) => {
  const { data, error } = await supabaseClient
    .from("support_requests")
    .insert({
      account_id: options.accountId,
      user_id: options.userId,
      name: options.requesterName || "Unknown customer",
      email: options.requesterEmail || "support@sermonslidepro.com",
      organization: options.accountName,
      subject: "Cancellation submission",
      message: `${options.accountName} has submitted for Offboarding. Reach out to confirm and support to save customer if applicable.`,
      submitted_from: "account_deletion_request",
      notification_sent: false,
    })
    .select("id")
    .single();

  if (error || !data) {
    logStep("Cancellation support ticket insert failed", { accountId: options.accountId, error: error?.message });
    return null;
  }

  return data.id as string;
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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) throw new Error("Authentication failed");

    const userId = claimsData.claims.sub as string;
    const email = claimsData.claims.email as string | null;
    if (!userId) throw new Error("Invalid user claims");

    const body = await req.json();
    const reason = clean(body?.reason);
    const additionalFeedback = clean(body?.additional_feedback);

    if (!reason) throw new Error("Exit reason is required");
    if (!additionalFeedback) throw new Error("Additional feedback is required");

    const { data: accountId } = await supabaseClient.rpc("get_user_account_id", { _user_id: userId });
    if (!accountId) throw new Error("No account found for user");

    const [{ data: profile }, { data: membership }, { data: account }] = await Promise.all([
      supabaseClient.from("profiles").select("full_name, email").eq("id", userId).maybeSingle(),
      supabaseClient.from("account_members").select("role").eq("account_id", accountId).eq("user_id", userId).maybeSingle(),
      supabaseClient
        .from("accounts")
        .select("name, stripe_customer_id, stripe_subscription_id, subscription_period_end, plan_tier, billing_interval")
        .eq("id", accountId)
        .maybeSingle(),
    ]);

    const isOwner = membership?.role === "owner";
    const trustedFullName = clean(profile?.full_name) || clean(body?.full_name) || "Not provided";
    const trustedEmail = clean(profile?.email) || clean(email) || clean(body?.email) || "";
    const accountName = clean(account?.name) || "Unknown organization";

    try {
      await supabaseClient.from("exit_surveys" as any).insert({
        requester_user_id: userId,
        requester_email: trustedEmail || email,
        account_id: accountId,
        was_owner: isOwner,
        reason,
        additional_feedback: additionalFeedback,
      } as any);
    } catch (surveyInsertErr) {
      logStep("Survey insert failed, continuing", { error: String(surveyInsertErr) });
    }

    if (!isOwner) {
      try {
        await sendDeletionAlert({
          fullName: trustedFullName,
          email: trustedEmail,
          accountName,
          accountId,
          role: clean(membership?.role) || "member",
          wasOwner: false,
          reason,
          additionalFeedback,
        });
      } catch (emailError) {
        logStep("Member deletion alert email failed, continuing deletion", { error: String(emailError) });
      }

      await supabaseClient
        .from("account_members")
        .delete()
        .eq("account_id", accountId)
        .eq("user_id", userId);

      const { error } = await supabaseClient.auth.admin.deleteUser(userId);
      if (error) {
        throw new Error(`Failed deleting user: ${error.message}`);
      }

      logStep("Member account deletion completed", { accountId, userId });

      return new Response(JSON.stringify({ success: true, scope: "member" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const confirmation = clean(body?.organization_confirmation);
    if (!confirmation || confirmation.toLowerCase() !== accountName.toLowerCase()) {
      throw new Error("Please type your organization name exactly to request organization deletion.");
    }

    const { data: existingRequest } = await supabaseClient
      .from("account_deletion_requests" as any)
      .select("id, cancelable_until, scheduled_delete_at, subscription_period_end, alert_email_sent")
      .eq("account_id", accountId)
      .eq("status", "pending")
      .maybeSingle();

    if (existingRequest) {
      return new Response(JSON.stringify({
        success: true,
        scope: "owner",
        alreadyPending: true,
        deletionRequest: existingRequest,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const now = new Date();
    const cancelableUntil = addDays(now, 7);
    let subscriptionPeriodEnd = account?.subscription_period_end ? new Date(account.subscription_period_end) : null;
    let stripeSchedulingError: string | null = null;

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const customerId = account?.stripe_customer_id || null;
    let subscriptionId = account?.stripe_subscription_id || null;

    if (stripeKey && (subscriptionId || customerId)) {
      const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
      try {
        let subscription: Stripe.Subscription | null = null;
        if (subscriptionId) {
          const retrieved = await stripe.subscriptions.retrieve(subscriptionId);
          if (retrieved.status !== "canceled" && retrieved.status !== "incomplete_expired") {
            subscription = retrieved;
          }
        }

        if (!subscription && customerId) {
          const subscriptions = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 10 });
          subscription = subscriptions.data.find((sub) =>
            sub.status === "active" || sub.status === "trialing" || sub.status === "past_due"
          ) || null;
          subscriptionId = subscription?.id || subscriptionId;
        }

        if (subscription) {
          const updated = await stripe.subscriptions.update(subscription.id, { cancel_at_period_end: true });
          const endTimestamp = typeof updated.current_period_end === "number" ? updated.current_period_end : null;
          if (endTimestamp) {
            subscriptionPeriodEnd = new Date(endTimestamp * 1000);
          }

          await supabaseClient
            .from("accounts")
            .update({
              stripe_subscription_id: updated.id,
              subscription_period_end: toIsoOrNull(subscriptionPeriodEnd),
            })
            .eq("id", accountId);
          logStep("Subscription set to cancel at period end", { subscriptionId: updated.id });
        }
      } catch (stripeError) {
        stripeSchedulingError = stripeError instanceof Error ? stripeError.message : String(stripeError);
        logStep("Stripe period-end cancellation failed", { error: stripeSchedulingError });
      }
    }

    const scheduledDeleteAt = maxDate(cancelableUntil, subscriptionPeriodEnd);
    const insertPayload = {
      account_id: accountId,
      requester_user_id: userId,
      requester_email: trustedEmail || email,
      requester_full_name: trustedFullName,
      account_name: accountName,
      requester_role: "owner",
      plan_tier: account?.plan_tier || null,
      billing_interval: account?.billing_interval || null,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      reason,
      additional_feedback: additionalFeedback,
      cancelable_until: cancelableUntil.toISOString(),
      subscription_period_end: toIsoOrNull(subscriptionPeriodEnd),
      scheduled_delete_at: scheduledDeleteAt.toISOString(),
      last_error: stripeSchedulingError,
      alert_email_sent: false,
    };

    const { data: deletionRequest, error: insertError } = await supabaseClient
      .from("account_deletion_requests" as any)
      .insert(insertPayload)
      .select("id, cancelable_until, scheduled_delete_at, subscription_period_end, alert_email_sent")
      .single();

    if (insertError || !deletionRequest) {
      throw new Error(`Failed creating deletion request: ${insertError?.message || "Unknown error"}`);
    }

    const cancellationSupportRequestId = await createCancellationSupportTicket(supabaseClient, {
      accountId,
      accountName,
      userId,
      requesterName: trustedFullName,
      requesterEmail: trustedEmail || email || "",
    });

    await createAdminNotification(supabaseClient, {
      type: "account_deletion_requested",
      title: "Cancellation submission",
      message: `${accountName} has submitted for Offboarding. Reach out to confirm and support to save customer if applicable.`,
      accountId,
      supportRequestId: cancellationSupportRequestId,
      accountDeletionRequestId: deletionRequest.id,
      metadata: {
        requesterEmail: trustedEmail || email,
        requesterName: trustedFullName,
        cancelableUntil: cancelableUntil.toISOString(),
        scheduledDeleteAt: scheduledDeleteAt.toISOString(),
        subscriptionPeriodEnd: toIsoOrNull(subscriptionPeriodEnd),
      },
    });

    try {
      await sendDeletionAlert({
        fullName: trustedFullName,
        email: trustedEmail,
        accountName,
        accountId,
        role: "owner",
        wasOwner: true,
        reason,
        additionalFeedback,
        planTier: account?.plan_tier || null,
        billingInterval: account?.billing_interval || null,
        subscriptionPeriodEnd: toIsoOrNull(subscriptionPeriodEnd),
        cancelableUntil: cancelableUntil.toISOString(),
        scheduledDeleteAt: scheduledDeleteAt.toISOString(),
        stripeSchedulingError,
      });

      await supabaseClient
        .from("account_deletion_requests" as any)
        .update({ alert_email_sent: true, alert_email_error: null })
        .eq("id", deletionRequest.id);
      if (cancellationSupportRequestId) {
        await supabaseClient
          .from("support_requests")
          .update({ notification_sent: true, notification_error: null })
          .eq("id", cancellationSupportRequestId);
      }
      deletionRequest.alert_email_sent = true;
      logStep("Save-account deletion request alert sent", { accountId, userId });
    } catch (emailError) {
      const emailErrorMessage = emailError instanceof Error ? emailError.message : String(emailError);
      await supabaseClient
        .from("account_deletion_requests" as any)
        .update({ alert_email_sent: false, alert_email_error: emailErrorMessage })
        .eq("id", deletionRequest.id);
      if (cancellationSupportRequestId) {
        await supabaseClient
          .from("support_requests")
          .update({ notification_sent: false, notification_error: emailErrorMessage })
          .eq("id", cancellationSupportRequestId);
      }
      logStep("Save-account deletion request alert failed", { error: emailErrorMessage });
    }

    return new Response(JSON.stringify({
      success: true,
      scope: "owner",
      deletionScheduled: true,
      deletionRequest,
      stripeSchedulingError,
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
