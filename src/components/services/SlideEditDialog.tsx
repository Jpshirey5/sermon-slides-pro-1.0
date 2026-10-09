import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ImagePlus, Loader2, X } from "lucide-react";
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
  /** Uploads a picture and returns its storage ref. */
  onUploadImage: (file: File) => Promise<string>;
  /** Resolved picture URLs, for the preview of the current background. */
  images?: Readonly<Record<string, string>>;
}

const toHex = (value: string) => (/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000");

/** Edit one slide in place. Sermon slides save to the sermon; custom slides save to their section. */
export function SlideEditDialog({ slide, onSave, onClose, onUploadImage, images = {} }: SlideEditDialogProps) {
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [background, setBackground] = useState("#000000");
  const [picture, setPicture] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!slide) return;
    setTitle(slide.title ?? "");
    setSubtitle(slide.subtitle ?? "");
    setReference(slide.reference ?? "");
    setNotes(slide.notes ?? "");
    setBackground(toHex(slide.style.background));
    setPicture(slide.style.backgroundImage ?? null);
    setSaving(false);
    setUploadError(null);
  }, [slide]);

  const isCustom = Boolean(slide?.source?.item_id);
  const isScripture = slide?.kind === "scripture" || slide?.kind === "missing";
  const isText = slide?.kind === "title" || slide?.kind === "point";
  const isGraphic = slide?.kind === "graphic";

  const choosePicture = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      setPicture(await onUploadImage(file));
    } catch (error) {
      setUploadError((error as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!slide) return;
    const edit: SlideEdit = { notes };
    if (isText) {
      edit.title = title;
      if (isCustom) edit.body = subtitle;
      else edit.subtitle = subtitle;
    }
    if (isScripture && reference.trim() !== (slide.reference ?? "")) edit.reference = reference;
    if (background !== toHex(slide.style.background)) edit.background = background;
    if (picture !== (slide.style.backgroundImage ?? null)) edit.backgroundImage = picture;
    setSaving(true);
    try {
      await onSave(edit);
    } finally {
      setSaving(false);
    }
  };

  const pictureUrl = picture ? images[picture] ?? (/^(https:|data:|blob:)/.test(picture) ? picture : null) : null;

  return (
    <Dialog open={slide !== null} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isGraphic ? "Edit graphic" : "Edit slide"}</DialogTitle>
          <DialogDescription>
            {isCustom ? "Changes are saved to this section of the service." : "Changes are saved to the sermon, so they show everywhere it's used."}
          </DialogDescription>
        </DialogHeader>
        {slide && (
          <div className="space-y-4 py-1">
            {isText && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="slide-title">{slide.kind === "title" ? "Title" : isCustom ? "Heading" : "Point"}</Label>
                  <Input id="slide-title" value={title} maxLength={300} onChange={(e) => setTitle(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="slide-subtitle">{isCustom ? "Text" : "Subtitle"}</Label>
                  {isCustom ? (
                    <Textarea id="slide-subtitle" rows={3} maxLength={2000} value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
                  ) : (
                    <Input id="slide-subtitle" value={subtitle} maxLength={300} onChange={(e) => setSubtitle(e.target.value)} />
                  )}
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
              <Label>{isGraphic ? "Picture" : "Background picture"}</Label>
              <div className="flex items-center gap-3">
                <div className="flex h-14 w-24 shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-black">
                  {pictureUrl ? <img src={pictureUrl} alt="" className="h-full w-full object-cover" /> : picture ? <span className="px-1 text-center text-[10px] text-neutral-400">Picture set</span> : <span className="text-[10px] text-neutral-500">None</span>}
                </div>
                <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => void choosePicture(e.target.files?.[0])} />
                <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => fileInput.current?.click()}>
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />} {picture ? "Replace" : "Choose picture"}
                </Button>
                {picture && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setPicture(null)}>
                    <X className="h-4 w-4" /> Remove
                  </Button>
                )}
              </div>
              {uploadError && <p className="text-xs text-destructive">{uploadError}</p>}
              <p className="text-xs text-muted-foreground">You can also drag a picture from your computer straight onto any slide.</p>
            </div>

            {!isGraphic && (
              <div className="flex items-center gap-3">
                <Label htmlFor="slide-background">Background color</Label>
                <input
                  id="slide-background"
                  type="color"
                  value={background}
                  onChange={(e) => setBackground(e.target.value)}
                  className="h-9 w-14 cursor-pointer rounded border border-input bg-transparent"
                />
                {picture && <span className="text-xs text-muted-foreground">Picking a color replaces the picture.</span>}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="slide-notes">Speaker notes</Label>
              <Textarea
                id="slide-notes"
                rows={3}
                maxLength={2000}
                placeholder="Only shows on the stage display, never on the main screen."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
        )}
        <DialogFooter className="sm:justify-between">
          {slide?.source?.sermon_id ? (
            <Link to={`/editor/${slide.source.sermon_id}`} className="text-sm text-muted-foreground underline-offset-4 hover:underline">
              Open the full sermon editor
            </Link>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button onClick={() => void handleSave()} disabled={saving || uploading}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
