export const IDLE_TIMEOUT_MS = 15 * 60 * 1000;
export const WARNING_MS = 60 * 1000;
export const STORAGE_LAST_ACTIVITY_KEY = "ssp_last_activity_at";
export const STORAGE_FORCED_LOGOUT_KEY = "ssp_forced_logout_at";
export const STORAGE_LOGOUT_REASON_KEY = "ssp_logout_reason";

export type LogoutReason = "inactive" | "security";

export function setStoredLogoutReason(reason: LogoutReason) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(STORAGE_LOGOUT_REASON_KEY, reason);
}

export function getStoredLogoutReason(): LogoutReason | null {
  if (typeof window === "undefined") return null;
  const reason = sessionStorage.getItem(STORAGE_LOGOUT_REASON_KEY);
  return reason === "inactive" || reason === "security" ? reason : null;
}

export function clearStoredLogoutReason() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(STORAGE_LOGOUT_REASON_KEY);
}

export function consumeStoredLogoutReason(): LogoutReason | null {
  const reason = getStoredLogoutReason();
  clearStoredLogoutReason();
  return reason;
}

export function getStoredLastActivity(): number | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(STORAGE_LAST_ACTIVITY_KEY);
  if (raw === null) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isInactivityExpired(at = Date.now()): boolean {
  const stored = getStoredLastActivity();
  return stored !== null && at - stored >= IDLE_TIMEOUT_MS;
}

export function resetSessionInactivityTracking(at = Date.now()) {
  if (typeof window === "undefined") return at;

  sessionStorage.setItem(STORAGE_LAST_ACTIVITY_KEY, String(at));
  sessionStorage.removeItem(STORAGE_FORCED_LOGOUT_KEY);
  clearStoredLogoutReason();

  return at;
}

// Removes the idle-tracking timestamps without touching the logout reason, so the
// /login page can still display why the user was signed out.
export function clearSessionInactivityTracking() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(STORAGE_LAST_ACTIVITY_KEY);
  sessionStorage.removeItem(STORAGE_FORCED_LOGOUT_KEY);
}
