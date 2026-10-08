// Scripture is stored as references, never as verse text (API.Bible licensing,
// see CLAUDE.md). This module is the one place that enforces it:
//
//   stripScriptureText   runs before every save of sermons.slides
//   hydrateScriptureText runs after every load, fetching fresh text
//
// Hydration splits a passage across slides with the same rule the presenter
// uses (splitEvenly), so the editor shows exactly what the projector will.
//
// No "@/" imports: the backfill script (scripts/strip-sermon-scripture.ts)
// runs this file under Deno.

import { parseReference } from "../../supabase/functions/_shared/scripture/references.ts";
import { splitEvenly } from "../../supabase/functions/_shared/presenter/slides.ts";

export interface LookupResult {
  text: string;
  verses?: { text: string; verse: number }[];
}

/** Fetch one passage. `reference` has no translation tag, e.g. "John 3:16-17". */
export type ScriptureLookup = (reference: string, translation: string) => Promise<LookupResult | null>;

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" ? v : "");

const TAG = /\s*\(([A-Za-z0-9]+)\)\s*$/;

/** "John 3:16 (NIV)" -> { base: "John 3:16", tag: "NIV" } */
export function splitTranslationTag(reference: string): { base: string; tag: string | null } {
  const m = reference.match(TAG);
  return m ? { base: reference.replace(TAG, "").trim(), tag: m[1].toUpperCase() } : { base: reference.trim(), tag: null };
}

/** A reference the presenter can resolve. Slides without one keep their text (see strip). */
export function isReadableReference(reference: unknown): boolean {
  return typeof reference === "string" && parseReference(reference) !== null;
}

type Shape = "wrapper" | "slides" | "formData" | "other";

function shapeOf(slides: unknown): Shape {
  if (Array.isArray(slides)) return "slides";
  if (!isObject(slides)) return "other";
  if ("formData" in slides || "editorSlides" in slides) return "wrapper";
  if ("points" in slides) return "formData";
  return "other";
}

function parts(slides: unknown): { formData: Json | null; editorSlides: Json[] | null } {
  switch (shapeOf(slides)) {
    case "slides":
      return { formData: null, editorSlides: (slides as unknown[]).filter(isObject) };
    case "formData":
      return { formData: slides as Json, editorSlides: null };
    case "wrapper": {
      const w = slides as Json;
      return {
        formData: isObject(w.formData) ? w.formData : null,
        editorSlides: Array.isArray(w.editorSlides) ? (w.editorSlides as unknown[]).filter(isObject) : null,
      };
    }
    default:
      return { formData: null, editorSlides: null };
  }
}

function rebuild<T>(original: T, formData: Json | null, editorSlides: Json[] | null): T {
  switch (shapeOf(original)) {
    case "slides":
      return editorSlides as unknown as T;
    case "formData":
      return formData as unknown as T;
    case "wrapper": {
      const w = { ...(original as unknown as Json) };
      if ("formData" in w) w.formData = formData;
      if ("editorSlides" in w) w.editorSlides = editorSlides;
      return w as T;
    }
    default:
      return original;
  }
}

function stripFormData(formData: Json | null): Json | null {
  if (!formData || !Array.isArray(formData.points)) return formData;
  return {
    ...formData,
    points: formData.points.map((point) => {
      if (!isObject(point) || !Array.isArray(point.scriptures)) return point;
      return {
        ...point,
        scriptures: point.scriptures.map((s) => {
          if (!isObject(s) || !isReadableReference(s.reference)) return s;
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { text, verses, ...rest } = s;
          return rest;
        }),
      };
    }),
  };
}

function stripEditorSlides(slides: Json[] | null): Json[] | null {
  if (!slides) return slides;
  return slides.map((slide) => {
    if (str(slide.type) !== "scripture" || !isObject(slide.content)) return slide;
    if (!isReadableReference(slide.content.reference)) return slide;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { scripture, ...content } = slide.content;
    return { ...slide, content };
  });
}

/**
 * Remove verse text before saving. Text is kept only on legacy scripture
 * slides whose reference cannot be read (there is nothing to fetch it again
 * from); the presenter never shows those, and the backfill report lists them.
 */
export function stripScriptureText<T>(slides: T): T {
  const { formData, editorSlides } = parts(slides);
  return rebuild(slides, stripFormData(formData), stripEditorSlides(editorSlides));
}

