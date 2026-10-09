// PARTNER API — seat (partner_accounts) lookup. Every lookup is scoped to the
// calling partner, so another partner's seat is indistinguishable from a
// missing one (404, never 403).

import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";
import { PartnerError } from "./errors.ts";

export interface Seat {
  id: string;
  partner_id: string;
  external_user_id: string;
  user_id: string;
  entitlement: string;
  entitlement_status: "active" | "revoked";
  theme_id: string | null;
  provisioned_at: string;
  revoked_at: string | null;
}

export const SEAT_COLUMNS =
  "id, partner_id, external_user_id, user_id, entitlement, entitlement_status, theme_id, provisioned_at, revoked_at";

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Accepts the partner's external_user_id or the SSP user uuid. The external id
 * is tried first because it is what partners normally send; a uuid-shaped
 * external id therefore still resolves to its own seat.
 */
export const findSeat = async (
  db: SupabaseClient,
  partnerId: string,
  idOrExternal: string,
): Promise<Seat | null> => {
  const { data: byExternal, error: externalError } = await db
    .from("partner_accounts")
    .select(SEAT_COLUMNS)
    .eq("partner_id", partnerId)
    .eq("external_user_id", idOrExternal)
    .maybeSingle();
  if (externalError) throw externalError;
  if (byExternal) return byExternal as Seat;

  if (!UUID_PATTERN.test(idOrExternal)) return null;
  const { data: byUser, error: userError } = await db
    .from("partner_accounts")
    .select(SEAT_COLUMNS)
    .eq("partner_id", partnerId)
    .eq("user_id", idOrExternal.toLowerCase())
    .maybeSingle();
  if (userError) throw userError;
  return (byUser as Seat) ?? null;
};

export const requireSeat = async (db: SupabaseClient, partnerId: string, idOrExternal: string): Promise<Seat> => {
  const seat = await findSeat(db, partnerId, idOrExternal);
  if (!seat) {
    throw new PartnerError("account_not_provisioned", "No account is provisioned for that user. Call POST /accounts first.");
  }
  return seat;
};

export const requireActiveSeat = async (db: SupabaseClient, partnerId: string, idOrExternal: string): Promise<Seat> => {
  const seat = await requireSeat(db, partnerId, idOrExternal);
  if (seat.entitlement_status !== "active") {
    throw new PartnerError("entitlement_inactive", "This user's entitlement has been revoked. Re-provision with POST /accounts.");
  }
  return seat;
};

export const serializeSeat = (seat: Seat, email: string | null, extra: Record<string, unknown> = {}) => ({
  ssp_user_id: seat.user_id,
  external_user_id: seat.external_user_id,
  email,
  entitlement: seat.entitlement,
  entitlement_status: seat.entitlement_status,
  theme_id: seat.theme_id,
  provisioned_at: seat.provisioned_at,
  ...extra,
});
