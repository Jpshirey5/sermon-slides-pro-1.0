import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-finalize-secret, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  console.log(`[FINALIZE-ACCOUNT-DELETIONS] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);
};

const cancelAndDeleteStripeCustomer = async (
  stripe: Stripe,
  customerId: string,
  subscriptionId: string | null
) => {
  const subscriptionIds = new Set<string>();
  if (subscriptionId) subscriptionIds.add(subscriptionId);

  try {
    const subscriptions = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 });
    for (const sub of subscriptions.data) {
      subscriptionIds.add(sub.id);
    }
  } catch (error) {
    logStep("Failed listing Stripe subscriptions before final delete", { customerId, error: String(error) });
  }

  for (const id of subscriptionIds) {
    try {
      const subscription = await stripe.subscriptions.retrieve(id);
      if (subscription.status !== "canceled" && subscription.status !== "incomplete_expired") {
        await stripe.subscriptions.cancel(id);
        logStep("Canceled Stripe subscription during finalization", { subscriptionId: id });
      }
    } catch (error) {
      logStep("Failed canceling Stripe subscription during finalization", { subscriptionId: id, error: String(error) });
    }
  }

  try {
    await stripe.customers.del(customerId);
    logStep("Deleted Stripe customer during finalization", { customerId });
  } catch (error) {
    logStep("Failed deleting Stripe customer during finalization", { customerId, error: String(error) });
  }
};

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const createAdminNotification = async (
  supabaseAdmin: ReturnType<typeof createClient>,
  notification: {
    type: "account_saving_needed" | "support_request";
    title: string;
    message: string;
    accountId?: string | null;
    supportRequestId?: string | null;
    accountDeletionRequestId?: string | null;
    metadata?: Record<string, unknown>;
  },
) => {
  const { error } = await supabaseAdmin.from("admin_notifications" as any).insert({
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

const sendAccountSavingSupportEmail = async (ticket: {
  name: string;
  email: string;
  organization: string;
  accountId: string;
  message: string;
}) => {
  const resendApiKey = Deno.env.get("RESEND_API_KEY") ?? "";
  const resendFromEmail = Deno.env.get("RESEND_FROM_EMAIL") ?? "";
  const resendFromName = Deno.env.get("RESEND_FROM_NAME") || "Sermon Slide Pro Support";
  const supportEmail = Deno.env.get("SUPPORT_CONTACT_EMAIL") || "support@sermonslidepro.com";
  if (!resendApiKey || !resendFromEmail) {
    throw new Error("Support email service is not configured");
  }

  const safeName = escapeHtml(ticket.name || "Unknown customer");
  const safeEmail = escapeHtml(ticket.email || "No email");
  const safeOrg = escapeHtml(ticket.organization || "Unknown organization");
  const safeAccountId = escapeHtml(ticket.accountId);
  const safeMessage = escapeHtml(ticket.message).replaceAll("\n", "<br />");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `${resendFromName} <${resendFromEmail}>`,
      to: [supportEmail],
      subject: "Account Saving - Grace Period Ended",
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
          <h2>Account Saving Follow-Up Needed</h2>
          <p>The 7-day deletion grace period has ended for this customer. Reach out before paid access ends.</p>
          <p><strong>Name:</strong> ${safeName}</p>
          <p><strong>Email:</strong> ${safeEmail}</p>
          <p><strong>Organization:</strong> ${safeOrg}</p>
          <p><strong>Account ID:</strong> ${safeAccountId}</p>
          <hr style="margin: 24px 0; border: 0; border-top: 1px solid #e5e7eb;" />
          <p>${safeMessage}</p>
        </div>
      `,
      text: `Account Saving Follow-Up Needed

The 7-day deletion grace period has ended for this customer. Reach out before paid access ends.

Name: ${ticket.name || "Unknown customer"}
Email: ${ticket.email || "No email"}
Organization: ${ticket.organization || "Unknown organization"}
Account ID: ${ticket.accountId}

${ticket.message}`,
      reply_to: ticket.email || undefined,
    }),
  });

  if (!response.ok) {
    throw new Error(`Resend support email failed: ${response.status} ${await response.text()}`);
  }
};

