// Test harness: a fresh PGlite database with the real partner migration, a
// supabase-js fake over it, deterministic deps, stubbed outbound fetches
// (scripture-lookup and Bedrock), and a signed-request helper that behaves
// exactly like a partner's HTTP client.

import type { PartnerDeps } from "../auth.ts";
import { hmacSha256Hex, randomBase64Url, randomHex, randomKeyPrefix, sha256Hex, signatureBase, signingSecretEnvName } from "../crypto.ts";
import { handlePartnerRequest } from "../../../partner-api/router.ts";
import { createFakeSupabase } from "./fakeSupabase.ts";
import { createDatabase } from "./pgStubs.ts";

export const SUPABASE_URL = "http://supabase.test";
export const SERVICE_ROLE_KEY = "service-role-test-key";
export const APP_ORIGIN = "https://app.ssp.test";

Deno.env.set("SUPABASE_URL", SUPABASE_URL);
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", SERVICE_ROLE_KEY);
Deno.env.set("SUPABASE_ANON_KEY", "anon-test-key");
Deno.env.set("SITE_URL", APP_ORIGIN);
Deno.env.set("AWS_ACCESS_KEY_ID", "AKIATEST");
Deno.env.set("AWS_SECRET_ACCESS_KEY", "secret-test");
Deno.env.set("AWS_REGION", "us-east-1");

// ── outbound fetch stubs ────────────────────────────────────────────────────

export interface ScriptureCall {
  reference: string;
  translation: string;
  onBehalfOf: string | null;
  authorization: string | null;
}

export const scriptureCalls: ScriptureCall[] = [];
/** References the stubbed scripture-lookup will refuse (simulating an unknown verse). */
export const unresolvableReferences = new Set<string>();
/** The forced-tool input the stubbed Bedrock returns for raw_text parses. */
export let bedrockToolInput: Record<string, unknown> = {
  title: "Parsed Sermon",
  items: [
    { kind: "point", text: "1. God is faithful", scripture_references_raw: ["Lamentations 3:22-23"] },
    { kind: "point", text: "2. So we can rest", scripture_references_raw: ["Matthew 11:28"] },
  ],
};
export const setBedrockToolInput = (input: Record<string, unknown>) => {
  bedrockToolInput = input;
};

const realFetch = globalThis.fetch;
globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url === `${SUPABASE_URL}/functions/v1/scripture-lookup`) {
    const headers = new Headers(init?.headers);
    const body = JSON.parse(String(init?.body ?? "{}"));
    scriptureCalls.push({
      reference: body.reference,
      translation: body.translation,
      onBehalfOf: headers.get("x-ssp-on-behalf-of-user"),
      authorization: headers.get("authorization"),
    });
    if (unresolvableReferences.has(body.reference)) {
      return Response.json({ text: "", reference: body.reference, translation: body.translation, error: true }, { status: 400 });
    }
    return Response.json({ text: `Text of ${body.reference}.`, reference: body.reference, translation: body.translation });
  }
  if (url.startsWith("https://bedrock-runtime.")) {
    return Response.json({
      content: [{ type: "tool_use", name: "save_sermon_structure", input: bedrockToolInput }],
      stop_reason: "tool_use",
      usage: { input_tokens: 10, output_tokens: 20 },
    });
  }
  return realFetch(input, init);
};

// ── harness ─────────────────────────────────────────────────────────────────

export interface PartnerCreds {
  partnerId: string;
  slug: string;
  apiKey: string;
  prefix: string;
  secret: string;
}

export interface CallOptions {
  idempotencyKey?: string;
  timestamp?: number;
  /** Sign this body but send `body` (tampering). */
  signedBody?: string;
  rawBody?: string;
  signature?: string;
  /** Sign as if calling this method/path instead (replay against another route). */
  signedMethod?: string;
  signedPath?: string;
  apiKey?: string;
  /** Hit the function URL directly instead of the /api/partner proxy path. */
  direct?: boolean;
}

export interface CallResult {
  status: number;
  // deno-lint-ignore no-explicit-any
  body: any;
  headers: Headers;
  text: string;
}

