// scripture-lookup: one passage for the editor and Quick Build.
//
// Who may look up what:
//   signed-in users          any translation their church may use
//   server-to-server         same, for the named user (Quick Build for partners)
//   everyone else            public domain translations only
//
// Every lookup goes through the shared resolver (30 day cache, revocation,
// copyright). ESV is separate (Crossway): church grant required, never cached.
// Limits: 90 verses per lookup; rate limits per user, per church, and per IP.

import { formatReference, parseReference, verseCount } from "../_shared/scripture/references.ts";
import { resolvePassages, type ResolverDeps } from "../_shared/scripture/resolver.ts";
import type { UnavailableReason } from "../_shared/scripture/expiry.ts";
import { dayBucket, minuteBucket } from "../_shared/presenter/access.ts";
import type { EsvFetcher } from "./esv.ts";

export const LOOKUP_LIMITS = {
  maxVerses: 90,
  perUserPerMinute: 120,
  perAccountPerDay: 5000,
  perIpPerMinute: 30,
};

export type Caller = { kind: "user"; userId: string } | { kind: "anonymous"; ip: string };

export interface LookupDeps {
  resolver: ResolverDeps;
  rateTake(key: string, bucket: string, limit: number): Promise<boolean>;
  getMemberAccountIds(userId: string): Promise<string[]>;
  esv: EsvFetcher | null;
  now?: () => Date;
  limits?: Partial<typeof LOOKUP_LIMITS>;
}

export interface LookupResponse {
  text: string;
  reference: string;
  translation: string;
  verses?: { text: string; verse: number }[];
  /** The line to show with the text. */
  copyright?: string;
  error?: boolean;
  errorMessage?: string;
}

const fail = (status: number, reference: string, translation: string, errorMessage: string) => ({
  status,
  body: { text: "", reference, translation, error: true, errorMessage } as LookupResponse,
});

const UNAVAILABLE_MESSAGES: Record<UnavailableReason, string> = {
  unknown_translation: "We don't support that translation.",
  suspended: "That translation is paused right now.",
  revoked: "That translation is no longer available.",
  no_source: "That translation isn't available in Sermon Slide Pro yet.",
  missing_copyright: "That translation isn't available right now.",
  not_entitled: "That translation isn't available on your account.",
};

