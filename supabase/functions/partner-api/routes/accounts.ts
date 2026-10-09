// POST /v1/accounts · GET /v1/accounts/{id} · DELETE /v1/accounts/{id}/entitlement

import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";
import { withPartner, type PartnerContext } from "../../_shared/partner/auth.ts";
import { setPartnerBilling } from "../../_shared/partner/adapters.ts";
import { randomBase64Url, sha256Hex } from "../../_shared/partner/crypto.ts";
import { PartnerError } from "../../_shared/partner/errors.ts";
import { accountCreateSchema, parseOrThrow } from "../../_shared/partner/schemas.ts";
import { requireSeat, SEAT_COLUMNS, serializeSeat, type Seat } from "../../_shared/partner/seats.ts";
import { requireTheme } from "../../_shared/partner/themes.ts";
import { getConfiguredAppOrigin } from "../../_shared/app-url.ts";

const DEFAULT_ENTITLEMENT = "core";
const PROVISION_TOKEN_TTL_MS = 2 * 60 * 1000;

const seatByExternalId = async (db: SupabaseClient, partnerId: string, externalUserId: string): Promise<Seat | null> => {
  const { data, error } = await db
    .from("partner_accounts")
    .select(SEAT_COLUMNS)
    .eq("partner_id", partnerId)
    .eq("external_user_id", externalUserId)
    .maybeSingle();
  if (error) throw error;
  return (data as Seat) ?? null;
};

const emailOf = async (db: SupabaseClient, userId: string): Promise<string | null> => {
  const { data } = await db.auth.admin.getUserById(userId);
  return data?.user?.email ?? null;
};

/** Re-provisioning a revoked seat reactivates it; an active seat is returned untouched. */
const reactivateIfRevoked = async (ctx: PartnerContext, seat: Seat): Promise<Seat> => {
  if (seat.entitlement_status === "active") return seat;
  const { data, error } = await ctx.db
    .from("partner_accounts")
    .update({ entitlement_status: "active", revoked_at: null, updated_at: new Date(ctx.deps.now()).toISOString() })
    .eq("id", seat.id)
    .select(SEAT_COLUMNS)
    .single();
  if (error) throw error;
  await setPartnerBilling(seat.user_id, true, seat.entitlement, ctx.deps);
  return data as Seat;
};

const existingSeatResponse = async (ctx: PartnerContext, seat: Seat) => {
  const current = await reactivateIfRevoked(ctx, seat);
  return {
    status: 200,
    body: serializeSeat(current, await emailOf(ctx.db, current.user_id), { created: false }),
  };
};

/**
 * Creates the auth user with no password. The handle_new_user trigger only
 * builds the church account for a partner signup when it can consume a
 * matching partner_provision_tokens row, so metadata alone cannot fake one.
 */
const createPasswordlessUser = async (
  ctx: PartnerContext,
  input: { email: string; name?: string; church_name?: string; role?: string },
): Promise<string | null> => {
  const provisionToken = randomBase64Url(32);
  const { error: tokenError } = await ctx.db.from("partner_provision_tokens").insert({
    token_hash: sha256Hex(provisionToken),
    partner_id: ctx.partner.id,
    email: input.email,
    entitlement: DEFAULT_ENTITLEMENT,
    expires_at: new Date(ctx.deps.now() + PROVISION_TOKEN_TTL_MS).toISOString(),
  });
  if (tokenError) throw tokenError;

  const { data, error } = await ctx.db.auth.admin.createUser({
    email: input.email,
    email_confirm: false,
    user_metadata: {
      full_name: input.name ?? null,
      org_name: input.church_name ?? null,
      church_role: input.role ?? null,
      provisioned_by_partner: ctx.partner.slug,
      signup_intent: "partner_provisioned",
      partner_provision_token: provisionToken,
    },
  });
  if (error) {
    // Lost a race with a concurrent signup for the same email: link instead.
    if (/already (been )?registered|email_exists|already exists/i.test(`${error.message} ${(error as { code?: string }).code ?? ""}`)) {
      return null;
    }
    throw new Error(`createUser failed: ${error.message}`);
  }
  return data.user!.id;
};

