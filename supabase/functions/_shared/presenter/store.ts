// Database access for the presenter endpoints, behind an interface so the
// bundle builder can be tested against real Postgres (PGlite). Production uses
// the service role client and enforces membership itself.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";
import type { AccountPlanFields } from "./access.ts";
import type { TranslationStatus } from "../scripture/expiry.ts";

export interface ServiceRow {
  id: string;
  account_id: string;
  title: string;
  service_date: string | null;
  default_translation_id: string | null;
  logo_path: string | null;
  archived_at: string | null;
}

export interface ServiceItemRow {
  id: string;
  position: number;
  item_type: string;
  sermon_id: string | null;
  payload: unknown;
  label: string | null;
}

export interface SermonRow {
  id: string;
  title: string;
  slides: unknown;
}

export interface PresenterStore {
  getService(id: string): Promise<ServiceRow | null>;
  isMember(userId: string, accountId: string): Promise<boolean>;
  /** The caller's account ids, for endpoints not tied to one service. */
  getMemberAccountIds(userId: string): Promise<string[]>;
  getAccountPlan(accountId: string): Promise<AccountPlanFields | null>;
  getItems(serviceId: string): Promise<ServiceItemRow[]>;
  /** Only sermons that belong to `accountId`. */
  getSermons(ids: readonly string[], accountId: string): Promise<SermonRow[]>;
  rateTake(key: string, bucket: string, limit: number): Promise<boolean>;
  getRevocationEpoch(): Promise<number>;
  getTranslationStatuses(): Promise<{ id: string; status: TranslationStatus }[]>;
  /** Insert, skipping client_event_ids already recorded. Returns the rows actually inserted. */
  insertFumsEvents(rows: readonly FumsEventRow[]): Promise<{ id: string; client_event_id: string }[]>;
  markFumsForwarded(results: readonly { id: string; ok: boolean; error?: string }[]): Promise<void>;
}

export interface FumsEventRow {
  client_event_id: string;
  account_id: string;
  user_id: string;
  device_id: string;
  session_id: string;
  translation_id: string;
  fums_token: string;
  displayed_at: string;
}

export function createSupabasePresenterStore(admin: SupabaseClient): PresenterStore {
  const fail = (scope: string, error: { message: string }): never => {
    throw new Error(`presenter_store_${scope}_failed: ${error.message}`);
  };

  return {
    async getService(id) {
      const { data, error } = await admin
        .from("services")
        .select("id, account_id, title, service_date, default_translation_id, logo_path, archived_at")
        .eq("id", id)
        .maybeSingle();
      if (error) fail("service", error);
      return (data as ServiceRow | null) ?? null;
    },

    async isMember(userId, accountId) {
      const { data, error } = await admin
        .from("account_members")
        .select("id")
        .eq("user_id", userId)
        .eq("account_id", accountId)
        .limit(1);
      if (error) fail("membership", error);
      return (data?.length ?? 0) > 0;
    },

    async getMemberAccountIds(userId) {
      const { data, error } = await admin.from("account_members").select("account_id").eq("user_id", userId);
      if (error) fail("memberships", error);
      return (data ?? []).map((r: { account_id: string }) => r.account_id);
    },

    async getAccountPlan(accountId) {
      const { data, error } = await admin
        .from("accounts")
        .select("subscription_status, is_beta_user, beta_trial_ends_at, partner_billing_active")
        .eq("id", accountId)
        .maybeSingle();
      if (error) fail("account", error);
      return (data as AccountPlanFields | null) ?? null;
    },

    async getItems(serviceId) {
      const { data, error } = await admin
        .from("service_items")
        .select("id, position, item_type, sermon_id, payload, label")
        .eq("service_id", serviceId)
        .order("position", { ascending: true });
      if (error) fail("items", error);
      return (data as ServiceItemRow[] | null) ?? [];
    },

    async getSermons(ids, accountId) {
      if (ids.length === 0) return [];
      const { data, error } = await admin
        .from("sermons")
        .select("id, title, slides")
        .eq("account_id", accountId)
        .in("id", ids as string[]);
      if (error) fail("sermons", error);
      return (data as SermonRow[] | null) ?? [];
    },

    async rateTake(key, bucket, limit) {
      const { data, error } = await admin.rpc("rate_take", { p_key: key, p_bucket: bucket, p_limit: limit });
      if (error) fail("rate", error);
      return data === true;
    },

    async getRevocationEpoch() {
      const { data, error } = await admin.from("scripture_revocation_state").select("epoch").maybeSingle();
      if (error) fail("epoch", error);
      return Number((data as { epoch: number } | null)?.epoch ?? 0);
    },

    async getTranslationStatuses() {
      const { data, error } = await admin.from("bible_translations").select("id, status");
      if (error) fail("statuses", error);
      return (data as { id: string; status: TranslationStatus }[] | null) ?? [];
    },

    async insertFumsEvents(rows) {
      if (rows.length === 0) return [];
      const { data, error } = await admin
        .from("fums_events")
        .upsert(rows as FumsEventRow[], { onConflict: "client_event_id", ignoreDuplicates: true })
        .select("id, client_event_id");
      if (error) fail("fums_insert", error);
      return (data as { id: string; client_event_id: string }[] | null) ?? [];
    },

    async markFumsForwarded(results) {
      const now = new Date().toISOString();
      for (const r of results) {
        const update = r.ok
          ? { forwarded_at: now, forward_error: null }
          : { forward_error: (r.error ?? "failed").slice(0, 200) };
        const { error } = await admin.from("fums_events").update(update).eq("id", r.id);
        if (error) fail("fums_mark", error);
      }
    },
  };
}