export async function handleLookup(
  deps: LookupDeps,
  caller: Caller,
  body: unknown,
): Promise<{ status: number; body: LookupResponse }> {
  const limits = { ...LOOKUP_LIMITS, ...deps.limits };
  const now = deps.now?.() ?? new Date();
  const b = (body && typeof body === "object" ? body : {}) as { reference?: unknown; translation?: unknown };
  const translation = (typeof b.translation === "string" && b.translation.trim() ? b.translation : "KJV").trim().toUpperCase();
  const rawReference = typeof b.reference === "string" ? b.reference.trim().replace(/\s+/g, " ") : "";

  if (rawReference.length < 3) return fail(400, rawReference, translation, "Enter a scripture reference like John 3:16.");
  if (!/^[A-Z0-9]{1,16}$/.test(translation)) return fail(400, rawReference, translation, "We don't support that translation.");
  const ref = parseReference(rawReference);
  if (!ref) {
    return fail(400, rawReference, translation, "We couldn't read that reference. Try something like John 3:16 or Genesis 1:1-5.");
  }
  const reference = formatReference(ref);
  if (verseCount(ref) > limits.maxVerses) {
    return fail(400, reference, translation, `That passage is long. Look up ${limits.maxVerses} verses or fewer at a time.`);
  }

  // Rate limits, before any database or API.Bible work.
  let accountId: string | null = null;
  if (caller.kind === "user") {
    if (!(await deps.rateTake(`user:${caller.userId}`, minuteBucket("lookup", now), limits.perUserPerMinute))) {
      return fail(429, reference, translation, "Too many lookups just now. Wait a moment and try again.");
    }
    accountId = (await deps.getMemberAccountIds(caller.userId))[0] ?? null;
    if (accountId && !(await deps.rateTake(`account:${accountId}`, dayBucket("lookup", now), limits.perAccountPerDay))) {
      return fail(429, reference, translation, "Your church has reached today's scripture lookup limit. Try again tomorrow.");
    }
  } else if (!(await deps.rateTake(`ip:${caller.ip}`, minuteBucket("lookup", now), limits.perIpPerMinute))) {
    return fail(429, reference, translation, "Too many lookups just now. Wait a moment and try again.");
  }

  const translationRow = await deps.resolver.store.getTranslation(translation);
  if (!translationRow) return fail(400, reference, translation, UNAVAILABLE_MESSAGES.unknown_translation);

  // Without a church account, only public domain text is served.
  if (!accountId && !translationRow.is_public_domain) {
    return fail(401, reference, translation, "Sign in to use this translation. Public domain translations like KJV work without an account.");
  }

  if (translationRow.provider === "esv_api") {
    if (translationRow.status !== "active") return fail(403, reference, translation, UNAVAILABLE_MESSAGES[translationRow.status === "revoked" ? "revoked" : "suspended"]);
    const grants = accountId ? await deps.resolver.store.getGrants(accountId) : [];
    if (!grants.some((g) => g.translation_id === translationRow.id && !g.revoked_at)) {
      return fail(403, reference, translation, UNAVAILABLE_MESSAGES.not_entitled);
    }
    const passage = deps.esv ? await deps.esv(reference) : null;
    if (!passage) return fail(502, reference, translation, "We couldn't look that passage up right now. Please try again in a moment.");
    return { status: 200, body: { text: passage.text, reference: passage.reference, translation, verses: passage.verses } };
  }

  const result = await resolvePassages(deps.resolver, {
    accountId: accountId ?? "anonymous",
    translationId: translation,
    passages: [ref],
    maxVerses: limits.maxVerses,
  });
  if (!result.ok) {
    if (result.reason === "invalid_reference" || result.reason === "too_many_verses") {
      return fail(400, reference, translation, "We couldn't read that reference. Try something like John 3:16 or Genesis 1:1-5.");
    }
    return fail(403, reference, translation, UNAVAILABLE_MESSAGES[result.reason]);
  }
  const passage = result.passages[0];
  if (!passage) {
    const reason = result.missing[0]?.reason;
    return reason === "not_found"
      ? fail(404, reference, translation, "We couldn't find that passage. Check the chapter and verse numbers.")
      : fail(502, reference, translation, "We couldn't look that passage up right now. Please try again in a moment.");
  }
  return {
    status: 200,
    body: {
      text: passage.verses.map((v) => v.text).join(" "),
      reference: passage.reference,
      translation: result.translation.id,
      verses: passage.verses,
      copyright: result.translation.attribution,
    },
  };
}

function constantTimeEquals(a: string, b: string): boolean {
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Who is calling. A server-to-server call presents the service role key and
 * names the user; a signed-in browser presents its session token; anything
 * else (no token, the public anon key, an expired session) is anonymous.
 */
export async function identifyCaller(
  req: Request,
  opts: { serviceRoleKey: string; userIdFromToken: (token: string) => Promise<string | null> },
): Promise<Caller> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const ip = (req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown").trim();
  if (!token) return { kind: "anonymous", ip };
  const onBehalfOf = req.headers.get("x-ssp-on-behalf-of-user") ?? "";
  if (onBehalfOf && constantTimeEquals(token, opts.serviceRoleKey)) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(onBehalfOf)
      ? { kind: "user", userId: onBehalfOf }
      : { kind: "anonymous", ip };
  }
  const userId = await opts.userIdFromToken(token).catch(() => null);
  return userId ? { kind: "user", userId } : { kind: "anonymous", ip };
}
