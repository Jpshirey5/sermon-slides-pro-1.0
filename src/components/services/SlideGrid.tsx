import { useEffect, useState, type DragEvent, type MouseEvent } from "react";
import { Check, Copy, ImageOff, Loader2, MoreHorizontal, Pencil, Plus, StickyNote, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { classifyFile } from "@/lib/media";
import type { Cursor, OutputFrame, PresenterSlide } from "@/presenter/core/types";
import { SlideView } from "@/presenter/ui/SlideView";

export interface AddKind {
  kind: string;
  label: string;
}

interface SlideGridProps {
  slides: PresenterSlide[];
  itemIndex: number;
  cursor: Cursor;
  live: boolean;
  images: Readonly<Record<string, string>>;
  videos: Readonly<Record<string, string>>;
  /** Slides can be added, moved, duplicated, deleted, and given pictures. */
  editable: boolean;
  /** What "Add slide" offers for this section. */
  addKinds: AddKind[];
  /** Dropping a picture on empty space adds a graphic slide (custom sections). */
  acceptsGraphicDrop: boolean;
  busySlideId: string | null;
  caption: (slide: PresenterSlide) => string;
  onSelect: (slideIndex: number) => void;
  onEdit: (slide: PresenterSlide) => void;
  /** Move slide `from` to sit before slide `before` (slides.length for the end). */
  onMove: (from: number, before: number) => void;
  /** Add a slide after `after` (null for the end). */
  onAdd: (kind: string, after: number | null) => void;
  onDuplicate: (slideIndex: number) => void;
  onDelete: (slideIndex: number) => void;
  onRemovePicture: (slideIndex: number) => void;
  /**
   * A picture dropped on slides or on empty space (null). When the slide it
   * lands on is part of a selection, every selected slide is passed.
   */
  onDropImage: (file: File, slideIndexes: number[] | null) => void;
  /** Remove the background picture from several slides at once. */
  onRemovePictures?: (slideIndexes: number[]) => void;
  /** A video dropped anywhere in the grid. */
  onDropVideo: (file: File) => void;
}

const SLIDE_DRAG = "application/x-ssp-slide";
const asFrame = (slide: PresenterSlide): OutputFrame => ({ kind: "slide", slide });
const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer.types).includes("Files");

