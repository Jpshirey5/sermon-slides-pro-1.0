import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";


const MAX_STRING_LENGTH = 500;
const MAX_BATCH_SIZE = 25;
const NOISY_EVENT_NAMES = new Set([
  "page_view",
  "presentations_loaded",
  "dashboard_viewed",
  "login_viewed",
  "signup_viewed",
  "create_sermon_viewed",
  "editor_viewed",
  "payment_success_viewed",
  "client_error",
]);

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

function stableSerialize(value: unknown): string {
  if (value == null) return "null";

  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }

  if (typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, nestedValue]) => `${JSON.stringify(key)}:${stableSerialize(nestedValue)}`)
      .join(",")}}`;
  }

  return JSON.stringify(String(value));
}

function buildDedupeKey(payload: Record<string, unknown>) {
  return stableSerialize({
    kind: payload.kind,
    name: payload.name,
    route: payload.route,
    properties: payload.properties ?? {},
    errorMessage: payload.errorMessage ?? null,
    anonymousId: payload.anonymousId ?? "unknown",
    sessionId: payload.sessionId ?? "unknown",
  });
}

function normalizeTelemetryPayloads(body: unknown): Record<string, unknown>[] {
  if (!body || typeof body !== "object") return [];

  const maybeBatch = (body as { events?: unknown }).events;
  const payloads = Array.isArray(maybeBatch) ? maybeBatch : [body];
  const dedupeKeys = new Set<string>();

  return payloads
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
    .slice(0, MAX_BATCH_SIZE)
    .filter((entry) => {
      const eventName = typeof entry.name === "string" ? entry.name : "unknown";
      if (!NOISY_EVENT_NAMES.has(eventName)) {
        return true;
      }

      const key = buildDedupeKey(entry);
      if (dedupeKeys.has(key)) {
        return false;
      }

      dedupeKeys.add(key);
      return true;
    });
}

async function readJsonBody(req: Request): Promise<unknown | null> {
  const rawBody = await req.text();
  if (!rawBody.trim()) return null;

  try {
    return JSON.parse(rawBody) as unknown;
  } catch {
    return null;
  }
}

serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";
  const corsHeaders = {
    "Access-Control-Allow-Origin": ["https://sermonslidepro.com", "http://localhost:8080", "http://localhost:5173"].includes(origin) ? origin : "https://sermonslidepro.com",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 405,
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  try {
    const body = await readJsonBody(req);
    const events = normalizeTelemetryPayloads(body);
    if (events.length === 0) {
      return new Response(JSON.stringify({ ok: true, ignored: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }
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

    const rows = events.map((event) => ({
      kind: event.kind === "error" ? "error" : "event",
      name: typeof event.name === "string" ? event.name : "unknown",
      route: typeof event.route === "string" ? event.route : null,
      properties: sanitizeValue(event.properties ?? {}, "properties"),
      error_message: typeof event.errorMessage === "string" ? redactSensitiveString(event.errorMessage) : null,
      error_stack: typeof event.errorStack === "string" ? redactSensitiveString(event.errorStack) : null,
      user_id: userId,
      account_id: accountId,
      anonymous_id: typeof event.anonymousId === "string" ? event.anonymousId : "unknown",
      session_id: typeof event.sessionId === "string" ? event.sessionId : "unknown",
      user_agent: redactSensitiveString(req.headers.get("user-agent") || "unknown"),
    }));

    const { error } = await supabaseAdmin.from("telemetry_events").insert(rows);

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
