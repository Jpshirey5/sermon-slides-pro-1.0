// Turn service items into presenter slides in two passes:
//   plan:   read sermons and scripture items, keep the pastor's own slides
//           (titles, points, blanks) and turn every scripture slide into a
//           reference to resolve. Verse text saved inside sermons is ignored.
//   render: once references are resolved, fill scripture slides with fresh
//           text and the translation's attribution line.
//
// Pure functions. No database or network access.

import {
  formatReference,
  type NormalizedPassage,
  parseReference,
  passageId,
  validatePassage,
} from "../scripture/references.ts";
import type { PresenterSlide, SlideStyle } from "./types.ts";

export const DEFAULT_STYLE: SlideStyle = {
  background: "#000000",
  fontFamily: "Georgia",
  textColor: "#FFFFFF",
  lineSpacing: 1.5,
};

/** Matches the "balanced" full-passage length in src/lib/slide-generation.ts. */
const PASSAGE_CHUNK_CHARS = 700;

export type ScriptureLayout =
  | { kind: "verse_by_verse" }
  | { kind: "passage" }
  /** Keep the pastor's slide count: split the passage across exactly n slides. */
  | { kind: "fixed"; slides: number };

export interface ScriptureSlot {
  kind: "scripture";
  id: string;
  ref: NormalizedPassage | null;
  /** Raw reference text when it could not be read, for the operator's notice. */
  raw_reference?: string;
  translation_id: string;
  layout: ScriptureLayout;
  /** One style per output slide for "fixed"; otherwise the first is reused. */
  styles: SlideStyle[];
  quote: boolean;
}

export interface StaticSlot {
  kind: "static";
  slide: PresenterSlide;
}

export type SlideSlot = ScriptureSlot | StaticSlot;

// ── reading sermon JSON ─────────────────────────────────────────────────────

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function styleFrom(slide: Json): SlideStyle {
  const bg = str(slide.background);
  return {
    background: bg && bg !== "transparent" ? bg : DEFAULT_STYLE.background,
    backgroundImage: str(slide.backgroundImage) || null,
    fontFamily: str(slide.fontFamily) || DEFAULT_STYLE.fontFamily,
    textColor: str(slide.textColor) || DEFAULT_STYLE.textColor,
    lineSpacing: num(slide.lineSpacing) ?? DEFAULT_STYLE.lineSpacing,
    fontSize: num(slide.fontSize),
  };
}

/** The sermons.slides column holds { formData, editorSlides }, or a legacy shape. */
export function readSermonJson(slides: unknown): { formData: Json | null; editorSlides: Json[] | null } {
  if (Array.isArray(slides)) return { formData: null, editorSlides: slides.filter(isObject) };
  if (!isObject(slides)) return { formData: null, editorSlides: null };
  if ("formData" in slides || "editorSlides" in slides) {
    return {
      formData: isObject(slides.formData) ? slides.formData : null,
      editorSlides: Array.isArray(slides.editorSlides) ? slides.editorSlides.filter(isObject) : null,
    };
  }
  return { formData: "points" in slides ? slides : null, editorSlides: null };
}

/** "(NIV)" at the end of a slide reference, if any. */
function translationTag(reference: string): string | null {
  const m = reference.match(/\(([A-Za-z0-9]+)\)\s*$/);
  return m ? m[1].toUpperCase() : null;
}

export function planSermon(
  sermon: { id: string; title: string; slides: unknown },
  fallbackTranslation: string,
): SlideSlot[] {
  const { formData, editorSlides } = readSermonJson(sermon.slides);
  const sermonTranslation = str(formData?.translation).toUpperCase() || fallbackTranslation;
  const quote = !formData?.proPresenterMode;

  if (editorSlides && editorSlides.length > 0) return planFromEditorSlides(sermon.id, editorSlides, sermonTranslation, quote);
  if (formData) return planFromFormData(sermon, formData, sermonTranslation, quote);
  return [];
}

