import { supabase } from "@/integrations/supabase/client";

// Partner API handoff state for this browser tab. Holds only non-secret
// display flags; the partner's return URL never reaches the browser — the
// partner-approve edge function reads it server-side at approve time.

const STORAGE_KEY = "ssp_partner_handoff";

export interface PartnerHandoffState {
  partnerName: string;
  deckId: string | null;
  canReturn: boolean;
}

export function savePartnerHandoff(state: PartnerHandoffState) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // storage unavailable: the approve control simply won't show
  }
}

export function readPartnerHandoff(): PartnerHandoffState | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.partnerName !== "string" || typeof parsed?.canReturn !== "boolean") return null;
    return {
      partnerName: parsed.partnerName,
      deckId: typeof parsed.deckId === "string" ? parsed.deckId : null,
      canReturn: parsed.canReturn,
    };
  } catch {
    return null;
  }
}

export function clearPartnerHandoff() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** Only in-app destinations the handoff function actually produces. */
export function safeHandoffDestination(next: string | null): string {
  if (next === "/dashboard") return next;
  if (next && /^\/editor\/[0-9a-f-]{36}$/i.test(next)) return next;
  return "/dashboard";
}

/**
 * Approves a partner deck and returns where to send the browser. The server
 * decides the destination from the handoff that brought this pastor in.
 */
export async function approvePartnerDeck(deckId: string): Promise<string> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;

  const { data, error } = await supabase.functions.invoke("partner-approve", {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    body: { deck_id: deckId },
  });

  if (error) {
    const context = (error as { context?: Response }).context;
    if (context && typeof context.json === "function") {
      const payload = await context.json().catch(() => null);
      if (typeof payload?.message === "string") throw new Error(payload.message);
    }
    throw new Error(error.message || "Could not send the deck back");
  }

  if (typeof data?.redirect_url !== "string") throw new Error("Could not send the deck back");
  return data.redirect_url;
}
