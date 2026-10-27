// The church's song library. Lyrics are entered by the church: songs they are
// licensed to use (CCLI), public domain hymns, or their own songs. Sermon
// Slide Pro never supplies lyrics (see CLAUDE.md).

import { supabase } from "@/integrations/supabase/client";
import { ensureResolvedAccountAccess } from "@/lib/account-access";
import { uploadPresentationBackground } from "@/lib/background-assets";
import { readSongTextStyle, type SongTextStyle } from "../../supabase/functions/_shared/presenter/slides.ts";

export type { SongTextStyle };

export type SongSource = "licensed" | "public_domain" | "original";

export interface SongSection {
  id: string;
  label: string;
  /** A blank line starts a new slide. */
  lyrics: string;
}

export interface Song {
  id: string;
  title: string;
  author: string;
  ccliSongNumber: string;
  copyright: string;
  source: SongSource;
  sections: SongSection[];
  /** Section ids in singing order; repeats allowed. Empty means "as listed". */
  arrangement: string[];
  /** This song's own background. Both empty means "use the church default". */
  background: string;
  backgroundImage: string | null;
  /** Font, size, color, and position. Anything not set uses the church default. */
  textStyle: SongTextStyle;
  updatedAt?: string;
}

/** The church's default background for every song without its own. */
export interface SongBackgroundSetting {
  background: string;
  backgroundImage: string | null;
}

export const SONG_SOURCE_LABELS: Record<SongSource, string> = {
  licensed: "Licensed (CCLI)",
  public_domain: "Public domain",
  original: "Original song",
};

export const SECTION_LABEL_SUGGESTIONS = ["Verse 1", "Verse 2", "Verse 3", "Verse 4", "Chorus", "Pre-chorus", "Bridge", "Tag", "Intro", "Ending"];

async function requireAccountId(): Promise<string> {
  const access = await ensureResolvedAccountAccess();
  if (!access.accountId) throw new Error("You need to be signed in to a church account.");
  return access.accountId;
}

