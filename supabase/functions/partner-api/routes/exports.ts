// GET /v1/exports/{id}

import { withPartner } from "../../_shared/partner/auth.ts";
import { readExportState } from "../../_shared/partner/adapters.ts";
import { PartnerError } from "../../_shared/partner/errors.ts";
import { UUID_PATTERN } from "../../_shared/partner/seats.ts";
import { EXPORT_POLL_MS } from "./decks.ts";

export const getExport = withPartner(async (ctx) => {
  const notFound = () => new PartnerError("export_not_found", "No export with that id exists.");
  if (!UUID_PATTERN.test(ctx.params.id)) throw notFound();

  const { data: job, error } = await ctx.db
    .from("partner_exports")
    .select("id, deck_id")
    .eq("id", ctx.params.id.toLowerCase())
    .maybeSingle();
  if (error) throw error;
  if (!job) throw notFound();

  // Scope through the parent deck, not the export row, so a deck that changes
  // hands can never leak its exports. Another partner's export is a plain 404.
  const { data: deck, error: deckError } = await ctx.db
    .from("sermons")
    .select("partner_id, partner_external_user_id")
    .eq("id", job.deck_id)
    .maybeSingle();
  if (deckError) throw deckError;
  if (!deck || deck.partner_id !== ctx.partner.id) throw notFound();
  ctx.log.externalUserId = deck.partner_external_user_id;

  const state = await readExportState(job.id, ctx.deps);
  const finished = state.status === "ready" || state.status === "failed";
  return {
    status: 200,
    body: { ...state, poll_after_ms: finished ? null : EXPORT_POLL_MS },
  };
});
