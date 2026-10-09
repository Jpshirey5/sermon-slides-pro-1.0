// POST { reference, translation } -> one passage. See handler.ts for who may
// look up what, and the limits. Guests (no sign-in) get public domain only.

import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { corsHeaders, json, readJson, resolverDeps } from "../_shared/presenter/http.ts";
import { createSupabasePresenterStore } from "../_shared/presenter/store.ts";
import { esvFromEnv } from "./esv.ts";
import { handleLookup, identifyCaller } from "./handler.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "method_not_allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const caller = await identifyCaller(req, {
      serviceRoleKey,
      userIdFromToken: async (token) => {
        const client = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data, error } = await client.auth.getClaims(token);
        const sub = data?.claims?.sub;
        // The public anon key decodes to a token with no user; that is anonymous.
        return !error && typeof sub === "string" && sub ? sub : null;
      },
    });

    const body = await readJson(req);
    if (body === null) return json(req, { text: "", reference: "", translation: "KJV", error: true, errorMessage: "Scripture lookup request body was empty or invalid JSON." }, 400);

    const store = createSupabasePresenterStore(admin);
    const result = await handleLookup(
      {
        resolver: resolverDeps(admin),
        rateTake: store.rateTake,
        getMemberAccountIds: store.getMemberAccountIds,
        esv: esvFromEnv(),
      },
      caller,
      body,
    );
    return json(req, result.body, result.status);
  } catch (error) {
    // Log the message only; never the request or any scripture.
    console.error("scripture_lookup_unhandled", { error: String(error instanceof Error ? error.message : error).slice(0, 300) });
    return json(req, { error: "Unexpected server error." }, 500);
  }
});
