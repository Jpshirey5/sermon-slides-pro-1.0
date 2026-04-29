import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const clean = (value: unknown) => String(value ?? "").trim();
const normalizeEmail = (value: unknown) => clean(value).toLowerCase();
const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const STRIPE_REPORTING_EXCLUDED_EMAILS = new Set([
  "jpshirey5@gmail.com",
  "jayshirey14@gmail.com",
]);
const REPORTING_START_DATE = new Date("2026-04-24T00:00:00.000Z");

const logStep = (step: string, details?: Record<string, unknown>) => {
  console.log(`[ADMIN-API] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);
};

type AdminContext = {
  userId: string;
  email: string;
  admin: any;
  supabaseAdmin: ReturnType<typeof createClient>;
};

const getSupabaseAdmin = () =>
  createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

const getAnonClient = (authHeader: string) =>
  createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );

const getAuthenticatedUser = async (authHeader: string) => {
  const token = authHeader.replace("Bearer ", "");
  const anonClient = getAnonClient(authHeader);
  const { data, error } = await anonClient.auth.getUser(token);
  if (error || !data?.user) throw new Error("Authentication failed");
  const userId = data.user.id;
  const email = data.user.email;
  if (!userId || !email) throw new Error("Invalid user claims");
  return { userId, email: normalizeEmail(email) };
};

const requireAdmin = async (req: Request, supabaseAdmin: ReturnType<typeof createClient>): Promise<AdminContext> => {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new Error("No authorization header");

  const { userId, email } = await getAuthenticatedUser(authHeader);
  const { data: admin } = await supabaseAdmin
    .from("admin_users")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (!admin) throw new Error("Admin access required");
  return { userId, email, admin, supabaseAdmin };
};

const audit = async (
  ctx: AdminContext | { admin?: any; userId?: string; supabaseAdmin: ReturnType<typeof createClient> },
  action: string,
  targetType?: string,
  targetId?: string,
  metadata: Record<string, unknown> = {},
) => {
  await ctx.supabaseAdmin.from("admin_audit_logs").insert({
    actor_admin_id: ctx.admin?.id ?? null,
    actor_user_id: ctx.userId ?? null,
    action,
    target_type: targetType ?? null,
    target_id: targetId ?? null,
    metadata,
  });
};

const createAdminNotification = async (
  ctx: AdminContext | { admin?: any; supabaseAdmin: ReturnType<typeof createClient> },
  notification: {
    type: "support_request" | "account_deletion_requested" | "account_saving_needed" | "subscription_changed";
    title: string;
    message: string;
    accountId?: string | null;
    supportRequestId?: string | null;
    accountDeletionRequestId?: string | null;
    metadata?: Record<string, unknown>;
  },
) => {
  const { error } = await ctx.supabaseAdmin.from("admin_notifications" as any).insert({
    type: notification.type,
    title: notification.title,
    message: notification.message,
    account_id: notification.accountId ?? null,
    support_request_id: notification.supportRequestId ?? null,
    account_deletion_request_id: notification.accountDeletionRequestId ?? null,
    created_by_admin_id: ctx.admin?.id ?? null,
    metadata: notification.metadata ?? {},
  });
  if (error) logStep("Admin notification insert failed", { error: error.message, type: notification.type });
};

const createCancellationSupportTicket = async (
  supabaseAdmin: ReturnType<typeof createClient>,
  options: {
    accountId: string;
    accountName: string;
    userId?: string | null;
    requesterName?: string | null;
    requesterEmail?: string | null;
  },
) => {
  const { data, error } = await supabaseAdmin
    .from("support_requests")
    .insert({
      account_id: options.accountId,
      user_id: options.userId ?? null,
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

const normalizeSiteUrl = (value: string | null | undefined) => {
  const trimmed = clean(value);
  if (!trimmed) return null;
  const withProtocol =
    trimmed.startsWith("http://") || trimmed.startsWith("https://")
      ? trimmed
      : `https://${trimmed}`;
  try {
    const url = new URL(withProtocol);
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
};

const getSiteUrl = () =>
  normalizeSiteUrl(Deno.env.get("SITE_URL")) ||
  normalizeSiteUrl(Deno.env.get("VITE_SITE_URL")) ||
  "https://www.sermonslidepro.com";

const sendAdminInviteEmail = async (email: string, token: string) => {
  const resendApiKey = Deno.env.get("RESEND_API_KEY") ?? "";
  const resendFromEmail = Deno.env.get("RESEND_FROM_EMAIL") ?? "";
  const resendFromName = Deno.env.get("RESEND_FROM_NAME") || "Sermon Slide Pro Support";
  if (!resendApiKey || !resendFromEmail) throw new Error("Resend is not configured");

  const acceptUrl = `${getSiteUrl().replace(/\/$/, "")}/admin/accept-invite?token=${encodeURIComponent(token)}`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `${resendFromName} <${resendFromEmail}>`,
      to: [email],
      subject: "Sermon Slide Pro Admin Invite",
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
          <h2>Sermon Slide Pro Admin Invite</h2>
          <p>You have been invited to help manage Sermon Slide Pro internally.</p>
          <p><a href="${acceptUrl}">Accept admin invite</a></p>
          <p>This invite expires in 7 days.</p>
        </div>
      `,
      text: `You have been invited to help manage Sermon Slide Pro internally.\n\nAccept invite: ${acceptUrl}\n\nThis invite expires in 7 days.`,
    }),
  });

  if (!response.ok) {
    throw new Error(`Resend invite failed: ${response.status} ${await response.text()}`);
  }
};

const hashToken = async (token: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
};

const generateEmailChangeToken = () => `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "");

const sendEmailChangeConfirmationEmail = async (email: string, token: string) => {
  const resendApiKey = Deno.env.get("RESEND_API_KEY") ?? "";
  const resendFromEmail = Deno.env.get("RESEND_FROM_EMAIL") ?? "";
  const resendFromName = Deno.env.get("RESEND_FROM_NAME") || "Sermon Slide Pro Support";
  if (!resendApiKey || !resendFromEmail) throw new Error("Resend is not configured");

  const confirmUrl = `${getSiteUrl().replace(/\/$/, "")}/auth/confirm-email-change?token=${encodeURIComponent(token)}`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `${resendFromName} <${resendFromEmail}>`,
      to: [email],
      subject: "Confirm your new Sermon Slide Pro email",
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
          <h2>Confirm your new email</h2>
          <p>A Sermon Slide Pro support admin requested an email change for your account.</p>
          <p>Please confirm your new email address by clicking the link below:</p>
          <p><a href="${confirmUrl}">Confirm new email</a></p>
          <p>This link expires in 48 hours. If you did not request this change, you can ignore this email and your current login will stay the same.</p>
        </div>
      `,
      text: `A Sermon Slide Pro support admin requested an email change for your account.\n\nConfirm your new email: ${confirmUrl}\n\nThis link expires in 48 hours. If you did not request this change, you can ignore this email and your current login will stay the same.`,
    }),
  });

  if (!response.ok) {
    throw new Error(`Resend email change confirmation failed: ${response.status} ${await response.text()}`);
  }
};

const getStripe = () => {
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) return null;
  return new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
};

const addDays = (date: Date, days: number) => {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
};

const maxDate = (a: Date, b: Date | null) => {
  if (!b) return a;
  return a.getTime() >= b.getTime() ? a : b;
};

const toIsoOrNull = (date: Date | null) => date ? date.toISOString() : null;

const mapWithConcurrency = async <T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
) => {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await worker(items[currentIndex]);
    }
  });
  await Promise.all(workers);
  return results;
};

const emptyNextInvoiceSummary = (status = "none") => ({
  status,
  amountDue: null,
  currency: null,
  nextInvoiceAt: null,
  subscriptionId: null,
  error: null,
});

const notApplicableNextInvoiceSummary = () => ({
  ...emptyNextInvoiceSummary("not_applicable"),
  reason: "offboarding",
});

const deriveAdminSubscriptionState = (account: any, activeDeletionRequest: any | null) => {
  if (!activeDeletionRequest) {
    return {
      adminSubscriptionStatus: account?.subscription_status || "inactive",
      adminSubscriptionStatusLabel: account?.subscription_status || "inactive",
      offboardingPhase: null,
      offboardingDate: null,
    };
  }

  const isGraceOpen = new Date(activeDeletionRequest.cancelable_until).getTime() > Date.now();
  return {
    adminSubscriptionStatus: "offboarding",
    adminSubscriptionStatusLabel: "Canceled / Offboarding",
    offboardingPhase: isGraceOpen ? "grace" : "access",
    offboardingDate: isGraceOpen
      ? activeDeletionRequest.cancelable_until
      : activeDeletionRequest.scheduled_delete_at,
  };
};

const getActiveDeletionRequestsForAccounts = async (ctx: AdminContext, accountIds: string[]) => {
  if (accountIds.length === 0) return new Map<string, any>();
  const { data, error } = await ctx.supabaseAdmin
    .from("account_deletion_requests" as any)
    .select("*")
    .in("account_id", accountIds)
    .eq("status", "pending")
    .order("requested_at", { ascending: false });
  if (error) throw new Error(error.message);

  const map = new Map<string, any>();
  for (const request of data || []) {
    if (!map.has(request.account_id)) map.set(request.account_id, request);
  }
  return map;
};

const getStripeReportingExclusions = async (supabaseAdmin: ReturnType<typeof createClient>) => {
  const [{ data: accounts, error: accountsError }, { data: owners, error: ownersError }] = await Promise.all([
    supabaseAdmin
      .from("accounts")
      .select("id, name, stripe_customer_id, stripe_subscription_id"),
    supabaseAdmin
      .from("account_members")
      .select("account_id, user_id, role")
      .eq("role", "owner"),
  ]);

  if (accountsError) throw new Error(accountsError.message);
  if (ownersError) throw new Error(ownersError.message);

  const ownerUserIds = Array.from(new Set((owners || []).map((owner: any) => owner.user_id).filter(Boolean)));
  const { data: ownerProfiles, error: ownerProfilesError } = ownerUserIds.length
    ? await supabaseAdmin
        .from("profiles")
        .select("id, email")
        .in("id", ownerUserIds)
    : { data: [] as any[], error: null };

  if (ownerProfilesError) throw new Error(ownerProfilesError.message);

  const ownerEmailByUserId = new Map<string, string>();
  for (const profile of ownerProfiles || []) {
    const ownerEmail = normalizeEmail(profile.email);
    if (profile.id && ownerEmail) {
      ownerEmailByUserId.set(profile.id, ownerEmail);
    }
  }

  const ownerEmailByAccountId = new Map<string, string>();
  for (const owner of owners || []) {
    const ownerEmail = ownerEmailByUserId.get(owner.user_id) || "";
    if (owner.account_id && ownerEmail && !ownerEmailByAccountId.has(owner.account_id)) {
      ownerEmailByAccountId.set(owner.account_id, ownerEmail);
    }
  }

  const customerIds = new Set<string>();
  const subscriptionIds = new Set<string>();

  for (const account of accounts || []) {
    const ownerEmail = ownerEmailByAccountId.get(account.id) || "";
    const shouldExclude = STRIPE_REPORTING_EXCLUDED_EMAILS.has(ownerEmail);

    if (!shouldExclude) continue;

    const customerId = clean(account.stripe_customer_id);
    const subscriptionId = clean(account.stripe_subscription_id);

    if (customerId) customerIds.add(customerId);
    if (subscriptionId) subscriptionIds.add(subscriptionId);
  }

  return { customerIds, subscriptionIds };
};

const getNextInvoiceSummary = async (stripe: Stripe | null, account: any) => {
  const customerId = clean(account?.stripe_customer_id);
  if (!customerId) return emptyNextInvoiceSummary("none");
  if (!stripe) return { ...emptyNextInvoiceSummary("unavailable"), error: "Stripe is not configured" };

  try {
    const subscriptionId = clean(account?.stripe_subscription_id);
    let subscription: any = null;

    if (subscriptionId) {
      try {
        const retrieved = await stripe.subscriptions.retrieve(subscriptionId);
        if (["active", "trialing", "past_due"].includes(retrieved.status)) subscription = retrieved;
      } catch (error) {
        logStep("Failed retrieving subscription for next invoice", { subscriptionId, error: String(error) });
      }
    }

    if (!subscription) {
      const subscriptions = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 10 });
      subscription = subscriptions.data.find((sub: any) => ["active", "trialing", "past_due"].includes(sub.status)) || null;
    }

    if (!subscription) return emptyNextInvoiceSummary("none");

    let upcoming: any = null;
    try {
      const invoicesApi = stripe.invoices as any;
      if (typeof invoicesApi.createPreview === "function") {
        upcoming = await invoicesApi.createPreview({ customer: customerId, subscription: subscription.id });
      } else if (typeof invoicesApi.retrieveUpcoming === "function") {
        upcoming = await invoicesApi.retrieveUpcoming({ customer: customerId, subscription: subscription.id });
      }
    } catch (error) {
      logStep("Upcoming invoice lookup failed", { customerId, subscriptionId: subscription.id, error: String(error) });
    }

    if (!upcoming) {
      return {
        status: "upcoming",
        amountDue: null,
        currency: subscription.currency || null,
        nextInvoiceAt: subscription.current_period_end || null,
        subscriptionId: subscription.id,
        error: null,
      };
    }

    return {
      status: "upcoming",
      amountDue: typeof upcoming.amount_due === "number" ? upcoming.amount_due : null,
      currency: upcoming.currency || subscription.currency || null,
      nextInvoiceAt: upcoming.next_payment_attempt || upcoming.period_end || subscription.current_period_end || null,
      subscriptionId: subscription.id,
      error: null,
    };
  } catch (error) {
    return {
      ...emptyNextInvoiceSummary("unavailable"),
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

const sendTeamRemovalEmail = async (options: {
  toEmail: string;
  recipientName: string;
  accountName: string;
}) => {
  const resendApiKey = Deno.env.get("RESEND_API_KEY") ?? "";
  const resendFromEmail = Deno.env.get("RESEND_FROM_EMAIL") ?? "";
  const resendFromName = Deno.env.get("RESEND_FROM_NAME") || "Sermon Slide Pro Support";
  if (!resendApiKey || !resendFromEmail || !options.toEmail) return false;

  const greeting = options.recipientName.trim() || "there";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `${resendFromName} <${resendFromEmail}>`,
      to: [options.toEmail],
      subject: `You were removed from ${options.accountName}`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
          <p>Hi ${greeting},</p>
          <p>Your access to <strong>${options.accountName}</strong> in Sermon Slide Pro has been removed by an administrator.</p>
          <p>Your login for this organization has been deleted. Presentations remain with the organization, so no shared church content was removed with your account.</p>
          <p>If you think this was a mistake, please contact Sermon Slide Pro support.</p>
        </div>
      `,
      text: `Hi ${greeting},

Your access to ${options.accountName} in Sermon Slide Pro has been removed by an administrator.

Your login for this organization has been deleted. Presentations remain with the organization, so no shared church content was removed with your account.

If you think this was a mistake, please contact Sermon Slide Pro support.`,
    }),
  });

  if (!response.ok) {
    throw new Error(`Resend removal email failed: ${response.status} ${await response.text()}`);
  }
  return true;
};

