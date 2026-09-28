// POST /v1/decks · GET /v1/decks/{id} · POST /v1/decks/{id}/exports

import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";
import { withPartner } from "../../_shared/partner/auth.ts";
import {
  createAndQueueDeck,
  createAndQueueExport,
  deckCompleteness,
  readDeckState,
  SUPPORTED_EXPORT_FORMATS,
  thumbnailUrls,
  type ExportFormat,
} from "../../_shared/partner/adapters.ts";
import { PartnerError } from "../../_shared/partner/errors.ts";
import { deckCreateSchema, exportCreateSchema, parseOrThrow, type ThemeConfig } from "../../_shared/partner/schemas.ts";
import { requireActiveSeat, UUID_PATTERN } from "../../_shared/partner/seats.ts";
import { requireTheme } from "../../_shared/partner/themes.ts";

export const DECK_POLL_MS = 3000;
export const EXPORT_POLL_MS = 5000;
const DEFAULT_TRANSLATION = "NIV";

/**
 * Scope first. A deck owned by another partner (or not a partner deck at all)
 * is reported exactly like a missing one — 404 deck_not_found, never 403 — so
 * deck ids cannot be probed across partners.
 */
export const requirePartnerDeck = async (db: SupabaseClient, partnerId: string, deckId: string) => {
  if (!UUID_PATTERN.test(deckId)) throw new PartnerError("deck_not_found", "No deck with that id exists.");
  const { data, error } = await db
    .from("sermons")
    .select("id, partner_id, partner_external_user_id")
    .eq("id", deckId.toLowerCase())
    .maybeSingle();
  if (error) throw error;
  if (!data || data.partner_id !== partnerId) throw new PartnerError("deck_not_found", "No deck with that id exists.");
  return data as { id: string; partner_id: string; partner_external_user_id: string | null };
};

export const createDeck = withPartner(async (ctx) => {
  const input = parseOrThrow(deckCreateSchema, ctx.body);
  ctx.log.externalUserId = input.external_user_id;

  const seat = await requireActiveSeat(ctx.db, ctx.partner.id, input.external_user_id);

  const since = new Date(ctx.deps.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await ctx.db
    .from("sermons")
    .select("id", { count: "exact", head: true })
    .eq("partner_id", ctx.partner.id)
    .gte("created_at", since);
  if (countError) throw countError;
  if ((count ?? 0) >= ctx.partner.deck_limit_per_day) {
    throw new PartnerError(
      "quota_exceeded",
      `Daily deck limit of ${ctx.partner.deck_limit_per_day} reached for the last 24 hours. Contact support to raise it.`,
    );
  }

  let themeConfig: ThemeConfig | null = null;
  if (input.theme_id) {
    themeConfig = (await requireTheme(ctx.db, ctx.partner.id, input.theme_id)).config;
  } else if (seat.theme_id) {
    const { data } = await ctx.db.from("partner_themes").select("config").eq("id", seat.theme_id).eq("partner_id", ctx.partner.id).maybeSingle();
    themeConfig = (data?.config as ThemeConfig) ?? null;
  }

  const source = input.points ? "points" : "raw_text";
  const deckId = await createAndQueueDeck(
    seat.user_id,
    ctx.partner.id,
    seat.external_user_id,
    {
      title: input.title,
      scripture_ref: input.scripture_ref,
      service_date: input.service_date,
      translation: input.translation ?? themeConfig?.default_translation ?? DEFAULT_TRANSLATION,
      big_idea: input.big_idea,
      points: input.points,
      raw_text: input.raw_text,
      theme: themeConfig,
    },
    ctx.deps,
  );

  return {
    status: 201,
    body: { deck_id: deckId, status: "queued", source, poll_after_ms: DECK_POLL_MS },
  };
}, { idempotent: true });

export const getDeck = withPartner(async (ctx) => {
  const deck = await requirePartnerDeck(ctx.db, ctx.partner.id, ctx.params.id);
  ctx.log.externalUserId = deck.partner_external_user_id;

  const state = await readDeckState(deck.id, ctx.deps);
  const finished = state.status === "ready" || state.status === "failed";
  return {
    status: 200,
    body: {
      deck_id: deck.id,
      status: state.status,
      slide_count: state.slide_count,
      completeness: state.status === "ready" ? deckCompleteness(state) : null,
      thumbnails: state.status === "ready" ? await thumbnailUrls(deck.id, ctx.deps) : [],
      approved_at: state.approved_at,
      created_at: state.created_at,
      error: state.error_message,
      poll_after_ms: finished ? null : DECK_POLL_MS,
    },
  };
});

export const createExport = withPartner(async (ctx) => {
  const input = parseOrThrow(exportCreateSchema, ctx.body);
  const unsupported = input.formats.filter((format) => !(SUPPORTED_EXPORT_FORMATS as readonly string[]).includes(format));
  if (unsupported.length) {
    throw new PartnerError("validation_failed", `formats: ${unsupported.join(", ")} export is not available yet. Use pro7 or pptx.`);
  }

  const deck = await requirePartnerDeck(ctx.db, ctx.partner.id, ctx.params.id);
  ctx.log.externalUserId = deck.partner_external_user_id;

  const state = await readDeckState(deck.id, ctx.deps);
  if (state.status !== "ready") {
    throw new PartnerError("deck_not_ready", `Deck is ${state.status}. Poll GET /decks/{id} until status is ready.`);
  }

  const exportId = await createAndQueueExport(deck.id, input.formats as ExportFormat[], ctx.deps);
  return {
    status: 201,
    body: { export_id: exportId, deck_id: deck.id, status: "queued", poll_after_ms: EXPORT_POLL_MS },
  };
}, { idempotent: true });
