// Build the bundle for one service: everything the presenter needs, with
// fresh scripture text, copyright lines, and per-item expiry.
//
// Checks happen in this order, and each one stops the request:
//   service exists and caller is a member   (404 either way, so ids do not leak)
//   account is paying                       (403 plan_required)
//   rate limits per user and per account    (429 rate_limited)
//   item and verse caps                     (422)
// Only the passages this service references are resolved. There is no way to
// ask this endpoint for arbitrary scripture.

import { computeBundleExpiry, earliestExpiry } from "../scripture/expiry.ts";
import { verseCount, type NormalizedPassage } from "../scripture/references.ts";
import { resolvePassages, type ResolverDeps } from "../scripture/resolver.ts";
import { accountCanPresent, dayBucket, minuteBucket } from "./access.ts";
import {
  DEFAULT_STYLE,
  passageKey,
  planScriptureItem,
  planSermon,
  planSong,
  renderSlot,
  type ResolvedText,
  type SlideSlot,
} from "./slides.ts";
import type { PresenterStore, ServiceItemRow } from "./store.ts";
import { STAGE_TEMPLATES, type BundleItem, type BundleTranslation, type PresenterSlide, type ServiceBundle, type StageTemplate } from "./types.ts";

export const LIMITS = {
  maxItems: 200,
  maxVerses: 300,
  perUserPerMinute: 60,
  perAccountPerDay: 300,
};

export const FALLBACK_TRANSLATION = "KJV";

export interface BundleDeps {
  store: PresenterStore;
  resolver: ResolverDeps;
  now?: () => Date;
  limits?: Partial<typeof LIMITS>;
}

export type BundleError =
  | { status: 404; error: "not_found" }
  | { status: 403; error: "plan_required" }
  | { status: 429; error: "rate_limited" }
  | { status: 422; error: "too_many_items" | "too_many_verses" };

export type BundleResult = { ok: true; bundle: ServiceBundle } | ({ ok: false } & BundleError);

const BLACK: PresenterSlide["style"] = { ...DEFAULT_STYLE, background: "#000000" };

interface PlannedItem {
  row: ServiceItemRow;
  type: BundleItem["type"];
  label: string;
  slots: SlideSlot[];
}

const DEFAULT_STAGE_TEMPLATE: Record<BundleItem["type"], StageTemplate> = {
  song: "worship",
  sermon: "message",
  scripture: "simple",
  logo: "simple",
  blank: "simple",
  credits: "simple",
};

/** Stage settings from the item payload, falling back to the default for its type. */
export function stageSettings(type: BundleItem["type"], payload: unknown): BundleItem["stage"] {
  const p = (payload && typeof payload === "object" ? payload : {}) as { stage_template?: unknown; timer_seconds?: unknown };
  const template = STAGE_TEMPLATES.includes(p.stage_template as StageTemplate) ? (p.stage_template as StageTemplate) : DEFAULT_STAGE_TEMPLATE[type];
  const t = p.timer_seconds;
  const timer = typeof t === "number" && Number.isInteger(t) && t > 0 && t <= 6 * 60 * 60 ? t : null;
  return { template, timer_seconds: timer };
}

