import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const resendApiKey = Deno.env.get("RESEND_API_KEY") ?? "";
    const resendFromEmail = Deno.env.get("RESEND_FROM_EMAIL") ?? "";
    const resendFromName = Deno.env.get("RESEND_FROM_NAME") || "Sermon Slide Pro";
    const supportEmail = Deno.env.get("SUPPORT_CONTACT_EMAIL") || "support@sermonslidepro.com";

    if (!resendApiKey || !resendFromEmail) {
      throw new Error("Contact email service is not configured");
    }

    const body = await req.json();
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

    if (!firstName || !lastName || !organization || !email || !phoneCountry || !phoneNumber || !message || !agreedToPolicies) {
      return new Response(
        JSON.stringify({ error: "All contact form fields are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const emailValidation = await domainLooksMailCapable(email);
    if (!emailValidation.valid) {
      return new Response(
        JSON.stringify({ error: INVALID_EMAIL_MESSAGE }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const fullName = [firstName, lastName].filter(Boolean).join(" ").trim() || "Unknown sender";
    const safeMessage = escapeHtml(message).replaceAll("\n", "<br />");
    const safeOrganization = organization ? escapeHtml(organization) : "Not provided";
    const safePhone = phoneNumber ? escapeHtml([phoneCountry, phoneNumber].filter(Boolean).join(" ")) : "Not provided";
    const safeEmail = escapeHtml(email);
    const safeName = escapeHtml(fullName);
    const safeOrigin = escapeHtml(submittedFrom);

    const subject = "Customer Support";
    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
        <h2 style="margin-bottom: 16px;">New Sermon Slide Pro Contact Form Submission</h2>
        <p><strong>Name:</strong> ${safeName}</p>
        <p><strong>Email:</strong> ${safeEmail}</p>
        <p><strong>Organization:</strong> ${safeOrganization}</p>
        <p><strong>Phone:</strong> ${safePhone}</p>
        <p><strong>Agreed to privacy policy:</strong> ${agreedToPolicies ? "Yes" : "No"}</p>
        <p><strong>Submitted from:</strong> ${safeOrigin}</p>
        <p><strong>Submitted at:</strong> ${escapeHtml(submittedAt)}</p>
        <hr style="margin: 24px 0; border: 0; border-top: 1px solid #e5e7eb;" />
        <p><strong>Message:</strong></p>
        <p>${safeMessage}</p>
      </div>
    `;
    const text = `New Sermon Slide Pro contact form submission

Name: ${fullName}
Email: ${email}
Organization: ${organization || "Not provided"}
Phone: ${[phoneCountry, phoneNumber].filter(Boolean).join(" ") || "Not provided"}
Agreed to privacy policy: ${agreedToPolicies ? "Yes" : "No"}
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
        reply_to: email,
      }),
    });

    if (!resendResponse.ok) {
      const errorBody = await resendResponse.text();
      throw new Error(`Resend email failed: ${resendResponse.status} ${errorBody}`);
    }

    return new Response(
      JSON.stringify({ success: true }),
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
