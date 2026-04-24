export type ProductTourStage = "dashboard" | "account" | "create" | "review" | "editor";

type ProductTourStatus = "pending" | "active" | "completed" | "skipped";

export interface ProductTourState {
  status: ProductTourStatus;
  stage: ProductTourStage;
  stepIndex: number;
}

const PRODUCT_TOUR_DEFERRED_MESSAGES_EVENT = "product-tour-deferred-messages-changed";

function getProductTourStorageKey(userId: string) {
  return `product_tour:${userId}`;
}

function getProductTourCompletionKey(userId: string) {
  return `product_tour_completion:${userId}`;
}

function getProductTourCreatePromptKey(userId: string) {
  return `product_tour_create_prompt:${userId}`;
}

function getDeferredDashboardMessagesKey(userId: string) {
  return `product_tour_deferred_messages:${userId}`;
}

function notifyDeferredDashboardMessagesChanged(userId: string, deferred: boolean) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PRODUCT_TOUR_DEFERRED_MESSAGES_EVENT, {
    detail: { userId, deferred },
  }));
}

export function readProductTourState(userId: string): ProductTourState | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = localStorage.getItem(getProductTourStorageKey(userId));
    return raw ? JSON.parse(raw) as ProductTourState : null;
  } catch {
    return null;
  }
}

export function writeProductTourState(userId: string, state: ProductTourState) {
  if (typeof window === "undefined") return;
  localStorage.setItem(getProductTourStorageKey(userId), JSON.stringify(state));
}

export function startProductTour(userId: string) {
  writeProductTourState(userId, {
    status: "pending",
    stage: "dashboard",
    stepIndex: 0,
  });
}

export function setProductTourStage(userId: string, stage: ProductTourStage, stepIndex = 0) {
  writeProductTourState(userId, {
    status: "active",
    stage,
    stepIndex,
  });
}

export function completeProductTour(userId: string) {
  writeProductTourState(userId, {
    status: "completed",
    stage: "editor",
    stepIndex: 0,
  });
  clearDeferredDashboardMessages(userId);
}

export function markProductTourCompletion(userId: string) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(getProductTourCompletionKey(userId), "true");
}

export function consumeProductTourCompletion(userId: string) {
  if (typeof window === "undefined") return false;

  const key = getProductTourCompletionKey(userId);
  const value = sessionStorage.getItem(key) === "true";
  if (value) {
    sessionStorage.removeItem(key);
  }
  return value;
}

export function markCreateTourPrompt(userId: string) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(getProductTourCreatePromptKey(userId), "true");
}

export function consumeCreateTourPrompt(userId: string) {
  if (typeof window === "undefined") return false;

  const key = getProductTourCreatePromptKey(userId);
  const value = sessionStorage.getItem(key) === "true";
  if (value) {
    sessionStorage.removeItem(key);
  }
  return value;
}

export function skipProductTour(userId: string, stage: ProductTourStage) {
  writeProductTourState(userId, {
    status: "skipped",
    stage,
    stepIndex: 0,
  });
  clearDeferredDashboardMessages(userId);
}

export function markDeferredDashboardMessages(userId: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(getDeferredDashboardMessagesKey(userId), "true");
  notifyDeferredDashboardMessagesChanged(userId, true);
}

export function shouldDeferDashboardMessages(userId: string) {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(getDeferredDashboardMessagesKey(userId)) === "true";
}

export function clearDeferredDashboardMessages(userId: string) {
  if (typeof window === "undefined") return;
  localStorage.removeItem(getDeferredDashboardMessagesKey(userId));
  notifyDeferredDashboardMessagesChanged(userId, false);
}

export function subscribeToDeferredDashboardMessages(
  userId: string,
  callback: (deferred: boolean) => void,
) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const handleChange = (event: Event) => {
    const customEvent = event as CustomEvent<{ userId?: string; deferred?: boolean }>;
    if (customEvent.detail?.userId !== userId) return;
    callback(Boolean(customEvent.detail?.deferred));
  };

  window.addEventListener(PRODUCT_TOUR_DEFERRED_MESSAGES_EVENT, handleChange);
  return () => {
    window.removeEventListener(PRODUCT_TOUR_DEFERRED_MESSAGES_EVENT, handleChange);
  };
}
