import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { SlideEdit } from "@/lib/sermon-slide-edit";
import type { PresenterSlide } from "@/presenter/core/types";

interface SlideEditDialogProps {
  slide: PresenterSlide | null;
  onSave: (edit: SlideEdit) => Promise<void>;
  onClose: () => void;
}

const toHex = (value: string) => (/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000");

/** Edit one sermon slide in place. Changes are saved to the sermon itself. */
export function SlideEditDialog({ slide, onSave, onClose }: SlideEditDialogProps) {
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [background, setBackground] = useState("#000000");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!slide) return;
    setTitle(slide.title ?? "");
    setSubtitle(slide.subtitle ?? "");
    setReference(slide.reference ?? "");
    setNotes(slide.notes ?? "");
    setBackground(toHex(slide.style.background));
    setSaving(false);
  }, [slide]);

  const isScripture = slide?.kind === "scripture" || slide?.kind === "missing";
  const isText = slide?.kind === "title" || slide?.kind === "point";

  const handleSave = async () => {
    if (!slide) return;
    const edit: SlideEdit = { notes };
    if (isText) Object.assign(edit, { title, subtitle });
    if (isScripture && reference.trim() !== (slide.reference ?? "")) edit.reference = reference;
    if (background !== toHex(slide.style.background)) edit.background = background;
    setSaving(true);
    try {
      await onSave(edit);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={slide !== null} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit slide</DialogTitle>
          <DialogDescription>Changes are saved to the sermon, so they show everywhere it's used.</DialogDescription>
        </DialogHeader>
        {slide && (
          <div className="space-y-4 py-1">
            {isText && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="slide-title">{slide.kind === "title" ? "Title" : "Point"}</Label>
                  <Input id="slide-title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="slide-subtitle">Subtitle</Label>
                  <Input id="slide-subtitle" value={subtitle} maxLength={200} onChange={(e) => setSubtitle(e.target.value)} />
                </div>
              </>
            )}
            {isScripture && (
              <div className="space-y-1.5">
                <Label htmlFor="slide-reference">Scripture reference</Label>
                <Input id="slide-reference" value={reference} placeholder="John 3:16-17 (NIV)" onChange={(e) => setReference(e.target.value)} />
                <p className="text-xs text-muted-foreground">
                  The verse words come from the translation and can't be retyped. Change the reference to change the verses. This applies to every slide of the passage.
                </p>
                {slide.kind === "scripture" && slide.text && (
                  <p className="select-none rounded-md bg-muted/60 px-3 py-2 text-sm italic text-muted-foreground">{slide.text}</p>
                )}
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="slide-notes">Speaker notes</Label>
              <Textarea
                id="slide-notes"
                rows={4}
                maxLength={2000}
                placeholder="Only shows on the stage display, never on the main screen."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-3">
              <Label htmlFor="slide-background">Background</Label>
              <input
                id="slide-background"
                type="color"
                value={background}
                onChange={(e) => setBackground(e.target.value)}
                className="h-9 w-14 cursor-pointer rounded border border-input bg-transparent"
              />
              {slide.style.backgroundImage && <span className="text-xs text-muted-foreground">Picking a color replaces the background image.</span>}
            </div>
          </div>
        )}
        <DialogFooter className="sm:justify-between">
          {slide?.source ? (
            <Link to={`/editor/${slide.source.sermon_id}`} className="text-sm text-muted-foreground underline-offset-4 hover:underline">
              Open the full sermon editor
            </Link>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button onClick={() => void handleSave()} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
