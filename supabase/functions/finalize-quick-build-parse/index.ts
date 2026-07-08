// QUICK BUILD LEARNING LOOP — called fire-and-forget by Sermon Review after
// "Create Slides". Links the saved sermon back to its parse row, computes the
// original-vs-final structure diff, and (when corrections are meaningful) updates
// the user's format profile so their future parses improve.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { computeStructureDiff, isMeaningfulDiff, type FinalStructure } from "./diff.ts";
import { updateFormatProfile } from "./profileUpdater.ts";

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
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ success: false, error: "Server misconfigured" }, 500);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ success: false, error: "Sign in required" }, 401);
    const token = authHeader.replace("Bearer ", "").trim();
    const supabaseAnon = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await supabaseAnon.auth.getUser(token);
    if (userError || !userData?.user?.id) {
      return json({ success: false, error: "Sign in required" }, 401);
    }
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const parseId: string = typeof body?.parse_id === "string" ? body.parse_id : "";
    const sermonId: string = typeof body?.sermon_id === "string" ? body.sermon_id : "";
    const finalStructure = body?.final_structure as FinalStructure | undefined;
    if (!parseId || !sermonId || !finalStructure || !Array.isArray(finalStructure.blocks)) {
      return json({ success: false, error: "parse_id, sermon_id, and final_structure are required" }, 400);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: parseRow, error: parseError } = await supabaseAdmin
      .from("quick_build_parses")
      .select("id, user_id, account_id, parsed_structure, document_analysis, finalized_at")
      .eq("id", parseId)
      .maybeSingle();
    if (parseError) throw new Error(parseError.message);
    if (!parseRow || parseRow.user_id !== userId) {
      return json({ success: false, error: "Parse not found" }, 404);
    }
    if (parseRow.finalized_at) {
      return json({ success: true, already_finalized: true });
    }

    // The sermon id comes from the client — verify it exists in the same account
    // before linking, so a parse row can't be pointed at someone else's sermon.
    const { data: sermonRow } = await supabaseAdmin
      .from("sermons")
      .select("id, account_id")
      .eq("id", sermonId)
      .maybeSingle();
    if (!sermonRow || sermonRow.account_id !== parseRow.account_id) {
      return json({ success: false, error: "Sermon not found" }, 404);
    }

    const diff = computeStructureDiff(parseRow.parsed_structure, finalStructure);

    const { error: updateError } = await supabaseAdmin
      .from("quick_build_parses")
      .update({
        sermon_id: sermonId,
        final_structure: finalStructure,
        structure_diff: diff,
        finalized_at: new Date().toISOString(),
      })
      .eq("id", parseId);
    if (updateError) throw new Error(updateError.message);

    // Profile update is best-effort: the finalize result must not depend on it.
    let profileUpdated = false;
    if (isMeaningfulDiff(diff)) {
      try {
        await updateFormatProfile(supabaseAdmin, {
          userId,
          accountId: parseRow.account_id,
          documentAnalysis: parseRow.document_analysis ?? null,
          diff,
        });
        profileUpdated = true;
      } catch (error) {
        console.error("format profile update failed:", error);
      }
    }

    return json({ success: true, diff, profile_updated: profileUpdated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return json({ success: false, error: message }, 400);
  }
});
