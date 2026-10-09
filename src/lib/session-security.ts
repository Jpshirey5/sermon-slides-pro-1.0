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

// While the presenter's operator view is open, the operator may not touch the
// mouse or keyboard for a long stretch (a long sermon point). Signing out then
// would kill the service, so the operator view holds the session open. The
// hold is released as soon as the presenter closes; idle sign-out applies
// everywhere else exactly as before.
let presentingHolds = 0;

export function holdSessionWhilePresenting(): () => void {
  presentingHolds += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    presentingHolds = Math.max(0, presentingHolds - 1);
  };
}

export function isPresentingHoldActive(): boolean {
  return presentingHolds > 0;
}

/**
 * The presenter's projector and stage windows hold no data and is never touched during
 * a service. It must not run the idle timer: a sign-out there would show a
 * warning on the big screen and sign the operator out too (the session is
 * shared between windows).
 */
export function isProjectorWindowPath(pathname: string): boolean {
  return /^\/present\/[^/]+\/(output|stage)\/?$/.test(pathname);
}
