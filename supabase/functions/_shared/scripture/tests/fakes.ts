// Test doubles for the resolver: a ScriptureStore over PGlite (real SQL, so
// constraints and triggers apply) and a scripted API.Bible client that records
// every call.

import type { PGlite } from "npm:@electric-sql/pglite@0.5.8";
import { ApiBibleError, type ApiBibleClient, type FetchedPassage } from "../apiBible.ts";
import type { CacheRow, ScriptureStore, TranslationRow } from "../store.ts";

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v));

export function createSqlScriptureStore(db: PGlite): ScriptureStore {
  return {
    async getTranslation(id) {
      const { rows } = await db.query<TranslationRow>(
        `select id, provider, provider_bible_id, name, language, is_public_domain, copyright_short,
                copyright_full, requires_entitlement, status
         from public.bible_translations where id = $1`,
        [id],
      );
      return rows[0] ?? null;
    },
    async getGrants(accountId) {
      const { rows } = await db.query<{ translation_id: string; revoked_at: unknown }>(
        `select translation_id, revoked_at from public.account_translation_access where account_id = $1`,
        [accountId],
      );
      return rows.map((r) => ({ translation_id: r.translation_id, revoked_at: r.revoked_at ? iso(r.revoked_at) : null }));
    },
    async readCache(translationId, passageIds) {
      const { rows } = await db.query<CacheRow>(
        `select translation_id, passage_id, verses, fums_token, fetched_at, expires_at
         from public.scripture_cache where translation_id = $1 and passage_id = any($2)`,
        [translationId, passageIds],
      );
      return rows.map((r) => ({ ...r, fetched_at: iso(r.fetched_at), expires_at: iso(r.expires_at) }));
    },
    async writeCache(rows) {
      for (const r of rows) {
        await db.query(
          `insert into public.scripture_cache (translation_id, passage_id, verses, fums_token, fetched_at, expires_at)
           values ($1, $2, $3, $4, $5, $6)
           on conflict (translation_id, passage_id) do update
             set verses = excluded.verses, fums_token = excluded.fums_token,
                 fetched_at = excluded.fetched_at, expires_at = excluded.expires_at`,
          [r.translation_id, r.passage_id, JSON.stringify(r.verses), r.fums_token, r.fetched_at, r.expires_at],
        );
      }
    },
    async setCopyrightIfMissing(id, short, full) {
      await db.query(
        `update public.bible_translations set copyright_short = $2, copyright_full = $3 where id = $1 and copyright_short is null`,
        [id, short, full],
      );
    },
    async purgeTranslation(id) {
      const { rows } = await db.query<{ n: number }>(`select public.purge_translation_cache($1) as n`, [id]);
      return Number(rows[0].n);
    },
  };
}

export interface FakeApi extends ApiBibleClient {
  passageCalls: { bibleId: string; passageId: string }[];
  copyrightCalls: string[];
}

/** `passages` maps passage id to its verses; anything else is a 404. */
export function createFakeApi(options: {
  passages?: Record<string, FetchedPassage>;
  copyright?: string | null;
  failWith?: ApiBibleError;
} = {}): FakeApi {
  const api: FakeApi = {
    passageCalls: [],
    copyrightCalls: [],
    async fetchPassage(bibleId, passageId) {
      api.passageCalls.push({ bibleId, passageId });
      if (options.failWith) throw options.failWith;
      const p = options.passages?.[passageId];
      if (!p) throw new ApiBibleError("not_found", 404);
      return p;
    },
    async fetchCopyright(bibleId) {
      api.copyrightCalls.push(bibleId);
      if (options.failWith) throw options.failWith;
      return options.copyright ?? null;
    },
  };
  return api;
}

export const passage = (verses: [number, string][], fumsToken: string | null = "fums-tok"): FetchedPassage => ({
  verses: verses.map(([verse, text]) => ({ verse, text })),
  fumsToken,
  copyright: null,
});
