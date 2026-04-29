const CHECKOUT_URL_STORAGE_KEY = "pending_pro_checkout_url";
const CHECKOUT_URL_MAX_AGE_MS = 30 * 60 * 1000;

type StoredCheckoutUrl = {
  url: string;
  createdAt: number;
};

export function setPendingCheckoutUrl(url: string) {
  const payload: StoredCheckoutUrl = {
    url,
    createdAt: Date.now(),
  };
  localStorage.setItem(CHECKOUT_URL_STORAGE_KEY, JSON.stringify(payload));
}

export function getFreshPendingCheckoutUrl() {
  const raw = localStorage.getItem(CHECKOUT_URL_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<StoredCheckoutUrl>;
    if (!parsed.url || typeof parsed.createdAt !== "number") {
      localStorage.removeItem(CHECKOUT_URL_STORAGE_KEY);
      return null;
    }

    if (Date.now() - parsed.createdAt > CHECKOUT_URL_MAX_AGE_MS) {
      localStorage.removeItem(CHECKOUT_URL_STORAGE_KEY);
      return null;
    }

    return parsed.url;
  } catch {
    localStorage.removeItem(CHECKOUT_URL_STORAGE_KEY);
    return null;
  }
}

export function clearPendingCheckoutState() {
  localStorage.removeItem("pending_pro_checkout");
  localStorage.removeItem("pending_pro_checkout_email");
  localStorage.removeItem("pending_pro_checkout_price_id");
  localStorage.removeItem(CHECKOUT_URL_STORAGE_KEY);
}
