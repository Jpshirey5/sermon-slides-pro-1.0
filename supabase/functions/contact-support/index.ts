import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const clean = (value: unknown) => String(value ?? "").trim();

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const DNS_LOOKUP_TIMEOUT_MS = 4000;
const INVALID_EMAIL_MESSAGE = "Please enter a valid email address for a real email domain.";

type DnsAnswer = {
  data?: string;
};

type DnsResponse = {
  Status?: number;
  Answer?: DnsAnswer[];
};

type AuthContext = {
  userId: string;
  email: string;
} | null;

const lookupDnsRecord = async (domain: string, recordType: "MX" | "A" | "AAAA") => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DNS_LOOKUP_TIMEOUT_MS);

  try {
    const response = await fetch(
      `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=${recordType}`,
      {
        signal: controller.signal,
        headers: { Accept: "application/dns-json" },
      },
    );

    if (!response.ok) {
      throw new Error(`DNS lookup failed with status ${response.status}`);
    }

    const data = (await response.json()) as DnsResponse;
    if (data.Status !== 0) {
      return [];
    }

    return Array.isArray(data.Answer) ? data.Answer : [];
  } finally {
    clearTimeout(timeoutId);
  }
};

const domainLooksMailCapable = async (email: string) => {
  if (!EMAIL_PATTERN.test(email)) {
    return { valid: false, reason: "invalid_syntax" as const };
  }

  const domain = email.split("@")[1]?.trim().toLowerCase();
  if (!domain) {
    return { valid: false, reason: "missing_domain" as const };
  }

  try {
    const [mxAnswers, aAnswers, aaaaAnswers] = await Promise.all([
      lookupDnsRecord(domain, "MX"),
      lookupDnsRecord(domain, "A"),
      lookupDnsRecord(domain, "AAAA"),
    ]);

    const hasMx = mxAnswers.some((answer) => Boolean(answer.data?.trim()));
    const hasIpFallback =
      aAnswers.some((answer) => Boolean(answer.data?.trim())) ||
      aaaaAnswers.some((answer) => Boolean(answer.data?.trim()));

    if (hasMx || hasIpFallback) {
      return { valid: true as const };
    }

    return { valid: false as const, reason: "no_mail_dns" as const };
  } catch (error) {
    console.warn("Contact email DNS validation lookup failed, allowing submission:", error);
    return { valid: true as const, dnsUncertain: true as const };
  }
};

const createAdminNotification = async (
  supabaseAdmin: ReturnType<typeof createClient>,
  notification: {
    type: "support_request" | "account_deletion_requested" | "account_saving_needed" | "subscription_changed";
    title: string;
    message: string;
    accountId?: string | null;
    supportRequestId?: string | null;
    metadata?: Record<string, unknown>;
  },
) => {
  const { error } = await supabaseAdmin.from("admin_notifications" as any).insert({
    type: notification.type,
    title: notification.title,
    message: notification.message,
    account_id: notification.accountId ?? null,
    support_request_id: notification.supportRequestId ?? null,
    metadata: notification.metadata ?? {},
  });
  if (error) console.warn("Admin notification insert failed:", error.message);
};

