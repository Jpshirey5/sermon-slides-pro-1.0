// The desktop app's pages come from ssp://app, an origin Supabase's functions
// do not list. For Supabase responses to requests made by our own pages, we
// set the allowed origin to ours. Nothing else is touched: only Supabase
// hosts, and only requests that came from ssp://app.

export function isSupabaseUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && (u.hostname.endsWith(".supabase.co") || u.hostname.endsWith(".supabase.in"));
  } catch {
    return false;
  }
}

type Headers = Record<string, string[] | string>;

/** Response headers with Access-Control-Allow-Origin set to `origin`, case-insensitively replacing any existing value. */
export function withAllowedOrigin(headers: Headers | undefined, origin: string): Headers {
  const out: Headers = {};
  for (const [name, value] of Object.entries(headers ?? {})) {
    if (name.toLowerCase() === "access-control-allow-origin") continue;
    out[name] = value;
  }
  out["Access-Control-Allow-Origin"] = [origin];
  return out;
}

/**
 * "scheme://host" of a page URL. Node's URL.origin is "null" for custom
 * schemes like ssp://, so this is built from the parts.
 */
export function pageOrigin(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.host ? `${u.protocol}//${u.host}` : null;
  } catch {
    return null;
  }
}

/** Origin of the page that made a request: its window's URL, else the referrer. */
export function requestOrigin(pageUrl: string | undefined, referrer: string | undefined): string | null {
  return pageOrigin(pageUrl) ?? pageOrigin(referrer);
}
