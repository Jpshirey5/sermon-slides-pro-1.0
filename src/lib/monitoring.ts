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
const TELEMETRY_FLUSH_INTERVAL_MS = 5000;
const TELEMETRY_MAX_BATCH_SIZE = 10;
const TELEMETRY_MAX_QUEUE_SIZE = 50;
const SESSION_CACHE_TTL_MS = 30000;

const EVENT_SAMPLE_RATES: Record<string, number> = {
  page_view: 0.25,
  presentations_loaded: 0.5,
  dashboard_viewed: 0.5,
  login_viewed: 0.5,
  signup_viewed: 0.5,
  create_sermon_viewed: 0.5,
  editor_viewed: 0.5,
};

const DEDUPE_WINDOW_MS_BY_EVENT: Record<string, number> = {
  page_view: 30000,
  presentations_loaded: 30000,
  client_error: 10000,
};

let monitoringInitialized = false;
let telemetryQueue: TelemetryPayload[] = [];
let flushTimer: number | null = null;
let flushInFlight: Promise<void> | null = null;
let cachedAccessToken: string | null = null;
let cachedSessionFetchedAt = 0;

const recentTelemetryKeys = new Map<string, number>();

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
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, nested]) => `${JSON.stringify(key)}:${stableSerialize(nested)}`).join(",")}}`;
  }

  return JSON.stringify(String(value));
}

function getAnonymousId() {
  if (typeof window === "undefined") return "server";
  return getPersistentId(window.localStorage, ANONYMOUS_ID_KEY);
}

function getSessionId() {
  if (typeof window === "undefined") return "server";
  return getPersistentId(window.sessionStorage, SESSION_ID_KEY);
}

function clearFlushTimer() {
  if (flushTimer !== null && typeof window !== "undefined") {
    window.clearTimeout(flushTimer);
  }
  flushTimer = null;
}

function scheduleFlush(delay = TELEMETRY_FLUSH_INTERVAL_MS) {
  if (typeof window === "undefined" || flushTimer !== null) return;

  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    void flushTelemetryQueue();
  }, delay);
}

function cleanupRecentTelemetry(now: number) {
  for (const [key, expiresAt] of recentTelemetryKeys.entries()) {
    if (expiresAt <= now) {
      recentTelemetryKeys.delete(key);
    }
  }
}

function getDedupeKey(payload: TelemetryPayload) {
  return stableSerialize({
    kind: payload.kind,
    name: payload.name,
    route: payload.route,
    properties: payload.properties,
    errorMessage: payload.errorMessage,
  });
}

function shouldSampleEvent(name: string) {
  const sampleRate = EVENT_SAMPLE_RATES[name];
  if (sampleRate == null || sampleRate >= 1) return true;
  return Math.random() < sampleRate;
}

function shouldDedupe(payload: TelemetryPayload) {
  const dedupeWindowMs = DEDUPE_WINDOW_MS_BY_EVENT[payload.name];
  if (!dedupeWindowMs) return false;

  const now = Date.now();
  cleanupRecentTelemetry(now);

  const dedupeKey = getDedupeKey(payload);
  const existing = recentTelemetryKeys.get(dedupeKey);
  if (existing && existing > now) {
    return true;
  }

  recentTelemetryKeys.set(dedupeKey, now + dedupeWindowMs);
  return false;
}

function enqueueTelemetry(payload: TelemetryPayload) {
  if (payload.kind === "event" && !shouldSampleEvent(payload.name)) {
    return;
  }

  if (shouldDedupe(payload)) {
    return;
  }

  if (telemetryQueue.length >= TELEMETRY_MAX_QUEUE_SIZE) {
    telemetryQueue.shift();
  }

  telemetryQueue.push(payload);

  if (telemetryQueue.length >= TELEMETRY_MAX_BATCH_SIZE) {
    clearFlushTimer();
    void flushTelemetryQueue();
    return;
  }

  scheduleFlush();
}

async function getAccessToken() {
  const now = Date.now();
  if (now - cachedSessionFetchedAt < SESSION_CACHE_TTL_MS) {
    return cachedAccessToken;
  }

  cachedSessionFetchedAt = now;

  try {
    const { data } = await supabase.auth.getSession();
    cachedAccessToken = data.session?.access_token ?? null;
  } catch {
    cachedAccessToken = null;
  }

  return cachedAccessToken;
}

async function sendTelemetryBatch(payloads: TelemetryPayload[]) {
  const accessToken = await getAccessToken();
  const { error } = await supabase.functions.invoke("capture-telemetry", {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    body: { events: payloads },
  });

  if (error) {
    console.error("Telemetry delivery failed", error);
    throw error;
  }
}

async function flushTelemetryQueue() {
  if (telemetryQueue.length === 0) return;

  if (flushInFlight) {
    await flushInFlight;
    return;
  }

  clearFlushTimer();

  const batch = telemetryQueue.splice(0, TELEMETRY_MAX_BATCH_SIZE);

  flushInFlight = (async () => {
    const queueSnapshot = [...batch];
    try {
      await sendTelemetryBatch(queueSnapshot);
    } catch {
      telemetryQueue = [...queueSnapshot, ...telemetryQueue].slice(-TELEMETRY_MAX_QUEUE_SIZE);
    } finally {
      flushInFlight = null;
      if (telemetryQueue.length > 0) {
        scheduleFlush();
      }
    }
  })();

  await flushInFlight;
}

export function trackEvent(name: string, properties?: Record<string, unknown>) {
  enqueueTelemetry({
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
  enqueueTelemetry({
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

  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      void flushTelemetryQueue();
    }
  });

  window.addEventListener("pagehide", () => {
    void flushTelemetryQueue();
  });
}
