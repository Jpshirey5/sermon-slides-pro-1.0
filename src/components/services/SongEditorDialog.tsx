import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2, X } from "lucide-react";
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
} from "@/lib/songs";
import { songCredit } from "../../../supabase/functions/_shared/presenter/slides.ts";

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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
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