/** Count what stripping would remove. Used by the backfill dry run. */
export function describeStoredScripture(slides: unknown): { textBlocks: number; unreadableWithText: number } {
  const { formData, editorSlides } = parts(slides);
  let textBlocks = 0;
  let unreadableWithText = 0;
  const count = (hasText: boolean, readable: boolean) => {
    if (!hasText) return;
    if (readable) textBlocks++;
    else unreadableWithText++;
  };
  for (const point of Array.isArray(formData?.points) ? formData!.points as unknown[] : []) {
    if (!isObject(point) || !Array.isArray(point.scriptures)) continue;
    for (const s of point.scriptures) {
      if (isObject(s)) count(Boolean(str(s.text).trim() || (Array.isArray(s.verses) && s.verses.length)), isReadableReference(s.reference));
    }
  }
  for (const slide of editorSlides ?? []) {
    if (str(slide.type) !== "scripture" || !isObject(slide.content)) continue;
    count(Boolean(str(slide.content.scripture).trim()), isReadableReference(slide.content.reference));
  }
  return { textBlocks, unreadableWithText };
}

async function mapLimited<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }));
  return out;
}

export interface HydrateResult<T> {
  slides: T;
  /** References we could not load, as "John 3:16 (NIV)". */
  missing: string[];
}

/**
 * Fill in fresh verse text after loading. Every readable scripture
 * reference is fetched again; any text that happened to be stored is
 * replaced, so what the pastor sees always matches the presenter.
 */
export async function hydrateScriptureText<T>(slides: T, lookup: ScriptureLookup): Promise<HydrateResult<T>> {
  const { formData, editorSlides } = parts(slides);
  const fallback = str(formData?.translation).toUpperCase() || "KJV";
  const quote = !formData?.proPresenterMode;

  const wanted = new Map<string, { base: string; translation: string }>();
  const keyOf = (reference: string, explicit: string | null) => {
    const { base, tag } = splitTranslationTag(reference);
    const translation = explicit || tag || fallback;
    const key = `${base}|${translation}`;
    if (!wanted.has(key)) wanted.set(key, { base, translation });
    return key;
  };

  for (const point of Array.isArray(formData?.points) ? formData!.points as unknown[] : []) {
    if (!isObject(point) || !Array.isArray(point.scriptures)) continue;
    for (const s of point.scriptures) if (isObject(s) && isReadableReference(s.reference)) keyOf(str(s.reference), null);
  }
  for (const slide of editorSlides ?? []) {
    if (str(slide.type) === "scripture" && isObject(slide.content) && isReadableReference(slide.content.reference)) {
      keyOf(str(slide.content.reference), null);
    }
  }

  const entries = [...wanted.entries()];
  const results = await mapLimited(entries, 4, async ([, w]) => {
    try {
      const r = await lookup(w.base, w.translation);
      return r && r.text.trim() ? r : null;
    } catch {
      return null;
    }
  });
  const found = new Map(entries.map(([key], i) => [key, results[i]]));
  const missing = entries.filter(([key]) => !found.get(key)).map(([, w]) => `${w.base} (${w.translation})`);

  const nextFormData = formData && Array.isArray(formData.points)
    ? {
      ...formData,
      points: formData.points.map((point) => {
        if (!isObject(point) || !Array.isArray(point.scriptures)) return point;
        return {
          ...point,
          scriptures: point.scriptures.map((s) => {
            if (!isObject(s) || !isReadableReference(s.reference)) return s;
            const r = found.get(keyOf(str(s.reference), null));
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { text, verses, ...rest } = s;
            return r ? { ...rest, text: r.text, ...(r.verses?.length ? { verses: r.verses } : {}) } : rest;
          }),
        };
      }),
    }
    : formData;

  let nextSlides = editorSlides;
  if (editorSlides) {
    nextSlides = editorSlides.map((slide) => ({ ...slide, content: isObject(slide.content) ? { ...slide.content } : slide.content }));
    for (let i = 0; i < nextSlides.length; i++) {
      const slide = nextSlides[i];
      const content = slide.content as Json;
      if (str(slide.type) !== "scripture" || !isObject(content) || !isReadableReference(content.reference)) continue;
      // Consecutive slides with the same reference are one passage split up.
      const reference = str(content.reference);
      let end = i;
      while (
        end + 1 < nextSlides.length &&
        str(nextSlides[end + 1].type) === "scripture" &&
        str((nextSlides[end + 1].content as Json | undefined)?.reference) === reference
      ) end++;
      const r = found.get(keyOf(reference, null));
      const chunks = r ? splitEvenly(r.text, end - i + 1) : [];
      for (let k = i; k <= end; k++) {
        const c = nextSlides[k].content as Json;
        const chunk = chunks[k - i];
        if (chunk) c.scripture = quote ? `"${chunk}"` : chunk;
        else delete c.scripture;
      }
      i = end;
    }
  }

  return { slides: rebuild(slides, nextFormData, nextSlides), missing };
}