const cancelAndDeleteStripeCustomer = async (
  stripe: Stripe,
  customerId: string,
  subscriptionId: string | null,
) => {
  const subscriptionIds = new Set<string>();
  if (subscriptionId) subscriptionIds.add(subscriptionId);

  try {
    const subscriptions = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 });
    for (const sub of subscriptions.data) subscriptionIds.add(sub.id);
  } catch (error) {
    logStep("Failed listing Stripe subscriptions before hard delete", { customerId, error: String(error) });
  }

  for (const id of subscriptionIds) {
    try {
      const subscription = await stripe.subscriptions.retrieve(id);
      if (subscription.status !== "canceled" && subscription.status !== "incomplete_expired") {
        await stripe.subscriptions.cancel(id);
      }
    } catch (error) {
      logStep("Failed canceling Stripe subscription during hard delete", { subscriptionId: id, error: String(error) });
    }
  }

  try {
    await stripe.customers.del(customerId);
  } catch (error) {
    logStep("Failed deleting Stripe customer during hard delete", { customerId, error: String(error) });
  }
};

const dateKey = (date: Date) => date.toISOString().slice(0, 10);
const normalizeOverviewRangeDays = (days: number) => Math.min(Math.max(days, 1), 90);

const buildDailyBuckets = (days: number) => {
  const safeDays = normalizeOverviewRangeDays(days);
  const end = new Date();
  end.setUTCHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setUTCDate(end.getUTCDate() - safeDays + 1);
  start.setUTCHours(0, 0, 0, 0);

  const buckets: Record<string, any> = {};
  for (let cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    buckets[dateKey(cursor)] = {
      date: dateKey(cursor),
      orgSignups: 0,
      userSignups: 0,
      orgDeletions: 0,
      userDeletions: 0,
    };
  }
  return { start, end, buckets };
};

const bootstrap = async (req: Request, supabaseAdmin: ReturnType<typeof createClient>) => {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new Error("No authorization header");
  const { userId, email } = await getAuthenticatedUser(authHeader);
  const allowedEmails = (Deno.env.get("ADMIN_BOOTSTRAP_EMAILS") ?? "")
    .split(",")
    .map((entry) => normalizeEmail(entry))
    .filter(Boolean);

  if (!allowedEmails.includes(email)) {
    throw new Error("This email is not allowed to bootstrap admin access");
  }

  const { count } = await supabaseAdmin
    .from("admin_users")
    .select("id", { count: "exact", head: true })
    .eq("status", "active");

  if ((count ?? 0) > 0) {
    throw new Error("Admin bootstrap is closed because an active admin already exists");
  }

  const { data: admin, error } = await supabaseAdmin
    .from("admin_users")
    .insert({ user_id: userId, email, status: "active" })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  await audit({ admin, userId, supabaseAdmin }, "admin_bootstrap", "admin_user", admin.id, { email });
  return { admin };
};

const overview = async (ctx: AdminContext) => {
  const [
    { count: profileCount },
    { count: accountCount },
    { count: activeCount },
    { count: canceledCount },
    { count: pastDueCount },
    { count: supportCount },
    { data: recentProfiles },
    { data: recentSupport },
    { data: recentRefunds },
  ] = await Promise.all([
    ctx.supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }),
    ctx.supabaseAdmin.from("accounts").select("id", { count: "exact", head: true }),
    ctx.supabaseAdmin
      .from("accounts")
      .select("id", { count: "exact", head: true })
      .in("subscription_status", ["active", "trialing"])
      .neq("name", "Bell Shoals Church"),
    ctx.supabaseAdmin.from("accounts").select("id", { count: "exact", head: true }).eq("subscription_status", "canceled"),
    ctx.supabaseAdmin.from("accounts").select("id", { count: "exact", head: true }).eq("subscription_status", "past_due"),
    ctx.supabaseAdmin.from("support_requests").select("id", { count: "exact", head: true }).eq("status", "active"),
    ctx.supabaseAdmin.from("profiles").select("id, full_name, email, created_at").order("created_at", { ascending: false }).limit(8),
    ctx.supabaseAdmin.from("support_requests").select("*").eq("status", "active").order("created_at", { ascending: false }).limit(6),
    ctx.supabaseAdmin.from("admin_audit_logs").select("*").eq("action", "refund_issued").order("created_at", { ascending: false }).limit(6),
  ]);

  return {
    metrics: {
      totalUsers: profileCount ?? 0,
      totalAccounts: accountCount ?? 0,
      activeSubscribers: activeCount ?? 0,
      canceledSubscriptions: canceledCount ?? 0,
      pastDueAccounts: pastDueCount ?? 0,
      failedPayments: pastDueCount ?? 0,
      openSupportRequests: supportCount ?? 0,
      mrrCents: null,
    },
    recentProfiles: recentProfiles || [],
    recentSupport: recentSupport || [],
    recentRefunds: recentRefunds || [],
  };
};

