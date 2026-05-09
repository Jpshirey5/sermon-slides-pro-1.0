import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";


const sendRemovalEmail = async (options: {
  apiKey: string;
  fromEmail: string;
  fromName: string;
  toEmail: string;
  recipientName: string;
  accountName: string;
}) => {
  const subject = `You were removed from ${options.accountName}`;
  const greeting = options.recipientName.trim() || "there";
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
      <p>Hi ${greeting},</p>
      <p>Your access to <strong>${options.accountName}</strong> in Sermon Slide Pro has been removed by an account owner.</p>
      <p>Your login for this organization has been deleted. Presentations remain with the organization, so no shared church content was removed with your account.</p>
      <p>If you think this was a mistake, please contact your organization administrator.</p>
      <p>Sermon Slide Pro</p>
    </div>
  `;
  const text = `Hi ${greeting},

Your access to ${options.accountName} in Sermon Slide Pro has been removed by an account owner.

Your login for this organization has been deleted. Presentations remain with the organization, so no shared church content was removed with your account.

If you think this was a mistake, please contact your organization administrator.

Sermon Slide Pro`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `${options.fromName} <${options.fromEmail}>`,
      to: [options.toEmail],
      subject,
      html,
      text,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Resend email failed: ${response.status} ${errorBody}`);
  }
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

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) throw new Error("Authentication failed");

    const requesterUserId = claimsData.claims.sub as string | undefined;
    if (!requesterUserId) throw new Error("Invalid user claims");

    const body = await req.json();
    const targetUserId = String(body?.targetUserId || "").trim();
    if (!targetUserId) throw new Error("Target user is required");
    if (targetUserId === requesterUserId) throw new Error("Owners cannot remove themselves from the team");

    const { data: accountId } = await supabaseAdmin.rpc("get_user_account_id", { _user_id: requesterUserId });
    if (!accountId) throw new Error("No account found for requester");

    const { data: requesterMembership } = await supabaseAdmin
      .from("account_members")
      .select("role")
      .eq("account_id", accountId)
      .eq("user_id", requesterUserId)
      .maybeSingle();

    if (requesterMembership?.role !== "owner") {
      throw new Error("Only owners can remove team members");
    }

    const { data: targetMembership } = await supabaseAdmin
      .from("account_members")
      .select("user_id, role")
      .eq("account_id", accountId)
      .eq("user_id", targetUserId)
      .maybeSingle();

    if (!targetMembership) {
      throw new Error("That team member no longer belongs to this organization");
    }

    if (targetMembership.role === "owner") {
      throw new Error("Owners cannot remove another owner");
    }

    const [{ data: targetProfile }, { data: accountRecord }] = await Promise.all([
      supabaseAdmin.from("profiles").select("full_name, email").eq("id", targetUserId).maybeSingle(),
      supabaseAdmin.from("accounts").select("name").eq("id", accountId).maybeSingle(),
    ]);

    const targetEmail = targetProfile?.email?.trim() || "";
    const targetName = targetProfile?.full_name?.trim() || "there";
    const accountName = accountRecord?.name?.trim() || "your organization";

    const { error: deleteUserError } = await supabaseAdmin.auth.admin.deleteUser(targetUserId);
    if (deleteUserError) {
      throw new Error(`Failed deleting team member account: ${deleteUserError.message}`);
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY") ?? "";
    const resendFromEmail = Deno.env.get("RESEND_FROM_EMAIL") ?? "";
    const resendFromName = Deno.env.get("RESEND_FROM_NAME") || "Sermon Slide Pro";

    let emailSent = false;
    if (resendApiKey && resendFromEmail && targetEmail) {
      try {
        await sendRemovalEmail({
          apiKey: resendApiKey,
          fromEmail: resendFromEmail,
          fromName: resendFromName,
          toEmail: targetEmail,
          recipientName: targetName,
          accountName,
        });
        emailSent = true;
      } catch (emailError) {
        console.error("Failed sending removal email:", emailError);
      }
    } else {
      console.warn("Removal email skipped because RESEND_API_KEY, RESEND_FROM_EMAIL, or target email is missing");
    }

    return new Response(
      JSON.stringify({ success: true, emailSent }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("Remove team member error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      },
    );
  }
});