function planFromEditorSlides(sermonId: string, slides: Json[], translation: string, quote: boolean): SlideSlot[] {
  const out: SlideSlot[] = [];
  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    const content = isObject(slide.content) ? slide.content : {};
    const id = `${sermonId}:${str(slide.id) || i}`;
    const type = str(slide.type);

    if (type === "scripture") {
      const reference = str(content.reference);
      // Consecutive slides with the same reference are one passage split up.
      const styles = [styleFrom(slide)];
      while (
        i + 1 < slides.length &&
        str(slides[i + 1].type) === "scripture" &&
        str((slides[i + 1].content as Json | undefined)?.reference) === reference
      ) {
        styles.push(styleFrom(slides[++i]));
      }
      out.push({
        kind: "scripture",
        id,
        ref: parseReference(reference),
        raw_reference: reference,
        translation_id: translationTag(reference) || translation,
        layout: { kind: "fixed", slides: styles.length },
        styles,
        quote,
      });
      continue;
    }

    out.push({
      kind: "static",
      slide: {
        id,
        kind: type === "title" || type === "point" ? type : "blank",
        title: str(content.title) || undefined,
        subtitle: str(content.subtitle) || undefined,
        style: styleFrom(slide),
      },
    });
  }
  return out;
}

function planFromFormData(sermon: { id: string; title: string }, formData: Json, translation: string, quote: boolean): SlideSlot[] {
  const out: SlideSlot[] = [{
    kind: "static",
    slide: { id: `${sermon.id}:title`, kind: "title", title: str(formData.title) || sermon.title, style: DEFAULT_STYLE },
  }];
  const verseByVerse = str(formData.verseBreakdown) === "verse-by-verse";
  const points = Array.isArray(formData.points) ? formData.points.filter(isObject) : [];

  points.forEach((point, p) => {
    const pointId = `${sermon.id}:p${str(point.id) || p}`;
    const isVerse = str(point.type) === "verse";
    if (!isVerse && str(point.title)) {
      out.push({ kind: "static", slide: { id: pointId, kind: "point", title: str(point.title), style: DEFAULT_STYLE } });
    }
    if (!isVerse && !str(point.title)) return;
    const scriptures = Array.isArray(point.scriptures) ? point.scriptures.filter(isObject) : [];
    scriptures.forEach((s, k) => {
      const reference = str(s.reference);
      if (!reference) return;
      out.push({
        kind: "scripture",
        id: `${pointId}:s${k}`,
        ref: parseReference(reference),
        raw_reference: reference,
        translation_id: translationTag(reference) || translation,
        layout: verseByVerse ? { kind: "verse_by_verse" } : { kind: "passage" },
        styles: [DEFAULT_STYLE],
        quote,
      });
    });
  });
  return out;
}

// ── scripture items ─────────────────────────────────────────────────────────

export function planScriptureItem(
  itemId: string,
  payload: unknown,
  fallbackTranslation: string,
): SlideSlot[] {
  const p = isObject(payload) ? payload : {};
  const translation = str(p.translation_id).toUpperCase() || fallbackTranslation;
  const layout: ScriptureLayout = str(p.layout) === "verse_by_verse" ? { kind: "verse_by_verse" } : { kind: "passage" };
  const style = isObject(p.style) ? styleFrom(p.style) : DEFAULT_STYLE;
  const passages = Array.isArray(p.passages) ? p.passages : [];
  return passages.map((raw, i) => ({
    kind: "scripture" as const,
    id: `${itemId}:${i}`,
    ref: validatePassage(raw) ? { ...raw, verse_end: raw.verse_end ?? raw.verse_start } as NormalizedPassage : null,
    translation_id: translation,
    layout,
    styles: [style],
    quote: false,
  }));
}

// ── rendering ───────────────────────────────────────────────────────────────

export interface ResolvedText {
  verses: { verse: number; text: string }[];
  fums_token: string | null;
  expires_at: string;
}

export interface RenderContext {
  /** Resolved passages by `${translation_id}|${passage_id}`. */
  passages: ReadonlyMap<string, ResolvedText>;
  /** Attribution line by translation id, only for translations we may show. */
  attributions: ReadonlyMap<string, string>;
  /** Why a translation cannot be shown, by translation id. */
  unavailable: ReadonlyMap<string, string>;
}

