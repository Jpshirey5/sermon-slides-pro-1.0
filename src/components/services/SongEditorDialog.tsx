import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ClipboardPaste, FileUp, Loader2, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import {
  emptySong,
  getSong,
  newSectionId,
  saveSong,
  SECTION_LABEL_SUGGESTIONS,
  slideCount,
  type Song,
  SONG_SOURCE_LABELS,
  type SongSource,
  validateSong,
  getChurchCcliLicense,
  uploadSongBackground,
} from "@/lib/songs";
import { SongBackgroundField } from "./SongBackgroundField";
import { SongTextStyleField } from "./SongTextStyleField";
import { MAX_SONG_TEXT, parseSongText } from "@/lib/song-import";
import { songCredit } from "../../../supabase/functions/_shared/presenter/slides.ts";

const readAsText = (file: File) =>
  typeof file.text === "function"
    ? file.text()
    : new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });

interface SongEditorDialogProps {
  open: boolean;
  /** Null to create a new song. */
  songId: string | null;
  onSaved: (songId: string) => void;
  onClose: () => void;
}

export function SongEditorDialog({ open, songId, onSaved, onClose }: SongEditorDialogProps) {
  const [song, setSong] = useState<Song | null>(null);
  const [saving, setSaving] = useState(false);
  const [showProblems, setShowProblems] = useState(false);
  const [license, setLicense] = useState("");
  useEffect(() => {
    if (open) getChurchCcliLicense().then(setLicense).catch(() => setLicense(""));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setShowProblems(false);
    setPasting(null);
    if (!songId) {
      setSong(emptySong());
      return;
    }
    setSong(null);
    getSong(songId)
      .then((s) => setSong(s ?? emptySong()))
      .catch((error) => {
        toast.error("Could not load the song", { description: (error as Error).message });
        onClose();
      });
  }, [open, songId]); // eslint-disable-line react-hooks/exhaustive-deps

  const [pasting, setPasting] = useState<string | null>(null);
  const [dropping, setDropping] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  /** Fill the song from a whole pasted song or a SongSelect lyrics file. Sections are replaced; details fill in only where blank. */
  const applyImport = (text: string, from: "paste" | "file") => {
    const imported = parseSongText(text);
    if (!imported) {
      toast.error(from === "file" ? "No lyrics found in that file." : "No lyrics found. Paste the whole song, with labels like Verse 1 and Chorus.");
      return false;
    }
    setSong((s) => {
      if (!s) return s;
      const sections = imported.sections.map((x) => ({ id: newSectionId(), label: x.label, lyrics: x.lyrics }));
      return {
        ...s,
        title: s.title.trim() ? s.title : imported.title,
        author: s.author.trim() ? s.author : imported.author,
        ccliSongNumber: s.ccliSongNumber.trim() ? s.ccliSongNumber : imported.ccliSongNumber,
        copyright: s.copyright.trim() ? s.copyright : imported.copyright,
        source: imported.ccliSongNumber ? "licensed" : s.source,
        sections,
        arrangement: imported.arrangement.map((i) => sections[i].id),
      };
    });
    toast.success(
      `${imported.sections.length} section${imported.sections.length === 1 ? "" : "s"} added`,
      { description: imported.fromSongSelect ? "Song details filled in from the SongSelect file." : "Check the section names and the arrangement." },
    );
    return true;
  };

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_SONG_TEXT * 4 || (!/\.(txt|text)$/i.test(file.name) && file.type !== "text/plain")) {
      toast.error("Choose the lyrics .txt file from SongSelect.");
      return;
    }
    applyImport(await readAsText(file), "file");
  };

  const update = (patch: Partial<Song>) => setSong((s) => (s ? { ...s, ...patch } : s));
  const updateSection = (id: string, patch: Partial<Song["sections"][number]>) =>
    setSong((s) => (s ? { ...s, sections: s.sections.map((x) => (x.id === id ? { ...x, ...patch } : x)) } : s));
  const moveSection = (index: number, dir: -1 | 1) =>
    setSong((s) => {
      if (!s) return s;
      const target = index + dir;
      if (target < 0 || target >= s.sections.length) return s;
      const sections = [...s.sections];
      [sections[index], sections[target]] = [sections[target], sections[index]];
      return { ...s, sections };
    });
  const removeSection = (id: string) =>
    setSong((s) => (s ? { ...s, sections: s.sections.filter((x) => x.id !== id), arrangement: s.arrangement.filter((a) => a !== id) } : s));
  const addSection = () =>
    setSong((s) => {
      if (!s) return s;
      const used = new Set(s.sections.map((x) => x.label));
      const label = SECTION_LABEL_SUGGESTIONS.find((l) => !used.has(l)) ?? `Section ${s.sections.length + 1}`;
      return { ...s, sections: [...s.sections, { id: newSectionId(), label, lyrics: "" }] };
    });

  const problems = song ? validateSong(song) : [];

  const handleSave = async () => {
    if (!song) return;
    if (problems.length) {
      setShowProblems(true);
      return;
    }
    setSaving(true);
    try {
      const id = await saveSong(song);
      toast.success("Song saved");
      onSaved(id);
    } catch (error) {
      toast.error("Could not save the song", { description: (error as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const labelOf = (id: string) => song?.sections.find((s) => s.id === id)?.label ?? "";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent
        className={`max-h-[90vh] overflow-y-auto sm:max-w-2xl ${dropping ? "ring-2 ring-primary" : ""}`}
        onDragOver={(e) => {
          if (Array.from(e.dataTransfer.types).includes("Files")) {
            e.preventDefault();
            setDropping(true);
          }
        }}
        onDragLeave={(e) => e.currentTarget === e.target && setDropping(false)}
        onDrop={(e) => {
          if (!e.dataTransfer.files.length) return;
          e.preventDefault();
          setDropping(false);
          void readFile(e.dataTransfer.files[0]);
        }}
      >
        <DialogHeader>
          <DialogTitle>{songId ? "Edit song" : "New song"}</DialogTitle>
          <DialogDescription>
            Enter lyrics your church is licensed to use, a public domain hymn, or your own song. A blank line in the lyrics starts a new slide.
          </DialogDescription>
        </DialogHeader>

        {!song ? (
          <div className="flex justify-center py-10 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : (
          <div className="space-y-5 py-1">
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-border px-3 py-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setPasting("")}>
                <ClipboardPaste className="h-4 w-4" /> Paste whole song
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
                <FileUp className="h-4 w-4" /> Import SongSelect file
              </Button>
              <input
                ref={fileInput}
                type="file"
                accept=".txt,text/plain"
                className="hidden"
                aria-label="SongSelect lyrics file"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  void readFile(file);
                }}
              />
              <span className="text-xs text-muted-foreground">or drop the lyrics .txt file you downloaded from SongSelect here.</span>
            </div>

            {pasting !== null && (
              <div className="space-y-2 rounded-lg border border-border p-3">
                <Label htmlFor="song-paste">Paste the whole song</Label>
                <p className="text-xs text-muted-foreground">
                  Put each section's name on its own line (Verse 1, Chorus, Bridge). A blank line inside a section starts a new slide. This replaces the sections below.
                </p>
                <Textarea
                  id="song-paste"
                  rows={10}
                  className="font-mono text-sm"
                  maxLength={MAX_SONG_TEXT}
                  autoFocus
                  value={pasting}
                  placeholder={"Verse 1\nFirst line\nSecond line\n\nChorus\nChorus line"}
                  onChange={(e) => setPasting(e.target.value)}
                />
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setPasting(null)}>Cancel</Button>
                  <Button type="button" size="sm" disabled={!pasting.trim()} onClick={() => applyImport(pasting, "paste") && setPasting(null)}>
                    Use these lyrics
                  </Button>
                </div>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="song-title">Title</Label>
                <Input id="song-title" value={song.title} maxLength={160} onChange={(e) => update({ title: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="song-author">Author</Label>
                <Input id="song-author" value={song.author} maxLength={200} placeholder="Songwriters" onChange={(e) => update({ author: e.target.value })} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Source</Label>
              <RadioGroup value={song.source} onValueChange={(v) => update({ source: v as SongSource })} className="flex flex-wrap gap-4">
                {(Object.keys(SONG_SOURCE_LABELS) as SongSource[]).map((s) => (
                  <label key={s} className="flex items-center gap-2 text-sm"><RadioGroupItem value={s} /> {SONG_SOURCE_LABELS[s]}</label>
                ))}
              </RadioGroup>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {song.source === "licensed" && (
                <div className="space-y-1.5">
                  <Label htmlFor="song-ccli">CCLI song number</Label>
                  <Input id="song-ccli" inputMode="numeric" value={song.ccliSongNumber} placeholder="7065049" onChange={(e) => update({ ccliSongNumber: e.target.value })} />
                </div>
              )}
              {song.source !== "public_domain" && (
                <div className="space-y-1.5">
                  <Label htmlFor="song-copyright">Copyright</Label>
                  <Input id="song-copyright" value={song.copyright} maxLength={300} placeholder="2016 Example Music" onChange={(e) => update({ copyright: e.target.value })} />
                </div>
              )}
            </div>

            {song.title.trim() && (
              <div className="rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Credit on the first slide: </span>
                {songCredit(
                  { title: song.title, author: song.author || null, copyright: song.copyright || null, ccli_song_number: song.ccliSongNumber || null, source: song.source },
                  license || null,
                )}
                {song.source === "licensed" && !license && " Add your church's CCLI license number on the Songs page."}
              </div>
            )}

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Sections</Label>
                <Button type="button" variant="outline" size="sm" onClick={addSection}><Plus className="h-4 w-4" /> Add section</Button>
              </div>
              <datalist id="section-labels">{SECTION_LABEL_SUGGESTIONS.map((l) => <option key={l} value={l} />)}</datalist>
              {song.sections.map((section, index) => (
                <div key={section.id} className="rounded-lg border border-border p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <Input
                      aria-label="Section name"
                      list="section-labels"
                      className="h-8 max-w-[180px]"
                      value={section.label}
                      onChange={(e) => updateSection(section.id, { label: e.target.value })}
                    />
                    <span className="text-xs text-muted-foreground">
                      {slideCount(section.lyrics)} slide{slideCount(section.lyrics) === 1 ? "" : "s"}
                    </span>
                    <div className="ml-auto flex">
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Move section up" disabled={index === 0} onClick={() => moveSection(index, -1)}><ArrowUp className="h-4 w-4" /></Button>
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Move section down" disabled={index === song.sections.length - 1} onClick={() => moveSection(index, 1)}><ArrowDown className="h-4 w-4" /></Button>
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Remove section" onClick={() => removeSection(section.id)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                  <Textarea
                    aria-label={`${section.label} lyrics`}
                    rows={4}
                    className="font-mono text-sm"
                    value={section.lyrics}
                    onChange={(e) => updateSection(section.id, { lyrics: e.target.value })}
                  />
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <Label>Arrangement</Label>
              <p className="text-xs text-muted-foreground">
                The order you sing it. Leave empty to sing the sections in the order listed. Tap a section to add it; sections can repeat.
              </p>
              <div className="flex min-h-9 flex-wrap gap-1.5 rounded-md border border-dashed border-border p-2">
                {song.arrangement.length === 0 && <span className="text-xs text-muted-foreground">As listed</span>}
                {song.arrangement.map((id, i) => (
                  <span key={`${id}-${i}`} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs text-primary">
                    {labelOf(id)}
                    <button type="button" aria-label={`Remove ${labelOf(id)} from arrangement`} onClick={() => update({ arrangement: song.arrangement.filter((_, j) => j !== i) })}>
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {song.sections.map((s) => (
                  <Button key={s.id} type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => update({ arrangement: [...song.arrangement, s.id] })}>
                    <Plus className="h-3 w-3" /> {s.label || "Section"}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Text</Label>
              <p className="text-xs text-muted-foreground">Every slide of this song uses the same text, so the words don't change size from slide to slide.</p>
              <SongTextStyleField idPrefix="song-text" value={song.textStyle} onChange={(textStyle) => update({ textStyle })} inheritLabel="Church default" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="song-background">Background</Label>
              <SongBackgroundField
                id="song-background"
                color={song.background}
                image={song.backgroundImage}
                onChange={({ color, image }) => update({ background: color, backgroundImage: image })}
                onUpload={(file) => uploadSongBackground(file, song.id || "new-song")}
                emptyText="Uses your church's default song background (set on the Songs page). You can also drag a picture onto this song's slides in a service."
              />
            </div>

            {showProblems && problems.length > 0 && (
              <ul className="list-inside list-disc text-sm text-destructive">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={() => void handleSave()} disabled={!song || saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save song
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
