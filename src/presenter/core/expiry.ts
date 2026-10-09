// Client-side expiry and revocation. The server already refuses expired or
// revoked scripture; this is the presenter's own guard for a bundle it is
// holding in memory: text past its expiry, past the bundle's expiry, or in a
// translation that was turned off is removed, never shown.

import { isExpired } from "../../../supabase/functions/_shared/scripture/expiry.ts";
import type { BundleItem, PresenterSlide, ServiceBundle } from "./types";

export { isExpired };

export type DropReason = "expired" | "revoked";

export interface PruneOptions {
  now?: Date | number;
  /** Translations the server says this church may no longer show. */
  unavailable?: ReadonlySet<string>;
}

export interface PruneResult {
  bundle: ServiceBundle;
  /** True when anything was removed. */
  changed: boolean;
  /** Item ids that lost scripture, with why. */
  dropped: { itemId: string; reason: DropReason }[];
}

function stripSlide(slide: PresenterSlide, reason: DropReason): PresenterSlide {
  return {
    id: slide.id,
    kind: "missing",
    reference: slide.reference,
    translation_id: slide.translation_id,
    missing_reason: reason,
    style: slide.style,
  };
}

/**
 * Remove scripture that must not be shown any more. Non-scripture slides
 * (titles, points, blanks, logo) are kept. On the credits slide only the
 * notices of revoked translations are removed.
 */
export function pruneBundle(bundle: ServiceBundle, options: PruneOptions = {}): PruneResult {
  const now = options.now ?? Date.now();
  const unavailable = options.unavailable ?? new Set<string>();
  const bundleExpired = isExpired(bundle.bundle_expires_at, now);
  const dropped: PruneResult["dropped"] = [];
  let changed = false;

  const items: BundleItem[] = bundle.items.map((item) => {
    if (item.type === "credits") {
      const slides = item.slides.map((s) => {
        if (!s.notices) return s;
        const notices = s.notices.filter((n) => !unavailable.has(n.translation_id));
        if (notices.length === s.notices.length) return s;
        changed = true;
        return { ...s, notices };
      });
      return { ...item, slides, translation_ids: item.translation_ids.filter((t) => !unavailable.has(t)) };
    }

    const itemExpired = bundleExpired || (item.expires_at !== null && isExpired(item.expires_at, now));
    let reason: DropReason | null = null;
    const slides = item.slides.map((slide) => {
      if (slide.kind !== "scripture") return slide;
      const revoked = Boolean(slide.translation_id && unavailable.has(slide.translation_id));
      if (!revoked && !itemExpired) return slide;
      reason = revoked ? "revoked" : reason ?? "expired";
      return stripSlide(slide, revoked ? "revoked" : "expired");
    });
    if (!reason) return item;
    changed = true;
    dropped.push({ itemId: item.id, reason });
    return {
      ...item,
      slides,
      translation_ids: itemExpired ? [] : item.translation_ids.filter((t) => !unavailable.has(t)),
    };
  });

  return { bundle: changed ? { ...bundle, items } : bundle, changed, dropped };
}

/**
 * Last line of defense before anything reaches the projector: a scripture
 * slide without its attribution line, or with expired text, is never shown.
 */
export function isShowable(slide: PresenterSlide, bundle: ServiceBundle, now: Date | number = Date.now()): boolean {
  if (slide.kind !== "scripture") return true;
  if (!slide.text || !slide.attribution?.trim()) return false;
  return !isExpired(bundle.bundle_expires_at, now);
}

/** Milliseconds until the bundle should be refetched (a bit before it expires). */
export function msUntilRefresh(bundle: ServiceBundle, now: number = Date.now(), leadMs = 10 * 60 * 1000): number {
  const expires = new Date(bundle.bundle_expires_at).getTime();
  if (Number.isNaN(expires)) return 0;
  return Math.max(0, expires - leadMs - now);
}
