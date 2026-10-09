// Database access for the scripture resolver, behind a small interface so the
// resolver can be tested against real Postgres (PGlite) without supabase-js.
// Production uses the service role client: these tables have no client policies.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";
import type { AccessGrant, TranslationStatus } from "./expiry.ts";
import type { FetchedVerse } from "./apiBible.ts";

export interface TranslationRow {
  id: string;
  provider: "api_bible" | "esv_api";
  provider_bible_id: string | null;
  name: string;
  language: string;
  is_public_domain: boolean;
  copyright_short: string | null;
  copyright_full: string | null;
  requires_entitlement: boolean;
  status: TranslationStatus;
}

export interface CacheRow {
  translation_id: string;
  passage_id: string;
  verses: FetchedVerse[];
  fums_token: string | null;
  fetched_at: string;
  expires_at: string;
}

export interface ScriptureStore {
  getTranslation(id: string): Promise<TranslationRow | null>;
  getGrants(accountId: string): Promise<AccessGrant[]>;
  /** All matching rows, expired or not. The resolver decides what is fresh. */
  readCache(translationId: string, passageIds: readonly string[]): Promise<CacheRow[]>;
  /** Insert or replace by (translation_id, passage_id). */
  writeCache(rows: readonly CacheRow[]): Promise<void>;
  /** Fill copyright lines from the provider. Never overwrites a line an admin set. */
  setCopyrightIfMissing(id: string, short: string, full: string): Promise<void>;
  purgeTranslation(id: string): Promise<number>;
}

const TRANSLATION_COLUMNS =
  "id, provider, provider_bible_id, name, language, is_public_domain, copyright_short, copyright_full, requires_entitlement, status";

export function createSupabaseScriptureStore(admin: SupabaseClient): ScriptureStore {
  const fail = (scope: string, error: { message: string }) => {
    throw new Error(`scripture_store_${scope}_failed: ${error.message}`);
  };

  return {
    async getTranslation(id) {
      const { data, error } = await admin.from("bible_translations").select(TRANSLATION_COLUMNS).eq("id", id).maybeSingle();
      if (error) fail("translation", error);
      return (data as TranslationRow | null) ?? null;
    },

    async getGrants(accountId) {
      const { data, error } = await admin
        .from("account_translation_access")
        .select("translation_id, revoked_at")
        .eq("account_id", accountId);
      if (error) fail("grants", error);
      return (data as AccessGrant[] | null) ?? [];
    },

    async readCache(translationId, passageIds) {
      if (passageIds.length === 0) return [];
      const { data, error } = await admin
        .from("scripture_cache")
        .select("translation_id, passage_id, verses, fums_token, fetched_at, expires_at")
        .eq("translation_id", translationId)
        .in("passage_id", passageIds as string[]);
      if (error) fail("cache_read", error);
      return (data as CacheRow[] | null) ?? [];
    },

    async writeCache(rows) {
      if (rows.length === 0) return;
      const { error } = await admin.from("scripture_cache").upsert(rows as CacheRow[], { onConflict: "translation_id,passage_id" });
      if (error) fail("cache_write", error);
    },

    async setCopyrightIfMissing(id, short, full) {
      const { error } = await admin
        .from("bible_translations")
        .update({ copyright_short: short, copyright_full: full })
        .eq("id", id)
        .is("copyright_short", null);
      if (error) fail("copyright", error);
    },

    async purgeTranslation(id) {
      const { data, error } = await admin.rpc("purge_translation_cache", { p_translation_id: id });
      if (error) fail("purge", error);
      return Number(data ?? 0);
    },
  };
}
