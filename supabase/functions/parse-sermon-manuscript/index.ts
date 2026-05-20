// QUICK BUILD ADDITION — Edge Function that parses a sermon manuscript, validates references,
// and inserts a sermon row whose slides.formData is byte-compatible with the structured creator.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { checkMonthlyLimit } from "./usageLimiter.ts";
import { parseManuscriptWithClaude } from "./claudeParser.ts";
import { validateReferences } from "./scriptureValidator.ts";
import { buildSermon } from "./sermonBuilder.ts";

const MAX_MANUSCRIPT_CHARS = 200_000;

interface ResolvedAccount {
  accountId: string;
  tier: string;
}

async function resolveAccountAndTier(
  supabaseAdmin: any,
  userId: string,
): Promise<ResolvedAccount> {
  const { data: membership, error: membershipError } = await supabaseAdmin
    .from("account_members")
    .select("account_id, role")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (membershipError) throw new Error(membershipError.message);
  if (!membership?.account_id) throw new Error("No account is linked to your user");

  const { data: account, error: accountError } = await supabaseAdmin
    .from("accounts")
    .select("id, plan_tier")
    .eq("id", membership.account_id)
    .maybeSingle();
  if (accountError) throw new Error(accountError.message);
  const tier = (account?.plan_tier || "").toLowerCase() || "free";
  return { accountId: membership.account_id, tier };
}

serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";
  const corsHeaders = {
    "Access-Control-Allow-Origin": [
      "https://sermonslidepro.com",
      "https://www.sermonslidepro.com",
      "http://localhost:8080",
      "http://localhost:5173",
    ].includes(origin)
      ? origin
      : "https://sermonslidepro.com",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error_code: "INTERNAL", error_message: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ success: false, error_code: "INTERNAL", error_message: "Server misconfigured" }, 500);
  }

  const startedAt = Date.now();
  let logContext: {
    userId?: string;
    accountId?: string;
    fileName?: string;
    fileSizeBytes?: number;
    translation?: string;
  } = {};
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json(
        { success: false, error_code: "AUTH_FAILED", error_message: "Sign in required" },
        401,
      );
    }
    const token = authHeader.replace("Bearer ", "").trim();
    const supabaseAnon = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await supabaseAnon.auth.getUser(token);
    if (userError || !userData?.user?.id) {
      return json(
        { success: false, error_code: "AUTH_FAILED", error_message: "Sign in required" },
        401,
      );
    }
    const userId = userData.user.id;
    logContext.userId = userId;

    const body = await req.json().catch(() => ({}));
    const manuscriptText: string = typeof body?.manuscript_text === "string" ? body.manuscript_text : "";
    const fileName: string = typeof body?.file_name === "string" ? body.file_name : "manuscript";
    const fileSizeBytes: number = Number.isFinite(body?.file_size_bytes) ? Number(body.file_size_bytes) : 0;
    const translation: string = typeof body?.translation === "string" && body.translation.trim() ? body.translation.trim() : "KJV";
    const requestedCampusId: string | null = typeof body?.campus_id === "string" && body.campus_id ? body.campus_id : null;
    logContext = { ...logContext, fileName, fileSizeBytes, translation };

    if (!manuscriptText.trim()) {
      return json(
        {
          success: false,
          error_code: "INVALID_FILE",
          error_message: "We couldn't read your file. Try saving it in a different format and uploading again.",
        },
        400,
      );
    }
    if (manuscriptText.length > MAX_MANUSCRIPT_CHARS) {
      return json(
        {
          success: false,
          error_code: "FILE_TOO_LARGE",
          error_message: "Your manuscript is too long. Please trim it to under 200,000 characters.",
        },
        400,
      );
    }

    const { accountId, tier } = await resolveAccountAndTier(supabaseAdmin, userId);
    logContext.accountId = accountId;

    const limit = await checkMonthlyLimit(supabaseAdmin, userId, tier);
    if (!limit.allowed) {
      const nextTier = tier === "pro" ? "Team" : tier === "team" ? "Enterprise" : null;
      const message = nextTier
        ? `You've used your ${limit.limit} Quick Build uploads for this month. Upgrade to ${nextTier} for more.`
        : `You've used your ${limit.limit} Quick Build uploads for this month.`;
      return json(
        {
          success: false,
          error_code: "LIMIT_REACHED",
          error_message: message,
          upgrade_required: nextTier !== null,
        },
        402,
      );
    }

    const parsedResult = await parseManuscriptWithClaude(manuscriptText);
    const validation = await validateReferences({
      refs: parsedResult.data.scripture_references,
      translation,
      supabaseUrl,
      anonKey,
    });

    const built = buildSermon({
      parsed: parsedResult.data,
      validatedVerses: validation.validated,
      translation,
    });

    // Resolve campus for enterprise accounts, mirroring src/lib/presentations.ts logic.
    let resolvedCampusId: string | null = null;
    if (tier === "enterprise") {
      if (requestedCampusId) {
        resolvedCampusId = requestedCampusId;
      } else {
        const { data: primaryCampus } = await supabaseAdmin
          .from("campuses")
          .select("id")
          .eq("account_id", accountId)
          .eq("is_primary", true)
          .maybeSingle();
        resolvedCampusId = primaryCampus?.id || null;
      }
    }

    const parsingDurationMs = Date.now() - startedAt;
    const partial = validation.warnings.length > 0;
    await supabaseAdmin.from("quick_build_usage").insert({
      user_id: userId,
      account_id: accountId,
      sermon_id: null,
      file_name: fileName,
      file_size_bytes: fileSizeBytes,
      tokens_used: parsedResult.tokens_used,
      parsing_duration_ms: parsingDurationMs,
      status: partial ? "partial" : "success",
      error_message: null,
      translation,
      points_detected: built.pointsCount,
      verses_detected: built.versesCount,
    });

    return json({
      success: true,
      sermon_id: built.sermonId,
      title: built.title,
      series: built.series,
      presentation_date: built.presentationDate,
      campus_id: resolvedCampusId,
      form_data: built.formData,
      points_count: built.pointsCount,
      verses_count: built.versesCount,
      parsing_duration_ms: parsingDurationMs,
      warnings: validation.warnings,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    try {
      if (logContext.userId && logContext.accountId) {
        await supabaseAdmin.from("quick_build_usage").insert({
          user_id: logContext.userId,
          account_id: logContext.accountId,
          sermon_id: null,
          file_name: logContext.fileName || "unknown",
          file_size_bytes: logContext.fileSizeBytes || 0,
          tokens_used: null,
          parsing_duration_ms: Date.now() - startedAt,
          status: "failed",
          error_message: message.slice(0, 500),
          translation: logContext.translation || null,
          points_detected: null,
          verses_detected: null,
        });
      }
    } catch {
      // ignore log failure
    }
    const looksLikeParseError = /Parser|Claude|JSON/i.test(message);
    return json(
      {
        success: false,
        error_code: looksLikeParseError ? "PARSE_FAILED" : "INTERNAL",
        error_message: looksLikeParseError
          ? "Something went wrong while parsing your sermon. Please try again, or use the Structured Builder to enter your sermon manually."
          : message,
      },
      400,
    );
  }
});