export const createHarness = async (options: { runBackgroundImmediately?: boolean } = {}) => {
  const pg = await createDatabase();
  const fake = createFakeSupabase(pg);
  const env = new Map<string, string>();
  const pending: (() => Promise<unknown>)[] = [];
  let clockOffsetMs = 0;

  const deps: PartnerDeps = {
    // deno-lint-ignore no-explicit-any
    db: fake.client as any,
    env: (name) => env.get(name) ?? Deno.env.get(name),
    now: () => Date.now() + clockOffsetMs,
    runInBackground: (task) => {
      if (options.runBackgroundImmediately) void task();
      else pending.push(task);
    },
  };

  /** Runs queued background work (deck generation, exports) to completion. */
  const drain = async () => {
    while (pending.length) await pending.shift()!();
  };

  const createPartner = async (options: {
    slug: string;
    hosts?: string[];
    rateLimitPerMin?: number;
    deckLimitPerDay?: number;
    isTest?: boolean;
  }): Promise<PartnerCreds> => {
    const { rows } = await pg.query<{ id: string }>(
      `insert into public.partners (name, slug, contact_email, is_test, allowed_return_hosts, rate_limit_per_min, deck_limit_per_day)
       values ($1, $2, $3, $4, $5, $6, $7) returning id`,
      [
        `Partner ${options.slug}`,
        options.slug,
        `dev@${options.slug}.test`,
        options.isTest ?? false,
        options.hosts ?? [],
        options.rateLimitPerMin ?? 120,
        options.deckLimitPerDay ?? 200,
      ],
    );
    const prefix = randomKeyPrefix();
    const apiKey = `ssp_${options.isTest ? "test" : "live"}_${prefix}_${randomBase64Url(32)}`;
    const secret = randomHex(32);
    await pg.query(
      `insert into public.partner_api_keys (partner_id, key_prefix, key_hash, signing_secret_hash) values ($1, $2, $3, $4)`,
      [rows[0].id, prefix, sha256Hex(apiKey), sha256Hex(secret)],
    );
    env.set(signingSecretEnvName(prefix), secret);
    return { partnerId: rows[0].id, slug: options.slug, apiKey, prefix, secret };
  };

  const call = async (
    creds: PartnerCreds,
    method: string,
    path: string,
    body?: unknown,
    options: CallOptions = {},
  ): Promise<CallResult> => {
    const rawBody = options.rawBody ?? (body === undefined ? "" : JSON.stringify(body));
    const hasBody = method !== "GET" && method !== "DELETE";
    const timestamp = String(options.timestamp ?? Math.floor(deps.now() / 1000));
    const signedPath = `/api/partner/v1${(options.signedPath ?? path).split("?")[0]}`;
    const signature = options.signature ??
      hmacSha256Hex(
        creds.secret,
        signatureBase(timestamp, options.signedMethod ?? method, signedPath, hasBody ? (options.signedBody ?? rawBody) : ""),
      );
    const url = options.direct
      ? `https://project.supabase.co/partner-api/v1${path}`
      : `https://app.ssp.test/api/partner/v1${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${options.apiKey ?? creds.apiKey}`,
      "X-SSP-Timestamp": timestamp,
      "X-SSP-Signature": signature,
      "cf-connecting-ip": "203.0.113.7",
    };
    if (hasBody) headers["Content-Type"] = "application/json";
    if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;
    const response = await handlePartnerRequest(
      new Request(url, { method, headers, body: hasBody ? rawBody : undefined }),
      deps,
    );
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null, headers: response.headers, text };
  };

  /** Creates an SSP user the way the app would have before any partner saw them. */
  const createExistingSspUser = async (email: string) => {
    const { rows } = await pg.query<{ id: string }>(
      `insert into auth.users (email, raw_user_meta_data, encrypted_password, email_confirmed_at)
       values ($1, '{"admin_invite_token":"seed","full_name":"Existing Pastor"}', 'bcrypt-hash', now()) returning id`,
      [email],
    );
    const userId = rows[0].id;
    const account = await pg.query<{ id: string }>(
      `insert into public.accounts (name, plan_tier, subscription_status, stripe_customer_id) values ('Existing Church', 'free', 'inactive', 'cus_existing') returning id`,
    );
    await pg.query(`insert into public.account_members (account_id, user_id, role, accepted_at) values ($1, $2, 'owner', now())`, [account.rows[0].id, userId]);
    await pg.query(
      `insert into public.sermons (account_id, created_by_user_id, title, slides) values ($1, $2, 'My own sermon', '{"editorSlides":[{"id":"a"}]}')`,
      [account.rows[0].id, userId],
    );
    return { userId, accountId: account.rows[0].id };
  };

  return {
    pg,
    fake,
    deps,
    env,
    drain,
    createPartner,
    call,
    createExistingSspUser,
    advanceClock: (ms: number) => {
      clockOffsetMs += ms;
    },
  };
};

export type Harness = Awaited<ReturnType<typeof createHarness>>;