export const createAccount = withPartner(async (ctx) => {
  const input = parseOrThrow(accountCreateSchema, ctx.body);
  ctx.log.externalUserId = input.external_user_id;

  // 1. Idempotent on external_user_id, with or without an Idempotency-Key.
  const existing = await seatByExternalId(ctx.db, ctx.partner.id, input.external_user_id);
  if (existing) return existingSeatResponse(ctx, existing);

  // 2. Theme by uuid or external_theme_id.
  const theme = input.theme_id ? await requireTheme(ctx.db, ctx.partner.id, input.theme_id) : null;

  // 3. Find or create the SSP user.
  const findUserId = async () => {
    const { data, error } = await ctx.db.rpc("partner_find_user_id_by_email", { p_email: input.email });
    if (error) throw error;
    return (data as string | null) ?? null;
  };
  let userId = await findUserId();
  let createdUser = false;
  if (!userId) {
    userId = await createPasswordlessUser(ctx, input);
    createdUser = Boolean(userId);
    userId = userId ?? await findUserId();
    if (!userId) throw new Error("User vanished between create and lookup");
  }

  if (!createdUser) {
    // An existing SSP user is linked as-is: password, plan history, and decks are untouched.
    const { data: linked, error: linkedError } = await ctx.db
      .from("partner_accounts")
      .select(SEAT_COLUMNS)
      .eq("partner_id", ctx.partner.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (linkedError) throw linkedError;
    if (linked && linked.external_user_id !== input.external_user_id) {
      throw new PartnerError(
        "email_conflict",
        "That email already belongs to a user you provisioned under a different external_user_id.",
      );
    }
  }

  const { data: seat, error: seatError } = await ctx.db
    .from("partner_accounts")
    .insert({
      partner_id: ctx.partner.id,
      external_user_id: input.external_user_id,
      user_id: userId,
      entitlement: DEFAULT_ENTITLEMENT,
      theme_id: theme?.id ?? null,
    })
    .select(SEAT_COLUMNS)
    .single();

  if (seatError) {
    // 5. Unique-violation race: a concurrent request created the seat first.
    if (seatError.code === "23505") {
      const raced = await seatByExternalId(ctx.db, ctx.partner.id, input.external_user_id);
      if (raced) return existingSeatResponse(ctx, raced);
      throw new PartnerError(
        "email_conflict",
        "That email already belongs to a user you provisioned under a different external_user_id.",
      );
    }
    throw seatError;
  }

  // 4. Partner-billed from here on: no Stripe checkout for this user.
  await setPartnerBilling(userId, true, DEFAULT_ENTITLEMENT, ctx.deps);

  if (createdUser) {
    // The one-time provisioning token is consumed; drop it from the user's metadata.
    await ctx.db.auth.admin.updateUserById(userId, { user_metadata: { partner_provision_token: null } }).catch(() => {});
    if (input.send_welcome_email) {
      // Existing recovery template: lets the pastor set a password for direct sign-in.
      const { error } = await ctx.db.auth.resetPasswordForEmail(input.email, {
        redirectTo: `${getConfiguredAppOrigin()}/reset-password`,
      });
      if (error) console.warn(`[PARTNER-API] Welcome email failed - ${JSON.stringify({ request_id: ctx.requestId })}`);
    }
  }

  return {
    status: 201,
    body: serializeSeat(seat as Seat, input.email, { created: true }),
  };
}, { idempotent: true });

export const getAccount = withPartner(async (ctx) => {
  const seat = await requireSeat(ctx.db, ctx.partner.id, ctx.params.id);
  ctx.log.externalUserId = seat.external_user_id;

  const [{ data: userData }, { count, error: countError }, { data: lastDeck }] = await Promise.all([
    ctx.db.auth.admin.getUserById(seat.user_id),
    ctx.db
      .from("sermons")
      .select("id", { count: "exact", head: true })
      .eq("partner_id", ctx.partner.id)
      .eq("created_by_user_id", seat.user_id),
    ctx.db
      .from("sermons")
      .select("updated_at")
      .eq("created_by_user_id", seat.user_id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (countError) throw countError;

  const activity = [userData?.user?.last_sign_in_at, lastDeck?.updated_at]
    .filter((value): value is string => Boolean(value))
    .sort();

  return {
    status: 200,
    body: serializeSeat(seat, userData?.user?.email ?? null, {
      decks_generated_total: count ?? 0,
      last_active_at: activity.length ? activity[activity.length - 1] : null,
    }),
  };
});

export const revokeEntitlement = withPartner(async (ctx) => {
  const seat = await requireSeat(ctx.db, ctx.partner.id, ctx.params.id);
  ctx.log.externalUserId = seat.external_user_id;

  if (seat.entitlement_status === "revoked") {
    return { status: 200, body: serializeSeat(seat, await emailOf(ctx.db, seat.user_id)) };
  }

  // CONTRACTUAL COMMITMENT: revoking a partner entitlement must never delete
  // the pastor's auth user, decks, or exports. They keep their SSP account and
  // can still sign in directly; only the partner-paid entitlement ends.
  const { data: revoked, error } = await ctx.db
    .from("partner_accounts")
    .update({
      entitlement_status: "revoked",
      revoked_at: new Date(ctx.deps.now()).toISOString(),
      updated_at: new Date(ctx.deps.now()).toISOString(),
    })
    .eq("id", seat.id)
    .select(SEAT_COLUMNS)
    .single();
  if (error) throw error;

  await setPartnerBilling(seat.user_id, false, seat.entitlement, ctx.deps);

  return { status: 200, body: serializeSeat(revoked as Seat, await emailOf(ctx.db, seat.user_id)) };
});
