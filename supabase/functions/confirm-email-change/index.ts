import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";



const clean = (value: unknown) => String(value ?? "").trim();
const normalizeEmail = (value: unknown) => clean(value).toLowerCase();
const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const hashToken = async (token: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
};

serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";
  const corsHeaders = {
    "Access-Control-Allow-Origin": ["https://sermonslidepro.com", "https://www.sermonslidepro.com", "http://localhost:8080", "http://localhost:5173"].includes(origin) ? origin : "https://sermonslidepro.com",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  try {
    const body = await req.json();
    const token = clean(body?.token);
    if (!token) throw new Error("Confirmation token is required");

    const tokenHash = await hashToken(token);
    const { data: request, error: requestError } = await supabaseAdmin
      .from("email_change_requests" as any)
      .select("*")
      .eq("token_hash", tokenHash)
      .eq("status", "pending")
      .maybeSingle();

    if (requestError) throw new Error(requestError.message);
    if (!request) throw new Error("This email change link is invalid or has already been used.");

    if (new Date(request.expires_at).getTime() <= Date.now()) {
      await supabaseAdmin
        .from("email_change_requests" as any)
        .update({ status: "expired" })
        .eq("id", request.id);
      throw new Error("This email change link has expired.");
    }

    const requestedEmail = normalizeEmail(request.requested_email);
    if (!requestedEmail || !isValidEmail(requestedEmail)) {
      throw new Error("The requested email is invalid.");
    }

    const { data: conflictingProfiles, error: conflictingProfilesError } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .ilike("email", requestedEmail)
      .neq("id", request.user_id)
      .limit(1);
    if (conflictingProfilesError) throw new Error(conflictingProfilesError.message);
    if ((conflictingProfiles || []).length > 0) {
      throw new Error("That email is already in use by another account.");
    }

    const authUpdate = await supabaseAdmin.auth.admin.updateUserById(request.user_id, {
      email: requestedEmail,
      email_confirm: true,
    });
    if (authUpdate.error) throw new Error(`Could not update login email: ${authUpdate.error.message}`);

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({ email: requestedEmail })
      .eq("id", request.user_id);

    if (profileError) {
      await supabaseAdmin.auth.admin.updateUserById(request.user_id, {
        email: request.current_email,
        email_confirm: true,
      });
      throw new Error("We couldn't finish syncing your account email. Please request a new confirmation link.");
    }

    const { error: adminUserError } = await supabaseAdmin
      .from("admin_users")
      .update({ email: requestedEmail })
      .eq("user_id", request.user_id);

    if (adminUserError) {
      await supabaseAdmin
        .from("profiles")
        .update({ email: request.current_email })
        .eq("id", request.user_id);
      await supabaseAdmin.auth.admin.updateUserById(request.user_id, {
        email: request.current_email,
        email_confirm: true,
      });
      throw new Error("We couldn't finish syncing your account email. Please request a new confirmation link.");
    }

    const now = new Date().toISOString();
    await supabaseAdmin
      .from("email_change_requests" as any)
      .update({ status: "confirmed", confirmed_at: now })
      .eq("id", request.id);

    return json({
      success: true,
      requestedEmail,
      accountId: request.account_id,
    });
  } catch (error) {
    return json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      400,
    );
  }
});
