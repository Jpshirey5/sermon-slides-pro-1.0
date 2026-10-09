// Edit sermon slides from the service workspace. A presenter slide points back
// to the editor slides it came from (source.slide_indexes); this applies an
// edit to those editor slides. The change is saved to the sermon itself, so
// it shows up in the editor and in every service using the sermon.
//
// Verse text is never edited here: for scripture, only the reference changes
// and the presenter fetches the new passage.

import type { SlideData } from "@/lib/slides/types";

export interface SlideEdit {
  title?: string;
  subtitle?: string;
  /** Scripture only. Applies to every slide of the split passage. */
  reference?: string;
  /** Speaker notes. Applies to the first slide of the group only. */
  notes?: string;
  /** Solid background color, applied to every slide in the group. */
  background?: string;
  /** Background picture (a storage ref), or null to remove it. Applied to the group. */
  backgroundImage?: string | null;
  /** Custom slides only: the body text under the title. */
  body?: string;
}

export type EditResult = { ok: true; slides: SlideData[] } | { ok: false; reason: string };

const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * Apply `edit` to the editor slides at `indexes`. Refuses when the sermon has
 * changed so the indexes no longer point at the expected slides (someone
 * edited it elsewhere); the workspace reloads and the pastor tries again.
 */
export function applySlideEdit(
  slides: readonly SlideData[],
  indexes: readonly number[],
  expectedType: SlideData["type"] | "missing",
  edit: SlideEdit,
): EditResult {
  if (indexes.length === 0) return { ok: false, reason: "This slide can't be edited here." };
  const targets = indexes.map((i) => slides[i]);
  if (targets.some((t) => !t || typeof t !== "object")) {
    return { ok: false, reason: "This sermon changed since it was loaded. Reload and try again." };
  }
  const isScripture = targets.every((t) => t.type === "scripture");
  if (expectedType === "missing" ? !isScripture : targets.some((t) => t.type !== expectedType)) {
    return { ok: false, reason: "This sermon changed since it was loaded. Reload and try again." };
  }
  if (edit.background !== undefined && !HEX.test(edit.background)) {
    return { ok: false, reason: "Pick a background color." };
  }
  if (edit.reference !== undefined && !isScripture) {
    return { ok: false, reason: "Only scripture slides have a reference." };
  }

  const next = slides.map((s) => ({ ...s, content: { ...s.content } }));
  indexes.forEach((index, position) => {
    const slide = next[index];
    if (edit.title !== undefined && !isScripture) slide.content.title = edit.title;
    if (edit.subtitle !== undefined && !isScripture) slide.content.subtitle = edit.subtitle;
    if (edit.reference !== undefined) {
      slide.content.reference = edit.reference.trim();
      // The old words belong to the old reference; the presenter fetches the new passage.
      delete slide.content.scripture;
    }
    if (edit.background !== undefined) {
      slide.background = edit.background;
      delete slide.backgroundImage;
    }
    if (edit.backgroundImage !== undefined) {
      if (edit.backgroundImage) slide.backgroundImage = edit.backgroundImage;
      else delete slide.backgroundImage;
    }
    if (edit.notes !== undefined && position === 0) {
      const notes = edit.notes.trim();
      if (notes) slide.notes = notes;
      else delete slide.notes;
    }
  });
  return { ok: true, slides: next };
}
