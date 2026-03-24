const LOCAL_DEV_SITE_URL = "http://localhost:8080";

const normalizeSiteUrl = (value: string) => {
  const trimmed = value.trim();
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

export const getSiteUrl = () => {
  const configuredSiteUrl = normalizeSiteUrl(import.meta.env.VITE_SITE_URL ?? "");
  if (configuredSiteUrl) return configuredSiteUrl;

  if (typeof window !== "undefined" && window.location.origin) {
    return normalizeSiteUrl(window.location.origin) ?? LOCAL_DEV_SITE_URL;
  }

  return LOCAL_DEV_SITE_URL;
};

export const buildAppUrl = (path: string, params?: Record<string, string | undefined>) => {
  const url = new URL(path, `${getSiteUrl()}/`);

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value) {
        url.searchParams.set(key, value);
      }
    });
  }

  return url.toString();
};

export const getPendingCheckoutPath = (priceId?: string | null) => {
  const params = new URLSearchParams({ startCheckout: "pro" });
  if (priceId) params.set("priceId", priceId);
  return `/checkout-redirect?${params.toString()}`;
};

export const getPostConfirmPath = (intent?: string | null, priceId?: string | null) => {
  if (intent === "checkout") {
    return getPendingCheckoutPath(priceId);
  }

  return "/dashboard";
};
