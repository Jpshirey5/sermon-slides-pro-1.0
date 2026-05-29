// Monthly business report: assembles signups/churn, usage, and revenue/MRR for the
// previous calendar month and emails a summary via Resend. Reuses the same shared
// aggregation helpers as the admin Reports dashboard so the numbers never diverge.
//
// Scheduling: triggered monthly (1st of the month) the same way other scheduled
// functions run — see supabase/migrations/*_schedule_monthly_report.sql for the
// pg_cron + pg_net setup. Can also be invoked manually for testing:
//   supabase functions invoke monthly-report --no-verify-jwt \
//     --header "x-worker-secret: <MONTHLY_REPORT_WORKER_SECRET>"
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { computeRevenueMetrics } from "../_shared/revenue.ts";
import {
  computeSignupChurnMetrics,
  computeUsageMetrics,
  getInternalAccountIds,
} from "../_shared/reporting.ts";
import { getConfiguredAppOrigin } from "../_shared/app-url.ts";

const escapeHtml = (value: string) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const money = (cents: number | null | undefined, currency = "usd") => {
  if (typeof cents !== "number") return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
};

const previousMonthWindow = (now: Date) => {
  const firstOfThisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  const end = new Date(firstOfThisMonth.getTime() - 1);
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1, 0, 0, 0, 0));
  const label = start.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  return { start, end, label };
};

const getRecipients = () =>
  (Deno.env.get("REPORT_RECIPIENTS") || "johnpshirey@icloud.com")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

const buildEmail = (options: {
  label: string;
  signups: Awaited<ReturnType<typeof computeSignupChurnMetrics>>;
  usage: Awaited<ReturnType<typeof computeUsageMetrics>>;
  revenue: Awaited<ReturnType<typeof computeRevenueMetrics>>;
  reportsUrl: string;
}) => {
  const { label, signups, usage, revenue, reportsUrl } = options;
  const currency = revenue.summary.currency || "usd";
  const split = usage.buildModeSplit;
  const attributed = split.quickBuild + split.structuredBuilder;
  const quickPct = attributed > 0 ? Math.round((split.quickBuild / attributed) * 100) : 0;

  const row = (label: string, value: string) =>
    `<tr><td style="padding:6px 0;color:#6b7280;">${escapeHtml(label)}</td><td style="padding:6px 0;text-align:right;font-weight:600;color:#111827;">${escapeHtml(value)}</td></tr>`;

  const section = (title: string, rows: string) =>
    `<h3 style="margin:24px 0 8px;font-family:Georgia,serif;color:#111827;">${escapeHtml(title)}</h3>
     <table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px;">${rows}</table>`;

  const html = `
    <div style="max-width:560px;margin:0 auto;font-family:Arial,sans-serif;line-height:1.5;color:#1f2937;">
      <h2 style="font-family:Georgia,serif;color:#111827;">Sermon Slide Pro — Monthly Report</h2>
      <p style="color:#6b7280;margin-top:-8px;">${escapeHtml(label)}</p>

      ${section("Signups & Churn", [
        row("New organizations", String(signups.newOrgs)),
        row("New users", String(signups.newUsers)),
        row("Org deletions", String(signups.orgDeletions)),
        row("Total organizations", String(signups.totalAccounts)),
        row("Active subscribers", String(signups.activeSubscribers)),
      ].join(""))}

      ${section("Revenue & MRR", [
        row("Current MRR", money(revenue.summary.currentMrrCents, currency)),
        row("Gross revenue", money(revenue.summary.grossRevenueCents, currency)),
        row("Net revenue (after refunds)", money(revenue.summary.netRevenueCents, currency)),
        row("Refunded", money(revenue.summary.refundedCents, currency)),
        row("Stripe fees", money(revenue.summary.stripeFeesCents, currency)),
        row("Active subscriptions", String(revenue.summary.activeSubscriptionCount)),
      ].join(""))}
      ${revenue.error ? `<p style="color:#b91c1c;font-size:12px;">Revenue note: ${escapeHtml(revenue.error)}</p>` : ""}

      ${section("Platform Usage", [
        row("Presentations created", String(usage.presentationsInWindow)),
        row("Presentations (all-time)", String(usage.totalPresentations)),
        row("Active organizations", String(usage.activeOrgs)),
        row("Quick Build share", `${quickPct}% (${split.quickBuild} of ${attributed})`),
        row("Quick Build / Structure / Unattributed", `${split.quickBuild} / ${split.structuredBuilder} / ${split.unknown}`),
        row("Exports (succeeded / started)", `${usage.exports.succeeded} / ${usage.exports.started}`),
      ].join(""))}
      <p style="color:#9ca3af;font-size:11px;">${escapeHtml(usage.notes.exports)}</p>

      <p style="margin-top:28px;">
        <a href="${reportsUrl}" style="background:#4f46e5;color:#ffffff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;">Open live dashboard</a>
      </p>
    </div>
  `;

  const text = [
    `Sermon Slide Pro — Monthly Report (${label})`,
    "",
    "Signups & Churn",
    `  New organizations: ${signups.newOrgs}`,
    `  New users: ${signups.newUsers}`,
    `  Org deletions: ${signups.orgDeletions}`,
    `  Total organizations: ${signups.totalAccounts}`,
    `  Active subscribers: ${signups.activeSubscribers}`,
    "",
    "Revenue & MRR",
    `  Current MRR: ${money(revenue.summary.currentMrrCents, currency)}`,
    `  Gross revenue: ${money(revenue.summary.grossRevenueCents, currency)}`,
    `  Net revenue: ${money(revenue.summary.netRevenueCents, currency)}`,
    `  Refunded: ${money(revenue.summary.refundedCents, currency)}`,
    `  Stripe fees: ${money(revenue.summary.stripeFeesCents, currency)}`,
    "",
    "Platform Usage",
    `  Presentations created: ${usage.presentationsInWindow}`,
    `  Presentations all-time: ${usage.totalPresentations}`,
    `  Active organizations: ${usage.activeOrgs}`,
    `  Quick Build share: ${quickPct}%`,
    `  Quick / Structure / Unattributed: ${split.quickBuild} / ${split.structuredBuilder} / ${split.unknown}`,
    `  Exports succeeded/started: ${usage.exports.succeeded} / ${usage.exports.started}`,
    "",
    `Dashboard: ${reportsUrl}`,
  ].join("\n");

  return { html, text };
};

serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-worker-secret, x-client-info, apikey, content-type",
  };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const expectedSecret = Deno.env.get("MONTHLY_REPORT_WORKER_SECRET") ?? "";
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

  const resendApiKey = Deno.env.get("RESEND_API_KEY") ?? "";
  const resendFromEmail = Deno.env.get("RESEND_FROM_EMAIL") ?? "";
  const resendFromName = Deno.env.get("RESEND_FROM_NAME") || "Sermon Slide Pro";
  if (!resendApiKey || !resendFromEmail) {
    return json({ error: "Resend is not configured" }, 500);
  }

  const supabaseAdmin = createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Allow an explicit window override for testing: { "start": ISO, "end": ISO }.
  let overrideStart: Date | null = null;
  let overrideEnd: Date | null = null;
  try {
    const body = await req.json();
    if (body?.start) overrideStart = new Date(body.start);
    if (body?.end) overrideEnd = new Date(body.end);
  } catch {
    // no body — use previous calendar month
  }

  const { start, end, label } =
    overrideStart && overrideEnd
      ? { start: overrideStart, end: overrideEnd, label: `${overrideStart.toISOString().slice(0, 10)} – ${overrideEnd.toISOString().slice(0, 10)}` }
      : previousMonthWindow(new Date());

  const startIso = start.toISOString();
  const endIso = end.toISOString();

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const stripe = stripeKey ? new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" }) : null;

  try {
    const excludedAccountIds = await getInternalAccountIds(supabaseAdmin);
    const [signups, usage, revenue] = await Promise.all([
      computeSignupChurnMetrics({ supabaseAdmin, startIso, endIso }),
      computeUsageMetrics({ supabaseAdmin, startIso, endIso, excludedAccountIds }),
      computeRevenueMetrics({ stripe, supabaseAdmin, start, end, log: (s, d) => console.log(`[monthly-report] ${s}`, d ?? "") }),
    ]);

    const reportsUrl = `${getConfiguredAppOrigin()}/admin/reports`;
    const { html, text } = buildEmail({ label, signups, usage, revenue, reportsUrl });
    const recipients = getRecipients();

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `${resendFromName} <${resendFromEmail}>`,
        to: recipients,
        subject: `Sermon Slide Pro — Monthly Report (${label})`,
        html,
        text,
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      return json({ error: `Resend failed: ${response.status} ${detail}` }, 502);
    }

    return json({
      sent: true,
      window: { start: startIso, end: endIso, label },
      recipients,
      summary: { signups, usage: { ...usage, dailyPresentations: undefined }, revenue: revenue.summary },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[monthly-report] failed", message);
    return json({ error: message }, 500);
  }
});