export async function buildServiceBundle(
  deps: BundleDeps,
  request: { userId: string; serviceId: string },
): Promise<BundleResult> {
  const limits = { ...LIMITS, ...deps.limits };
  const now = deps.now?.() ?? new Date();
  const { store } = deps;

  const service = await store.getService(request.serviceId);
  if (!service || !(await store.isMember(request.userId, service.account_id))) {
    return { ok: false, status: 404, error: "not_found" };
  }
  const plan = await store.getAccountPlan(service.account_id);
  if (!accountCanPresent(plan, now)) {
    return { ok: false, status: 403, error: "plan_required" };
  }
  const userOk = await store.rateTake(`user:${request.userId}`, minuteBucket("bundle", now), limits.perUserPerMinute);
  const accountOk = userOk &&
    await store.rateTake(`account:${service.account_id}`, dayBucket("bundle", now), limits.perAccountPerDay);
  if (!userOk || !accountOk) return { ok: false, status: 429, error: "rate_limited" };

  const rows = await store.getItems(service.id);
  if (rows.length > limits.maxItems) return { ok: false, status: 422, error: "too_many_items" };

  // ── plan ──
  const fallback = service.default_translation_id || FALLBACK_TRANSLATION;
  const sermonIds = [...new Set(rows.map((r) => r.sermon_id).filter((id): id is string => Boolean(id)))];
  const sermons = new Map((await store.getSermons(sermonIds, service.account_id)).map((s) => [s.id, s]));
  const songIds = [...new Set(rows.map((r) => r.song_id).filter((id): id is string => Boolean(id)))];
  const songs = new Map((await store.getSongs(songIds, service.account_id)).map((s) => [s.id, s]));

  const planned: PlannedItem[] = rows.map((row) => {
    switch (row.item_type) {
      case "sermon": {
        const sermon = row.sermon_id ? sermons.get(row.sermon_id) : undefined;
        if (!sermon) {
          return {
            row,
            type: "sermon",
            label: row.label || "Sermon",
            slots: [{ kind: "static", slide: { id: `${row.id}:missing`, kind: "missing", missing_reason: "sermon_deleted", style: BLACK } }],
          };
        }
        return { row, type: "sermon", label: row.label || sermon.title, slots: planSermon(sermon, fallback) };
      }
      case "scripture":
        return { row, type: "scripture", label: row.label || "Scripture", slots: planScriptureItem(row.id, row.payload, fallback) };
      case "song": {
        const song = row.song_id ? songs.get(row.song_id) : undefined;
        if (!song) {
          return {
            row,
            type: "song",
            label: row.label || "Song",
            slots: [{ kind: "static", slide: { id: `${row.id}:missing`, kind: "missing", missing_reason: "song_deleted", style: BLACK } }],
          };
        }
        return { row, type: "song", label: row.label || song.title, slots: planSong(row.id, song, plan?.ccli_license_number ?? null) };
      }
      case "logo":
        return { row, type: "logo", label: row.label || "Logo", slots: [{ kind: "static", slide: { id: row.id, kind: "logo", style: BLACK } }] };
      default:
        return { row, type: "blank", label: row.label || "Blank", slots: [{ kind: "static", slide: { id: row.id, kind: "blank", style: BLACK } }] };
    }
  });

  // ── collect references, by translation, and enforce the verse cap ──
  const byTranslation = new Map<string, Map<string, NormalizedPassage>>();
  for (const item of planned) {
    for (const slot of item.slots) {
      if (slot.kind !== "scripture" || !slot.ref) continue;
      const refs = byTranslation.get(slot.translation_id) ?? new Map<string, NormalizedPassage>();
      refs.set(passageKey(slot.translation_id, slot.ref), slot.ref);
      byTranslation.set(slot.translation_id, refs);
    }
  }
  let totalVerses = 0;
  for (const refs of byTranslation.values()) for (const ref of refs.values()) totalVerses += verseCount(ref);
  if (totalVerses > limits.maxVerses) return { ok: false, status: 422, error: "too_many_verses" };

  // ── resolve ──
  const passages = new Map<string, ResolvedText>();
  const attributions = new Map<string, string>();
  const unavailable = new Map<string, string>();
  const translations: Record<string, BundleTranslation> = {};

  for (const [translationId, refs] of byTranslation) {
    const result = await resolvePassages(deps.resolver, {
      accountId: service.account_id,
      translationId,
      passages: [...refs.values()],
      maxVerses: limits.maxVerses,
    });
    if (!result.ok) {
      unavailable.set(translationId, result.reason);
      continue;
    }
    // A slot's translation id is what the sermon says ("niv"); key by both.
    const t = result.translation;
    translations[t.id] = t;
    for (const id of new Set([translationId, t.id])) attributions.set(id, t.attribution);
    for (const p of result.passages) passages.set(passageKey(translationId, p.ref), p);
  }

  // ── render ──
  const items: BundleItem[] = planned.map((item) => {
    const slides: PresenterSlide[] = [];
    const expiries: (string | null)[] = [];
    const used = new Set<string>();
    for (const slot of item.slots) {
      const rendered = renderSlot(slot, { passages, attributions, unavailable });
      slides.push(...rendered.slides);
      expiries.push(rendered.expires_at);
      for (const s of rendered.slides) if (s.kind === "scripture" && s.translation_id) used.add(s.translation_id);
    }
    return {
      id: item.row.id,
      type: item.type,
      label: item.label,
      expires_at: earliestExpiry(expiries)?.toISOString() ?? null,
      translation_ids: [...used].sort(),
      stage: stageSettings(item.type, item.row.payload),
      sermon_id: item.row.sermon_id,
      song_id: item.row.song_id ?? null,
      slides,
    };
  });

  // Full notices for every translation shown, at the end of the service.
  const shown = new Set(items.flatMap((i) => i.translation_ids));
  const notices = Object.values(translations)
    .filter((t) => shown.has(t.id))
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((t) => ({ translation_id: t.id, name: t.name, notice: t.notice }));
  if (notices.length > 0) {
    items.push({
      id: `${service.id}:credits`,
      type: "credits",
      label: "Scripture credits",
      expires_at: null,
      translation_ids: notices.map((n) => n.translation_id),
      stage: stageSettings("credits", null),
      slides: [{ id: `${service.id}:credits`, kind: "credits", notices, style: BLACK }],
    });
  }

  const issuedAt = now.toISOString();
  return {
    ok: true,
    bundle: {
      service: { id: service.id, title: service.title, service_date: service.service_date, logo_path: service.logo_path },
      items,
      translations,
      issued_at: issuedAt,
      bundle_expires_at: computeBundleExpiry(items.map((i) => i.expires_at), now).toISOString(),
      revocation_epoch: await store.getRevocationEpoch(),
    },
  };
}
