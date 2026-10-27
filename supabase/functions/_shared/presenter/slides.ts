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
import type { PresenterSlide, SlideStyle, TextPosition } from "./types.ts";

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
  /** Speaker notes per output slide (fixed layout) or for the whole passage. */
  notes?: (string | undefined)[];
  /** Where the slides came from in the sermon, for editing. */
  source?: { sermon_id: string; slide_indexes: number[] };
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
      const notes = [str(slide.notes) || undefined];
      const indexes = [i];
      while (
        i + 1 < slides.length &&
        str(slides[i + 1].type) === "scripture" &&
        str((slides[i + 1].content as Json | undefined)?.reference) === reference
      ) {
        styles.push(styleFrom(slides[++i]));
        notes.push(str(slides[i].notes) || undefined);
        indexes.push(i);
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
        notes,
        source: { sermon_id: sermonId, slide_indexes: indexes },
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
        notes: str(slide.notes) || undefined,
        source: { sermon_id: sermonId, slide_indexes: [i] },
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
    ...(slot.source ? { source: slot.source } : {}),
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
    ...(slot.source ? { source: slot.source } : {}),
  };
  const notesFor = (i: number) => slot.notes?.[Math.min(i, slot.notes.length - 1)] || undefined;

  if (slot.layout.kind === "verse_by_verse") {
    const bookChapter = formatReference(slot.ref).replace(/:.*$/, "");
    return {
      slides: resolved.verses.map((v, i) => ({
        ...base,
        id: `${slot.id}:v${v.verse}`,
        text: wrap(v.text),
        reference: `${bookChapter}:${v.verse} (${slot.translation_id})`,
        notes: notesFor(i),
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
      notes: notesFor(i),
      style: style(i),
    })),
    expires_at: resolved.expires_at,
  };
}

// ── songs ───────────────────────────────────────────────────────────────────

export interface SongRow {
  id: string;
  title: string;
  author: string | null;
  ccli_song_number: string | null;
  copyright: string | null;
  source: "licensed" | "public_domain" | "original";
  sections: unknown;
  arrangement: unknown;
  background?: string | null;
  background_image?: string | null;
  text_style?: unknown;
}

// ── song text style ─────────────────────────────────────────────────────────

export type SongTextSize = "auto" | "small" | "medium" | "large" | "xlarge";

export interface SongTextStyle {
  fontFamily?: string;
  size?: SongTextSize;
  textColor?: string;
  position?: TextPosition;
}

/** Text sizes in percent of slide width. */
export const SONG_TEXT_SIZES: Record<Exclude<SongTextSize, "auto">, number> = { small: 3.6, medium: 4.6, large: 5.6, xlarge: 6.6 };
const TEXT_POSITIONS: readonly TextPosition[] = ["top", "center", "bottom"];

export const isTextPosition = (v: unknown): v is TextPosition => TEXT_POSITIONS.includes(v as TextPosition);

