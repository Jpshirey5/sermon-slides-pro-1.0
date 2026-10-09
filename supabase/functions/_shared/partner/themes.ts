// PARTNER API — theme lookup, always scoped to the calling partner.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";
import { PartnerError } from "./errors.ts";
import type { ThemeConfig } from "./schemas.ts";
import { UUID_PATTERN } from "./seats.ts";

export interface Theme {
  id: string;
  partner_id: string;
  external_theme_id: string;
  church_name: string;
  config: ThemeConfig;
  created_at: string;
  updated_at: string;
}

export const THEME_COLUMNS = "id, partner_id, external_theme_id, church_name, config, created_at, updated_at";

/** Accepts the SSP theme uuid or the partner's external_theme_id. */
export const findTheme = async (db: SupabaseClient, partnerId: string, idOrExternal: string): Promise<Theme | null> => {
  const { data: byExternal, error: externalError } = await db
    .from("partner_themes")
    .select(THEME_COLUMNS)
    .eq("partner_id", partnerId)
    .eq("external_theme_id", idOrExternal)
    .maybeSingle();
  if (externalError) throw externalError;
  if (byExternal) return byExternal as Theme;

  if (!UUID_PATTERN.test(idOrExternal)) return null;
  const { data: byId, error: idError } = await db
    .from("partner_themes")
    .select(THEME_COLUMNS)
    .eq("partner_id", partnerId)
    .eq("id", idOrExternal.toLowerCase())
    .maybeSingle();
  if (idError) throw idError;
  return (byId as Theme) ?? null;
};

export const requireTheme = async (db: SupabaseClient, partnerId: string, idOrExternal: string): Promise<Theme> => {
  const theme = await findTheme(db, partnerId, idOrExternal);
  if (!theme) throw new PartnerError("theme_not_found", "No theme with that id exists for this partner. Create it with POST /themes.");
  return theme;
};

export const serializeTheme = (theme: Theme) => ({
  theme_id: theme.id,
  external_theme_id: theme.external_theme_id,
  church_name: theme.church_name,
  config: theme.config,
  created_at: theme.created_at,
  updated_at: theme.updated_at,
});