export function SlideGrid(props: SlideGridProps) {
  const { slides, itemIndex, cursor, live, editable } = props;
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropBefore, setDropBefore] = useState<number | null>(null);
  const [fileOver, setFileOver] = useState<number | "grid" | null>(null);
  // Shift-click selects a range from the last clicked slide; Cmd or Ctrl-click adds or removes one.
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [anchor, setAnchor] = useState<number | null>(null);
  const slideKey = slides.map((s) => s.id).join("|");

  useEffect(() => {
    setSelected(new Set());
    setAnchor(null);
  }, [itemIndex, slideKey]);

  const multi = selected.size > 1;
  const canPicture = (i: number) => editable && Boolean(slides[i]?.source) && slides[i]?.kind !== "graphic";
  const dropTargets = (i: number) => (multi && selected.has(i) ? [...selected].sort((a, b) => a - b).filter(canPicture) : [i]);

  const clickSlide = (i: number, e: MouseEvent) => {
    if (e.shiftKey) {
      e.preventDefault();
      const from = anchor ?? (cursor.item === itemIndex ? cursor.slide : i);
      const [lo, hi] = from < i ? [from, i] : [i, from];
      setSelected(new Set(Array.from({ length: hi - lo + 1 }, (_, k) => lo + k)));
      setAnchor(from);
      return;
    }
    if (e.metaKey || e.ctrlKey) {
      const next = new Set(selected.size ? selected : anchor !== null ? [anchor] : []);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      setSelected(next);
      setAnchor(i);
      return;
    }
    setSelected(new Set([i]));
    setAnchor(i);
    props.onSelect(i);
  };

  const reset = () => {
    setDragFrom(null);
    setDropBefore(null);
    setFileOver(null);
  };

  const handleFiles = (e: DragEvent, slideIndex: number | null) => {
    e.preventDefault();
    e.stopPropagation();
    const files = Array.from(e.dataTransfer.files);
    reset();
    for (const file of files) {
      const kind = classifyFile(file);
      if (kind === "video") props.onDropVideo(file);
      else props.onDropImage(file, slideIndex === null ? null : dropTargets(slideIndex)); // the handler explains unsupported files
    }
  };

  return (
    <div
      className={`grid min-h-[40vh] grid-cols-2 content-start gap-3 rounded-lg p-1 md:grid-cols-3 2xl:grid-cols-4 ${fileOver === "grid" ? "bg-primary/10 ring-2 ring-dashed ring-primary/60" : ""}`}
      onDragOver={(e) => {
        if (hasFiles(e)) {
          e.preventDefault();
          if (fileOver !== "grid" && typeof fileOver !== "number") setFileOver("grid");
        } else if (dragFrom !== null) {
          e.preventDefault();
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setFileOver(null);
      }}
      onDrop={(e) => {
        if (hasFiles(e)) return handleFiles(e, null);
        if (dragFrom !== null) {
          e.preventDefault();
          props.onMove(dragFrom, slides.length);
        }
        reset();
      }}
      aria-label="Slides"
      onKeyDown={(e) => {
        if (e.key === "Escape" && multi) setSelected(new Set());
      }}
    >
      {multi && (
        <div className="col-span-full flex items-center gap-2 rounded-md bg-primary/15 px-3 py-1.5 text-xs text-neutral-200" role="status">
          <Check className="h-3.5 w-3.5 text-primary" />
          <span>{selected.size} slides selected. Drop a picture on any of them to set the background on all.</span>
          {props.onRemovePictures && [...selected].some((i) => canPicture(i) && slides[i].style.backgroundImage) && (
            <Button size="sm" variant="ghost" className="ml-auto h-6 px-2 text-xs text-neutral-300 hover:bg-neutral-800 hover:text-white" onClick={() => props.onRemovePictures?.([...selected].sort((a, b) => a - b).filter(canPicture))}>
              <ImageOff className="h-3.5 w-3.5" /> Remove pictures
            </Button>
          )}
          <Button size="sm" variant="ghost" className={`${props.onRemovePictures ? "" : "ml-auto "}h-6 px-2 text-xs text-neutral-300 hover:bg-neutral-800 hover:text-white`} onClick={() => setSelected(new Set())} aria-label="Clear selection">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
      {slides.map((slide, i) => {
        const isCursor = cursor.item === itemIndex && cursor.slide === i;
        const isLive = isCursor && live;
        const canMove = editable && Boolean(slide.source);
        return (
          <div
            key={slide.id}
            className={`group relative ${dragFrom === i ? "opacity-40" : ""} ${dropBefore === i ? "before:absolute before:-left-2 before:top-0 before:h-full before:w-1 before:rounded before:bg-primary" : ""}`}
            draggable={canMove}
            onDragStart={(e) => {
              e.dataTransfer.setData(SLIDE_DRAG, String(i));
              e.dataTransfer.effectAllowed = "move";
              setDragFrom(i);
            }}
            onDragEnd={reset}
            onDragOver={(e) => {
              if (hasFiles(e)) {
                e.preventDefault();
                e.stopPropagation();
                if (fileOver !== i) setFileOver(i);
              } else if (dragFrom !== null) {
                e.preventDefault();
                e.stopPropagation();
                if (dropBefore !== i) setDropBefore(i);
              }
            }}
            onDrop={(e) => {
              if (hasFiles(e)) return handleFiles(e, i);
              e.preventDefault();
              e.stopPropagation();
              if (dragFrom !== null && dragFrom !== i) props.onMove(dragFrom, i);
              reset();
            }}
          >
            <button
              type="button"
              onClick={(e) => clickSlide(i, e)}
              onDoubleClick={() => props.onEdit(slide)}
              aria-pressed={multi ? selected.has(i) : undefined}
              className={`block w-full select-none rounded-md p-1 text-left transition-colors ${multi && selected.has(i) ? "bg-primary/15 " : ""}${isLive ? "bg-red-500/20 ring-2 ring-red-500" : isCursor ? "ring-2 ring-primary" : "ring-1 ring-neutral-800 hover:ring-neutral-600"} ${fileOver === i ? "ring-2 ring-dashed ring-amber-400" : ""}`}
              aria-label={`Slide ${i + 1}: ${props.caption(slide)}`}
              aria-current={isCursor ? "true" : undefined}
            >
              <div className="relative">
                <SlideView frame={asFrame(slide)} images={props.images} videos={props.videos} showMissing className="rounded" />
                {fileOver !== null && fileOver !== "grid" && (fileOver === i || (multi && selected.has(fileOver) && selected.has(i))) && (
                  <div className="absolute inset-0 flex items-center justify-center rounded bg-black/60 text-xs font-medium text-amber-200">
                    {multi && selected.has(i) ? `Drop to set background on ${dropTargets(i).length} slides` : "Drop to set background"}
                  </div>
                )}
                {multi && selected.has(i) && (
                  <span className="absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check className="h-3 w-3" /></span>
                )}
                {props.busySlideId === slide.id && (
                  <div className="absolute inset-0 flex items-center justify-center rounded bg-black/60"><Loader2 className="h-5 w-5 animate-spin text-white" /></div>
                )}
              </div>
              <span className="mt-1 flex items-center gap-1.5 px-1 text-xs text-neutral-400">
                <span className="tabular-nums text-neutral-500">{i + 1}</span>
                <span className="truncate">{props.caption(slide)}</span>
                {slide.notes && <StickyNote className="ml-auto h-3 w-3 shrink-0 text-amber-300" aria-label="Has speaker notes" />}
              </span>
            </button>

            {editable && slide.source && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="absolute right-2 top-2 h-7 w-7 bg-black/60 text-neutral-200 opacity-0 hover:bg-black/80 hover:text-white group-hover:opacity-100 data-[state=open]:opacity-100"
                    aria-label={`Slide ${i + 1} options`}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem onSelect={() => props.onEdit(slide)}><Pencil className="h-4 w-4" /> Edit</DropdownMenuItem>
                  <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Add after this slide</DropdownMenuLabel>
                  {props.addKinds.map((k) => (
                    <DropdownMenuItem key={k.kind} onSelect={() => props.onAdd(k.kind, i)}><Plus className="h-4 w-4" /> {k.label}</DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => props.onDuplicate(i)}><Copy className="h-4 w-4" /> Duplicate</DropdownMenuItem>
                  {slide.style.backgroundImage && slide.kind !== "graphic" && (
                    <DropdownMenuItem onSelect={() => props.onRemovePicture(i)}><ImageOff className="h-4 w-4" /> Remove background picture</DropdownMenuItem>
                  )}
                  <DropdownMenuItem className="text-destructive" onSelect={() => props.onDelete(i)}><Trash2 className="h-4 w-4" /> Delete</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        );
      })}

      {editable && props.addKinds.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex aspect-video w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed border-neutral-700 text-sm text-neutral-400 hover:border-neutral-500 hover:text-neutral-200"
              aria-label="Add slide"
            >
              <Plus className="h-5 w-5" />
              Add slide
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {props.addKinds.map((k) => (
              <DropdownMenuItem key={k.kind} onSelect={() => props.onAdd(k.kind, null)}>{k.label}</DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {fileOver === "grid" && (
        <p className="col-span-full text-center text-xs text-primary">
          {props.acceptsGraphicDrop ? "Drop a picture to add it as a slide, or a video to add it to the service." : "Drop a video to add it to the service, or drop a picture on a slide to make it the background."}
        </p>
      )}
    </div>
  );
}