/** Read a stored text style, keeping only valid values. */
export function readSongTextStyle(raw: unknown): SongTextStyle {
  const r = isObject(raw) ? raw : {};
  const out: SongTextStyle = {};
  const font = str(r.fontFamily).trim();
  if (font && font.length <= 80 && /^[A-Za-z0-9 '-]+$/.test(font)) out.fontFamily = font;
  if (r.size === "auto" || (typeof r.size === "string" && r.size in SONG_TEXT_SIZES)) out.size = r.size as SongTextSize;
  if (HEX_COLOR.test(str(r.textColor))) out.textColor = str(r.textColor);
  if (isTextPosition(r.position)) out.position = r.position;
  return out;
}

/** One size for a whole song, picked to fit its fullest slide, so the words don't change size between slides. */
export function autoLyricsSize(stanzas: readonly string[]): number {
  const sizeFor = (text: string) => {
    const lines = text.split("\n");
    const longest = Math.max(...lines.map((l) => l.length), 0);
    if (lines.length <= 2 && longest < 32) return 5.6;
    if (lines.length <= 4 && longest < 40) return 4.6;
    return 3.6;
  };
  return stanzas.length ? Math.min(...stanzas.map(sizeFor)) : 4.6;
}

/** A background for song slides: the church's default, or one song's own. */
export interface SongBackground {
  background?: string | null;
  background_image?: string | null;
  /** Font, size, color, and position (see readSongTextStyle). */
  text_style?: unknown;
}

const HEX_BG = /^#[0-9a-fA-F]{6}$/;

/** The song's own background if it has one, else the church default, else black. */
export function songStyle(song: SongBackground, churchDefault: SongBackground | null): SlideStyle {
  const own = Boolean(song.background || song.background_image);
  const pick = own ? song : churchDefault ?? {};
  // Text style: each setting the song has wins, then the church's, then the default.
  const text = { ...readSongTextStyle(churchDefault?.text_style), ...readSongTextStyle(song.text_style) };
  return {
    ...DEFAULT_STYLE,
    background: pick.background && HEX_BG.test(pick.background) ? pick.background : DEFAULT_STYLE.background,
    backgroundImage: pick.background_image || null,
    fontFamily: text.fontFamily ?? DEFAULT_STYLE.fontFamily,
    textColor: text.textColor ?? DEFAULT_STYLE.textColor,
    ...(text.size && text.size !== "auto" ? { fontSize: SONG_TEXT_SIZES[text.size] } : {}),
    ...(text.position ? { textPosition: text.position } : {}),
  };
}

interface SongSection {
  id: string;
  label: string;
  lyrics: string;
}

function readSections(raw: unknown): SongSection[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isObject).map((s, i) => ({
    id: str(s.id) || `s${i}`,
    label: str(s.label) || `Section ${i + 1}`,
    lyrics: str(s.lyrics),
  }));
}

/** The order sections are sung in: the arrangement if set, otherwise as listed. */
/**
 * Sections in singing order. A service's own arrangement (from the service
 * item) wins over the song's saved one; either way, ids that no longer match
 * a section are skipped.
 */
export function songOrder(song: Pick<SongRow, "sections" | "arrangement">, serviceArrangement?: unknown): SongSection[] {
  const sections = readSections(song.sections);
  const byId = new Map(sections.map((s) => [s.id, s]));
  const pick = (list: unknown) => (Array.isArray(list) ? list.map((x) => str(x)).filter((id) => byId.has(id)) : []);
  const forService = pick(serviceArrangement);
  const arrangement = forService.length ? forService : pick(song.arrangement);
  return arrangement.length ? arrangement.map((id) => byId.get(id)!) : sections;
}

/** Song credit line for the first slide, as CCLI asks churches to show. */
export function songCredit(song: Pick<SongRow, "title" | "author" | "copyright" | "ccli_song_number" | "source">, ccliLicense: string | null): string {
  const parts = [`"${song.title.trim()}"`];
  if (song.author?.trim()) parts.push(song.author.trim());
  if (song.source === "public_domain") {
    parts.push("Public domain");
  } else if (song.source === "original") {
    if (song.copyright?.trim()) parts.push(song.copyright.trim());
  } else {
    if (song.copyright?.trim()) parts.push(song.copyright.trim());
    if (song.ccli_song_number?.trim()) parts.push(`CCLI Song # ${song.ccli_song_number.trim()}`);
    if (ccliLicense?.trim()) parts.push(`CCLI License # ${ccliLicense.trim()}`);
  }
  return parts.join(". ").replace(/\.\./g, ".") + ".";
}

/** One slide per stanza: a blank line in a section's lyrics starts a new slide. */
export function planSong(
  itemId: string,
  song: SongRow,
  ccliLicense: string | null,
  options: { churchBackground?: SongBackground | null; serviceArrangement?: unknown } = {},
): SlideSlot[] {
  const credit = songCredit(song, ccliLicense);
  const order = songOrder(song, options.serviceArrangement);
  const stanzasOf = (lyrics: string) => lyrics.replace(/\r\n/g, "\n").split(/\n\s*\n/).map((t) => t.trim()).filter(Boolean);
  const base = songStyle(song, options.churchBackground ?? null);
  // Same size on every slide of the song.
  const style: SlideStyle = { ...base, fontSize: base.fontSize ?? autoLyricsSize(order.flatMap((s) => stanzasOf(s.lyrics))) };
  const slots: SlideSlot[] = [];
  order.forEach((section, sectionIndex) => {
    const stanzas = stanzasOf(section.lyrics);
    stanzas.forEach((text, stanzaIndex) => {
      slots.push({
        kind: "static",
        slide: {
          id: `${itemId}:${sectionIndex}:${stanzaIndex}`,
          kind: "lyrics",
          text,
          label: section.label,
          ...(slots.length === 0 ? { credit } : {}),
          style,
        },
      });
    });
  });
  return slots;
}

// ── custom Slides items ─────────────────────────────────────────────────────

export type CustomSlideKind = "title" | "text" | "graphic" | "blank" | "video";

export interface CustomSlide {
  id: string;
  kind: CustomSlideKind;
  title?: string;
  body?: string;
  background?: string;
  backgroundImage?: string | null;
  textColor?: string;
  fontFamily?: string;
  notes?: string;
  /** Video slides: a video from the church's library. */
  media_id?: string;
  loop?: boolean;
  end_action?: "hold" | "clear" | "next";
}

const CUSTOM_KINDS: readonly CustomSlideKind[] = ["title", "text", "graphic", "blank", "video"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/** Read the slides list stored on a Slides item, dropping anything malformed. */
export function readCustomSlides(payload: unknown): CustomSlide[] {
  const p = isObject(payload) ? payload : {};
  if (!Array.isArray(p.slides)) return [];
  return p.slides.filter(isObject).slice(0, 200).map((s, i) => ({
    id: str(s.id) || `c${i}`,
    kind: CUSTOM_KINDS.includes(s.kind as CustomSlideKind) ? (s.kind as CustomSlideKind) : "text",
    title: str(s.title).slice(0, 300) || undefined,
    body: str(s.body).slice(0, 2000) || undefined,
    background: HEX_COLOR.test(str(s.background)) ? str(s.background) : undefined,
    backgroundImage: str(s.backgroundImage) || null,
    textColor: HEX_COLOR.test(str(s.textColor)) ? str(s.textColor) : undefined,
    fontFamily: str(s.fontFamily).slice(0, 80) || undefined,
    notes: str(s.notes).slice(0, 2000) || undefined,
    ...(s.kind === "video"
      ? {
        media_id: UUID.test(str(s.media_id)) ? str(s.media_id) : undefined,
        loop: s.loop === true,
        end_action: s.end_action === "clear" || s.end_action === "next" ? s.end_action : "hold",
      }
      : {}),
  }));
}

/** Library videos used by video slides in a Blank slide section. */
export function customSlideMediaIds(payload: unknown): string[] {
  return readCustomSlides(payload).flatMap((s) => (s.kind === "video" && s.media_id ? [s.media_id] : []));
}

export function planCustomSlides(itemId: string, payload: unknown, media: ReadonlyMap<string, MediaRow> = new Map()): SlideSlot[] {
  return readCustomSlides(payload).map((s, i) => {
    const source = { item_id: itemId, slide_indexes: [i] };
    if (s.kind === "video") {
      const m = s.media_id ? media.get(s.media_id) : undefined;
      if (!m) {
        return { kind: "static" as const, slide: { id: `${itemId}:${s.id}`, kind: "missing" as const, missing_reason: "video_deleted" as const, source, notes: s.notes, style: { ...DEFAULT_STYLE, background: "#000000" } } };
      }
      return { kind: "static" as const, slide: { ...videoSlide(`${itemId}:${s.id}`, m, { loop: s.loop, end_action: s.end_action }), notes: s.notes, source } };
    }
    const style: SlideStyle = {
      background: s.background ?? DEFAULT_STYLE.background,
      backgroundImage: s.backgroundImage,
      fontFamily: s.fontFamily ?? DEFAULT_STYLE.fontFamily,
      textColor: s.textColor ?? DEFAULT_STYLE.textColor,
      lineSpacing: DEFAULT_STYLE.lineSpacing,
    };
    const kind = s.kind === "text" ? "point" : s.kind;
    return {
      kind: "static" as const,
      slide: {
        id: `${itemId}:${s.id}`,
        kind,
        title: s.kind === "graphic" || s.kind === "blank" ? undefined : s.title,
        subtitle: s.kind === "text" || s.kind === "title" ? s.body : undefined,
        notes: s.notes,
        source,
        style,
      },
    };
  });
}

// ── video items ─────────────────────────────────────────────────────────────

export interface MediaRow {
  id: string;
  storage_path: string;
  file_name: string;
  duration_seconds: number | string | null;
}

export function planVideo(itemId: string, media: MediaRow, payload: unknown): SlideSlot[] {
  return [{ kind: "static", slide: videoSlide(`${itemId}:video`, media, payload) }];
}

function videoSlide(id: string, media: MediaRow, payload: unknown): PresenterSlide {
  const p = isObject(payload) ? payload : {};
  const endAction = p.end_action === "clear" || p.end_action === "next" ? p.end_action : "hold";
  const duration = media.duration_seconds === null ? null : Number(media.duration_seconds);
  return {
    id,
    kind: "video",
    title: media.file_name,
    video: {
      media_id: media.id,
      storage_path: media.storage_path,
      duration_seconds: duration !== null && Number.isFinite(duration) ? duration : null,
      loop: p.loop === true,
      end_action: endAction,
    },
    style: { ...DEFAULT_STYLE, background: "#000000" },
  };
}
