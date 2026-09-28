// Partner API routes live in Supabase edge functions; this gives them stable
// URLs on the app's own domain. Shared by worker/index.ts (Workers deploys)
// and functions/ (Cloudflare Pages deploys), so either project type works.
//   /api/partner/v1/*  → functions/v1/partner-api/v1/*
//   /handoff?t=...     → functions/v1/partner-handoff?t=...

// Public project URL (it also ships in the browser bundle as VITE_SUPABASE_URL).
// An env var named SUPABASE_URL overrides it, e.g. for a staging project.
export const DEFAULT_SUPABASE_URL = "https://hqtcgynnnghxihvykrin.supabase.co";

export const partnerProxyTarget = (url: URL, supabaseUrl: string): string | null => {
  const base = supabaseUrl.replace(/\/+$/, "");
  if (url.pathname.startsWith("/api/partner/v1/")) {
    return `${base}/functions/v1/partner-api${url.pathname.slice("/api/partner".length)}${url.search}`;
  }
  if (url.pathname === "/handoff") {
    return `${base}/functions/v1/partner-handoff${url.search}`;
  }
  return null;
};

export const proxyToSupabase = (request: Request, target: string): Promise<Response> => {
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("cookie");
  // Ask Supabase for an uncompressed body; Cloudflare re-compresses for the
  // client based on what the client actually accepts.
  headers.set("accept-encoding", "identity");
  const clientIp = request.headers.get("cf-connecting-ip");
  if (clientIp) headers.set("x-forwarded-for", clientIp);

  return fetch(target, {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
    // Pass redirects (the handoff 302) straight through to the browser.
    redirect: "manual",
  });
};

/** Proxies the request if it is a partner route; otherwise returns null. */
export const handlePartnerProxy = (request: Request, supabaseUrl?: string): Promise<Response> | null => {
  const target = partnerProxyTarget(new URL(request.url), supabaseUrl || DEFAULT_SUPABASE_URL);
  return target ? proxyToSupabase(request, target) : null;
};
