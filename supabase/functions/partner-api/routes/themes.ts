// POST /v1/themes · GET /v1/themes/{id}

import { withPartner } from "../../_shared/partner/auth.ts";
import { parseOrThrow, themeCreateSchema } from "../../_shared/partner/schemas.ts";
import { requireTheme, serializeTheme, THEME_COLUMNS, type Theme } from "../../_shared/partner/themes.ts";

export const upsertTheme = withPartner(async (ctx) => {
  const input = parseOrThrow(themeCreateSchema, ctx.body);
  const { data, error } = await ctx.db
    .from("partner_themes")
    .upsert(
      {
        partner_id: ctx.partner.id,
        external_theme_id: input.external_theme_id,
        church_name: input.church_name,
        config: input.config,
        updated_at: new Date(ctx.deps.now()).toISOString(),
      },
      { onConflict: "partner_id,external_theme_id" },
    )
    .select(THEME_COLUMNS)
    .single();
  if (error) throw error;
  return { status: 201, body: serializeTheme(data as Theme) };
}, { idempotent: true });

export const getTheme = withPartner(async (ctx) => {
  const theme = await requireTheme(ctx.db, ctx.partner.id, ctx.params.id);
  return { status: 200, body: serializeTheme(theme) };
});
