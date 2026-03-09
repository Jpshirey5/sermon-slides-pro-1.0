import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Resend } from "npm:resend@6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, token, org_name, invited_by_name, site_url } = await req.json();

    if (!email || !token) {
      return new Response(JSON.stringify({ error: "Missing email or token" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      return new Response(JSON.stringify({ error: "RESEND_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resend = new Resend(resendApiKey);

    const normalizeBaseUrl = (value: string | null | undefined) => {
      if (!value) return null;
      try {
        const url = new URL(value);
        return `${url.protocol}//${url.host}`;
      } catch {
        return null;
      }
    };

    const requestOrigin = normalizeBaseUrl(req.headers.get("origin"));
    const refererOrigin = normalizeBaseUrl(req.headers.get("referer"));
    const bodySiteUrl = normalizeBaseUrl(site_url);
    const envSiteUrl = normalizeBaseUrl(Deno.env.get("SITE_URL"));

    const siteUrl = bodySiteUrl || requestOrigin || refererOrigin || envSiteUrl || "http://localhost:8080";
    const signupLink = `${siteUrl}/signup?invite=${token}`;

    const orgDisplay = org_name || "Sermon Slide Pro";
    const inviterDisplay = invited_by_name || "A team member";

    const { error } = await resend.emails.send({
      from: "Sermon Slide Pro <onboarding@resend.dev>",
      to: email,
      subject: `You've been invited to join ${orgDisplay} on Sermon Slide Pro`,
      html: `
        <div style="font-family: Georgia, 'Times New Roman', serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
          <h1 style="font-size: 24px; color: #1a1a2e; margin-bottom: 8px;">You're Invited!</h1>
          <p style="font-size: 16px; color: #555; line-height: 1.6;">
            ${inviterDisplay} has invited you to join <strong>${orgDisplay}</strong> on Sermon Slide Pro.
          </p>
          <p style="font-size: 16px; color: #555; line-height: 1.6;">
            Click the button below to create your account and get started.
          </p>
          <div style="margin: 32px 0;">
            <a href="${signupLink}" style="display: inline-block; background-color: #6d28d9; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-size: 16px; font-weight: 600;">
              Join ${orgDisplay}
            </a>
          </div>
          <p style="font-size: 13px; color: #999; line-height: 1.5;">
            This invite expires in 7 days. If you didn't expect this email, you can safely ignore it.
          </p>
        </div>
      `,
    });

    if (error) {
      console.error("Resend error:", error);
      return new Response(JSON.stringify({ error: "Failed to send email" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Send invite error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
