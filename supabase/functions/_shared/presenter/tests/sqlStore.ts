// PresenterStore over PGlite, for tests. Real SQL, so the migration's
// constraints, triggers, and rate_take behave as in production.

import type { PGlite } from "npm:@electric-sql/pglite@0.5.8";
import type { FumsEventRow, PresenterStore, ServiceItemRow, ServiceRow, SermonRow } from "../store.ts";
import type { AccountPlanFields } from "../access.ts";
import type { TranslationStatus } from "../../scripture/expiry.ts";
import type { MediaRow, SongRow } from "../slides.ts";

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v == null ? null : String(v));

export function createSqlPresenterStore(db: PGlite): PresenterStore {
  return {
    async getService(id) {
      const { rows } = await db.query<ServiceRow>(
        `select id, account_id, title, service_date::text, default_translation_id, logo_path, archived_at
         from public.services where id = $1`,
        [id],
      );
      return rows[0] ?? null;
    },
    async isMember(userId, accountId) {
      const { rows } = await db.query(`select 1 from public.account_members where user_id = $1 and account_id = $2`, [userId, accountId]);
      return rows.length > 0;
    },
    async getMemberAccountIds(userId) {
      const { rows } = await db.query<{ account_id: string }>(`select account_id from public.account_members where user_id = $1`, [userId]);
      return rows.map((r) => r.account_id);
    },
    async getAccountPlan(accountId) {
      const { rows } = await db.query<AccountPlanFields & { beta_trial_ends_at: unknown }>(
        `select subscription_status, is_beta_user, beta_trial_ends_at, partner_billing_active, ccli_license_number from public.accounts where id = $1`,
        [accountId],
      );
      const r = rows[0];
      return r ? { ...r, beta_trial_ends_at: iso(r.beta_trial_ends_at) } : null;
    },
    async getItems(serviceId) {
      const { rows } = await db.query<ServiceItemRow>(
        `select id, position, item_type, sermon_id, song_id, media_id, payload, label from public.service_items where service_id = $1 order by position`,
        [serviceId],
      );
      return rows;
    },
    async getSermons(ids, accountId) {
      const { rows } = await db.query<SermonRow>(
        `select id, title, slides from public.sermons where account_id = $1 and id = any($2)`,
        [accountId, ids],
      );
      return rows;
    },
    async getSongs(ids, accountId) {
      const { rows } = await db.query<SongRow>(
        `select id, title, author, ccli_song_number, copyright, source, sections, arrangement
         from public.songs where account_id = $1 and id = any($2)`,
        [accountId, ids],
      );
      return rows;
    },
    async getMedia(ids, accountId) {
      const { rows } = await db.query<MediaRow>(
        `select id, storage_path, file_name, duration_seconds from public.service_media where account_id = $1 and id = any($2)`,
        [accountId, ids],
      );
      return rows;
    },
    async rateTake(key, bucket, limit) {
      const { rows } = await db.query<{ ok: boolean }>(`select public.rate_take($1, $2, $3) as ok`, [key, bucket, limit]);
      return rows[0].ok;
    },
    async getRevocationEpoch() {
      const { rows } = await db.query<{ epoch: number }>(`select epoch from public.scripture_revocation_state`);
      return Number(rows[0]?.epoch ?? 0);
    },
    async getTranslationStatuses() {
      const { rows } = await db.query<{ id: string; status: TranslationStatus }>(`select id, status from public.bible_translations`);
      return rows;
    },
    async insertFumsEvents(rows: readonly FumsEventRow[]) {
      const inserted: { id: string; client_event_id: string }[] = [];
      for (const r of rows) {
        const res = await db.query<{ id: string; client_event_id: string }>(
          `insert into public.fums_events (client_event_id, account_id, user_id, device_id, session_id, translation_id, fums_token, displayed_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8)
           on conflict (client_event_id) do nothing
           returning id, client_event_id`,
          [r.client_event_id, r.account_id, r.user_id, r.device_id, r.session_id, r.translation_id, r.fums_token, r.displayed_at],
        );
        inserted.push(...res.rows);
      }
      return inserted;
    },
    async markFumsForwarded(results) {
      for (const r of results) {
        if (r.ok) await db.query(`update public.fums_events set forwarded_at = now(), forward_error = null where id = $1`, [r.id]);
        else await db.query(`update public.fums_events set forward_error = $2 where id = $1`, [r.id, r.error ?? "failed"]);
      }
    },
  };
}
