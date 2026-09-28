// POST /v1/sessions — mint a single-use, 300-second handoff URL that signs the
// pastor into SSP (optionally straight onto a deck).

import { withPartner } from "../../_shared/partner/auth.ts";
import { randomBase64Url, sha256Hex } from "../../_shared/partner/crypto.ts";
import { PartnerError } from "../../_shared/partner/errors.ts";
import { validateReturnUrl } from "../../_shared/partner/returnUrl.ts";
import { parseOrThrow, sessionCreateSchema } from "../../_shared/partner/schemas.ts";
import { requireActiveSeat } from "../../_shared/partner/seats.ts";
import { getConfiguredAppOrigin } from "../../_shared/app-url.ts";

export const HANDOFF_TTL_SECONDS = 300;

export const createSession = withPartner(async (ctx) => {
  const input = parseOrThrow(sessionCreateSchema, ctx.body);
  ctx.log.externalUserId = input.external_user_id;

  const seat = await requireActiveSeat(ctx.db, ctx.partner.id, input.external_user_id);

  const returnUrl = input.return_url === undefined
    ? null
    : validateReturnUrl(input.return_url, ctx.partner.allowed_return_hosts ?? []);

  if (input.deck_id) {
    const { data: deck, error } = await ctx.db
      .from("sermons")
      .select("id")
      .eq("id", input.deck_id)
      .eq("partner_id", ctx.partner.id)
      .eq("created_by_user_id", seat.user_id)
      .maybeSingle();
    if (error) throw error;
    if (!deck) throw new PartnerError("deck_not_found", "No deck with that id exists for this user.");
  }

  // 32 CSPRNG bytes. Only the hash is stored; the raw token exists in this
  // response and nowhere else, and is never logged.
  const token = randomBase64Url(32);
  const expiresAt = new Date(ctx.deps.now() + HANDOFF_TTL_SECONDS * 1000).toISOString();
  const { error } = await ctx.db.from("handoff_tokens").insert({
    token_hash: sha256Hex(token),
    partner_id: ctx.partner.id,
    user_id: seat.user_id,
    deck_id: input.deck_id ?? null,
    return_url: returnUrl,
    expires_at: expiresAt,
    created_ip: ctx.clientIp,
  });
  if (error) throw error;

  return {
    status: 201,
    body: {
      url: `${getConfiguredAppOrigin()}/handoff?t=${token}`,
      expires_at: expiresAt,
      expires_in: HANDOFF_TTL_SECONDS,
    },
  };
});