function fail(action: string, error: { message: string } | null): asserts error is null {
  if (error) throw new Error(`Could not ${action}: ${error.message}`);
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

export function emptySong(): Song {
  return {
    id: "",
    title: "",
    author: "",
    ccliSongNumber: "",
    copyright: "",
    source: "licensed",
    sections: [{ id: newSectionId(), label: "Verse 1", lyrics: "" }, { id: newSectionId(), label: "Chorus", lyrics: "" }],
    arrangement: [],
    background: "",
    backgroundImage: null,
    textStyle: {},
  };
}

export function newSectionId(): string {
  return `s${Math.random().toString(36).slice(2, 9)}`;
}

function rowToSong(r: {
  id: string; title: string; author: string | null; ccli_song_number: string | null; copyright: string | null;
  source: string; sections: unknown; arrangement: unknown; updated_at?: string;
  background?: string | null; background_image?: string | null; text_style?: unknown;
}): Song {
  const sections = Array.isArray(r.sections)
    ? r.sections.filter((s): s is Record<string, unknown> => Boolean(s) && typeof s === "object").map((s, i) => ({
      id: str(s.id) || `s${i}`,
      label: str(s.label) || `Section ${i + 1}`,
      lyrics: str(s.lyrics),
    }))
    : [];
  const ids = new Set(sections.map((s) => s.id));
  return {
    id: r.id,
    title: r.title,
    author: r.author ?? "",
    ccliSongNumber: r.ccli_song_number ?? "",
    copyright: r.copyright ?? "",
    source: (["licensed", "public_domain", "original"].includes(r.source) ? r.source : "licensed") as SongSource,
    sections,
    arrangement: Array.isArray(r.arrangement) ? r.arrangement.map(str).filter((id) => ids.has(id)) : [],
    background: r.background ?? "",
    backgroundImage: r.background_image ?? null,
    textStyle: readSongTextStyle(r.text_style),
    updatedAt: r.updated_at,
  };
}

/** Problems that block saving, in plain language. Empty means it can be saved. */
export function validateSong(song: Song): string[] {
  const problems: string[] = [];
  if (!song.title.trim()) problems.push("Add a title.");
  if (song.ccliSongNumber.trim() && !/^[0-9]{1,12}$/.test(song.ccliSongNumber.trim())) problems.push("The CCLI song number should be digits only.");
  if (!song.sections.some((s) => s.lyrics.trim())) problems.push("Add lyrics to at least one section.");
  if (song.sections.some((s) => !s.label.trim())) problems.push("Give every section a name.");
  return problems;
}

/** How many slides each section makes (a blank line starts a new slide). */
export function slideCount(lyrics: string): number {
  return lyrics.replace(/\r\n/g, "\n").split(/\n\s*\n/).filter((t) => t.trim()).length;
}

export async function listSongs(): Promise<Song[]> {
  const accountId = await requireAccountId();
  const { data, error } = await supabase
    .from("songs")
    .select("id, title, author, ccli_song_number, copyright, source, sections, arrangement, background, background_image, text_style, updated_at")
    .eq("account_id", accountId)
    .is("archived_at", null)
    .order("title", { ascending: true })
    .limit(1000);
  fail("load songs", error);
  return (data ?? []).map(rowToSong);
}

export async function getSong(id: string): Promise<Song | null> {
  const { data, error } = await supabase
    .from("songs")
    .select("id, title, author, ccli_song_number, copyright, source, sections, arrangement, background, background_image, text_style, updated_at")
    .eq("id", id)
    .maybeSingle();
  fail("load the song", error);
  return data ? rowToSong(data) : null;
}

/** Create or update. Returns the song id. */
export async function saveSong(song: Song): Promise<string> {
  const problems = validateSong(song);
  if (problems.length) throw new Error(problems.join(" "));
  const accountId = await requireAccountId();
  const access = await ensureResolvedAccountAccess();
  const fields = {
    title: song.title.trim(),
    author: song.author.trim() || null,
    ccli_song_number: song.source === "licensed" ? song.ccliSongNumber.trim() || null : null,
    copyright: song.copyright.trim() || null,
    source: song.source,
    sections: song.sections.map((s) => ({ id: s.id, label: s.label.trim(), lyrics: s.lyrics.replace(/\r\n/g, "\n").trimEnd() })),
    arrangement: song.arrangement.filter((id) => song.sections.some((s) => s.id === id)),
    background: /^#[0-9a-fA-F]{6}$/.test(song.background) ? song.background : null,
    background_image: song.backgroundImage || null,
    text_style: readSongTextStyle(song.textStyle) as never,
  };
  if (song.id) {
    const { error } = await supabase.from("songs").update(fields).eq("id", song.id);
    fail("save the song", error);
    return song.id;
  }
  const { data, error } = await supabase
    .from("songs")
    .insert({ ...fields, account_id: accountId, created_by_user_id: access.userId })
    .select("id")
    .single();
  fail("save the song", error);
  return data.id;
}

export async function deleteSong(id: string): Promise<void> {
  const { error } = await supabase.from("songs").delete().eq("id", id);
  fail("delete the song", error);
}

export async function getChurchCcliLicense(): Promise<string> {
  const accountId = await requireAccountId();
  const { data, error } = await supabase.from("accounts").select("ccli_license_number").eq("id", accountId).maybeSingle();
  fail("load the CCLI license number", error);
  return (data as { ccli_license_number: string | null } | null)?.ccli_license_number ?? "";
}

/** Only church owners can change it (account settings are owner-only). */
export async function setChurchCcliLicense(value: string): Promise<void> {
  const accountId = await requireAccountId();
  const trimmed = value.trim();
  if (trimmed && !/^[0-9]{1,12}$/.test(trimmed)) throw new Error("The CCLI license number should be digits only.");
  const { data, error } = await supabase
    .from("accounts")
    .update({ ccli_license_number: trimmed || null })
    .eq("id", accountId)
    .select("id");
  fail("save the CCLI license number", error);
  if (!data || data.length === 0) throw new Error("Only the church owner can change the CCLI license number.");
}

/** Set just one song's background (from dropping a picture on its slides). */
export async function setSongBackground(songId: string, bg: { background?: string | null; backgroundImage?: string | null }): Promise<void> {
  const update: { background?: string | null; background_image?: string | null } = {};
  if (bg.background !== undefined) update.background = bg.background;
  if (bg.backgroundImage !== undefined) update.background_image = bg.backgroundImage;
  const { error } = await supabase.from("songs").update(update).eq("id", songId);
  fail("save the song background", error);
}

export async function getChurchSongBackground(): Promise<SongBackgroundSetting> {
  const accountId = await requireAccountId();
  const { data, error } = await supabase.from("accounts").select("song_background, song_background_image").eq("id", accountId).maybeSingle();
  fail("load the song background", error);
  const row = data as { song_background: string | null; song_background_image: string | null } | null;
  return { background: row?.song_background ?? "", backgroundImage: row?.song_background_image ?? null };
}

/** Only church owners can change it (account settings are owner-only). */
export async function setChurchSongBackground(value: SongBackgroundSetting): Promise<void> {
  const accountId = await requireAccountId();
  const { data, error } = await supabase
    .from("accounts")
    .update({
      song_background: /^#[0-9a-fA-F]{6}$/.test(value.background) ? value.background : null,
      song_background_image: value.backgroundImage || null,
    })
    .eq("id", accountId)
    .select("id");
  fail("save the song background", error);
  if (!data || data.length === 0) throw new Error("Only the church owner can change the default song background.");
}

/** Upload a picture for song backgrounds. Returns its storage ref. */
export async function uploadSongBackground(file: File, key: string): Promise<string> {
  const accountId = await requireAccountId();
  return uploadPresentationBackground({ file, accountId, presentationId: "songs", slideId: key.replace(/[^A-Za-z0-9-]/g, "") || "song" });
}

const localDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Record that a song was shown in a service today (once per song per service per day). */
export async function recordSongUse(serviceId: string, songId: string): Promise<void> {
  const { error } = await supabase.rpc("record_song_use", { _service_id: serviceId, _song_id: songId, _used_on: localDate() });
  fail("record the song for CCLI reporting", error);
}

export interface SongUse {
  id: string;
  usedOn: string;
  title: string;
  author: string;
  copyright: string;
  ccliSongNumber: string;
  source: SongSource;
  serviceId: string | null;
  serviceTitle: string;
}

/** Song uses between two dates (inclusive, YYYY-MM-DD), newest first. */
export async function listSongUses(from: string, to: string): Promise<SongUse[]> {
  const accountId = await requireAccountId();
  const { data, error } = await supabase
    .from("song_usage")
    .select("id, used_on, title, author, copyright, ccli_song_number, source, service_id, services(title)")
    .eq("account_id", accountId)
    .gte("used_on", from)
    .lte("used_on", to)
    .order("used_on", { ascending: false })
    .limit(5000);
  fail("load song use", error);
  return ((data ?? []) as Array<{
    id: string; used_on: string; title: string; author: string | null; copyright: string | null; ccli_song_number: string | null;
    source: string; service_id: string | null; services: { title: string } | null;
  }>).map((r) => ({
    id: r.id,
    usedOn: r.used_on,
    title: r.title,
    author: r.author ?? "",
    copyright: r.copyright ?? "",
    ccliSongNumber: r.ccli_song_number ?? "",
    source: (["licensed", "public_domain", "original"].includes(r.source) ? r.source : "licensed") as SongSource,
    serviceId: r.service_id,
    serviceTitle: r.services?.title ?? "Deleted service",
  }));
}

export async function deleteSongUse(id: string): Promise<void> {
  const { error } = await supabase.from("song_usage").delete().eq("id", id);
  fail("remove the song use", error);
}

export interface SongReportRow {
  title: string;
  author: string;
  copyright: string;
  ccliSongNumber: string;
  /** Services the song was used in during the period. */
  uses: number;
  lastUsed: string;
}

/**
 * Totals per song for the CCLI report. Only licensed songs are reported to
 * CCLI; public domain and original songs come back separately.
 */
export function summarizeSongUses(uses: readonly SongUse[]): { report: SongReportRow[]; notReported: SongReportRow[] } {
  const groups = new Map<string, { row: SongReportRow; licensed: boolean }>();
  for (const u of uses) {
    const key = u.ccliSongNumber ? `ccli:${u.ccliSongNumber}` : `title:${u.title.trim().toLowerCase()}`;
    const g = groups.get(key);
    if (g) {
      g.row.uses += 1;
      if (u.usedOn > g.row.lastUsed) g.row.lastUsed = u.usedOn;
    } else {
      groups.set(key, {
        licensed: u.source === "licensed",
        row: { title: u.title, author: u.author, copyright: u.copyright, ccliSongNumber: u.ccliSongNumber, uses: 1, lastUsed: u.usedOn },
      });
    }
  }
  const byUses = (a: SongReportRow, b: SongReportRow) => b.uses - a.uses || a.title.localeCompare(b.title);
  const all = [...groups.values()];
  return {
    report: all.filter((g) => g.licensed).map((g) => g.row).sort(byUses),
    notReported: all.filter((g) => !g.licensed).map((g) => g.row).sort(byUses),
  };
}

/** The report as CSV, for the church's own records or to copy from. Titles and numbers only, never lyrics. */
export function songReportCsv(rows: readonly SongReportRow[]): string {
  const cell = (v: string | number) => {
    const t = String(v);
    const safe = /^[=+\-@]/.test(t) ? `'${t}` : t;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const lines = [["Title", "CCLI Song Number", "Authors", "Copyright", "Times Used", "Last Used"]];
  for (const r of rows) lines.push([r.title, r.ccliSongNumber, r.author, r.copyright, String(r.uses), r.lastUsed]);
  return lines.map((l) => l.map(cell).join(",")).join("\n") + "\n";
}

export async function getChurchSongTextStyle(): Promise<SongTextStyle> {
  const accountId = await requireAccountId();
  const { data, error } = await supabase.from("accounts").select("song_text_style").eq("id", accountId).maybeSingle();
  fail("load the song text style", error);
  return readSongTextStyle((data as { song_text_style: unknown } | null)?.song_text_style);
}

/** Only church owners can change it (account settings are owner-only). */
export async function setChurchSongTextStyle(style: SongTextStyle): Promise<void> {
  const accountId = await requireAccountId();
  const { data, error } = await supabase
    .from("accounts")
    .update({ song_text_style: readSongTextStyle(style) as never })
    .eq("id", accountId)
    .select("id");
  fail("save the song text style", error);
  if (!data || data.length === 0) throw new Error("Only the church owner can change the default song text style.");
}
