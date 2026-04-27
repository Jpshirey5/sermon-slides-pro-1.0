export const PENDING_SERMON_KEY = "pending_payment_sermon_id";
export const PENDING_EXPORT_CONTEXT_KEY = "pending_payment_context_v1";
export const PENDING_EXPORT_SNAPSHOT_KEY = "pending_payment_snapshot_v1";
export const EXPORT_UNLOCK_SESSION_PREFIX = "export_unlock_session:";
const WINDOW_PENDING_EXPORT_PREFIX = "__ssp_pending_export__:";

function trySetStorage(storage: Storage, key: string, value: string) {
  try {
    storage.setItem(key, value);
    return true;
  } catch (error) {
    console.warn(`Failed to persist ${key} in storage:`, error);
    return false;
  }
}

interface PendingExportContext {
  sermonId: string;
  createdAt: number;
}

export interface PendingExportSnapshot {
  sermonId: string;
  title: string;
  slides: any[];
  createdAt: number;
}

export function setPendingExportContext(sermonId: string) {
  if (typeof window === "undefined") return;
  const payload: PendingExportContext = {
    sermonId,
    createdAt: Date.now(),
  };
  const serialized = JSON.stringify(payload);
  localStorage.setItem(PENDING_SERMON_KEY, sermonId);
  localStorage.setItem(PENDING_EXPORT_CONTEXT_KEY, serialized);
  sessionStorage.setItem(PENDING_EXPORT_CONTEXT_KEY, serialized);
}

export function setPendingExportSnapshot(snapshot: PendingExportSnapshot) {
  if (typeof window === "undefined") return;
  const serialized = JSON.stringify(snapshot);

  localStorage.removeItem(PENDING_EXPORT_SNAPSHOT_KEY);
  // Large slide payloads can exceed localStorage quota, especially for guest sessions
  // that already keep presentation state there. Prefer session storage and window.name.
  trySetStorage(sessionStorage, PENDING_EXPORT_SNAPSHOT_KEY, serialized);
  // Keep a cross-origin fallback for Stripe round-trips in the same tab.
  window.name = `${WINDOW_PENDING_EXPORT_PREFIX}${serialized}`;
}

export function getPendingExportSermonId(): string | null {
  if (typeof window === "undefined") return null;

  const direct = localStorage.getItem(PENDING_SERMON_KEY);
  if (direct) return direct;

  const fromLocal = localStorage.getItem(PENDING_EXPORT_CONTEXT_KEY);
  if (fromLocal) {
    try {
      return (JSON.parse(fromLocal) as PendingExportContext).sermonId || null;
    } catch {
      return null;
    }
  }

  const fromSession = sessionStorage.getItem(PENDING_EXPORT_CONTEXT_KEY);
  if (fromSession) {
    try {
      return (JSON.parse(fromSession) as PendingExportContext).sermonId || null;
    } catch {
      return null;
    }
  }

  return null;
}

export function getPendingExportSnapshot(): PendingExportSnapshot | null {
  if (typeof window === "undefined") return null;

  const fromSession = sessionStorage.getItem(PENDING_EXPORT_SNAPSHOT_KEY);
  if (fromSession) {
    try {
      return JSON.parse(fromSession) as PendingExportSnapshot;
    } catch {
      // Continue fallback lookup
    }
  }

  if (window.name.startsWith(WINDOW_PENDING_EXPORT_PREFIX)) {
    const payload = window.name.slice(WINDOW_PENDING_EXPORT_PREFIX.length);
    try {
      return JSON.parse(payload) as PendingExportSnapshot;
    } catch {
      return null;
    }
  }

  const fromLocal = localStorage.getItem(PENDING_EXPORT_SNAPSHOT_KEY);
  if (fromLocal) {
    try {
      return JSON.parse(fromLocal) as PendingExportSnapshot;
    } catch {
      return null;
    }
  }

  return null;
}

export function clearPendingExportContext() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(PENDING_SERMON_KEY);
  localStorage.removeItem(PENDING_EXPORT_CONTEXT_KEY);
  localStorage.removeItem(PENDING_EXPORT_SNAPSHOT_KEY);
  sessionStorage.removeItem(PENDING_EXPORT_CONTEXT_KEY);
  sessionStorage.removeItem(PENDING_EXPORT_SNAPSHOT_KEY);
  if (window.name.startsWith(WINDOW_PENDING_EXPORT_PREFIX)) {
    window.name = "";
  }
}

export function getVerifiedExportUnlockSession(sermonId: string): string | null {
  if (typeof window === "undefined" || !sermonId) return null;
  return localStorage.getItem(`${EXPORT_UNLOCK_SESSION_PREFIX}${sermonId}`);
}

export function setVerifiedExportUnlockSession(sermonId: string, sessionId: string) {
  if (typeof window === "undefined" || !sermonId || !sessionId) return;
  localStorage.setItem(`${EXPORT_UNLOCK_SESSION_PREFIX}${sermonId}`, sessionId);
}

export function clearVerifiedExportUnlockSession(sermonId: string) {
  if (typeof window === "undefined" || !sermonId) return;
  localStorage.removeItem(`${EXPORT_UNLOCK_SESSION_PREFIX}${sermonId}`);
  localStorage.removeItem(`export_unlocked:${sermonId}`);
}
