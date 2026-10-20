import { useEffect, useState } from "react";
import { Loader2, Plus, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getSong, type Song } from "@/lib/songs";

interface ServiceArrangementDialogProps {
  /** The song section being arranged, or null when closed. */
  target: { songId: string; current: string[] } | null;
  /** Save this service's order. An empty list means "use the song's arrangement". */
  onSave: (arrangement: string[]) => Promise<void>;
  onClose: () => void;
}

/** Set the singing order for one service without changing the song in the library. */
export function ServiceArrangementDialog({ target, onSave, onClose }: ServiceArrangementDialogProps) {
  const [song, setSong] = useState<Song | null>(null);
  const [order, setOrder] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!target) return;
    setSong(null);
    getSong(target.songId)
      .then((s) => {
        if (!s) throw new Error("This song was deleted.");
        setSong(s);
        const known = new Set(s.sections.map((x) => x.id));
        const mine = target.current.filter((id) => known.has(id));
        setOrder(mine.length ? mine : s.arrangement.length ? s.arrangement : s.sections.map((x) => x.id));
      })
      .catch((error) => {
        toast.error("Could not load the song", { description: (error as Error).message });
        onClose();
      });
  }, [target]); // eslint-disable-line react-hooks/exhaustive-deps

  const songDefault = song ? (song.arrangement.length ? song.arrangement : song.sections.map((x) => x.id)) : [];
  const sameAsSong = order.length === songDefault.length && order.every((id, i) => id === songDefault[i]);
  const label = (id: string) => song?.sections.find((s) => s.id === id)?.label ?? "";

  const save = async () => {
    setSaving(true);
    try {
      await onSave(sameAsSong ? [] : order);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={target !== null} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Arrangement for this service</DialogTitle>
          <DialogDescription>
            The order you'll sing {song ? `"${song.title}"` : "this song"} in this service. The song in your library keeps its own arrangement.
          </DialogDescription>
        </DialogHeader>
        {!song ? (
          <div className="flex justify-center py-6 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : (
          <div className="space-y-3">
            <div className="flex min-h-10 flex-wrap gap-1.5 rounded-md border border-dashed border-border p-2" aria-label="Singing order">
              {order.length === 0 && <span className="text-xs text-muted-foreground">Tap the sections below in the order you'll sing them.</span>}
              {order.map((id, i) => (
                <span key={`${id}-${i}`} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs text-primary">
                  {label(id)}
                  <button type="button" aria-label={`Remove ${label(id)} from the order`} onClick={() => setOrder(order.filter((_, j) => j !== i))}>
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {song.sections.map((s) => (
                <Button key={s.id} type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => setOrder([...order, s.id])}>
                  <Plus className="h-3 w-3" /> {s.label}
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="ghost" size="sm" disabled={sameAsSong} onClick={() => setOrder(songDefault)}>
                <RotateCcw className="h-4 w-4" /> Use the song's arrangement
              </Button>
              <Button type="button" variant="ghost" size="sm" disabled={order.length === 0} onClick={() => setOrder([])}>
                Clear
              </Button>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={() => void save()} disabled={!song || saving || order.length === 0}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
