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

    // Use Supabase Auth admin to send a simple invite email
    // For now, we'll use the Supabase SMTP via the admin API
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Send invite using Supabase's built-in email (via auth.admin)
    // Since Supabase doesn't have a generic "send email" endpoint,
    // we'll use the inviteUserByEmail which sends an email automatically
    // But we want a custom flow, so we'll just return the link for now
    // and let the frontend show it if email sending fails.

    // Attempt to send via Supabase Auth invite (this sends a real email)
    const response = await fetch(`${supabaseUrl}/auth/v1/invite`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
      },
      body: JSON.stringify({
        email,
        data: {
          invite_token: token,
          org_name: org_name || "SermonSlides",
        },
      }),
    });

    // Even if the auth invite fails (user may already exist), 
    // the account_invite record is what matters
    if (!response.ok) {
      const errorBody = await response.text();
      console.log("Auth invite response:", response.status, errorBody);
      
      // Return the signup link so the frontend can show it
      return new Response(
        JSON.stringify({ 
          success: true, 
          method: "link_only",
          signup_link: signupLink,
          message: "Invite created. Share this link with the user." 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, method: "email_sent" }),
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
