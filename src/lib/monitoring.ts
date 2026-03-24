import { supabase } from "@/integrations/supabase/client";

type TelemetryKind = "event" | "error";

interface TelemetryPayload {
  kind: TelemetryKind;
  name: string;
  route?: string;
  properties?: Record<string, unknown>;
  errorMessage?: string;
  errorStack?: string;
  anonymousId: string;
  sessionId: string;
}

const ANONYMOUS_ID_KEY = "telemetry_anonymous_id";
const SESSION_ID_KEY = "telemetry_session_id";
const MAX_STRING_LENGTH = 500;

let monitoringInitialized = false;

function generateId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getPersistentId(storage: Storage, key: string) {
  const existing = storage.getItem(key);
  if (existing) return existing;
  const created = generateId();
  storage.setItem(key, created);
  return created;
}

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

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: sanitizeValue(value.message, `${keyPath}.message`),
    };
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item, index) => sanitizeValue(item, `${keyPath}[${index}]`));
  }

  if (typeof value === "object") {
    const sanitizedEntries = Object.entries(value as Record<string, unknown>).slice(0, 30).map(([key, nested]) => [
      key,
      sanitizeValue(nested, keyPath ? `${keyPath}.${key}` : key),
    ]);
    return Object.fromEntries(sanitizedEntries);
  }

  return String(value);
}

function sanitizeProperties(properties?: Record<string, unknown>) {
  if (!properties) return undefined;
  return sanitizeValue(properties, "properties") as Record<string, unknown>;
}

function getAnonymousId() {
  if (typeof window === "undefined") return "server";
  return getPersistentId(window.localStorage, ANONYMOUS_ID_KEY);
}

function getSessionId() {
  if (typeof window === "undefined") return "server";
  return getPersistentId(window.sessionStorage, SESSION_ID_KEY);
}

async function sendTelemetry(payload: TelemetryPayload) {
  try {
    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;
    await supabase.functions.invoke("capture-telemetry", {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      body: payload,
    });
  } catch (error) {
    console.error("Telemetry delivery failed", error);
  }
}

export function trackEvent(name: string, properties?: Record<string, unknown>) {
  void sendTelemetry({
    kind: "event",
    name,
    properties: sanitizeProperties(properties),
    route: typeof window !== "undefined" ? window.location.pathname : undefined,
    anonymousId: getAnonymousId(),
    sessionId: getSessionId(),
  });
}

export function trackPageView(pathname: string) {
  trackEvent("page_view", { pathname });
}

export function logError(error: unknown, context?: Record<string, unknown>) {
  const normalizedError = error instanceof Error ? error : new Error(typeof error === "string" ? error : "Unknown error");
  void sendTelemetry({
    kind: "error",
    name: "client_error",
    route: typeof window !== "undefined" ? window.location.pathname : undefined,
    properties: sanitizeProperties(context),
    errorMessage: redactSensitiveString(normalizedError.message),
    errorStack: normalizedError.stack ? redactSensitiveString(normalizedError.stack) : undefined,
    anonymousId: getAnonymousId(),
    sessionId: getSessionId(),
  });
}

export function initMonitoring() {
  if (monitoringInitialized || typeof window === "undefined") return;
  monitoringInitialized = true;

  window.addEventListener("error", (event) => {
    logError(event.error ?? event.message, {
      source: "window.error",
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    logError(event.reason, { source: "window.unhandledrejection" });
  });
}
