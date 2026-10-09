// Request plumbing shared by the presenter edge functions: CORS (same allowed
// origins as the other functions), JSON responses that are never cached, and
// resolving the signed-in user from the JWT.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";
import { apiBibleFromEnv, bibleIdFromEnv } from "../scripture/apiBible.ts";
import type { ResolverDeps } from "../scripture/resolver.ts";
import { createSupabaseScriptureStore } from "../scripture/store.ts";

const ALLOWED_ORIGINS = [
  "https://sermonslidepro.com",
  "https://www.sermonslidepro.com",
  "http://localhost:8080",
  "http://localhost:5173",
];

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(req),
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function adminClient(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** The signed-in user's id, or null. Never trusts a user id from the body. */
export async function authenticatedUserId(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const client = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getClaims(token);
  const sub = data?.claims?.sub;
  return !error && typeof sub === "string" && sub ? sub : null;
}

export function resolverDeps(admin: SupabaseClient): ResolverDeps {
  return { store: createSupabaseScriptureStore(admin), api: apiBibleFromEnv(), bibleIdFallback: bibleIdFromEnv };
}

export async function readJson(req: Request): Promise<unknown> {
  const text = await req.text();
  if (text.length > 256 * 1024) return null;
  try {
    return text.trim() ? JSON.parse(text) : {};
  } catch {
    return null;
  }
}

/** Standard wrapper: OPTIONS, POST only, signed in, then `handle`. */
export function presenterHandler(
  scope: string,
  handle: (ctx: { req: Request; userId: string; admin: SupabaseClient; body: unknown }) => Promise<Response>,
): (req: Request) => Promise<Response> {
  return async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });
    if (req.method !== "POST") return json(req, { error: "method_not_allowed" }, 405);
    try {
      const userId = await authenticatedUserId(req);
      if (!userId) return json(req, { error: "unauthorized" }, 401);
      const body = await readJson(req);
      if (body === null) return json(req, { error: "bad_request" }, 400);
      return await handle({ req, userId, admin: adminClient(), body });
    } catch (error) {
      // Log the scope and message only; never request bodies or scripture.
      console.error(`${scope}_unhandled`, { error: String(error instanceof Error ? error.message : error).slice(0, 300) });
      return json(req, { error: "server_error" }, 500);
    }
  };
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
