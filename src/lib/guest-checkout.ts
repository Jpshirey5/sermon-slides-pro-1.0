import { supabase } from "@/integrations/supabase/client";

interface VerifyGuestCheckoutResponse {
  paid?: boolean;
  error?: string;
}

export async function verifyGuestCheckoutSession(sermonId: string, sessionId: string): Promise<boolean> {
  if (!sermonId || !sessionId) return false;

  const { data, error } = await supabase.functions.invoke<VerifyGuestCheckoutResponse>("verify-guest-checkout", {
    body: { sermonId, session_id: sessionId },
  });

  if (error) {
    throw error;
  }

  if (data?.error) {
    return false;
  }

  return data?.paid === true;
}
