import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const normalizeEmail = (value: string | null | undefined) => value?.trim().toLowerCase() || "";


const normalizeBaseUrl = (value: string | null | undefined) => {
  if (!value) return null;
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
};

const getSiteUrl = (req: Request, requestedSiteUrl: string | null | undefined) => {
  const configuredSiteUrl =
    normalizeBaseUrl(Deno.env.get("SITE_URL")) ||
    normalizeBaseUrl(Deno.env.get("VITE_SITE_URL")) ||
    "https://www.sermonslidepro.com";

  const allowedOrigins = new Set([
    configuredSiteUrl,
    "http://localhost:8080",
    "http://127.0.0.1:8080",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
  ]);

  const candidates = [
    normalizeBaseUrl(requestedSiteUrl),
    normalizeBaseUrl(req.headers.get("origin")),
    normalizeBaseUrl(req.headers.get("referer")),
  ];

  return candidates.find((candidate) => candidate && allowedOrigins.has(candidate)) || configuredSiteUrl;
};

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

const getAuthenticatedUser = async (req: Request, supabaseUrl: string, anonKey: string) => {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new Error("No authorization header");

  const token = authHeader.replace("Bearer ", "");
  const supabaseAnon = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabaseAnon.auth.getUser(token);
  if (error || !data.user?.id) throw new Error("Authentication failed");
  return data.user;
};

serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";
  const corsHeaders = {
    "Access-Control-Allow-Origin": ["https://sermonslidepro.com", "http://localhost:8080", "http://localhost:5173"].includes(origin) ? origin : "https://sermonslidepro.com",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
  const json = (body: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const { email, token, site_url } = await req.json();
    const normalizedEmail = normalizeEmail(email);
    const inviteToken = typeof token === "string" ? token.trim() : "";

    if (!normalizedEmail || !inviteToken) {
      return json({ error: "Missing email or token" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return json({ error: "Supabase admin invite configuration is missing" }, 500);
    }

    const authenticatedUser = await getAuthenticatedUser(req, supabaseUrl, anonKey);

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data: invite, error: inviteError } = await supabaseAdmin
      .from("account_invites")
      .select("id, account_id, email, token, expires_at")
      .eq("token", inviteToken)
      .maybeSingle();

    if (inviteError) {
      console.error("Invite lookup failed:", inviteError);
      return json({ error: "Could not verify invite" }, 500);
    }

    if (!invite || normalizeEmail(invite.email) !== normalizedEmail) {
      return json({ error: "Invite not found" }, 404);
    }

    if (new Date(invite.expires_at).getTime() <= Date.now()) {
      return json({ error: "Invite has expired" }, 400);
    }

    const { data: requesterMembership, error: membershipError } = await supabaseAdmin
      .from("account_members")
      .select("role")
      .eq("account_id", invite.account_id)
      .eq("user_id", authenticatedUser.id)
      .maybeSingle();

    if (membershipError) {
      console.error("Invite requester membership lookup failed:", membershipError);
      return json({ error: "Could not verify invite permissions" }, 500);
    }

    if (requesterMembership?.role !== "owner") {
      return json({ error: "Only the account owner can send team invites" }, 403);
    }

    const siteUrl = getSiteUrl(req, typeof site_url === "string" ? site_url : null);
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
        invite_token: inviteToken,
        signup_intent: "dashboard",
      },
    });

    if (error) {
      console.error("Supabase invite error:", error);
      return json({ error: error.message || "Failed to send invite email" }, 500);
    }

    return json({ success: true, refreshedExistingAuthUser });
  } catch (error) {
    console.error("Send invite error:", error);
    const message = error instanceof Error && error.message === "No authorization header"
      ? "Authentication required"
      : error instanceof Error && error.message === "Authentication failed"
      ? "Authentication failed"
      : "Internal server error";
    const status = message === "Internal server error" ? 500 : 401;
    return json({ error: message }, status);
  }
});
