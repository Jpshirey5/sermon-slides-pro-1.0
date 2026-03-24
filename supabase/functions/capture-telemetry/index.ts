import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_STRING_LENGTH = 500;

function redactSensitiveString(value: string) {
  if (/@/.test(value) && /\./.test(value)) {
    return "[redacted-email]";
  }

  if (/bearer\s+[a-z0-9_.-]+/i.test(value)) {
    return "[redacted-token]";
  }

  if (/password|token|secret|authorization|cookie|api[-_ ]?key/i.test(value)) {
    return "[redacted]";
  }

  if (value.length > MAX_STRING_LENGTH) {
    return `${value.slice(0, MAX_STRING_LENGTH)}...[truncated]`;
  }

  return value;
}

function sanitizeValue(value: unknown, keyPath = ""): unknown {
  if (value == null) return value;

  if (typeof value === "string") {
    if (/password|token|secret|authorization|cookie|email/i.test(keyPath)) {
      return "[redacted]";
    }
    return redactSensitiveString(value);
  }

  if (typeof value === "number" || typeof value === "boolean") return value;

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item, index) => sanitizeValue(item, `${keyPath}[${index}]`));
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 30)
        .map(([key, nestedValue]) => [key, sanitizeValue(nestedValue, keyPath ? `${keyPath}.${key}` : key)])
    );
  }

  return String(value);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  try {
    const body = await req.json();
    const authHeader = req.headers.get("Authorization");
    let userId: string | null = null;
    let accountId: string | null = null;

    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const anonClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false },
      });

      const { data: userData } = await anonClient.auth.getUser(token);
      userId = userData.user?.id ?? null;

      if (userId) {
        const { data } = await supabaseAdmin.rpc("get_user_account_id", { _user_id: userId });
        accountId = data ?? null;
      }
    }

    const row = {
      kind: body?.kind === "error" ? "error" : "event",
      name: typeof body?.name === "string" ? body.name : "unknown",
      route: typeof body?.route === "string" ? body.route : null,
      properties: sanitizeValue(body?.properties ?? {}, "properties"),
      error_message: typeof body?.errorMessage === "string" ? redactSensitiveString(body.errorMessage) : null,
      error_stack: typeof body?.errorStack === "string" ? redactSensitiveString(body.errorStack) : null,
      user_id: userId,
      account_id: accountId,
      anonymous_id: typeof body?.anonymousId === "string" ? body.anonymousId : "unknown",
      session_id: typeof body?.sessionId === "string" ? body.sessionId : "unknown",
      user_agent: redactSensitiveString(req.headers.get("user-agent") || "unknown"),
    };

    const { error } = await supabaseAdmin.from("telemetry_events").insert(row);

    if (error) {
      console.error("[CAPTURE-TELEMETRY] insert failed", error);
      return new Response(JSON.stringify({ error: "insert_failed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("[CAPTURE-TELEMETRY] unexpected error", error);
    return new Response(JSON.stringify({ error: "unexpected_error" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
