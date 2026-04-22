import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-worker-secret, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const clean = (value: unknown) => String(value ?? "").trim();

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const addDays = (date: Date, days: number) => {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
};

const sendBetaEmail = async (options: {
  toEmail: string;
  recipientName: string;
  accountName: string;
  subject: string;
  heading: string;
  body: string;
}) => {
  const resendApiKey = Deno.env.get("RESEND_API_KEY") ?? "";
  const resendFromEmail = Deno.env.get("RESEND_FROM_EMAIL") ?? "";
  const resendFromName = Deno.env.get("RESEND_FROM_NAME") || "Sermon Slide Pro Support";
  if (!resendApiKey || !resendFromEmail) throw new Error("Resend is not configured");

  const safeName = escapeHtml(options.recipientName || "there");
  const safeAccountName = escapeHtml(options.accountName || "your organization");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `${resendFromName} <${resendFromEmail}>`,
      to: [options.toEmail],
      subject: options.subject,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
          <h2>${escapeHtml(options.heading)}</h2>
          <p>Hi ${safeName},</p>
          <p>${escapeHtml(options.body)}</p>
          <p>Thank you for helping make Sermon Slide Pro a better platform for churches like ${safeAccountName}.</p>
        </div>
      `,
      text: `Hi ${options.recipientName || "there"},\n\n${options.body}\n\nThank you for helping make Sermon Slide Pro a better platform for churches like ${options.accountName || "your organization"}.`,
    }),
  });

  if (!response.ok) {
    throw new Error(`Resend beta email failed: ${response.status} ${await response.text()}`);
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const expectedSecret = Deno.env.get("BETA_EMAIL_WORKER_SECRET") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const providedSecret = req.headers.get("x-worker-secret") ?? "";
  const providedBearer = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const authorizedByWorkerSecret = Boolean(expectedSecret && providedSecret === expectedSecret);
  const authorizedByServiceRole = Boolean(serviceRoleKey && providedBearer === serviceRoleKey);

  if (!authorizedByWorkerSecret && !authorizedByServiceRole) {
    return json({ error: "Unauthorized" }, 401);
  }

  if (!serviceRoleKey) {
    return json({ error: "SUPABASE_SERVICE_ROLE_KEY is not configured" }, 500);
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    serviceRoleKey,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const now = new Date();
  const { data: accounts, error } = await supabaseAdmin
    .from("accounts")
    .select("id, name, beta_started_at, beta_trial_ends_at, beta_day_10_email_sent_at, beta_day_25_email_sent_at, beta_day_30_email_sent_at")
    .eq("is_beta_user", true)
    .not("beta_started_at", "is", null)
    .not("beta_trial_ends_at", "is", null);

  if (error) return json({ error: error.message }, 500);

  const results: Array<Record<string, unknown>> = [];

  for (const account of accounts || []) {
    const { data: owner } = await supabaseAdmin
      .from("account_members")
      .select("user_id")
      .eq("account_id", account.id)
      .eq("role", "owner")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!owner?.user_id) continue;

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("full_name, email")
      .eq("id", owner.user_id)
      .maybeSingle();

    const toEmail = clean(profile?.email);
    if (!toEmail) continue;

    const startedAt = new Date(account.beta_started_at);
    const trialEndsAt = new Date(account.beta_trial_ends_at);
    const updates: Record<string, string> = {};

    const sendAndMark = async (
      key: string,
      subject: string,
      heading: string,
      body: string,
    ) => {
      await sendBetaEmail({
        toEmail,
        recipientName: clean(profile?.full_name) || "there",
        accountName: clean(account.name) || "your church",
        subject,
        heading,
        body,
      });
      updates[key] = now.toISOString();
      results.push({ accountId: account.id, email: toEmail, emailType: key });
    };

    try {
      if (!account.beta_day_10_email_sent_at && now >= addDays(startedAt, 10)) {
        await sendAndMark(
          "beta_day_10_email_sent_at",
          "How’s Sermon Slide Pro going?",
          "How’s it going?",
          "You are about 10 days into your beta period, and we would love to hear how Sermon Slide Pro is fitting into your sermon workflow.",
        );
      }

      if (!account.beta_day_25_email_sent_at && now >= addDays(startedAt, 25)) {
        await sendAndMark(
          "beta_day_25_email_sent_at",
          "Your Sermon Slide Pro trial is ending soon",
          "Your trial is ending",
          "Your beta testing period is nearing the end. If there is anything we can improve before you move into the live subscription experience, please reply and tell us.",
        );
      }

      if (!account.beta_day_30_email_sent_at && now >= trialEndsAt) {
        await sendAndMark(
          "beta_day_30_email_sent_at",
          "You’re now on live subscription 🎉",
          "You’re now on live subscription 🎉",
          "Your beta testing period has ended. Thank you for testing Sermon Slide Pro and helping shape the platform.",
        );
      }

      if (Object.keys(updates).length > 0) {
        await supabaseAdmin.from("accounts").update(updates).eq("id", account.id);
      }
    } catch (emailError) {
      results.push({
        accountId: account.id,
        email: toEmail,
        error: emailError instanceof Error ? emailError.message : String(emailError),
      });
    }
  }

  return json({ processed: results.length, results });
});
