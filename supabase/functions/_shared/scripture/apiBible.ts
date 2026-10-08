// API.Bible client. This is the only file in the presenter path that reads
// BIBLE_API_KEY. The key goes in a request header to API.Bible and nowhere
// else: never into a response, a log line, or an error message.
//
// FUMS: API.Bible returns a FUMS token with each passage when asked for
// fums-version 3. The exact field name and reporting endpoint still need to
// be confirmed against API.Bible's docs (flagged in the plan); we read the
// documented candidates and keep whichever is present.

export interface FetchedVerse {
  verse: number;
  text: string;
}

export interface FetchedPassage {
  verses: FetchedVerse[];
  fumsToken: string | null;
  copyright: string | null;
}

export type ApiBibleErrorKind = "not_found" | "unauthorized" | "rate_limited" | "upstream" | "network" | "empty";

export class ApiBibleError extends Error {
  constructor(public readonly kind: ApiBibleErrorKind, public readonly status: number | null) {
    super(`api_bible_${kind}${status ? `_${status}` : ""}`);
    this.name = "ApiBibleError";
  }
}

export interface ApiBibleClient {
  fetchPassage(bibleId: string, passageId: string, firstVerse: number): Promise<FetchedPassage>;
  fetchCopyright(bibleId: string): Promise<string | null>;
}

export interface ApiBibleOptions {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

const DEFAULT_BASE_URL = "https://rest.api.bible/v1";

/** Plain text from API.Bible's text content or copyright fields. */
export function cleanText(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/¶/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Split text-mode passage content ("[16] For God so loved ... [17] For God
 * sent ...") into verses. Without markers, the whole text is `firstVerse`.
 */
export function splitVerses(content: string, firstVerse: number): FetchedVerse[] {
  const parts = content.split(/\[(\d+)\]/);
  const verses: FetchedVerse[] = [];
  const lead = cleanText(parts[0] ?? "");
  for (let i = 1; i < parts.length; i += 2) {
    const text = cleanText(parts[i + 1] ?? "");
    if (text) verses.push({ verse: parseInt(parts[i], 10), text });
  }
  if (verses.length === 0) return lead ? [{ verse: firstVerse, text: lead }] : [];
  // Text before the first marker belongs to the first verse.
  if (lead) verses[0] = { verse: verses[0].verse, text: `${lead} ${verses[0].text}` };
  return verses;
}

function readFumsToken(meta: unknown): string | null {
  if (!meta || typeof meta !== "object") return null;
  const m = meta as Record<string, unknown>;
  for (const key of ["fumsToken", "fumsId"]) {
    const value = m[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function errorKind(status: number): ApiBibleErrorKind {
  if (status === 404 || status === 400) return "not_found";
  if (status === 401 || status === 403) return "unauthorized";
  if (status === 429) return "rate_limited";
  return "upstream";
}

export function createApiBibleClient(options: ApiBibleOptions): ApiBibleClient {
  const baseUrl = (options.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "");
  const doFetch = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 8000;

  const get = async (path: string): Promise<Record<string, unknown>> => {
    let response: Response;
    try {
      response = await doFetch(`${baseUrl}${path}`, {
        method: "GET",
        headers: { Accept: "application/json", "api-key": options.apiKey },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new ApiBibleError("network", null);
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new ApiBibleError(errorKind(response.status), response.status);
    }
    try {
      return await response.json();
    } catch {
      throw new ApiBibleError("upstream", response.status);
    }
  };

  return {
    async fetchPassage(bibleId, passageId, firstVerse) {
      const query = new URLSearchParams({
        "content-type": "text",
        "include-notes": "false",
        "include-titles": "false",
        "include-chapter-numbers": "false",
        "include-verse-numbers": "true",
        "include-verse-spans": "false",
        "fums-version": "3",
      });
      const body = await get(
        `/bibles/${encodeURIComponent(bibleId)}/passages/${encodeURIComponent(passageId)}?${query}`,
      );
      const data = (body.data ?? {}) as Record<string, unknown>;
      const verses = splitVerses(String(data.content ?? ""), firstVerse);
      if (verses.length === 0) throw new ApiBibleError("empty", null);
      const copyright = typeof data.copyright === "string" ? cleanText(data.copyright) || null : null;
      return { verses, fumsToken: readFumsToken(body.meta), copyright };
    },

    async fetchCopyright(bibleId) {
      const body = await get(`/bibles/${encodeURIComponent(bibleId)}`);
      const data = (body.data ?? {}) as Record<string, unknown>;
      return typeof data.copyright === "string" ? cleanText(data.copyright) || null : null;
    },
  };
}

/** Builds the client from edge function secrets. Returns null when unconfigured. */
export function apiBibleFromEnv(): ApiBibleClient | null {
  const apiKey = Deno.env.get("BIBLE_API_KEY");
  if (!apiKey) return null;
  return createApiBibleClient({ apiKey, baseUrl: Deno.env.get("BIBLE_API_BASE_URL") || undefined });
}

/**
 * NIV, CSB, and NKJV ids live in edge function secrets today. The catalog
 * column wins when it is filled in.
 */
export function bibleIdFromEnv(translationId: string): string | null {
  const key = `BIBLE_ID_${translationId.toUpperCase().replace(/[^A-Z0-9]/g, "")}`;
  return Deno.env.get(key)?.trim() || null;
}
