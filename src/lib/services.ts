// Services: an ordered list of things to present on a Sunday. Items store
// references and settings only. Scripture text is never saved here; the
// presenter gets it fresh from the service-bundle endpoint.

import { supabase } from "@/integrations/supabase/client";
import { ensureResolvedAccountAccess } from "@/lib/account-access";
import {
  formatReference,
  type NormalizedPassage,
  parseReference,
} from "../../supabase/functions/_shared/scripture/references.ts";

export type ServiceItemType = "sermon" | "scripture" | "song" | "slides" | "video" | "blank" | "logo";
export type StageTemplateChoice = "worship" | "message" | "video" | "simple";
export type ScriptureLayout = "passage" | "verse_by_verse";

export interface ScripturePayload {
  passages: NormalizedPassage[];
  /** Null means "use the service's default translation". */
  translation_id: string | null;
  layout: ScriptureLayout;
}

export interface ServiceSummary {
  id: string;
  title: string;
  serviceDate: string | null;
  updatedAt: string;
}

export interface ServiceItem {
  id: string;
  position: number;
  type: ServiceItemType;
  sermonId: string | null;
  songId: string | null;
  mediaId: string | null;
  label: string | null;
  payload: Record<string, unknown>;
}

export interface ServiceDetail extends ServiceSummary {
  accountId: string;
  defaultTranslationId: string | null;
  items: ServiceItem[];
}

export interface SermonOption {
  id: string;
  title: string;
  presentationDate: string | null;
}

const POSITION_STEP = 1000;

async function requireAccountId(): Promise<string> {
  const access = await ensureResolvedAccountAccess();
  if (!access.accountId) throw new Error("You need to be signed in to a church account.");
  return access.accountId;
}

function fail(action: string, error: { message: string } | null): asserts error is null {
  if (error) throw new Error(`Could not ${action}: ${error.message}`);
}

export async function listServices(): Promise<ServiceSummary[]> {
  const accountId = await requireAccountId();
  const { data, error } = await supabase
    .from("services")
    .select("id, title, service_date, updated_at")
    .eq("account_id", accountId)
    .is("archived_at", null)
    .order("service_date", { ascending: false, nullsFirst: true })
    .order("updated_at", { ascending: false })
    .limit(100);
  fail("load services", error);
  return (data ?? []).map((r) => ({ id: r.id, title: r.title, serviceDate: r.service_date, updatedAt: r.updated_at }));
}

export async function createService(input: { title: string; serviceDate: string | null; defaultTranslationId: string | null }): Promise<string> {
  const accountId = await requireAccountId();
  const access = await ensureResolvedAccountAccess();
  const { data, error } = await supabase
    .from("services")
    .insert({
      account_id: accountId,
      title: input.title.trim(),
      service_date: input.serviceDate || null,
      default_translation_id: input.defaultTranslationId,
      created_by_user_id: access.userId,
    })
    .select("id")
    .single();
  fail("create the service", error);
  return data.id;
}

export async function getService(id: string): Promise<ServiceDetail | null> {
  const [{ data: service, error }, { data: items, error: itemsError }] = await Promise.all([
    supabase
      .from("services")
      .select("id, account_id, title, service_date, default_translation_id, updated_at")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("service_items")
      .select("id, position, item_type, sermon_id, song_id, media_id, label, payload")
      .eq("service_id", id)
      .order("position", { ascending: true }),
  ]);
  fail("load the service", error);
  fail("load the service items", itemsError);
  if (!service) return null;
  return {
    id: service.id,
    accountId: service.account_id,
    title: service.title,
    serviceDate: service.service_date,
    defaultTranslationId: service.default_translation_id,
    updatedAt: service.updated_at,
    items: (items ?? []).map((r) => ({
      id: r.id,
      position: r.position,
      type: r.item_type as ServiceItemType,
      sermonId: r.sermon_id,
      songId: r.song_id ?? null,
      mediaId: r.media_id ?? null,
      label: r.label,
      payload: (r.payload && typeof r.payload === "object" && !Array.isArray(r.payload) ? r.payload : {}) as Record<string, unknown>,
    })),
  };
}

export async function updateService(
  id: string,
  patch: Partial<{ title: string; serviceDate: string | null; defaultTranslationId: string | null }>,
): Promise<void> {
  const update: { title?: string; service_date?: string | null; default_translation_id?: string | null } = {};
  if (patch.title !== undefined) update.title = patch.title.trim();
  if (patch.serviceDate !== undefined) update.service_date = patch.serviceDate || null;
  if (patch.defaultTranslationId !== undefined) update.default_translation_id = patch.defaultTranslationId;
  const { error } = await supabase.from("services").update(update).eq("id", id);
  fail("save the service", error);
}

export async function deleteService(id: string): Promise<void> {
  const { error } = await supabase.from("services").delete().eq("id", id);
  fail("delete the service", error);
}