export const passageKey = (translationId: string, ref: NormalizedPassage) => `${translationId}|${passageId(ref)}`;

/** Split text into exactly `parts` chunks of roughly equal length, on word boundaries. */
export function splitEvenly(text: string, parts: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (parts <= 1 || words.length <= 1) return [words.join(" ")];
  const n = Math.min(parts, words.length);
  // cumulative[i] = length of words[0..i] joined, plus a trailing space.
  const cumulative: number[] = [];
  let running = 0;
  for (const word of words) cumulative.push((running += word.length + 1));
  const total = running;

  // Chunk k ends at the word whose running length is closest to k/n of the
  // total, leaving at least one word for every chunk still to come.
  const ends: number[] = [];
  let previous = -1;
  for (let k = 1; k < n; k++) {
    const goal = (total * k) / n;
    const last = words.length - (n - k) - 1;
    let best = previous + 1;
    for (let i = previous + 1; i <= last; i++) {
      if (Math.abs(cumulative[i] - goal) < Math.abs(cumulative[best] - goal)) best = i;
    }
    ends.push(best);
    previous = best;
  }
  ends.push(words.length - 1);

  let start = 0;
  return ends.map((end) => {
    const chunk = words.slice(start, end + 1).join(" ");
    start = end + 1;
    return chunk;
  });
}

function splitByLength(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  return splitEvenly(text, Math.ceil(text.length / max));
}

function missingSlide(slot: ScriptureSlot, reason: string): PresenterSlide {
  return {
    id: slot.id,
    kind: "missing",
    reference: slot.ref ? `${formatReference(slot.ref)} (${slot.translation_id})` : slot.raw_reference || undefined,
    translation_id: slot.translation_id,
    missing_reason: reason,
    style: slot.styles[0] ?? DEFAULT_STYLE,
  };
}

export function renderSlot(slot: SlideSlot, ctx: RenderContext): { slides: PresenterSlide[]; expires_at: string | null } {
  if (slot.kind === "static") return { slides: [slot.slide], expires_at: null };
  if (!slot.ref) return { slides: [missingSlide(slot, "unreadable_reference")], expires_at: null };

  const unavailable = ctx.unavailable.get(slot.translation_id);
  if (unavailable) return { slides: [missingSlide(slot, unavailable)], expires_at: null };

  const resolved = ctx.passages.get(passageKey(slot.translation_id, slot.ref));
  const attribution = ctx.attributions.get(slot.translation_id);
  if (!resolved || !attribution) return { slides: [missingSlide(slot, "not_found")], expires_at: null };

  const tokens = resolved.fums_token ? [resolved.fums_token] : [];
  const wrap = (t: string) => (slot.quote ? `"${t}"` : t);
  const style = (i: number) => slot.styles[i] ?? slot.styles[slot.styles.length - 1] ?? DEFAULT_STYLE;
  const base = {
    kind: "scripture" as const,
    attribution,
    translation_id: slot.translation_id,
    fums_tokens: tokens,
  };

  if (slot.layout.kind === "verse_by_verse") {
    const bookChapter = formatReference(slot.ref).replace(/:.*$/, "");
    return {
      slides: resolved.verses.map((v, i) => ({
        ...base,
        id: `${slot.id}:v${v.verse}`,
        text: wrap(v.text),
        reference: `${bookChapter}:${v.verse} (${slot.translation_id})`,
        style: style(i),
      })),
      expires_at: resolved.expires_at,
    };
  }

  const fullText = resolved.verses.map((v) => v.text).join(" ");
  const chunks = slot.layout.kind === "fixed"
    ? splitEvenly(fullText, slot.layout.slides)
    : splitByLength(fullText, PASSAGE_CHUNK_CHARS);
  const reference = `${formatReference(slot.ref)} (${slot.translation_id})`;
  return {
    slides: chunks.map((chunk, i) => ({
      ...base,
      id: chunks.length > 1 ? `${slot.id}:c${i}` : slot.id,
      text: wrap(chunk),
      reference,
      style: style(i),
    })),
    expires_at: resolved.expires_at,
  };
}
