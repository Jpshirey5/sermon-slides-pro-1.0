import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const normalizeEmail = (value: string | null | undefined) => value?.trim().toLowerCase() || "";

const findAuthUserByEmail = async (
  supabaseAdmin: ReturnType<typeof createClient>,
  email: string,
) => {
  let page = 1;

  while (page <= 10) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: 200,
    });

    if (error) {
      throw error;
    }

    const match = data.users.find((user) => normalizeEmail(user.email) === email);
    if (match) {
      return match;
    }

    if (!data.users.length || !data.nextPage) {
      return null;
    }

    page = data.nextPage;
  }

  return null;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, token, site_url } = await req.json();
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail || !token) {
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
    let refreshedExistingAuthUser = false;

    const existingAuthUser = await findAuthUserByEmail(supabaseAdmin, normalizedEmail);

    if (existingAuthUser) {
      const [{ data: membership }, { data: profile }] = await Promise.all([
        supabaseAdmin
          .from("account_members")
          .select("accepted_at")
          .eq("user_id", existingAuthUser.id)
          .maybeSingle(),
        supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("id", existingAuthUser.id)
          .maybeSingle(),
      ]);

      const hasAcceptedMembership = Boolean(membership?.accepted_at);
      const hasCompletedProfile = Boolean(profile?.id);

      if (hasAcceptedMembership || hasCompletedProfile) {
        return new Response(
          JSON.stringify({
            success: false,
            code: "active_user_exists",
            error: "This person already has an active account. Ask them to log in instead.",
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const { error: deleteStaleUserError } = await supabaseAdmin.auth.admin.deleteUser(existingAuthUser.id);
      if (deleteStaleUserError) {
        console.error("Failed deleting stale invited auth user:", deleteStaleUserError);
        return new Response(
          JSON.stringify({
            success: false,
            code: "stale_invite_cleanup_failed",
            error: "We found an older unfinished invite for this email, but could not refresh it yet.",
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      refreshedExistingAuthUser = true;
    }

    const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(normalizedEmail, {
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
      JSON.stringify({ success: true, refreshedExistingAuthUser }),
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
