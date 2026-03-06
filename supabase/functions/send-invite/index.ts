import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
    const { email, token, org_name, invited_by_name } = await req.json();

    if (!email || !token) {
      return new Response(JSON.stringify({ error: "Missing email or token" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const siteUrl = Deno.env.get("SITE_URL") || "https://id-preview--4106109b-8adc-4e56-b2c6-847326cb6d74.lovable.app";
    const signupLink = `${siteUrl}/signup?invite=${token}`;

    // We intentionally do NOT call /auth/v1/invite — that creates a ghost user.
    // Instead, we just return the signup link for the frontend to display/share.
    // The account_invites table record is what matters.

    return new Response(
      JSON.stringify({
        success: true,
        method: "link_only",
        signup_link: signupLink,
        message: `Invite created for ${email}. Share this link with them.`,
      }),
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