const getAuthenticatedUser = async (req: Request, supabaseUrl: string, anonKey: string): Promise<AuthContext> => {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;

  const token = authHeader.replace("Bearer ", "");
  const anonClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await anonClient.auth.getUser(token);
  if (error || !data?.user) throw new Error("Authentication failed");
  return {
    userId: data.user.id,
    email: data.user.email?.trim().toLowerCase() || "",
  };
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

  try {
    const resendApiKey = Deno.env.get("RESEND_API_KEY") ?? "";
    const resendFromEmail = Deno.env.get("RESEND_FROM_EMAIL") ?? "";
    const resendFromName = Deno.env.get("RESEND_FROM_NAME") || "Sermon Slide Pro";
    const supportEmail = Deno.env.get("SUPPORT_CONTACT_EMAIL") || "support@sermonslidepro.com";
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabaseAdmin = createClient(
      supabaseUrl,
      serviceRoleKey,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const body = await req.json();
    const isSupportTicket = Boolean(body?.supportTicket);
    const authenticatedUser = isSupportTicket ? await getAuthenticatedUser(req, supabaseUrl, anonKey) : null;
    const firstName = clean(body?.firstName);
    const lastName = clean(body?.lastName);
    const organization = clean(body?.organization);
    const email = clean(body?.email).toLowerCase();
    const phoneCountry = clean(body?.phoneCountry);
    const phoneNumber = clean(body?.phoneNumber);
    const message = clean(body?.message);
    const agreedToPolicies = Boolean(body?.agreedToPolicies);
    const submittedFrom = clean(req.headers.get("origin")) || clean(req.headers.get("referer")) || "Unknown origin";
    const submittedAt = new Date().toISOString();

    let trustedAccountId: string | null = null;
    let trustedUserId: string | null = null;
    let trustedName = "";
    let trustedEmail = "";
    let trustedOrganization = "";
    let trustedPhone = "";

    if (isSupportTicket) {
      if (!authenticatedUser) {
        throw new Error("Please log in before submitting support.");
      }

      trustedUserId = authenticatedUser.userId;
      const [{ data: profile }, { data: accountId }] = await Promise.all([
        supabaseAdmin
          .from("profiles")
          .select("full_name, email")
          .eq("id", authenticatedUser.userId)
          .maybeSingle(),
        supabaseAdmin.rpc("get_user_account_id", { _user_id: authenticatedUser.userId }),
      ]);

      trustedAccountId = accountId || null;
      const { data: account } = trustedAccountId
        ? await supabaseAdmin.from("accounts").select("name").eq("id", trustedAccountId).maybeSingle()
        : { data: null as any };

      trustedName = clean(profile?.full_name) || clean(authenticatedUser.email) || "Signed-in user";
      trustedEmail = clean(profile?.email).toLowerCase() || authenticatedUser.email;
      trustedOrganization = clean(account?.name) || "Unknown organization";
      trustedPhone = phoneNumber ? [phoneCountry || "US", phoneNumber].filter(Boolean).join(" ") : "";

      if (!message) {
        return new Response(
          JSON.stringify({ error: "Please describe what you need help with." }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
    } else if (!firstName || !lastName || !organization || !email || !phoneCountry || !phoneNumber || !message || !agreedToPolicies) {
      return new Response(
        JSON.stringify({ error: "All contact form fields are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const submissionEmail = trustedEmail || email;
    const submissionName = trustedName || [firstName, lastName].filter(Boolean).join(" ").trim() || "Unknown sender";
    const submissionOrganization = trustedOrganization || organization;
    const submissionPhone = trustedPhone || [phoneCountry, phoneNumber].filter(Boolean).join(" ");

    const emailValidation = await domainLooksMailCapable(submissionEmail);
    if (!emailValidation.valid) {
      return new Response(
        JSON.stringify({ error: INVALID_EMAIL_MESSAGE }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    let supportRequestId: string | null = null;

    const { data: supportRequest, error: supportInsertError } = await supabaseAdmin
      .from("support_requests")
      .insert({
        account_id: trustedAccountId,
        user_id: trustedUserId,
        name: submissionName,
        email: submissionEmail,
        organization: submissionOrganization,
        phone: submissionPhone,
        subject: isSupportTicket ? "Support Request" : "Customer Support",
        message,
        submitted_from: submittedFrom,
        notification_sent: false,
      })
      .select("id")
      .single();

    if (supportInsertError || !supportRequest) {
      throw new Error(`Could not save support request: ${supportInsertError?.message || "Unknown error"}`);
    }

    supportRequestId = supportRequest.id;

    await createAdminNotification(supabaseAdmin, {
      type: "support_request",
      title: isSupportTicket ? "New support ticket" : "New contact request",
      message: `${submissionName} from ${submissionOrganization || "an unknown organization"} submitted a support request.`,
      accountId: trustedAccountId,
      supportRequestId,
      metadata: {
        email: submissionEmail,
        organization: submissionOrganization || null,
        source: isSupportTicket ? "dashboard" : "public_contact",
      },
    });

    if (!resendApiKey || !resendFromEmail) {
      const emailError = "Contact email service is not configured";
      await supabaseAdmin
        .from("support_requests")
        .update({ notification_sent: false, notification_error: emailError })
        .eq("id", supportRequestId);
      return new Response(
        JSON.stringify({
          error: "Your request was saved, but the email notification could not be sent. Support can still see it in the queue.",
          supportRequestId,
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    const safeMessage = escapeHtml(message).replaceAll("\n", "<br />");
    const safeOrganization = submissionOrganization ? escapeHtml(submissionOrganization) : "Not provided";
    const safePhone = submissionPhone ? escapeHtml(submissionPhone) : "Not provided";
    const safeEmail = escapeHtml(submissionEmail);
    const safeName = escapeHtml(submissionName);
    const safeOrigin = escapeHtml(submittedFrom);

    const subject = isSupportTicket ? "Customer Support - Signed-In Request" : "Customer Support";
    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
        <h2 style="margin-bottom: 16px;">${isSupportTicket ? "New Sermon Slide Pro Support Request" : "New Sermon Slide Pro Contact Form Submission"}</h2>
        <p><strong>Name:</strong> ${safeName}</p>
        <p><strong>Email:</strong> ${safeEmail}</p>
        <p><strong>Organization:</strong> ${safeOrganization}</p>
        <p><strong>Phone:</strong> ${safePhone}</p>
        <p><strong>Request type:</strong> ${isSupportTicket ? "Signed-in support ticket" : "Public contact form"}</p>
        <p><strong>Account ID:</strong> ${trustedAccountId ? escapeHtml(trustedAccountId) : "Not linked"}</p>
        <p><strong>Agreed to privacy policy:</strong> ${agreedToPolicies || isSupportTicket ? "Yes" : "No"}</p>
        <p><strong>Submitted from:</strong> ${safeOrigin}</p>
        <p><strong>Submitted at:</strong> ${escapeHtml(submittedAt)}</p>
        <hr style="margin: 24px 0; border: 0; border-top: 1px solid #e5e7eb;" />
        <p><strong>Message:</strong></p>
        <p>${safeMessage}</p>
      </div>
    `;
    const text = `${isSupportTicket ? "New Sermon Slide Pro support request" : "New Sermon Slide Pro contact form submission"}

Name: ${submissionName}
Email: ${submissionEmail}
Organization: ${submissionOrganization || "Not provided"}
Phone: ${submissionPhone || "Not provided"}
Request type: ${isSupportTicket ? "Signed-in support ticket" : "Public contact form"}
Account ID: ${trustedAccountId || "Not linked"}
Agreed to privacy policy: ${agreedToPolicies || isSupportTicket ? "Yes" : "No"}
Submitted from: ${submittedFrom}
Submitted at: ${submittedAt}

Message:
${message}`;

    const resendResponse = await fetch("https://api.resend.com/emails", {
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
        reply_to: submissionEmail,
      }),
    });

    if (!resendResponse.ok) {
      const errorBody = await resendResponse.text();
      const emailError = `Resend email failed: ${resendResponse.status} ${errorBody}`;
      await supabaseAdmin
        .from("support_requests")
        .update({ notification_sent: false, notification_error: emailError })
        .eq("id", supportRequestId);
      return new Response(
        JSON.stringify({
          error: "Your request was saved, but the email notification could not be sent. Support can still see it in the queue.",
          supportRequestId,
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    await supabaseAdmin
      .from("support_requests")
      .update({ notification_sent: true, notification_error: null })
      .eq("id", supportRequestId);

    return new Response(
      JSON.stringify({ success: true, supportRequestId }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("Contact support error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