const overviewActivity = async (ctx: AdminContext, body: any) => {
  const days = Number(body?.days) || 30;
  const { start, end, buckets } = buildDailyBuckets(days);
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  const [
    { data: orgSignups },
    { data: userSignups },
    { data: orgDeletionRequests },
    { data: userDeletionLogs },
  ] = await Promise.all([
    ctx.supabaseAdmin.from("accounts").select("created_at").gte("created_at", startIso).lte("created_at", endIso),
    ctx.supabaseAdmin.from("profiles").select("created_at").gte("created_at", startIso).lte("created_at", endIso),
    ctx.supabaseAdmin
      .from("account_deletion_requests" as any)
      .select("requested_at, completed_at, status")
      .or(`requested_at.gte.${startIso},completed_at.gte.${startIso}`),
    ctx.supabaseAdmin
      .from("admin_audit_logs")
      .select("created_at, action, metadata")
      .in("action", ["customer_member_removed", "customer_org_hard_deleted"])
      .gte("created_at", startIso)
      .lte("created_at", endIso),
  ]);

  for (const row of orgSignups || []) {
    const key = dateKey(new Date(row.created_at));
    if (buckets[key]) buckets[key].orgSignups += 1;
  }

  for (const row of userSignups || []) {
    const key = dateKey(new Date(row.created_at));
    if (buckets[key]) buckets[key].userSignups += 1;
  }

  for (const row of orgDeletionRequests || []) {
    const timestamp = row.completed_at || row.requested_at;
    if (!timestamp) continue;
    const date = new Date(timestamp);
    if (date < start || date > end) continue;
    const key = dateKey(date);
    if (buckets[key]) buckets[key].orgDeletions += 1;
  }

  for (const row of userDeletionLogs || []) {
    const key = dateKey(new Date(row.created_at));
    if (!buckets[key]) continue;
    const metadata = row.metadata || {};
    const count = row.action === "customer_org_hard_deleted"
      ? Math.max(Number(metadata.memberCount) || 0, 0)
      : 1;
    buckets[key].userDeletions += count;
  }

  return {
    rangeDays: normalizeOverviewRangeDays(days),
    items: Object.values(buckets),
    notes: {
      userDeletions: "User deletion history is counted from admin audit logs going forward; older user deletions may be unavailable.",
    },
  };
};

const listPaidInvoicesInRange = async (
  stripe: Stripe,
  startUnix: number,
  endUnix: number,
) => {
  const invoices: Stripe.Invoice[] = [];
  let startingAfter: string | undefined;

  for (let page = 0; page < 20; page += 1) {
    const response = await stripe.invoices.list({
      status: "paid",
      created: { gte: startUnix, lte: endUnix },
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });

    invoices.push(...response.data);
    if (!response.has_more || response.data.length === 0) break;
    startingAfter = response.data[response.data.length - 1].id;
  }

  return invoices;
};

const listRefundsInRange = async (
  stripe: Stripe,
  startUnix: number,
  endUnix: number,
) => {
  const refunds: Stripe.Refund[] = [];
  let startingAfter: string | undefined;

  for (let page = 0; page < 20; page += 1) {
    const response = await stripe.refunds.list({
      created: { gte: startUnix, lte: endUnix },
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });

    refunds.push(...response.data);
    if (!response.has_more || response.data.length === 0) break;
    startingAfter = response.data[response.data.length - 1].id;
  }

  return refunds;
};

const listSucceededChargesInRange = async (
  stripe: Stripe,
  startUnix: number,
  endUnix: number,
) => {
  const charges: Stripe.Charge[] = [];
  let startingAfter: string | undefined;

  for (let page = 0; page < 20; page += 1) {
    const response = await stripe.charges.list({
      created: { gte: startUnix, lte: endUnix },
      limit: 100,
      expand: ["data.balance_transaction"],
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });

    charges.push(...response.data);
    if (!response.has_more || response.data.length === 0) break;
    startingAfter = response.data[response.data.length - 1].id;
  }

  return charges;
};

const listActiveSubscriptions = async (stripe: Stripe) => {
  const subscriptions: Stripe.Subscription[] = [];
  let startingAfter: string | undefined;

  for (let page = 0; page < 20; page += 1) {
    const response = await stripe.subscriptions.list({
      status: "active",
      limit: 100,
      expand: ["data.items.data.price"],
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });

    subscriptions.push(...response.data);
    if (!response.has_more || response.data.length === 0) break;
    startingAfter = response.data[response.data.length - 1].id;
  }

  return subscriptions;
};

const normalizeRecurringAmountToMonthly = (price: Stripe.Price, quantity = 1) => {
  const recurring = price.recurring;
  const amount = price.unit_amount ?? 0;
  if (!recurring || amount <= 0) return 0;

  const intervalCount = Math.max(recurring.interval_count || 1, 1);
  const totalAmount = amount * Math.max(quantity || 1, 1);

  if (recurring.interval === "month") return totalAmount / intervalCount;
  if (recurring.interval === "year") return totalAmount / (12 * intervalCount);
  if (recurring.interval === "week") return (totalAmount * 52) / (12 * intervalCount);
  if (recurring.interval === "day") return (totalAmount * 365) / (12 * intervalCount);
  return 0;
};

type RevenuePaymentRow = {
  id: string;
  created: number;
  customerId: string;
  currency: string | null;
  grossAmount: number;
  feeAmount: number;
  netAmount: number;
};

