import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { resolveBackgroundImageSource } from "@/lib/background-assets";

interface SongBackgroundFieldProps {
  id: string;
  color: string;
  image: string | null;
  onChange: (next: { color: string; image: string | null }) => void;
  onUpload: (file: File) => Promise<string>;
  /** Shown when neither a color nor a picture is set. */
  emptyText: string;
}

/** A background color and/or picture, with a small preview. Used for song backgrounds. */
export function SongBackgroundField({ id, color, image, onChange, onUpload, emptyText }: SongBackgroundFieldProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    setUrl(null);
    if (image) void resolveBackgroundImageSource(image).then((u) => live && setUrl(u ?? null)).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [image]);

  const choose = async (file: File | undefined) => {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) return setProblem("Choose a PNG, JPG, WebP, or GIF picture.");
    setUploading(true);
    setProblem(null);
    try {
      onChange({ color, image: await onUpload(file) });
    } catch (error) {
      setProblem((error as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const empty = !color && !image;
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-3">
        <div
          className="flex h-14 w-24 shrink-0 items-center justify-center overflow-hidden rounded border border-border"
          style={{ background: color || "#000000" }}
          aria-hidden
        >
          {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : empty && <span className="px-1 text-center text-[10px] text-neutral-400">Default</span>}
        </div>
        <input
          id={id}
          type="color"
          aria-label="Background color"
          value={color || "#000000"}
          onChange={(e) => onChange({ color: e.target.value, image })}
          className="h-9 w-12 cursor-pointer rounded border border-input bg-transparent"
        />
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" aria-label="Background picture file" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; void choose(f); }} />
        <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => input.current?.click()}>
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />} {image ? "Replace picture" : "Choose picture"}
        </Button>
        {!empty && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange({ color: "", image: null })}>
            <X className="h-4 w-4" /> Clear
          </Button>
        )}
      </div>
      {empty && <p className="text-xs text-muted-foreground">{emptyText}</p>}
      {problem && <p className="text-xs text-destructive">{problem}</p>}
    </div>
  );
}
