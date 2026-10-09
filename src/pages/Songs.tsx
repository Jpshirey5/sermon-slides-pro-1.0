import { useEffect, useState } from "react";
import { ListMusic, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ServicesHeader } from "@/components/services/ServicesHeader";
import { SongEditorDialog } from "@/components/services/SongEditorDialog";
import { deleteSong, getChurchCcliLicense, listSongs, setChurchCcliLicense, type Song, SONG_SOURCE_LABELS } from "@/lib/songs";

const Songs = () => {
  const [songs, setSongs] = useState<Song[] | null>(null);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<{ songId: string | null } | null>(null);
  const [deleting, setDeleting] = useState<Song | null>(null);
  const [license, setLicense] = useState("");
  const [savedLicense, setSavedLicense] = useState("");
  const [savingLicense, setSavingLicense] = useState(false);

  const load = () =>
    listSongs()
      .then(setSongs)
      .catch((error) => {
        setSongs([]);
        toast.error("Could not load your songs", { description: (error as Error).message });
      });

  useEffect(() => {
    void load();
    getChurchCcliLicense().then((v) => { setLicense(v); setSavedLicense(v); }).catch(() => undefined);
  }, []);

  const saveLicense = async () => {
    setSavingLicense(true);
    try {
      await setChurchCcliLicense(license);
      setSavedLicense(license.trim());
      toast.success("CCLI license number saved");
    } catch (error) {
      toast.error("Could not save", { description: (error as Error).message });
    } finally {
      setSavingLicense(false);
    }
  };

  const q = query.trim().toLowerCase();
  const shown = (songs ?? []).filter((s) => !q || s.title.toLowerCase().includes(q) || s.author.toLowerCase().includes(q) || s.ccliSongNumber.includes(q));

  return (
    <div className="app-shell">
      <ServicesHeader backTo="/dashboard/services" backLabel="Services" />
      <main className="container mx-auto max-w-3xl px-4 py-8">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-serif text-3xl font-semibold text-foreground">Songs</h1>
            <p className="mt-1 text-muted-foreground">
              Your church's song library. Add songs you're licensed to use through CCLI, public domain hymns, and your own songs.
            </p>
          </div>
          <Button variant="hero" onClick={() => setEditing({ songId: null })}>
            <Plus className="h-4 w-4" /> New song
          </Button>
        </div>

        <Card className="mb-6">
          <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="ccli-license">Your church's CCLI license number</Label>
              <Input id="ccli-license" inputMode="numeric" placeholder="1234567" value={license} onChange={(e) => setLicense(e.target.value.replace(/[^0-9]/g, "").slice(0, 12))} />
              <p className="text-xs text-muted-foreground">Shown in the credit line on the first slide of each licensed song.</p>
            </div>
            <Button variant="outline" onClick={() => void saveLicense()} disabled={savingLicense || license.trim() === savedLicense}>
              {savingLicense && <Loader2 className="h-4 w-4 animate-spin" />} Save
            </Button>
          </CardContent>
        </Card>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input aria-label="Search songs" placeholder="Search by title, author, or CCLI number" className="pl-9" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>

        {songs === null ? (
          <div className="flex justify-center py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : songs.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <ListMusic className="mx-auto mb-3 h-8 w-8 text-primary" />
              <p className="font-medium text-foreground">Add your first song</p>
              <p className="mb-5 mt-1 text-sm text-muted-foreground">Paste the lyrics, split them into sections, and they're ready for Sunday.</p>
              <Button onClick={() => setEditing({ songId: null })}><Plus className="h-4 w-4" /> New song</Button>
            </CardContent>
          </Card>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {shown.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setEditing({ songId: s.id })}>
                  <p className="truncate font-medium text-foreground">{s.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[s.author, SONG_SOURCE_LABELS[s.source], s.ccliSongNumber && `CCLI ${s.ccliSongNumber}`].filter(Boolean).join(" · ")}
                  </p>
                </button>
                <Button variant="ghost" size="icon" aria-label={`Delete ${s.title}`} onClick={() => setDeleting(s)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
            {shown.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted-foreground">Nothing matches that search.</li>}
          </ul>
        )}
      </main>

      <SongEditorDialog
        open={editing !== null}
        songId={editing?.songId ?? null}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); void load(); }}
      />

      <AlertDialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.title}?</AlertDialogTitle>
            <AlertDialogDescription>Services that use this song will show it as missing until you replace it.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                const song = deleting;
                setDeleting(null);
                if (!song) return;
                try {
                  await deleteSong(song.id);
                  void load();
                } catch (error) {
                  toast.error("Could not delete the song", { description: (error as Error).message });
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Songs;
