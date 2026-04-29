const PRODUCTION_SITE_URL = "https://www.sermonslidepro.com";

const normalizeBaseUrl = (value: string | null | undefined) => {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return null;

  const withProtocol =
    trimmed.startsWith("http://") || trimmed.startsWith("https://")
      ? trimmed
      : `https://${trimmed}`;

  try {
    const url = new URL(withProtocol);
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
};

export const getConfiguredAppOrigin = () =>
  normalizeBaseUrl(Deno.env.get("SITE_URL")) ||
  normalizeBaseUrl(Deno.env.get("VITE_SITE_URL")) ||
  PRODUCTION_SITE_URL;

const isLocalOrigin = (origin: string) =>
  origin === "http://localhost:8080" ||
  origin === "http://127.0.0.1:8080" ||
  origin === "http://localhost:5173" ||
  origin === "http://127.0.0.1:5173";

export const getTrustedAppOrigin = (req: Request, requestedOrigin?: string | null) => {
  const configuredSiteUrl = getConfiguredAppOrigin();
  const candidates = [
    normalizeBaseUrl(requestedOrigin),
    normalizeBaseUrl(req.headers.get("origin")),
    normalizeBaseUrl(req.headers.get("referer")),
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    if (candidate === configuredSiteUrl || isLocalOrigin(candidate)) {
      return candidate;
    }
  }

  return configuredSiteUrl;
};
