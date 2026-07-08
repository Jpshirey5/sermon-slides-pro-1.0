// QUICK BUILD ADDITION — Edge Function that parses a sermon document (native PDF or
// structure-preserving HTML from .docx), validates references, and returns slides.formData
// byte-compatible with the structured creator.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { checkMonthlyLimit } from "./usageLimiter.ts";
import {
  BEDROCK_MODEL_ID,
  PROMPT_VERSION,
  parseManuscriptWithClaude,
  type ParserInput,
} from "./claudeParser.ts";
import { validateReferences } from "./scriptureValidator.ts";
import { buildSermon } from "./sermonBuilder.ts";
import { extractRefsFromText, mergeRefs, stripHtml } from "./refExtractor.ts";

const MAX_MANUSCRIPT_CHARS = 200_000;
const MAX_HTML_CHARS = 400_000;
const MAX_PDF_BYTES = 10 * 1024 * 1024;

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
    const fileName: string = typeof body?.file_name === "string" ? body.file_name : "manuscript";
    const fileSizeBytes: number = Number.isFinite(body?.file_size_bytes) ? Number(body.file_size_bytes) : 0;
    const translation: string = typeof body?.translation === "string" && body.translation.trim() ? body.translation.trim() : "KJV";
    const requestedCampusId: string | null = typeof body?.campus_id === "string" && body.campus_id ? body.campus_id : null;
    logContext = { ...logContext, fileName, fileSizeBytes, translation };

    // Three accepted document payloads: native PDF (base64), HTML rendering of a
    // .docx (structure-preserving), or plain text (legacy clients).
    const fileBase64: string = typeof body?.file_base64 === "string" ? body.file_base64 : "";
    const manuscriptHtml: string = typeof body?.manuscript_html === "string" ? body.manuscript_html : "";
    const manuscriptText: string = typeof body?.manuscript_text === "string" ? body.manuscript_text : "";

    let parserInput: ParserInput;
    let backstopText: string | null = null;
    if (fileBase64) {
      const approxBytes = Math.floor(fileBase64.length * 0.75);
      if (approxBytes > MAX_PDF_BYTES) {
        return json(
          {
            success: false,
            error_code: "FILE_TOO_LARGE",
            error_message: "Your file is too large. Please upload a file under 10MB.",
          },
          400,
        );
      }
      parserInput = { kind: "pdf", base64: fileBase64 };
    } else if (manuscriptHtml.trim()) {
      if (manuscriptHtml.length > MAX_HTML_CHARS) {
        return json(
          {
            success: false,
            error_code: "FILE_TOO_LARGE",
            error_message: "Your manuscript is too long. Please trim it and upload again.",
          },
          400,
        );
      }
      parserInput = { kind: "html", html: manuscriptHtml };
      backstopText = stripHtml(manuscriptHtml);
    } else if (manuscriptText.trim()) {
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
      parserInput = { kind: "text", text: manuscriptText };
      backstopText = manuscriptText;
    } else {
      return json(
        {
          success: false,
          error_code: "INVALID_FILE",
          error_message: "We couldn't read your file. Try saving it in a different format and uploading again.",
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

    // Learning loop: per-user format hints distilled from this pastor's previous
    // uploads and corrections. The prompt subordinates hints to the document itself.
    let userFormatHints = "";
    try {
      const { data: profileRow } = await supabaseAdmin
        .from("quick_build_user_profiles")
        .select("profile_text")
        .eq("user_id", userId)
        .maybeSingle();
      userFormatHints = profileRow?.profile_text || "";
    } catch {
      // hints are an optimization — never block a parse on them
    }

    const parsedResult = await parseManuscriptWithClaude(parserInput, { userFormatHints });

    // Deterministic backstop: regex-extract references from the document text and
    // union them with the model's refs so a citation is never silently absent.
    // (PDF inputs have no client-extracted text layer, so the model is authoritative there.)
    const refs = backstopText
      ? mergeRefs(parsedResult.data.scripture_references, extractRefsFromText(backstopText))
      : parsedResult.data.scripture_references;

    const validation = await validateReferences({
      refs,
      translation,
      supabaseUrl,
      anonKey,
      authHeader,
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
    const { data: usageRow } = await supabaseAdmin
      .from("quick_build_usage")
      .insert({
        user_id: userId,
        account_id: accountId,
        sermon_id: null,
        file_name: fileName,
        file_size_bytes: fileSizeBytes,
        tokens_used: parsedResult.tokens_used,
        parsing_duration_ms: parsingDurationMs,
        status: partial ? "partial" : "success",
        error_message: partial ? validation.warnings.join("; ").slice(0, 500) : null,
        translation,
        points_detected: built.pointsCount,
        verses_detected: built.versesCount,
        prompt_version: parsedResult.prompt_version,
        model_id: parsedResult.model_id,
      })
      .select("id")
      .single();

    // Learning loop: persist the extracted structure (never the manuscript itself)
    // so the eventual saved sermon can be diffed against what the parser produced.
    // Non-fatal — a successful parse must reach the user even if this insert fails.
    let parseId: string | null = null;
    try {
      const { data: parseRow } = await supabaseAdmin
        .from("quick_build_parses")
        .insert({
          usage_id: usageRow?.id ?? null,
          user_id: userId,
          account_id: accountId,
          prompt_version: parsedResult.prompt_version,
          model_id: parsedResult.model_id,
          document_analysis: parsedResult.analysis,
          parsed_structure: {
            title: built.title,
            series: built.series,
            points: parsedResult.data.points,
            scripture_references: refs,
          },
        })
        .select("id")
        .single();
      parseId = parseRow?.id ?? null;
    } catch {
      // ignore — learning loop only
    }

    return json({
      parse_id: parseId,
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
          prompt_version: PROMPT_VERSION,
          model_id: BEDROCK_MODEL_ID,
        });
      }
    } catch {
      // ignore log failure
    }
    const looksLikeParseError = /Parser|Claude|JSON|Bedrock/i.test(message);
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
