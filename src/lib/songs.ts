// The church's song library. Lyrics are entered by the church: songs they are
// licensed to use (CCLI), public domain hymns, or their own songs. Sermon
// Slide Pro never supplies lyrics (see CLAUDE.md).

import { supabase } from "@/integrations/supabase/client";
import { ensureResolvedAccountAccess } from "@/lib/account-access";

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
  updatedAt?: string;
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
  };
}

export function newSectionId(): string {
  return `s${Math.random().toString(36).slice(2, 9)}`;
}

function rowToSong(r: {
  id: string; title: string; author: string | null; ccli_song_number: string | null; copyright: string | null;
  source: string; sections: unknown; arrangement: unknown; updated_at?: string;
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
    .select("id, title, author, ccli_song_number, copyright, source, sections, arrangement, updated_at")
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
    .select("id, title, author, ccli_song_number, copyright, source, sections, arrangement, updated_at")
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