const createPostGraceSaveTickets = async (supabaseAdmin: ReturnType<typeof createClient>) => {
  const nowIso = new Date().toISOString();
  const { data: requests, error } = await supabaseAdmin
    .from("account_deletion_requests" as any)
    .select("*")
    .eq("status", "pending")
    .lte("cancelable_until", nowIso)
    .is("save_ticket_id", null)
    .limit(25);

  if (error) throw new Error(`Failed loading post-grace deletion requests: ${error.message}`);

  const results: Array<{ id: string; accountId: string; supportRequestId?: string; status: string; error?: string }> = [];

  for (const deletionRequest of requests || []) {
    const accountId = deletionRequest.account_id as string;
    const organization = deletionRequest.account_name || "Unknown organization";
    const requesterName = deletionRequest.requester_full_name || "Unknown customer";
    const requesterEmail = deletionRequest.requester_email || "";
    const message = [
      "Account saving follow-up needed.",
      "",
      `The 7-day grace period ended on ${deletionRequest.cancelable_until}.`,
      `The customer has access until ${deletionRequest.scheduled_delete_at}.`,
      "",
      `Reason: ${deletionRequest.reason || "Not provided"}`,
      `Feedback: ${deletionRequest.additional_feedback || "Not provided"}`,
    ].join("\n");

    try {
      const { data: supportRequest, error: insertError } = await supabaseAdmin
        .from("support_requests")
        .insert({
          account_id: accountId,
          user_id: deletionRequest.requester_user_id || null,
          name: requesterName,
          email: requesterEmail || "support@sermonslidepro.com",
          organization,
          subject: "Account Saving - Grace Period Ended",
          message,
          submitted_from: "finalize-account-deletions",
          notification_sent: false,
        })
        .select("id")
        .single();

      if (insertError || !supportRequest) {
        throw new Error(insertError?.message || "Support ticket insert failed");
      }

      let notificationError: string | null = null;
      try {
        await sendAccountSavingSupportEmail({
          name: requesterName,
          email: requesterEmail,
          organization,
          accountId,
          message,
        });
      } catch (emailError) {
        notificationError = emailError instanceof Error ? emailError.message : String(emailError);
      }

      await supabaseAdmin
        .from("support_requests")
        .update({
          notification_sent: !notificationError,
          notification_error: notificationError,
        })
        .eq("id", supportRequest.id);

      await supabaseAdmin
        .from("account_deletion_requests" as any)
        .update({
          save_ticket_id: supportRequest.id,
          save_ticket_created_at: new Date().toISOString(),
        })
        .eq("id", deletionRequest.id);

      await createAdminNotification(supabaseAdmin, {
        type: "account_saving_needed",
        title: "Account saving follow-up needed",
        message: `${organization} passed the 7-day deletion grace period.`,
        accountId,
        supportRequestId: supportRequest.id,
        accountDeletionRequestId: deletionRequest.id,
        metadata: {
          requesterEmail,
          cancelableUntil: deletionRequest.cancelable_until,
          scheduledDeleteAt: deletionRequest.scheduled_delete_at,
          emailError: notificationError,
        },
      });

      results.push({ id: deletionRequest.id, accountId, supportRequestId: supportRequest.id, status: "ticket_created" });
    } catch (ticketError) {
      const message = ticketError instanceof Error ? ticketError.message : String(ticketError);
      logStep("Post-grace save ticket creation failed", { requestId: deletionRequest.id, accountId, error: message });
      results.push({ id: deletionRequest.id, accountId, status: "failed", error: message });
    }
  }

  return results;
};

serve(async (req) => {
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
    const finalizeSecret = Deno.env.get("FINALIZE_ACCOUNT_DELETIONS_SECRET") ?? "";
    const suppliedSecret =
      req.headers.get("x-finalize-secret") ||
      req.headers.get("authorization")?.replace("Bearer ", "") ||
      "";

    if (!finalizeSecret || suppliedSecret !== finalizeSecret) {
      throw new Error("Unauthorized finalization request");
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    const { data: dueRequests, error: requestError } = await supabaseAdmin
      .from("account_deletion_requests" as any)
      .select("id, account_id, stripe_customer_id, stripe_subscription_id")
      .eq("status", "pending")
      .lte("scheduled_delete_at", new Date().toISOString())
      .limit(25);

    if (requestError) {
      throw new Error(`Failed loading due deletion requests: ${requestError.message}`);
    }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
    const stripe = stripeKey ? new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" }) : null;
    const saveTicketResults = await createPostGraceSaveTickets(supabaseAdmin);
    const results: Array<{ id: string; accountId: string; status: string; error?: string }> = [];

    for (const deletionRequest of dueRequests || []) {
      const requestId = deletionRequest.id as string;
      const accountId = deletionRequest.account_id as string;

      try {
        const { data: members } = await supabaseAdmin
          .from("account_members")
          .select("user_id")
          .eq("account_id", accountId);

        const memberUserIds = Array.from(new Set((members || []).map((m: any) => m.user_id).filter(Boolean)));

        const { error: deleteAccountError } = await supabaseAdmin
          .from("accounts")
          .delete()
          .eq("id", accountId);

        if (deleteAccountError) {
          throw new Error(`Failed deleting account data: ${deleteAccountError.message}`);
        }

        for (const memberUserId of memberUserIds) {
          const { error } = await supabaseAdmin.auth.admin.deleteUser(memberUserId);
          if (error) {
            logStep("Failed deleting team auth user during finalization", { memberUserId, error: error.message });
          }
        }

        if (stripe && deletionRequest.stripe_customer_id) {
          await cancelAndDeleteStripeCustomer(
            stripe,
            deletionRequest.stripe_customer_id,
            deletionRequest.stripe_subscription_id || null
          );
        }

        const { error: updateError } = await supabaseAdmin
          .from("account_deletion_requests" as any)
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
            last_error: null,
          })
          .eq("id", requestId);

        if (updateError) {
          throw new Error(`Deleted account but failed marking request completed: ${updateError.message}`);
        }

        results.push({ id: requestId, accountId, status: "completed" });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logStep("Deletion request finalization failed", { requestId, accountId, error: message });
        await supabaseAdmin
          .from("account_deletion_requests" as any)
          .update({ status: "failed", last_error: message })
          .eq("id", requestId);
        results.push({ id: requestId, accountId, status: "failed", error: message });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      saveTicketsProcessed: saveTicketResults.length,
      saveTicketResults,
      processed: results.length,
      results,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    logStep("ERROR", { message });
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