export async function addServiceItem(
  service: Pick<ServiceDetail, "id" | "accountId" | "items">,
  item: {
    type: ServiceItemType;
    sermonId?: string | null;
    songId?: string | null;
    mediaId?: string | null;
    label?: string | null;
    payload?: Record<string, unknown>;
    /** Put it right after this item instead of at the end. */
    afterItemId?: string | null;
  },
): Promise<void> {
  const last = service.items.reduce((max, i) => Math.max(max, i.position), 0);
  const after = item.afterItemId ? service.items.find((i) => i.id === item.afterItemId) : undefined;
  const { data, error } = await supabase.from("service_items").insert({
    service_id: service.id,
    account_id: service.accountId,
    position: last + POSITION_STEP,
    item_type: item.type,
    sermon_id: item.type === "sermon" ? item.sermonId ?? null : null,
    song_id: item.type === "song" ? item.songId ?? null : null,
    media_id: item.type === "video" ? item.mediaId ?? null : null,
    label: item.label?.trim() || null,
    payload: (item.payload ?? {}) as never,
  }).select("id").single();
  fail("add the item", error);
  if (after && data) {
    const ordered = [...service.items].sort((a, b) => a.position - b.position).map((i) => i.id);
    ordered.splice(ordered.indexOf(after.id) + 1, 0, data.id);
    await reorderServiceItems(service.id, ordered);
  }
}

export async function updateServiceItem(id: string, patch: { label?: string | null; payload?: Record<string, unknown> }): Promise<void> {
  const update: { label?: string | null; payload?: never } = {};
  if (patch.label !== undefined) update.label = patch.label?.trim() || null;
  if (patch.payload !== undefined) update.payload = patch.payload as never;
  const { error } = await supabase.from("service_items").update(update).eq("id", id);
  fail("save the item", error);
}

/**
 * Save an item's stage display settings, keeping the rest of its payload.
 * `template: null` follows the default for the item's type; `timerSeconds: null` clears the countdown.
 */
export async function setItemStageSettings(
  item: Pick<ServiceItem, "id" | "payload">,
  settings: { template?: StageTemplateChoice | null; timerSeconds?: number | null },
): Promise<void> {
  const payload: Record<string, unknown> = { ...item.payload };
  if (settings.template !== undefined) {
    if (settings.template) payload.stage_template = settings.template;
    else delete payload.stage_template;
  }
  if (settings.timerSeconds !== undefined) {
    const t = settings.timerSeconds;
    if (t && Number.isFinite(t) && t > 0) payload.timer_seconds = Math.min(Math.round(t), 6 * 60 * 60);
    else delete payload.timer_seconds;
  }
  await updateServiceItem(item.id, { payload });
}

export async function removeServiceItem(id: string): Promise<void> {
  const { error } = await supabase.from("service_items").delete().eq("id", id);
  fail("remove the item", error);
}

export async function reorderServiceItems(serviceId: string, itemIds: string[]): Promise<void> {
  const { error } = await supabase.rpc("reorder_service_items", { p_service_id: serviceId, p_item_ids: itemIds });
  fail("reorder the items", error);
}

/** Move one item up or down. Returns the new id order (unchanged at the ends). */
export function moveItem(ids: readonly string[], index: number, direction: -1 | 1): string[] {
  const target = index + direction;
  if (index < 0 || index >= ids.length || target < 0 || target >= ids.length) return [...ids];
  const next = [...ids];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/**
 * The service to open when a pastor clicks Present on a sermon: the most
 * recently updated service that already has this sermon in it, or a new
 * one-item service named after the sermon.
 */
export async function getOrCreateServiceForSermon(sermon: { id: string; title: string; presentationDate?: string | null }): Promise<string> {
  const accountId = await requireAccountId();
  const { data: existing, error } = await supabase
    .from("service_items")
    .select("service_id, services!inner(id, archived_at, updated_at)")
    .eq("account_id", accountId)
    .eq("sermon_id", sermon.id)
    .is("services.archived_at", null)
    .order("updated_at", { ascending: false, referencedTable: "services" })
    .limit(1);
  fail("look up services for this sermon", error);
  if (existing && existing.length > 0) return existing[0].service_id;

  const serviceId = await createService({
    title: sermon.title.trim() || "Sunday Service",
    serviceDate: sermon.presentationDate ?? null,
    defaultTranslationId: null,
  });
  await addServiceItem({ id: serviceId, accountId, items: [] }, { type: "sermon", sermonId: sermon.id });
  return serviceId;
}

export async function listSermonOptions(): Promise<SermonOption[]> {
  const accountId = await requireAccountId();
  const { data, error } = await supabase
    .from("sermons")
    .select("id, title, presentation_date")
    .eq("account_id", accountId)
    .order("updated_at", { ascending: false })
    .limit(100);
  fail("load sermons", error);
  return (data ?? []).map((r) => ({ id: r.id, title: r.title, presentationDate: r.presentation_date ?? null }));
}

/**
 * Parse what the pastor typed, for example "John 3:16-18; Romans 8:28".
 * Returns the passages it could read and the parts it could not.
 */
export function parseReferenceList(text: string): { passages: NormalizedPassage[]; unreadable: string[] } {
  const passages: NormalizedPassage[] = [];
  const unreadable: string[] = [];
  for (const part of text.split(/[;\n]+/).map((p) => p.trim()).filter(Boolean)) {
    const ref = parseReference(part);
    if (ref) passages.push(ref);
    else unreadable.push(part);
  }
  return { passages, unreadable };
}

export function readScripturePayload(payload: Record<string, unknown>): ScripturePayload {
  const passages = Array.isArray(payload.passages) ? (payload.passages as NormalizedPassage[]) : [];
  return {
    passages,
    translation_id: typeof payload.translation_id === "string" ? payload.translation_id : null,
    layout: payload.layout === "verse_by_verse" ? "verse_by_verse" : "passage",
  };
}

export function describeScripture(payload: Record<string, unknown>): string {
  const p = readScripturePayload(payload);
  return p.passages.length ? p.passages.map(formatReference).join("; ") : "No passages yet";
}

export { formatReference };
