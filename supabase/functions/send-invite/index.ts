import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

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
    const { email, token, site_url } = await req.json();

    if (!email || !token) {
      return new Response(JSON.stringify({ error: "Missing email or token" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: "Supabase admin invite configuration is missing" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

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
    const redirectTo = `${siteUrl}/auth/confirm`;

    const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: {
        invite_token: token,
        signup_intent: "dashboard",
      },
    });

    if (error) {
      console.error("Supabase invite error:", error);
      return new Response(JSON.stringify({ error: error.message || "Failed to send invite email" }), {
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
