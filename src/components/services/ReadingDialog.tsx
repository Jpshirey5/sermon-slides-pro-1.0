import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { TranslationSelect } from "@/components/services/TranslationSelect";
import { formatReference, parseReferenceList, type ScriptureLayout, type ScripturePayload } from "@/lib/services";

export interface ReadingDraft {
  text: string;
  translation: string | null;
  layout: ScriptureLayout;
}

interface ReadingDialogProps {
  open: boolean;
  /** Null for a new reading. */
  initial: ReadingDraft | null;
  onSave: (payload: ScripturePayload) => void;
  onClose: () => void;
}

/** Add or edit a scripture reading. Stores references only; text is fetched when presenting. */
export function ReadingDialog({ open, initial, onSave, onClose }: ReadingDialogProps) {
  const [draft, setDraft] = useState<ReadingDraft>({ text: "", translation: null, layout: "passage" });
  useEffect(() => {
    if (open) setDraft(initial ?? { text: "", translation: null, layout: "passage" });
  }, [open, initial]);

  const parsed = parseReferenceList(draft.text);
  const canSave = parsed.passages.length > 0 && parsed.unreadable.length === 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit reading" : "Add a reading"}</DialogTitle>
          <DialogDescription>We fetch the text when you present, so it's always current.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="reading-refs">References</Label>
            <Textarea
              id="reading-refs"
              rows={3}
              placeholder="John 3:16-18; Romans 8:28"
              value={draft.text}
              onChange={(e) => setDraft({ ...draft, text: e.target.value })}
            />
            {parsed.unreadable.length > 0 ? (
              <p className="text-xs text-destructive">We couldn't read: {parsed.unreadable.join("; ")}. Try a form like John 3:16-18.</p>
            ) : parsed.passages.length > 0 ? (
              <p className="text-xs text-muted-foreground">{parsed.passages.map(formatReference).join("; ")}</p>
            ) : (
              <p className="text-xs text-muted-foreground">One passage per line, or separate them with semicolons.</p>
            )}
          </div>
          <div className="space-y-2">
            <Label>Translation</Label>
            <TranslationSelect allowDefault value={draft.translation} onChange={(v) => setDraft({ ...draft, translation: v })} />
          </div>
          <div className="space-y-2">
            <Label>Slides</Label>
            <RadioGroup value={draft.layout} onValueChange={(v) => setDraft({ ...draft, layout: v as ScriptureLayout })} className="grid gap-2">
              <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="passage" /> Full passage</label>
              <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="verse_by_verse" /> One verse per slide</label>
            </RadioGroup>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!canSave}
            onClick={() => onSave({ passages: parsed.passages, translation_id: draft.translation, layout: draft.layout })}
          >
            {initial ? "Save" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
