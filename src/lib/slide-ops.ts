// List operations for adding, moving, duplicating, and deleting slides in the
// workspace. They work on index groups because one presenter slide can come
// from several editor slides (a scripture passage split across slides), and
// those must always move together.

import type { SlideData } from "@/lib/slides/types";
import type { SlideEdit } from "@/lib/sermon-slide-edit";
import type { CustomSlide, CustomSlideKind } from "../../supabase/functions/_shared/presenter/slides.ts";

export type { CustomSlide, CustomSlideKind };

const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/**
 * Move the slides at `indexes` (a group) so they sit just before `beforeIndex`
 * (an index in the original list; use list.length for "at the end").
 */
export function moveGroup<T>(list: readonly T[], indexes: readonly number[], beforeIndex: number): T[] {
  const group = [...new Set(indexes)].filter((i) => i >= 0 && i < list.length).sort((a, b) => a - b);
  if (group.length === 0) return [...list];
  const moving = group.map((i) => list[i]);
  const rest = list.filter((_, i) => !group.includes(i));
  const removedBefore = group.filter((i) => i < beforeIndex).length;
  const target = Math.max(0, Math.min(rest.length, beforeIndex - removedBefore));
  return [...rest.slice(0, target), ...moving, ...rest.slice(target)];
}

export function removeGroup<T>(list: readonly T[], indexes: readonly number[]): T[] {
  const drop = new Set(indexes);
  return list.filter((_, i) => !drop.has(i));
}

/** Copies of the group, placed right after it, with fresh ids. */
export function duplicateGroup<T extends { id: string }>(list: readonly T[], indexes: readonly number[]): T[] {
  const group = [...new Set(indexes)].filter((i) => i >= 0 && i < list.length).sort((a, b) => a - b);
  if (group.length === 0) return [...list];
  const copies = group.map((i) => ({ ...structuredClone(list[i]), id: newId("copy") }));
  const after = group[group.length - 1] + 1;
  return [...list.slice(0, after), ...copies, ...list.slice(after)];
}

export function insertAt<T>(list: readonly T[], index: number, items: readonly T[]): T[] {
  const at = Math.max(0, Math.min(list.length, index));
  return [...list.slice(0, at), ...items, ...list.slice(at)];
}

export type NewSermonSlideKind = "title" | "point" | "scripture" | "blank";

/** A new sermon slide, styled like its neighbor so it fits in. */
export function newSermonSlide(kind: NewSermonSlideKind, like?: SlideData): SlideData {
  return {
    id: newId("slide"),
    type: kind,
    content: kind === "title" ? { title: "New title", subtitle: "" } : kind === "point" ? { title: "New point", subtitle: "" } : kind === "scripture" ? { reference: "" } : {},
    background: like?.background ?? "#000000",
    ...(like?.backgroundImage ? { backgroundImage: like.backgroundImage } : {}),
    fontFamily: like?.fontFamily ?? "Georgia",
    textColor: like?.textColor ?? "#FFFFFF",
    lineSpacing: like?.lineSpacing ?? 1.5,
  };
}

export function newCustomSlide(kind: CustomSlideKind, extra: Partial<CustomSlide> = {}): CustomSlide {
  return {
    id: newId("s"),
    kind,
    ...(kind === "title" ? { title: "Welcome" } : kind === "text" ? { title: "Announcements", body: "" } : {}),
    ...extra,
  };
}

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Apply an edit from the slide editor to one custom slide. */
export function applyCustomSlideEdit(list: readonly CustomSlide[], index: number, edit: SlideEdit): { ok: true; slides: CustomSlide[] } | { ok: false; reason: string } {
  const current = list[index];
  if (!current) return { ok: false, reason: "This slide changed since it was loaded. Reload and try again." };
  if (edit.background !== undefined && !HEX.test(edit.background)) return { ok: false, reason: "Pick a background color." };
  const next: CustomSlide = { ...current };
  if (edit.title !== undefined) next.title = edit.title.slice(0, 300);
  if (edit.body !== undefined) next.body = edit.body.slice(0, 2000);
  if (edit.notes !== undefined) {
    const notes = edit.notes.trim();
    if (notes) next.notes = notes.slice(0, 2000);
    else delete next.notes;
  }
  if (edit.background !== undefined) {
    next.background = edit.background;
    next.backgroundImage = null;
  }
  if (edit.backgroundImage !== undefined) next.backgroundImage = edit.backgroundImage || null;
  return { ok: true, slides: list.map((s, i) => (i === index ? next : s)) };
}
