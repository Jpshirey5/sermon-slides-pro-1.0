export const IDLE_TIMEOUT_MS = 15 * 60 * 1000;
export const WARNING_MS = 60 * 1000;
export const STORAGE_LAST_ACTIVITY_KEY = "ssp_last_activity_at";
export const STORAGE_FORCED_LOGOUT_KEY = "ssp_forced_logout_at";
export const STORAGE_LOGOUT_REASON_KEY = "ssp_logout_reason";

export type LogoutReason = "inactive" | "security";

export function setStoredLogoutReason(reason: LogoutReason) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_LOGOUT_REASON_KEY, reason);
}

export function getStoredLogoutReason(): LogoutReason | null {
  if (typeof window === "undefined") return null;
  const reason = localStorage.getItem(STORAGE_LOGOUT_REASON_KEY);
  return reason === "inactive" || reason === "security" ? reason : null;
}

export function clearStoredLogoutReason() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_LOGOUT_REASON_KEY);
}

export function consumeStoredLogoutReason(): LogoutReason | null {
  const reason = getStoredLogoutReason();
  clearStoredLogoutReason();
  return reason;
}

export function resetSessionInactivityTracking(at = Date.now()) {
  if (typeof window === "undefined") return at;

  localStorage.setItem(STORAGE_LAST_ACTIVITY_KEY, String(at));
  localStorage.removeItem(STORAGE_FORCED_LOGOUT_KEY);
  clearStoredLogoutReason();

  return at;
}
