type Env = {
  ASSETS: {
    fetch: (request: Request) => Promise<Response>;
  };
  SUPABASE_URL: string;
};

// Partner API routes live in Supabase edge functions; the worker gives them
// stable URLs on the app's own domain.
//   /api/partner/v1/*  → functions/v1/partner-api/v1/*
//   /handoff?t=...     → functions/v1/partner-handoff?t=...
const proxyTarget = (url: URL, supabaseUrl: string): string | null => {
  const base = supabaseUrl.replace(/\/+$/, "");
  if (url.pathname.startsWith("/api/partner/v1/")) {
    return `${base}/functions/v1/partner-api${url.pathname.slice("/api/partner".length)}${url.search}`;
  }
  if (url.pathname === "/handoff") {
    return `${base}/functions/v1/partner-handoff${url.search}`;
  }
  return null;
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const target = env.SUPABASE_URL ? proxyTarget(new URL(request.url), env.SUPABASE_URL) : null;
    if (!target) return env.ASSETS.fetch(request);

    const headers = new Headers(request.headers);
    headers.delete("host");
    headers.delete("cookie");
    const clientIp = request.headers.get("cf-connecting-ip");
    if (clientIp) headers.set("x-forwarded-for", clientIp);

    return fetch(target, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
      // Pass redirects (the handoff 302) straight through to the browser.
      redirect: "manual",
    });
  },
};