const overviewRevenue = async (ctx: AdminContext, body: any) => {
  const days = Number(body?.days) || 30;
  const { start, end, buckets } = buildDailyBuckets(days);
  for (const bucket of Object.values(buckets)) {
    bucket.grossRevenueCents = 0;
    bucket.refundedCents = 0;
    bucket.stripeFeesCents = 0;
    bucket.netRevenueCents = 0;
    bucket.netAfterFeesCents = 0;
  }

  const stripe = getStripe();
  const emptyItems = Object.values(buckets);
  if (!stripe) {
    return {
      rangeDays: normalizeOverviewRangeDays(days),
      items: emptyItems,
      summary: {
        grossRevenueCents: 0,
        refundedCents: 0,
        stripeFeesCents: 0,
        netRevenueCents: 0,
        netAfterFeesCents: 0,
        currentMrrCents: 0,
        paidInvoiceCount: 0,
        balanceTransactionCount: 0,
        activeSubscriptionCount: 0,
        currency: "usd",
        mixedCurrencies: false,
      },
      error: "Stripe is not configured.",
    };
  }

  try {
    const effectiveStart = start > REPORTING_START_DATE ? start : REPORTING_START_DATE;
    const startUnix = Math.floor(effectiveStart.getTime() / 1000);
    const endUnix = Math.floor(end.getTime() / 1000);
    const [{ customerIds: excludedCustomerIds, subscriptionIds: excludedSubscriptionIds }, invoices, refunds, charges, subscriptions] = await Promise.all([
      getStripeReportingExclusions(ctx.supabaseAdmin),
      listPaidInvoicesInRange(stripe, startUnix, endUnix),
      listRefundsInRange(stripe, startUnix, endUnix),
      listSucceededChargesInRange(stripe, startUnix, endUnix),
      listActiveSubscriptions(stripe),
    ]);

    const includedSubscriptions = subscriptions.filter((subscription) => (
      subscription.livemode === true &&
      !excludedCustomerIds.has(clean(subscription.customer)) &&
      !excludedSubscriptionIds.has(clean(subscription.id))
    ));

    const seenPaymentIds = new Set<string>();
    const includedChargeIds = new Set<string>();
    const paymentRows: RevenuePaymentRow[] = [];

    const addPaymentRowFromCharge = (charge: Stripe.Charge | null, source: "invoice" | "charge") => {
      if (!charge) return;
      if (charge.livemode !== true) return;
      if (charge.status !== "succeeded") return;
      if (new Date(charge.created * 1000) < REPORTING_START_DATE) return;

      const customerId = clean(charge.customer);
      if (!customerId || excludedCustomerIds.has(customerId)) return;

      const paymentId = clean(charge.id);
      if (!paymentId || seenPaymentIds.has(paymentId)) return;

      const rawBalanceTransaction = charge.balance_transaction as Stripe.BalanceTransaction | string | null;
      const balanceTransaction = rawBalanceTransaction && typeof rawBalanceTransaction === "object" ? rawBalanceTransaction : null;
      if (!balanceTransaction) {
        logStep("Skipping revenue charge without expanded balance transaction", {
          chargeId: paymentId,
          source,
        });
        return;
      }
      if (balanceTransaction.livemode !== true) return;

      seenPaymentIds.add(paymentId);
      includedChargeIds.add(paymentId);

      paymentRows.push({
        id: paymentId,
        created: charge.created,
        customerId,
        currency: charge.currency || balanceTransaction.currency || null,
        grossAmount: balanceTransaction.amount || 0,
        feeAmount: balanceTransaction.fee || 0,
        netAmount: balanceTransaction.net || 0,
      });
    };

    const includedInvoices = invoices.filter((invoice) => (
      invoice.livemode === true &&
      invoice.status === "paid" &&
      !excludedCustomerIds.has(clean(invoice.customer)) &&
      new Date(invoice.created * 1000) >= REPORTING_START_DATE
    ));

    for (const invoice of includedInvoices) {
      const chargeId = clean((invoice as any).charge);
      if (!chargeId) continue;

      try {
        const charge = await stripe.charges.retrieve(chargeId, { expand: ["balance_transaction"] });
        addPaymentRowFromCharge(charge, "invoice");
      } catch (error) {
        logStep("Failed retrieving invoice charge for revenue", {
          invoiceId: invoice.id,
          chargeId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    for (const charge of charges) {
      if (clean(charge.invoice)) continue;
      addPaymentRowFromCharge(charge, "charge");
    }

    const includedRefunds = refunds.filter((refund) => {
      if (refund.livemode !== true) return false;
      if (new Date(refund.created * 1000) < REPORTING_START_DATE) return false;
      const refundChargeId = clean((refund as any).charge);
      return Boolean(refundChargeId && includedChargeIds.has(refundChargeId));
    });

    const currencies = new Set<string>();
    let grossRevenueCents = 0;
    let refundedCents = 0;
    let stripeFeesCents = 0;
    let netAfterFeesCents = 0;
    let currentMrrCents = 0;

    for (const paymentRow of paymentRows) {
      const key = dateKey(new Date(paymentRow.created * 1000));
      if (!buckets[key]) continue;
      buckets[key].grossRevenueCents += paymentRow.grossAmount;
      buckets[key].stripeFeesCents += paymentRow.feeAmount;
      buckets[key].netAfterFeesCents += paymentRow.netAmount;
      grossRevenueCents += paymentRow.grossAmount;
      stripeFeesCents += paymentRow.feeAmount;
      netAfterFeesCents += paymentRow.netAmount;
      if (paymentRow.currency) currencies.add(paymentRow.currency);
    }

    for (const refund of includedRefunds) {
      const key = dateKey(new Date(refund.created * 1000));
      const amount = refund.amount || 0;
      if (!buckets[key]) continue;
      buckets[key].refundedCents += amount;
      refundedCents += amount;
      if (refund.currency) currencies.add(refund.currency);
    }

    for (const subscription of includedSubscriptions) {
      for (const item of subscription.items?.data || []) {
        const price = item.price;
        currentMrrCents += normalizeRecurringAmountToMonthly(price, item.quantity || 1);
        if (price.currency) currencies.add(price.currency);
      }
    }

    for (const bucket of Object.values(buckets)) {
      bucket.netRevenueCents = bucket.grossRevenueCents - bucket.refundedCents;
    }

    const currency = Array.from(currencies)[0] || "usd";
    return {
      rangeDays: normalizeOverviewRangeDays(days),
      items: Object.values(buckets),
      summary: {
        grossRevenueCents,
        refundedCents,
        stripeFeesCents,
        netRevenueCents: grossRevenueCents - refundedCents,
        netAfterFeesCents,
        currentMrrCents: Math.round(currentMrrCents),
        paidInvoiceCount: includedInvoices.length,
        balanceTransactionCount: paymentRows.length,
        activeSubscriptionCount: includedSubscriptions.length,
        currency,
        mixedCurrencies: currencies.size > 1,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logStep("Stripe revenue overview failed", { error: message });
    return {
      rangeDays: normalizeOverviewRangeDays(days),
      items: emptyItems,
      summary: {
        grossRevenueCents: 0,
        refundedCents: 0,
        stripeFeesCents: 0,
        netRevenueCents: 0,
        netAfterFeesCents: 0,
        currentMrrCents: 0,
        paidInvoiceCount: 0,
        balanceTransactionCount: 0,
        activeSubscriptionCount: 0,
        currency: "usd",
        mixedCurrencies: false,
      },
      error: message,
    };
  }
};

const getProfilesByUserIds = async (ctx: AdminContext, userIds: string[]) => {
  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
  if (uniqueUserIds.length === 0) return new Map<string, any>();

  const { data: profiles, error } = await ctx.supabaseAdmin
    .from("profiles")
    .select("id, full_name, email, church_role, created_at, updated_at")
    .in("id", uniqueUserIds);
  if (error) throw new Error(error.message);

  const profileMap = new Map<string, any>();
  for (const profile of profiles || []) {
    profileMap.set(profile.id, profile);
  }
  return profileMap;
};

const getOwnerProfilesForAccounts = async (ctx: AdminContext, accountIds: string[]) => {
  if (accountIds.length === 0) return new Map<string, any>();
  const { data: owners, error } = await ctx.supabaseAdmin
    .from("account_members")
    .select("account_id, user_id, role")
    .in("account_id", accountIds)
    .eq("role", "owner");
  if (error) throw new Error(error.message);

  const profileMap = await getProfilesByUserIds(ctx, (owners || []).map((owner: any) => owner.user_id));

  const map = new Map<string, any>();
  for (const owner of owners || []) {
    if (!map.has(owner.account_id)) {
      map.set(owner.account_id, {
        ...owner,
        profiles: profileMap.get(owner.user_id) || null,
      });
    }
  }
  return map;
};

const getPendingEmailChangeRequestForUser = async (
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
) => {
  const { data, error } = await supabaseAdmin
    .from("email_change_requests" as any)
    .select("id, user_id, account_id, current_email, requested_email, status, expires_at, confirmed_at, created_at, updated_at")
    .eq("user_id", userId)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data || null;
};

const customers = async (ctx: AdminContext, body: any) => {
  const search = clean(body?.search).toLowerCase();
  const status = clean(body?.status) || "all";
  const limit = Math.min(Math.max(Number(body?.limit) || 25, 1), 100);
  const offset = Math.max(Number(body?.offset) || 0, 0);

  let query = ctx.supabaseAdmin.from("accounts").select("*", { count: "exact" }).order("created_at", { ascending: false });
  if (status === "active") query = query.in("subscription_status", ["active", "trialing"]);
  if (status === "past_due" || status === "failed_payment") query = query.eq("subscription_status", "past_due");
  if (status === "free") query = query.or("plan_tier.eq.free,subscription_status.eq.inactive");
  if (status === "beta") query = query.eq("is_beta_user", true);
  if (status === "recent") {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    query = query.gte("created_at", cutoff);
  }

  const { data: accountRows, count, error } = await query.range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);
  const accountIds = (accountRows || []).map((account: any) => account.id);
  const ownerMap = await getOwnerProfilesForAccounts(ctx, accountIds);
  const activeDeletionRequestMap = await getActiveDeletionRequestsForAccounts(ctx, accountIds);
  const stripe = getStripe();
  const nextInvoiceSummaries = await mapWithConcurrency(accountRows || [], 4, async (account: any) => ({
    accountId: account.id,
    nextInvoice: activeDeletionRequestMap.has(account.id)
      ? notApplicableNextInvoiceSummary()
      : await getNextInvoiceSummary(stripe, account),
  }));
  const nextInvoiceMap = new Map(nextInvoiceSummaries.map((summary) => [summary.accountId, summary.nextInvoice]));
  const { data: supportRows } = accountIds.length
    ? await ctx.supabaseAdmin.from("support_requests").select("id, email, account_id").eq("status", "active")
    : { data: [] as any[] };

  const supportByEmail = new Map<string, number>();
  const supportByAccount = new Map<string, number>();
  for (const support of supportRows || []) {
    const email = normalizeEmail(support.email);
    supportByEmail.set(email, (supportByEmail.get(email) || 0) + 1);
    if (support.account_id) {
      supportByAccount.set(support.account_id, (supportByAccount.get(support.account_id) || 0) + 1);
    }
  }

  let items = (accountRows || []).map((account: any) => {
    const owner = ownerMap.get(account.id);
    const profile = owner?.profiles || null;
    const activeDeletionRequest = activeDeletionRequestMap.get(account.id) || null;
    const adminSubscription = deriveAdminSubscriptionState(account, activeDeletionRequest);
    return {
      account,
      owner: profile,
      activeDeletionRequest,
      ...adminSubscription,
      supportRequestCount:
        supportByAccount.get(account.id) ||
        (profile?.email ? supportByEmail.get(normalizeEmail(profile.email)) || 0 : 0),
      nextInvoice: nextInvoiceMap.get(account.id) || emptyNextInvoiceSummary("none"),
    };
  });

  if (search) {
    items = items.filter((item: any) =>
      [item.account?.name, item.owner?.full_name, item.owner?.email, item.account?.stripe_customer_id]
        .some((value) => clean(value).toLowerCase().includes(search))
    );
  }

  if (status === "support") {
    items = items.filter((item: any) => item.supportRequestCount > 0);
  }

  if (status === "active") {
    items = items.filter((item: any) => !item.activeDeletionRequest);
  }

  if (status === "canceled") {
    items = items.filter((item: any) => item.activeDeletionRequest || item.account?.subscription_status === "canceled");
  }

  return { items, total: count ?? items.length, limit, offset };
};

const customerDetail = async (ctx: AdminContext, body: any) => {
  const accountId = clean(body?.accountId);
  if (!isUuid(accountId)) throw new Error("A valid account id is required");

  const [
    { data: account },
    { data: members, error: membersError },
    { count: presentationCount },
    { data: activeDeletionRequest },
  ] = await Promise.all([
    ctx.supabaseAdmin.from("accounts").select("*").eq("id", accountId).maybeSingle(),
    ctx.supabaseAdmin.from("account_members").select("*").eq("account_id", accountId).order("created_at", { ascending: true }),
    ctx.supabaseAdmin.from("sermons").select("id", { count: "exact", head: true }).eq("account_id", accountId),
    ctx.supabaseAdmin
      .from("account_deletion_requests" as any)
      .select("*")
      .eq("account_id", accountId)
      .eq("status", "pending")
      .order("requested_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (!account) throw new Error("Customer account not found");
  if (membersError) throw new Error(membersError.message);
  const profileMap = await getProfilesByUserIds(ctx, (members || []).map((member: any) => member.user_id));
  const membersWithProfiles = (members || []).map((member: any) => ({
    ...member,
    profiles: profileMap.get(member.user_id) || null,
  }));
  const owner = membersWithProfiles.find((member: any) => member.role === "owner") || null;
  const pendingEmailChangeRequest = owner?.user_id
    ? await getPendingEmailChangeRequestForUser(ctx.supabaseAdmin, owner.user_id)
    : null;
  const ownerEmail = owner?.profiles?.email ? normalizeEmail(owner.profiles.email) : "";
  const [{ data: accountSupportRequests }, { data: legacySupportRequests }] = await Promise.all([
    ctx.supabaseAdmin
      .from("support_requests")
      .select("*")
      .eq("account_id", accountId)
      .eq("status", "active")
      .order("created_at", { ascending: false }),
    ownerEmail
      ? ctx.supabaseAdmin
          .from("support_requests")
          .select("*")
          .is("account_id", null)
          .ilike("email", ownerEmail)
          .eq("status", "active")
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const supportById = new Map<string, any>();
  for (const request of [...(accountSupportRequests || []), ...(legacySupportRequests || [])]) {
    supportById.set(request.id, request);
  }
  const supportRequests = Array.from(supportById.values()).sort((a, b) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  let stripeContext: any = null;
  let nextInvoice = activeDeletionRequest ? notApplicableNextInvoiceSummary() : emptyNextInvoiceSummary("none");
  const stripe = getStripe();
  if (stripe && account.stripe_customer_id) {
    try {
      const [customer, subscriptions, invoices, nextInvoiceSummary] = await Promise.all([
        stripe.customers.retrieve(account.stripe_customer_id),
        stripe.subscriptions.list({ customer: account.stripe_customer_id, status: "all", limit: 5 }),
        stripe.invoices.list({ customer: account.stripe_customer_id, limit: 10 }),
        activeDeletionRequest ? Promise.resolve(notApplicableNextInvoiceSummary()) : getNextInvoiceSummary(stripe, account),
      ]);
      nextInvoice = nextInvoiceSummary;

      stripeContext = {
        customer,
        subscriptions: subscriptions.data,
        nextInvoice,
        invoices: invoices.data.map((invoice: any) => ({
          id: invoice.id,
          number: invoice.number,
          status: invoice.status,
          amount_paid: invoice.amount_paid,
          amount_due: invoice.amount_due,
          currency: invoice.currency,
          created: invoice.created,
          hosted_invoice_url: invoice.hosted_invoice_url,
          payment_intent: typeof invoice.payment_intent === "string" ? invoice.payment_intent : invoice.payment_intent?.id || null,
        })),
      };
    } catch (error) {
      stripeContext = { error: error instanceof Error ? error.message : String(error) };
      nextInvoice = activeDeletionRequest
        ? notApplicableNextInvoiceSummary()
        : { ...emptyNextInvoiceSummary("unavailable"), error: stripeContext.error };
    }
  } else {
    nextInvoice = await getNextInvoiceSummary(stripe, account);
  }

  const normalizedMembers = membersWithProfiles.map((member: any) => ({
    id: member.id,
    account_id: member.account_id,
    user_id: member.user_id,
    role: member.role,
    invited_email: member.invited_email,
    invited_at: member.invited_at,
    accepted_at: member.accepted_at,
    created_at: member.created_at,
    profile: member.profiles || null,
  }));

  const adminSubscription = deriveAdminSubscriptionState(account, activeDeletionRequest || null);

  return {
    account,
    activeDeletionRequest: activeDeletionRequest || null,
    ...adminSubscription,
    location: {
      city: account.city || null,
      state: account.state || null,
      label: [account.city, account.state].filter(Boolean).join(", ") || null,
    },
    members: normalizedMembers,
    owner,
    pendingEmailChangeRequest,
    presentationCount: presentationCount ?? 0,
    supportRequests: supportRequests || [],
    nextInvoice,
    stripeContext,
  };
};

const customerUpdate = async (ctx: AdminContext, body: any) => {
  const accountId = clean(body?.accountId);
  const changes = body?.changes;
  if (!isUuid(accountId)) throw new Error("A valid account id is required");
  if (!changes || typeof changes !== "object" || Array.isArray(changes)) {
    throw new Error("Changed fields are required");
  }

  const [{ data: account }, { data: ownerMembership }] = await Promise.all([
    ctx.supabaseAdmin.from("accounts").select("*").eq("id", accountId).maybeSingle(),
    ctx.supabaseAdmin
      .from("account_members")
      .select("user_id, role")
      .eq("account_id", accountId)
      .eq("role", "owner")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  if (!account) throw new Error("Customer account not found");
  if (!ownerMembership?.user_id) throw new Error("Owner record not found");

  const ownerProfileMap = await getProfilesByUserIds(ctx, [ownerMembership.user_id]);
  const ownerProfile = ownerProfileMap.get(ownerMembership.user_id) || null;
  if (!ownerProfile) throw new Error("Owner profile not found");

  const accountPatch: Record<string, unknown> = {};
  const profilePatch: Record<string, unknown> = {};
  const changedFields: string[] = [];

  if ("accountName" in changes) {
    const nextValue = clean(changes.accountName);
    if (!nextValue) throw new Error("Organization name is required");
    if (nextValue !== clean(account.name)) {
      accountPatch.name = nextValue;
      changedFields.push("accountName");
    }
  }

  if ("city" in changes) {
    const nextValue = clean(changes.city) || null;
    if ((nextValue || "") !== clean(account.city)) {
      accountPatch.city = nextValue;
      changedFields.push("city");
    }
  }

  if ("state" in changes) {
    const nextValue = clean(changes.state) || null;
    if ((nextValue || "") !== clean(account.state)) {
      accountPatch.state = nextValue;
      changedFields.push("state");
    }
  }

  if ("ownerFullName" in changes) {
    const nextValue = clean(changes.ownerFullName) || null;
    if ((nextValue || "") !== clean(ownerProfile.full_name)) {
      profilePatch.full_name = nextValue;
      changedFields.push("ownerFullName");
    }
  }

  if ("ownerChurchRole" in changes) {
    const nextValue = clean(changes.ownerChurchRole) || null;
    if ((nextValue || "") !== clean(ownerProfile.church_role)) {
      profilePatch.church_role = nextValue;
      changedFields.push("ownerChurchRole");
    }
  }

  if (changedFields.length === 0) {
    return await customerDetail(ctx, { accountId });
  }

  if (Object.keys(accountPatch).length > 0) {
    const { error } = await ctx.supabaseAdmin
      .from("accounts")
      .update(accountPatch)
      .eq("id", accountId);
    if (error) throw new Error(error.message);
  }

  if (Object.keys(profilePatch).length > 0) {
    const { error } = await ctx.supabaseAdmin
      .from("profiles")
      .update(profilePatch)
      .eq("id", ownerMembership.user_id);
    if (error) throw new Error(error.message);
  }

  await audit(ctx, "customer_updated", "account", accountId, {
    ownerUserId: ownerMembership.user_id,
    fields: changedFields,
  });

  return await customerDetail(ctx, { accountId });
};

const customerRequestEmailChange = async (ctx: AdminContext, body: any) => {
  const accountId = clean(body?.accountId);
  const requestedEmail = normalizeEmail(body?.requestedEmail);
  if (!isUuid(accountId)) throw new Error("A valid account id is required");
  if (!requestedEmail) throw new Error("A new email is required");
  if (!isValidEmail(requestedEmail)) throw new Error("Enter a valid email address");

  const [{ data: account }, { data: ownerMembership }] = await Promise.all([
    ctx.supabaseAdmin.from("accounts").select("id, name").eq("id", accountId).maybeSingle(),
    ctx.supabaseAdmin
      .from("account_members")
      .select("user_id, role")
      .eq("account_id", accountId)
      .eq("role", "owner")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  if (!account) throw new Error("Customer account not found");
  if (!ownerMembership?.user_id) throw new Error("Owner record not found");

  const ownerProfileMap = await getProfilesByUserIds(ctx, [ownerMembership.user_id]);
  const ownerProfile = ownerProfileMap.get(ownerMembership.user_id) || null;
  if (!ownerProfile?.email) throw new Error("Owner email not found");

  const currentEmail = normalizeEmail(ownerProfile.email);
  if (requestedEmail === currentEmail) {
    throw new Error("That email already matches the current owner email");
  }

  const { data: conflictingProfiles, error: conflictingProfilesError } = await ctx.supabaseAdmin
    .from("profiles")
    .select("id")
    .ilike("email", requestedEmail)
    .neq("id", ownerMembership.user_id)
    .limit(1);
  if (conflictingProfilesError) throw new Error(conflictingProfilesError.message);
  if ((conflictingProfiles || []).length > 0) {
    throw new Error("That email is already in use by another account");
  }

  const { data: conflictingPending, error: conflictingPendingError } = await ctx.supabaseAdmin
    .from("email_change_requests" as any)
    .select("id")
    .ilike("requested_email", requestedEmail)
    .eq("status", "pending")
    .neq("user_id", ownerMembership.user_id)
    .limit(1);
  if (conflictingPendingError) throw new Error(conflictingPendingError.message);
  if ((conflictingPending || []).length > 0) {
    throw new Error("That email already has a pending change request");
  }

  await ctx.supabaseAdmin
    .from("email_change_requests" as any)
    .update({ status: "canceled" })
    .eq("user_id", ownerMembership.user_id)
    .eq("status", "pending");

  const rawToken = generateEmailChangeToken();
  const tokenHash = await hashToken(rawToken);
  const expiresAt = addDays(new Date(), 2).toISOString();

  const { data: request, error: requestError } = await ctx.supabaseAdmin
    .from("email_change_requests" as any)
    .insert({
      user_id: ownerMembership.user_id,
      account_id: accountId,
      current_email: currentEmail,
      requested_email: requestedEmail,
      token_hash: tokenHash,
      requested_by_admin_id: ctx.admin.id,
      status: "pending",
      expires_at: expiresAt,
    })
    .select("id")
    .single();
  if (requestError || !request) throw new Error(requestError?.message || "Could not create email change request");

  try {
    await sendEmailChangeConfirmationEmail(requestedEmail, rawToken);
  } catch (error) {
    await ctx.supabaseAdmin
      .from("email_change_requests" as any)
      .delete()
      .eq("id", request.id);
    throw error;
  }

  await audit(ctx, "customer_email_change_requested", "account", accountId, {
    ownerUserId: ownerMembership.user_id,
    currentEmail,
    requestedEmail,
  });

  return await customerDetail(ctx, { accountId });
};

const customerRemoveMember = async (ctx: AdminContext, body: any) => {
  const accountId = clean(body?.accountId);
  const targetUserId = clean(body?.targetUserId);
  if (!isUuid(accountId) || !isUuid(targetUserId)) throw new Error("A valid account and user are required");

  const [{ data: account }, { data: targetMembership }, { count: ownerCount }] = await Promise.all([
    ctx.supabaseAdmin.from("accounts").select("id, name").eq("id", accountId).maybeSingle(),
    ctx.supabaseAdmin
      .from("account_members")
      .select("user_id, role")
      .eq("account_id", accountId)
      .eq("user_id", targetUserId)
      .maybeSingle(),
    ctx.supabaseAdmin
      .from("account_members")
      .select("id", { count: "exact", head: true })
      .eq("account_id", accountId)
      .eq("role", "owner"),
  ]);

  if (!account) throw new Error("Customer account not found");
  if (!targetMembership) throw new Error("Team member not found");
  if (targetMembership.role === "owner" && (ownerCount ?? 0) <= 1) {
    throw new Error("Transfer ownership before removing the only owner");
  }

  const profileMap = await getProfilesByUserIds(ctx, [targetUserId]);
  const profile = profileMap.get(targetUserId) || {};
  const targetEmail = clean(profile.email);
  const targetName = clean(profile.full_name) || "there";
  const { data: targetAdmin } = await ctx.supabaseAdmin
    .from("admin_users")
    .select("id")
    .eq("user_id", targetUserId)
    .eq("status", "active")
    .maybeSingle();

  await ctx.supabaseAdmin.from("account_members").delete().eq("account_id", accountId).eq("user_id", targetUserId);
  if (!targetAdmin) {
    const { error: deleteUserError } = await ctx.supabaseAdmin.auth.admin.deleteUser(targetUserId);
    if (deleteUserError) throw new Error(`Failed deleting team member account: ${deleteUserError.message}`);
  }

  let emailSent = false;
  try {
    emailSent = await sendTeamRemovalEmail({
      toEmail: targetEmail,
      recipientName: targetName,
      accountName: clean(account.name) || "your organization",
    });
  } catch (error) {
    logStep("Admin customer member removal email failed", { accountId, targetUserId, error: String(error) });
  }

  await audit(ctx, "customer_member_removed", "user", targetUserId, {
    accountId,
    email: targetEmail,
    role: targetMembership.role,
    emailSent,
    authUserDeleted: !targetAdmin,
  });
  return { success: true, emailSent };
};

const customerTransferOwner = async (ctx: AdminContext, body: any) => {
  const accountId = clean(body?.accountId);
  const newOwnerUserId = clean(body?.newOwnerUserId);
  const previousOwnerUserId = clean(body?.previousOwnerUserId);
  if (!isUuid(accountId) || !isUuid(newOwnerUserId) || !isUuid(previousOwnerUserId)) {
    throw new Error("A valid account, current owner, and new owner are required");
  }
  if (newOwnerUserId === previousOwnerUserId) throw new Error("Choose a different user to become owner");

  const { data: memberships } = await ctx.supabaseAdmin
    .from("account_members")
    .select("user_id, role")
    .eq("account_id", accountId)
    .in("user_id", [newOwnerUserId, previousOwnerUserId]);

  const previousOwner = (memberships || []).find((member: any) => member.user_id === previousOwnerUserId);
  const newOwner = (memberships || []).find((member: any) => member.user_id === newOwnerUserId);
  if (!previousOwner || previousOwner.role !== "owner") throw new Error("Current owner membership not found");
  if (!newOwner) throw new Error("Replacement owner must already belong to this organization");
  const profileMap = await getProfilesByUserIds(ctx, [previousOwnerUserId, newOwnerUserId]);
  const previousOwnerProfile = profileMap.get(previousOwnerUserId) || null;
  const newOwnerProfile = profileMap.get(newOwnerUserId) || null;

  const { error: promoteError } = await ctx.supabaseAdmin
    .from("account_members")
    .update({ role: "owner" })
    .eq("account_id", accountId)
    .eq("user_id", newOwnerUserId);
  if (promoteError) throw new Error(promoteError.message);

  const { error: demoteError } = await ctx.supabaseAdmin
    .from("account_members")
    .update({ role: "member" })
    .eq("account_id", accountId)
    .eq("user_id", previousOwnerUserId);
  if (demoteError) throw new Error(demoteError.message);

  await audit(ctx, "customer_owner_transferred", "account", accountId, {
    previousOwnerUserId,
    previousOwnerEmail: previousOwnerProfile?.email || null,
    newOwnerUserId,
    newOwnerEmail: newOwnerProfile?.email || null,
  });
  return { success: true };
};

const customerScheduleOrgDeletion = async (ctx: AdminContext, body: any) => {
  const accountId = clean(body?.accountId);
  const reason = clean(body?.reason) || "Admin scheduled organization deletion";
  if (!isUuid(accountId)) throw new Error("A valid account id is required");

  const { data: existingRequest } = await ctx.supabaseAdmin
    .from("account_deletion_requests" as any)
    .select("*")
    .eq("account_id", accountId)
    .eq("status", "pending")
    .maybeSingle();
  if (existingRequest) return { success: true, alreadyPending: true, deletionRequest: existingRequest };

  const [{ data: account }, { data: owner }] = await Promise.all([
    ctx.supabaseAdmin.from("accounts").select("*").eq("id", accountId).maybeSingle(),
    ctx.supabaseAdmin
      .from("account_members")
      .select("user_id")
      .eq("account_id", accountId)
      .eq("role", "owner")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);
  if (!account) throw new Error("Customer account not found");
  const ownerProfileMap = await getProfilesByUserIds(ctx, owner?.user_id ? [owner.user_id] : []);
  const ownerProfile = owner?.user_id ? ownerProfileMap.get(owner.user_id) : null;

  const now = new Date();
  const cancelableUntil = addDays(now, 7);
  let subscriptionPeriodEnd = account.subscription_period_end ? new Date(account.subscription_period_end) : null;
  let stripeSchedulingError: string | null = null;
  const stripe = getStripe();
  let subscriptionId = account.stripe_subscription_id || null;

  if (stripe && (subscriptionId || account.stripe_customer_id)) {
    try {
      let subscription: Stripe.Subscription | null = null;
      if (subscriptionId) {
        const retrieved = await stripe.subscriptions.retrieve(subscriptionId);
        if (retrieved.status !== "canceled" && retrieved.status !== "incomplete_expired") subscription = retrieved;
      }
      if (!subscription && account.stripe_customer_id) {
        const subscriptions = await stripe.subscriptions.list({ customer: account.stripe_customer_id, status: "all", limit: 10 });
        subscription = subscriptions.data.find((sub) =>
          sub.status === "active" || sub.status === "trialing" || sub.status === "past_due"
        ) || null;
        subscriptionId = subscription?.id || subscriptionId;
      }
      if (subscription) {
        const updated = await stripe.subscriptions.update(subscription.id, { cancel_at_period_end: true });
        const endTimestamp = typeof updated.current_period_end === "number" ? updated.current_period_end : null;
        if (endTimestamp) subscriptionPeriodEnd = new Date(endTimestamp * 1000);
        await ctx.supabaseAdmin
          .from("accounts")
          .update({
            stripe_subscription_id: updated.id,
            subscription_period_end: toIsoOrNull(subscriptionPeriodEnd),
          })
          .eq("id", accountId);
      }
    } catch (error) {
      stripeSchedulingError = error instanceof Error ? error.message : String(error);
    }
  }

  const scheduledDeleteAt = maxDate(cancelableUntil, subscriptionPeriodEnd);
  const { data: deletionRequest, error } = await ctx.supabaseAdmin
    .from("account_deletion_requests" as any)
    .insert({
      account_id: accountId,
      requester_user_id: owner?.user_id || null,
      requester_email: ownerProfile?.email || ctx.email,
      requester_full_name: ownerProfile?.full_name || "Admin scheduled",
      account_name: account.name,
      requester_role: "admin",
      plan_tier: account.plan_tier || null,
      billing_interval: account.billing_interval || null,
      stripe_customer_id: account.stripe_customer_id || null,
      stripe_subscription_id: subscriptionId,
      reason,
      additional_feedback: "Scheduled from the internal admin dashboard.",
      cancelable_until: cancelableUntil.toISOString(),
      subscription_period_end: toIsoOrNull(subscriptionPeriodEnd),
      scheduled_delete_at: scheduledDeleteAt.toISOString(),
      last_error: stripeSchedulingError,
      alert_email_sent: false,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  const cancellationSupportRequestId = await createCancellationSupportTicket(ctx.supabaseAdmin, {
    accountId,
    accountName: account.name || "Unknown organization",
    userId: owner?.user_id || null,
    requesterName: ownerProfile?.full_name || "Admin scheduled",
    requesterEmail: ownerProfile?.email || ctx.email,
  });

  await audit(ctx, "customer_org_deletion_scheduled", "account", accountId, {
    deletionRequestId: deletionRequest.id,
    scheduledDeleteAt: deletionRequest.scheduled_delete_at,
    stripeSchedulingError,
  });
  await createAdminNotification(ctx, {
    type: "account_deletion_requested",
    title: "Cancellation submission",
    message: `${account.name || "An organization"} has submitted for Offboarding. Reach out to confirm and support to save customer if applicable.`,
    accountId,
    supportRequestId: cancellationSupportRequestId,
    accountDeletionRequestId: deletionRequest.id,
    metadata: {
      source: "admin",
      cancelableUntil: deletionRequest.cancelable_until,
      scheduledDeleteAt: deletionRequest.scheduled_delete_at,
      stripeSchedulingError,
    },
  });
  return { success: true, deletionRequest, stripeSchedulingError };
};

const customerHardDeleteOrg = async (ctx: AdminContext, body: any) => {
  const accountId = clean(body?.accountId);
  const confirmation = clean(body?.confirmation);
  if (!isUuid(accountId)) throw new Error("A valid account id is required");

  const { data: account } = await ctx.supabaseAdmin.from("accounts").select("*").eq("id", accountId).maybeSingle();
  if (!account) throw new Error("Customer account not found");
  if (confirmation.toLowerCase() !== clean(account.name).toLowerCase()) {
    throw new Error("Type the organization name exactly to hard delete this organization");
  }

  const { data: members } = await ctx.supabaseAdmin
    .from("account_members")
    .select("user_id, role")
    .eq("account_id", accountId);
  const memberUserIds = Array.from(new Set((members || []).map((member: any) => member.user_id).filter(Boolean)));
  const { data: activeAdmins } = memberUserIds.length
    ? await ctx.supabaseAdmin
        .from("admin_users")
        .select("user_id")
        .in("user_id", memberUserIds)
        .eq("status", "active")
    : { data: [] as any[] };
  const activeAdminUserIds = new Set((activeAdmins || []).map((admin: any) => admin.user_id));

  const stripe = getStripe();
  if (stripe && account.stripe_customer_id) {
    await cancelAndDeleteStripeCustomer(stripe, account.stripe_customer_id, account.stripe_subscription_id || null);
  }

  const { error: deleteAccountError } = await ctx.supabaseAdmin.from("accounts").delete().eq("id", accountId);
  if (deleteAccountError) throw new Error(`Failed deleting account data: ${deleteAccountError.message}`);

  for (const memberUserId of memberUserIds) {
    if (activeAdminUserIds.has(memberUserId)) {
      logStep("Skipped auth user delete for active admin during org hard delete", { memberUserId });
      continue;
    }
    const { error } = await ctx.supabaseAdmin.auth.admin.deleteUser(memberUserId);
    if (error) logStep("Failed deleting auth user during admin hard delete", { memberUserId, error: error.message });
  }

  await ctx.supabaseAdmin
    .from("account_deletion_requests" as any)
    .update({ status: "completed", completed_at: new Date().toISOString(), last_error: null })
    .eq("account_id", accountId)
    .eq("status", "pending");

  await audit(ctx, "customer_org_hard_deleted", "account", accountId, {
    accountName: account.name,
    memberCount: memberUserIds.length,
    memberUserIds,
    skippedActiveAdminUserIds: Array.from(activeAdminUserIds),
    stripeCustomerId: account.stripe_customer_id || null,
  });
  return { success: true, deletedUsers: memberUserIds.length };
};

const customerBetaUpdate = async (ctx: AdminContext, body: any) => {
  const accountId = clean(body?.accountId);
  const enabled = Boolean(body?.enabled);
  if (!isUuid(accountId)) throw new Error("A valid account id is required");

  const { data: account } = await ctx.supabaseAdmin.from("accounts").select("*").eq("id", accountId).maybeSingle();
  if (!account) throw new Error("Customer account not found");

  const now = new Date();
  const betaPlanTier = ["pro", "team", "enterprise"].includes(clean(account.plan_tier))
    ? clean(account.plan_tier)
    : "pro";
  const trialEndsAt = addDays(now, 30).toISOString();
  const update = enabled
    ? {
        is_beta_user: true,
        beta_started_at: now.toISOString(),
        beta_trial_ends_at: trialEndsAt,
        beta_plan_tier: betaPlanTier,
        beta_day_10_email_sent_at: null,
        beta_day_25_email_sent_at: null,
        beta_day_30_email_sent_at: null,
        plan_tier: betaPlanTier,
        subscription_status: "trialing",
        subscription_period_end: trialEndsAt,
      }
    : {
        is_beta_user: false,
      };

  const { data: updatedAccount, error } = await ctx.supabaseAdmin
    .from("accounts")
    .update(update)
    .eq("id", accountId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await audit(ctx, enabled ? "customer_beta_enabled" : "customer_beta_disabled", "account", accountId, {
    betaTrialEndsAt: updatedAccount.beta_trial_ends_at || null,
    betaPlanTier: updatedAccount.beta_plan_tier || null,
  });

  return { success: true, account: updatedAccount };
};

const purgeExpiredArchivedSupportRequests = async (ctx: AdminContext) => {
  const { error } = await ctx.supabaseAdmin
    .from("support_requests")
    .delete()
    .eq("status", "archived")
    .not("archived_until", "is", null)
    .lt("archived_until", new Date().toISOString());

  if (error) {
    logStep("Expired support request purge failed", { error: error.message });
  }
};

const supportList = async (ctx: AdminContext, body: any) => {
  await purgeExpiredArchivedSupportRequests(ctx);
  const search = clean(body?.search).toLowerCase();
  const status = clean(body?.status) === "archived" ? "archived" : "active";
  const { data, error } = await ctx.supabaseAdmin
    .from("support_requests")
    .select("*")
    .eq("status", status)
    .order(status === "archived" ? "completed_at" : "created_at", { ascending: false, nullsFirst: false })
    .limit(200);
  if (error) throw new Error(error.message);
  const accountIds = Array.from(new Set((data || []).map((item: any) => item.account_id).filter(Boolean)));
  const { data: accounts } = accountIds.length
    ? await ctx.supabaseAdmin.from("accounts").select("id, name, city, state").in("id", accountIds)
    : { data: [] as any[] };
  const accountMap = new Map((accounts || []).map((account: any) => [account.id, account]));
  const enriched = (data || []).map((item: any) => ({
    ...item,
    account: item.account_id ? accountMap.get(item.account_id) || null : null,
  }));

  const items = search
    ? enriched.filter((item: any) =>
        [item.name, item.email, item.organization, item.subject, item.message, item.account?.name]
          .some((value) => clean(value).toLowerCase().includes(search))
      )
    : enriched;
  return { items, status };
};

const supportComplete = async (ctx: AdminContext, body: any) => {
  await purgeExpiredArchivedSupportRequests(ctx);
  const ids = Array.from(
    new Set(
      (Array.isArray(body?.ids) ? body.ids : [body?.id])
        .map((value: any) => clean(value))
        .filter(Boolean),
    ),
  );

  if (ids.length === 0 || ids.some((id) => !isUuid(id))) {
    throw new Error("One or more valid support request ids are required");
  }

  const { data: existing, error: fetchError } = await ctx.supabaseAdmin
    .from("support_requests")
    .select("*")
    .in("id", ids)
    .eq("status", "active");
  if (fetchError) throw new Error(fetchError.message);
  if (!existing || existing.length === 0) throw new Error("No active support requests were found");

  const now = new Date();
  const archivedUntil = addDays(now, 7);
  const existingIds = existing.map((item: any) => item.id);
  const { error } = await ctx.supabaseAdmin
    .from("support_requests")
    .update({
      status: "archived",
      completed_at: now.toISOString(),
      completed_by_admin_id: ctx.admin.id,
      archived_until: archivedUntil.toISOString(),
    })
    .in("id", existingIds)
    .eq("status", "active");
  if (error) throw new Error(error.message);

  for (const item of existing) {
    await audit(ctx, "support_request_completed", "support_request", item.id, {
      email: item.email,
      subject: item.subject,
      archivedUntil: archivedUntil.toISOString(),
    });
  }

  return { success: true, completedCount: existing.length, ids: existingIds, archivedUntil: archivedUntil.toISOString() };
};

const supportEmailContactedUpdate = async (ctx: AdminContext, body: any) => {
  const id = clean(body?.id);
  const contacted = Boolean(body?.contacted);
  if (!isUuid(id)) throw new Error("A valid support request id is required");

  const update = contacted
    ? {
        email_contacted_at: new Date().toISOString(),
        email_contacted_by_admin_id: ctx.admin.id,
      }
    : {
        email_contacted_at: null,
        email_contacted_by_admin_id: null,
      };

  const { data, error } = await ctx.supabaseAdmin
    .from("support_requests")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await audit(ctx, contacted ? "support_email_contacted_marked" : "support_email_contacted_unmarked", "support_request", id, {
    email: data.email,
    subject: data.subject,
  });

  return { success: true, item: data };
};

const notificationTargetUrl = (notification: any) => {
  if (notification.account_id) return `/admin/customers/${notification.account_id}`;
  if (notification.support_request_id) return "/admin/support";
  return "/admin";
};

const notificationsList = async (ctx: AdminContext, body: any) => {
  const limit = Math.min(Math.max(Number(body?.limit) || 30, 1), 50);
  const rawLimit = Math.min(limit * 4, 200);
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: notifications, error }, { data: recentNotificationIds }] = await Promise.all([
    ctx.supabaseAdmin
      .from("admin_notifications" as any)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(rawLimit),
    ctx.supabaseAdmin
      .from("admin_notifications" as any)
      .select("id")
      .gte("created_at", ninetyDaysAgo)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);
  if (error) throw new Error(error.message);

  const visibleIds = (notifications || []).map((item: any) => item.id);
  const recentIds = (recentNotificationIds || []).map((item: any) => item.id);
  const allIds = Array.from(new Set([...visibleIds, ...recentIds]));
  const { data: reads } = allIds.length
    ? await ctx.supabaseAdmin
        .from("admin_notification_reads" as any)
        .select("notification_id, read_at, cleared_at")
        .eq("admin_user_id", ctx.admin.id)
        .in("notification_id", allIds)
    : { data: [] as any[] };
  const readMap = new Map((reads || []).map((read: any) => [read.notification_id, read]));
  const items = (notifications || [])
    .filter((item: any) => !readMap.get(item.id)?.cleared_at)
    .slice(0, limit)
    .map((item: any) => ({
      ...item,
      readAt: readMap.get(item.id)?.read_at || null,
      isRead: Boolean(readMap.get(item.id)?.read_at),
      targetUrl: notificationTargetUrl(item),
    }));
  const unreadCount = recentIds.filter((id: string) => {
    const read = readMap.get(id);
    return !read?.read_at && !read?.cleared_at;
  }).length;

  return { items, unreadCount };
};

const notificationsMarkRead = async (ctx: AdminContext, body: any) => {
  const id = clean(body?.id);
  if (!isUuid(id)) throw new Error("A valid notification id is required");

  const { error } = await ctx.supabaseAdmin
    .from("admin_notification_reads" as any)
    .upsert({
      notification_id: id,
      admin_user_id: ctx.admin.id,
      read_at: new Date().toISOString(),
    }, { onConflict: "notification_id,admin_user_id" });
  if (error) throw new Error(error.message);

  return { success: true };
};

const notificationsMarkAllRead = async (ctx: AdminContext) => {
  const { data: notifications, error } = await ctx.supabaseAdmin
    .from("admin_notifications" as any)
    .select("id")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);

  const rows = (notifications || []).map((notification: any) => ({
    notification_id: notification.id,
    admin_user_id: ctx.admin.id,
    read_at: new Date().toISOString(),
  }));

  if (rows.length > 0) {
    const { error: upsertError } = await ctx.supabaseAdmin
      .from("admin_notification_reads" as any)
      .upsert(rows, { onConflict: "notification_id,admin_user_id" });
    if (upsertError) throw new Error(upsertError.message);
  }

  return { success: true, count: rows.length };
};

const notificationsClearAll = async (ctx: AdminContext) => {
  const { data: notifications, error } = await ctx.supabaseAdmin
    .from("admin_notifications" as any)
    .select("id")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);

  const now = new Date().toISOString();
  const rows = (notifications || []).map((notification: any) => ({
    notification_id: notification.id,
    admin_user_id: ctx.admin.id,
    read_at: now,
    cleared_at: now,
  }));

  if (rows.length > 0) {
    const { error: upsertError } = await ctx.supabaseAdmin
      .from("admin_notification_reads" as any)
      .upsert(rows, { onConflict: "notification_id,admin_user_id" });
    if (upsertError) throw new Error(upsertError.message);
  }

  return { success: true, count: rows.length };
};

const normalizeMessagePayload = (body: any, existing: any = {}) => {
  const title = clean(body?.title ?? existing.title);
  const messageBody = clean(body?.body ?? existing.body);
  const audienceType = clean(body?.audienceType ?? body?.audience_type ?? existing.audience_type ?? "all");
  const targetAccountId = clean(body?.targetAccountId ?? body?.target_account_id ?? existing.target_account_id);
  const status = clean(body?.status ?? existing.status ?? "active") || "active";
  const startsAt = clean(body?.startsAt ?? body?.starts_at ?? existing.starts_at);
  const endsAt = clean(body?.endsAt ?? body?.ends_at ?? existing.ends_at);
  const ctaLabel = clean(body?.ctaLabel ?? body?.cta_label ?? existing.cta_label);
  const ctaUrl = clean(body?.ctaUrl ?? body?.cta_url ?? existing.cta_url);

  if (!title) throw new Error("Message title is required");
  if (!messageBody) throw new Error("Message body is required");
  if (!["all", "account", "beta"].includes(audienceType)) throw new Error("Choose a valid message audience");
  if (!["active", "inactive"].includes(status)) throw new Error("Choose a valid message status");
  if (audienceType === "account" && !isUuid(targetAccountId)) throw new Error("Choose a customer for this message");

  return {
    title,
    body: messageBody,
    audience_type: audienceType,
    target_account_id: audienceType === "account" ? targetAccountId : null,
    status,
    starts_at: startsAt || null,
    ends_at: endsAt || null,
    cta_label: ctaLabel && ctaUrl ? ctaLabel : null,
    cta_url: ctaLabel && ctaUrl ? ctaUrl : null,
  };
};

const enrichMessagesWithAccounts = async (ctx: AdminContext, messages: any[]) => {
  const accountIds = Array.from(new Set(messages.map((message) => message.target_account_id).filter(Boolean)));
  const { data: accounts } = accountIds.length
    ? await ctx.supabaseAdmin.from("accounts").select("id, name, city, state").in("id", accountIds)
    : { data: [] as any[] };
  const accountMap = new Map((accounts || []).map((account: any) => [account.id, account]));
  return messages.map((message) => ({
    ...message,
    targetAccount: message.target_account_id ? accountMap.get(message.target_account_id) || null : null,
  }));
};

const messagesList = async (ctx: AdminContext) => {
  const { data, error } = await ctx.supabaseAdmin
    .from("global_messages" as any)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return { items: await enrichMessagesWithAccounts(ctx, data || []) };
};

const messagesCustomerOptions = async (ctx: AdminContext, body: any) => {
  const search = clean(body?.search).toLowerCase();
  let query = ctx.supabaseAdmin
    .from("accounts")
    .select("id, name, city, state")
    .order("name", { ascending: true })
    .limit(100);
  if (search) query = query.ilike("name", `%${search}%`);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return { items: data || [] };
};

const messagesCreate = async (ctx: AdminContext, body: any) => {
  const payload = normalizeMessagePayload(body);
  const { data, error } = await ctx.supabaseAdmin
    .from("global_messages" as any)
    .insert({ ...payload, created_by_admin_id: ctx.admin.id })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await audit(ctx, "global_message_created", "global_message", data.id, {
    audienceType: data.audience_type,
    targetAccountId: data.target_account_id,
    status: data.status,
  });

  const [item] = await enrichMessagesWithAccounts(ctx, [data]);
  return { item };
};

const messagesUpdate = async (ctx: AdminContext, body: any) => {
  const id = clean(body?.id);
  if (!isUuid(id)) throw new Error("A valid message id is required");

  const { data: existing, error: existingError } = await ctx.supabaseAdmin
    .from("global_messages" as any)
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (!existing) throw new Error("Message not found");

  const payload = normalizeMessagePayload(body, existing);
  const { data, error } = await ctx.supabaseAdmin
    .from("global_messages" as any)
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await audit(ctx, "global_message_updated", "global_message", id, {
    audienceType: data.audience_type,
    targetAccountId: data.target_account_id,
    status: data.status,
  });

  const [item] = await enrichMessagesWithAccounts(ctx, [data]);
  return { item };
};

const messagesDelete = async (ctx: AdminContext, body: any) => {
  const id = clean(body?.id);
  if (!isUuid(id)) throw new Error("A valid message id is required");

  const { data: existing } = await ctx.supabaseAdmin
    .from("global_messages" as any)
    .select("id, title, audience_type, target_account_id")
    .eq("id", id)
    .maybeSingle();

  const { error } = await ctx.supabaseAdmin
    .from("global_messages" as any)
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);

  await audit(ctx, "global_message_deleted", "global_message", id, {
    title: existing?.title || null,
    audienceType: existing?.audience_type || null,
    targetAccountId: existing?.target_account_id || null,
  });

  return { success: true };
};

const adminUsers = async (ctx: AdminContext) => {
  const [{ data: admins }, { data: invites }] = await Promise.all([
    ctx.supabaseAdmin.from("admin_users").select("*").order("created_at", { ascending: false }),
    ctx.supabaseAdmin.from("admin_invites").select("*").order("created_at", { ascending: false }).limit(100),
  ]);
  return { admins: admins || [], invites: invites || [] };
};

const adminInvite = async (ctx: AdminContext, body: any) => {
  const email = normalizeEmail(body?.email);
  if (!email.includes("@")) throw new Error("A valid admin email is required");
  const { data: existingAdmin } = await ctx.supabaseAdmin
    .from("admin_users")
    .select("*")
    .eq("email", email)
    .eq("status", "active")
    .maybeSingle();
  if (existingAdmin) throw new Error("That email already has active admin access");

  const { data: invite, error } = await ctx.supabaseAdmin
    .from("admin_invites")
    .insert({ email, invited_by: ctx.admin.id })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  await sendAdminInviteEmail(email, invite.token);
  await audit(ctx, "admin_invite_created", "admin_invite", invite.id, { email });
  return { invite };
};

const adminInviteResend = async (ctx: AdminContext, body: any) => {
  const id = clean(body?.id);
  if (!isUuid(id)) throw new Error("A valid invite id is required");
  const { data: invite } = await ctx.supabaseAdmin.from("admin_invites").select("*").eq("id", id).maybeSingle();
  if (!invite || invite.status !== "pending") throw new Error("Pending admin invite not found");
  await sendAdminInviteEmail(invite.email, invite.token);
  await audit(ctx, "admin_invite_resent", "admin_invite", id, { email: invite.email });
  return { success: true };
};

const adminInviteAccept = async (req: Request, supabaseAdmin: ReturnType<typeof createClient>, body: any) => {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new Error("Please sign in before accepting this admin invite");
  const { userId, email } = await getAuthenticatedUser(authHeader);
  const token = clean(body?.token);
  if (!token) throw new Error("Invite token is required");

  const { data: invite } = await supabaseAdmin
    .from("admin_invites")
    .select("*")
    .eq("token", token)
    .eq("status", "pending")
    .maybeSingle();
  if (!invite) throw new Error("Admin invite is invalid or has already been used");
  if (new Date(invite.expires_at).getTime() <= Date.now()) {
    await supabaseAdmin.from("admin_invites").update({ status: "expired" }).eq("id", invite.id);
    throw new Error("Admin invite has expired");
  }
  if (normalizeEmail(invite.email) !== email) {
    throw new Error("This invite belongs to a different email address");
  }

  const { data: admin, error } = await supabaseAdmin
    .from("admin_users")
    .upsert({ user_id: userId, email, status: "active", invited_by: invite.invited_by }, { onConflict: "email" })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  await supabaseAdmin.from("admin_invites").update({ status: "accepted", accepted_by: admin.id }).eq("id", invite.id);
  await audit({ admin, userId, supabaseAdmin }, "admin_invite_accepted", "admin_invite", invite.id, { email });
  return { admin };
};

const adminDeactivate = async (ctx: AdminContext, body: any) => {
  const id = clean(body?.id);
  if (!isUuid(id)) throw new Error("A valid admin id is required");
  if (id === ctx.admin.id) throw new Error("You cannot deactivate your own admin access");
  const { count } = await ctx.supabaseAdmin
    .from("admin_users")
    .select("id", { count: "exact", head: true })
    .eq("status", "active");
  if ((count ?? 0) <= 1) throw new Error("At least one active admin is required");
  const { error } = await ctx.supabaseAdmin.from("admin_users").update({ status: "deactivated" }).eq("id", id);
  if (error) throw new Error(error.message);
  await audit(ctx, "admin_access_revoked", "admin_user", id);
  return { success: true };
};

const passwordReset = async (ctx: AdminContext, body: any) => {
  const email = normalizeEmail(body?.email);
  if (!email.includes("@")) throw new Error("A valid email is required");
  const redirectTo = `${getSiteUrl().replace(/\/$/, "")}/reset-password`;
  const supabaseAuth = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { error } = await supabaseAuth.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw new Error(error.message);
  await audit(ctx, "password_reset_sent", "user_email", email);
  return { success: true };
};

const billingList = async (ctx: AdminContext) => {
  const { data: accounts } = await ctx.supabaseAdmin
    .from("accounts")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(200);
  return {
    items: accounts || [],
  };
};

const refundInvoiceCharge = async (ctx: AdminContext, body: any) => {
  const paymentIntentId = clean(body?.paymentIntentId);
  const accountId = clean(body?.accountId);
  if (!paymentIntentId.startsWith("pi_")) throw new Error("A valid payment intent id is required");
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe is not configured");
  const refund = await stripe.refunds.create({ payment_intent: paymentIntentId });
  await audit(ctx, "refund_issued", "payment_intent", paymentIntentId, {
    accountId,
    refundId: refund.id,
    amount: refund.amount,
    currency: refund.currency,
  });
  return { refund };
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseAdmin = getSupabaseAdmin();

  try {
    const body = await req.json();
    const action = clean(body?.action);
    logStep("Action received", { action });

    if (action === "bootstrap") return json(await bootstrap(req, supabaseAdmin));
    if (action === "admin_invite_accept") return json(await adminInviteAccept(req, supabaseAdmin, body));

    const ctx = await requireAdmin(req, supabaseAdmin);

    switch (action) {
      case "me":
        return json({ admin: ctx.admin });
      case "overview":
        return json(await overview(ctx));
      case "overview_revenue":
        return json(await overviewRevenue(ctx, body));
      case "overview_activity":
        return json(await overviewActivity(ctx, body));
      case "customers":
        return json(await customers(ctx, body));
      case "customer_detail":
        return json(await customerDetail(ctx, body));
      case "customer_update":
        return json(await customerUpdate(ctx, body));
      case "customer_request_email_change":
        return json(await customerRequestEmailChange(ctx, body));
      case "customer_remove_member":
        return json(await customerRemoveMember(ctx, body));
      case "customer_transfer_owner":
        return json(await customerTransferOwner(ctx, body));
      case "customer_schedule_org_deletion":
        return json(await customerScheduleOrgDeletion(ctx, body));
      case "customer_hard_delete_org":
        return json(await customerHardDeleteOrg(ctx, body));
      case "customer_beta_update":
        return json(await customerBetaUpdate(ctx, body));
      case "support_list":
        return json(await supportList(ctx, body));
      case "support_complete":
        return json(await supportComplete(ctx, body));
      case "support_email_contacted_update":
        return json(await supportEmailContactedUpdate(ctx, body));
      case "notifications_list":
        return json(await notificationsList(ctx, body));
      case "notifications_mark_read":
        return json(await notificationsMarkRead(ctx, body));
      case "notifications_mark_all_read":
        return json(await notificationsMarkAllRead(ctx));
      case "notifications_clear_all":
        return json(await notificationsClearAll(ctx));
      case "messages_list":
        return json(await messagesList(ctx));
      case "messages_customer_options":
        return json(await messagesCustomerOptions(ctx, body));
      case "messages_create":
        return json(await messagesCreate(ctx, body));
      case "messages_update":
        return json(await messagesUpdate(ctx, body));
      case "messages_delete":
        return json(await messagesDelete(ctx, body));
      case "admin_users":
        return json(await adminUsers(ctx));
      case "admin_invite":
        return json(await adminInvite(ctx, body));
      case "admin_invite_resend":
        return json(await adminInviteResend(ctx, body));
      case "admin_deactivate":
        return json(await adminDeactivate(ctx, body));
      case "password_reset":
        return json(await passwordReset(ctx, body));
      case "billing_list":
        return json(await billingList(ctx));
      case "refund_invoice_charge":
        return json(await refundInvoiceCharge(ctx, body));
      default:
        throw new Error("Unsupported admin action");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    logStep("ERROR", { message });
    return json({ error: message }, 500);
  }
});
