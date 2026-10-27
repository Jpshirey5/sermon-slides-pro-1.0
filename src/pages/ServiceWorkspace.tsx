// The service workspace: lay out, edit, and run a service in one place.
//
//   left    service order: add, drag to reorder, per-item stage settings
//   middle  every slide of the selected item; click to show, double-click to edit
//   right   main screen preview and controls, stage display preview and controls
//
// Our own layout and visual design (see CLAUDE.md: no ProPresenter trade dress).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Clock,
  Film,
  Upload,
  GripVertical,
  Image as ImageIcon,
  Keyboard,
  LayoutTemplate,
  ListMusic,
  Loader2,
  MessageSquare,
  MonitorPlay,
  MonitorUp,
  MoreHorizontal,
  Pencil,
  Music,
  Pause,
  Play,
  Plus,
  Presentation,
  Radio,
  RotateCcw,
  ScrollText,
  Square,
  StickyNote,
  Tv,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PickerDialog } from "@/components/services/PickerDialog";
import { ReadingDialog, type ReadingDraft } from "@/components/services/ReadingDialog";
import { SlideEditDialog } from "@/components/services/SlideEditDialog";
import { SongEditorDialog } from "@/components/services/SongEditorDialog";
import { ServiceArrangementDialog } from "@/components/services/ServiceArrangementDialog";
import { POSITION_LABELS } from "@/components/services/SongTextStyleField";
import { type AddKind as GridAddKind, SlideGrid } from "@/components/services/SlideGrid";
import { VideoControls } from "@/components/services/VideoControls";
import { classifyFile, fileProblem, formatDuration, listVideos, type MediaItem, uploadSlideImage, uploadVideo, videoUrl } from "@/lib/media";
import { applyCustomSlideEdit, type CustomSlide, duplicateGroup, insertAt, moveGroup, newCustomSlide, newSermonSlide, type NewSermonSlideKind, removeGroup } from "@/lib/slide-ops";
import type { SlideData } from "@/lib/slides/types";
import { readCustomSlides } from "../../supabase/functions/_shared/presenter/slides.ts";
import { VideoPlayer } from "@/presenter/ui/VideoPlayer";
import { getDesktop, SCREEN_COMMAND_EVENT, type ScreenCommandDetail } from "@/desktop/bridge";
import { supabase } from "@/integrations/supabase/client";
import { resolveBackgroundImages } from "@/lib/background-assets";
import { formatDateOnlyForDisplay } from "@/lib/date-format";
import { trackEvent } from "@/lib/monitoring";
import { getEditorPresentationState, saveEditorSlides } from "@/lib/presentations";
import { applySlideEdit, type SlideEdit } from "@/lib/sermon-slide-edit";
import {
  addServiceItem,
  formatReference,
  getService,
  listSermonOptions,
  readScripturePayload,
  removeServiceItem,
  reorderServiceItems,
  saveAsTemplate,
  type ScripturePayload,
  type SermonOption,
  type ServiceDetail,
  type ServiceItem,
  setItemStageSettings,
  updateService,
  updateServiceItem,
} from "@/lib/services";
import { holdSessionWhilePresenting } from "@/lib/session-security";
import { listSongs, recordSongUse, setSongBackground, type Song, uploadSongBackground } from "@/lib/songs";
import type { BundleFetchError, Invoke } from "@/presenter/core/bundle-client";
import {
  type DisplayInfo,
  listDisplays,
  openOutputWindow,
  pickDefaultDisplay,
  STAGE_WINDOW_NAME,
  supportsWindowManagement,
} from "@/presenter/core/displays";
import { createIndexedDbQueueStorage, getDeviceId } from "@/presenter/core/fums-queue";
import { formatCountdown, STAGE_TEMPLATE_LABELS, STAGE_TEMPLATES, type StageTemplate, timerRemainingMs } from "@/presenter/core/stage";
import { createBroadcastTransport, newChannelNonce } from "@/presenter/core/transport";
import type { BundleItem, OutputFrame, PresenterSlide, ServiceBundle } from "@/presenter/core/types";
import { missingText, SlideView } from "@/presenter/ui/SlideView";
import { StageView } from "@/presenter/ui/StageView";
import { SHORTCUTS, useKeyboardShortcuts } from "@/presenter/ui/useKeyboardShortcuts";
import { usePresenterSession } from "@/presenter/ui/usePresenterSession";

/** supabase.functions.invoke, reshaped to carry the HTTP status. */
const invoke: Invoke = async (fn, body) => {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (!error) return { data, error: null };
  const context = (error as { context?: unknown }).context;
  const status = typeof Response !== "undefined" && context instanceof Response ? context.status : undefined;
  return { data: null, error: { status, message: error.message } };
};

const LOAD_ERRORS: Record<BundleFetchError, string> = {
  not_found: "We couldn't find this service. It may have been deleted, or it belongs to another church.",
  plan_required: "Presenting needs an active plan. Check your billing on the Account page.",
  rate_limited: "Too many requests just now. Wait a moment and try again.",
  too_large: "This service has more scripture than we can load at once. Split long readings into smaller ones.",
  network: "We couldn't reach Sermon Slide Pro. Check the internet connection and try again.",
  server: "Something went wrong loading this service. Try again in a moment.",
};

/** Sections whose slides have words, so they can sit in the upper third, center, or lower third. */
const TEXT_SECTION_TYPES = new Set<string>(["sermon", "song", "slides", "scripture"]);

const ITEM_ICON: Record<BundleItem["type"], typeof Square> = {
  sermon: Presentation,
  scripture: BookOpen,
  song: Music,
  logo: ImageIcon,
  blank: Square,
  credits: ScrollText,
  slides: Square,
  video: Film,
};

const asFrame = (slide: PresenterSlide | null): OutputFrame => (slide ? { kind: "slide", slide } : { kind: "black" });

export function slideCaption(slide: PresenterSlide): string {
  switch (slide.kind) {
    case "scripture":
      return slide.reference ?? "Scripture";
    case "lyrics":
      return slide.label ?? "Lyrics";
    case "title":
      return "Title";
    case "point":
      return slide.title ?? "Point";
    case "credits":
      return "Scripture credits";
    case "logo":
      return "Logo";
    case "missing":
      return slide.reference ?? "Unavailable";
    default:
      return "Black";
  }
}

type WindowKind = "main" | "stage";
type AddKind = "sermon" | "song" | "video";

const ServiceWorkspace = () => {
  const { id: serviceId = "" } = useParams();
  const navigate = useNavigate();
  const [service, setService] = useState<ServiceDetail | null | undefined>(undefined);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [viewItem, setViewItem] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);

  // dialogs
  const [picker, setPicker] = useState<AddKind | null>(null);
  const [videoLibrary, setVideoLibrary] = useState<MediaItem[] | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [busySlideId, setBusySlideId] = useState<string | null>(null);
  const [videoSettings, setVideoSettings] = useState<{
    /** An old-style video item, or a video slide inside a Blank slide section. */
    target: { kind: "item"; row: ServiceItem } | { kind: "slide"; item: BundleItem; index: number };
    loop: boolean;
    endAction: "hold" | "clear" | "next";
  } | null>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const graphicInput = useRef<HTMLInputElement>(null);
  const pendingGraphic = useRef<{ item: BundleItem; after: number | null } | null>(null);
  const pendingVideo = useRef<{ item: BundleItem; after: number | null } | null>(null);
  /** When set, the sermon or song picker fills this section instead of adding a new one. */
  const fillRow = useRef<string | null>(null);
  const [templateName, setTemplateName] = useState<string | null>(null);
  const [arranging, setArranging] = useState<{ row: ServiceItem; songId: string } | null>(null);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [sermons, setSermons] = useState<SermonOption[] | null>(null);
  const [songs, setSongs] = useState<Song[] | null>(null);
  const [reading, setReading] = useState<{ itemId: string | null; draft: ReadingDraft | null } | null>(null);
  const [songEditor, setSongEditor] = useState<{ songId: string | null; addToService: boolean } | null>(null);
  const [editingSlide, setEditingSlide] = useState<PresenterSlide | null>(null);
  const [countdownFor, setCountdownFor] = useState<ServiceItem | null>(null);
  const [renaming, setRenaming] = useState<{ rowId: string; value: string } | null>(null);
  const renamingRef = useRef(false);
  renamingRef.current = renaming !== null;
  const [countdownMinutes, setCountdownMinutes] = useState("");
  const [displays, setDisplays] = useState<{ kind: WindowKind; list: DisplayInfo[] } | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showNotices, setShowNotices] = useState(false);
  const [dragFrom, setDragFrom] = useState<number | null>(null);

  const desktop = useMemo(() => getDesktop(), []);
  const deps = useMemo(() => ({
    invoke,
    // Desktop app: keep an encrypted offline copy of the service for Sunday.
    offlineCache: desktop
      ? {
        save: async (id: string, b: ServiceBundle) => {
          await desktop.offlineCache.save(`service:${id}`, JSON.stringify(b), b.bundle_expires_at);
        },
        load: async (id: string) => {
          const json = await desktop.offlineCache.load(`service:${id}`);
          return json ? (JSON.parse(json) as ServiceBundle) : null;
        },
        remove: (id: string) => desktop.offlineCache.remove(`service:${id}`),
      }
      : undefined,
    createTransport: createBroadcastTransport,
    queueStorage: createIndexedDbQueueStorage(),
    deviceId: getDeviceId(),
    resolveImages: resolveBackgroundImages,
    resolveVideo: videoUrl,
    newNonce: () => newChannelNonce(),
    onNotice: ({ kind, message }: { kind: string; message: string }) =>
      kind === "revoked" ? toast.warning(message, { duration: 10_000 }) : kind === "refresh_failed" ? undefined : toast(message),
  }), [desktop]);

  const session = usePresenterSession(serviceId, deps);

  // Desktop app: it tells us when a presenter window is closed.
  useEffect(() => desktop?.onPresenterClosed((kind) => session.windowClosed(kind)), [desktop]); // eslint-disable-line react-hooks/exhaustive-deps
  // Screens > Open Main Screen / Open Stage Display in the app menu.
  const chooseScreenRef = useRef<((kind: WindowKind) => Promise<void>) | null>(null);
  useEffect(() => {
    const onCommand = (e: Event) => {
      const detail = (e as CustomEvent<ScreenCommandDetail>).detail;
      if (!chooseScreenRef.current) return;
      detail.handled = true;
      void chooseScreenRef.current(detail.kind);
    };
    window.addEventListener(SCREEN_COMMAND_EVENT, onCommand);
    return () => window.removeEventListener(SCREEN_COMMAND_EVENT, onCommand);
  }, []);
  // CCLI reporting: a song counts once per service, the first time one of its
  // slides is live on the main screen. Rehearsing with no main screen open
  // doesn't count. A failed save is retried the next time the song is live.
  const reportedSongs = useRef(new Set<string>());
  const liveSongId = (() => {
    const item = session.bundle?.items[session.state.cursor.item];
    return session.projectorConnected && session.state.mode === "live" && item?.type === "song" ? item.song_id ?? null : null;
  })();
  useEffect(() => {
    if (!liveSongId || !service || service.isTemplate || reportedSongs.current.has(liveSongId)) return;
    reportedSongs.current.add(liveSongId);
    recordSongUse(service.id, liveSongId).catch(() => reportedSongs.current.delete(liveSongId));
  }, [liveSongId, service]);
  // A screen unplugged or turned off mid-service, and plugged back in.
  useEffect(
    () =>
      desktop?.screens.onChanged(({ kind, state }) => {
        const name = kind === "main" ? "Main screen" : "Stage display";
        if (kind && state === "disconnected") toast.warning(`${name} disconnected`, { description: "Its window is hidden until the screen is plugged back in.", duration: 10000 });
        if (kind && state === "reconnected") toast.success(`${name} is back`);
      }),
    [desktop],
  );
  const { bundle, state, dispatch, frame, images, projectorConnected, stageConnected, stage, dispatchStage, stageFrame } = session;
  const live = projectorConnected || stageConnected;

  const loadService = useCallback(async () => {
    try {
      const next = await getService(serviceId);
      setService(next);
      if (next) setTitle(next.title);
    } catch (error) {
      toast.error("Could not load the service", { description: (error as Error).message });
      setService(null);
    }
  }, [serviceId]);

  useEffect(() => {
    void loadService();
  }, [loadService]);

  const anyDialogOpen = Boolean(picker || reading || songEditor || editingSlide || countdownFor || renaming || arranging || templateName !== null || displays || showShortcuts || showNotices);
  useKeyboardShortcuts(dispatch, session.load.kind === "ready" && !anyDialogOpen);

  // The view follows the live slide when it moves to another item.
  useEffect(() => setViewItem(state.cursor.item), [state.cursor.item]);

  // Clock and countdown in the stage preview.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  // While a projector or stage window is open, presenting counts as activity
  // for the idle sign-out, and leaving asks for confirmation.
  useEffect(() => {
    if (!live) return;
    const release = holdSessionWhilePresenting();
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      release();
      window.removeEventListener("beforeunload", warn);
    };
  }, [live]);

  useEffect(() => {
    if (projectorConnected) trackEvent("presenter_session_started", { serviceId, itemCount: bundle?.items.length ?? 0 });
  }, [projectorConnected]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (bundle) document.title = `${bundle.service.title} | Sermon Slide Pro`;
  }, [bundle]);

  /** Run a change to the service, then reload both the order and the slides. */
  const run = async (label: string, action: () => Promise<unknown>): Promise<boolean> => {
    if (busy) return false;
    setBusy(true);
    try {
      await action();
      await Promise.all([loadService(), session.reload()]);
      return true;
    } catch (error) {
      toast.error(label, { description: (error as Error).message });
      return false;
    } finally {
      setBusy(false);
    }
  };

  /** Save a section's new name. An empty name goes back to the default (the sermon or song title). */
  const saveRename = () => {
    const r = renaming;
    if (!r) return;
    setRenaming(null);
    const row = service?.items.find((i) => i.id === r.rowId);
    const label = r.value.trim().slice(0, 120);
    if (!row || label === (row.label ?? "")) return;
    void run("Could not rename the section", () => updateServiceItem(row.id, { label: label || null }));
  };

  const serviceItem = (bundleItemId: string) => service?.items.find((i) => i.id === bundleItemId) ?? null;

  // ── adding items ──
  const openPicker = (kind: AddKind) => {
    setPicker(kind);
    if (kind === "sermon") listSermonOptions().then(setSermons).catch(() => setSermons([]));
    else if (kind === "song") listSongs().then(setSongs).catch(() => setSongs([]));
    else listVideos().then(setVideoLibrary).catch(() => setVideoLibrary([]));
  };
  const add = (item: Parameters<typeof addServiceItem>[1]) => {
    if (!service) return;
    void run("Could not add the item", () => addServiceItem(service, item));
  };

  // ── reordering by drag ──
  const orderIds = (service?.items ?? []).map((i) => i.id);
  const dropAt = (to: number) => {
    if (dragFrom === null || !service || dragFrom === to) return setDragFrom(null);
    const ids = [...orderIds];
    const [moved] = ids.splice(dragFrom, 1);
    ids.splice(to, 0, moved);
    setDragFrom(null);
    void run("Could not reorder the service", () => reorderServiceItems(service.id, ids));
  };

  // ── slides inside a section: add, move, duplicate, delete, pictures ──

  /** Change a section's slide list (a sermon's editor slides, or a Slides item's own list), then reload. */
  const mutateSlides = (item: BundleItem, label: string, change: (list: Array<SlideData | CustomSlide>) => Array<SlideData | CustomSlide> | null) =>
    run(label, async () => {
      if (item.type === "sermon" && item.sermon_id) {
        const sermon = await getEditorPresentationState(item.sermon_id);
        if (!sermon?.editorSlides) throw new Error("This sermon has no editor slides yet. Open it in the sermon editor once, then try again.");
        const next = change(sermon.editorSlides);
        if (next) await saveEditorSlides(item.sermon_id, next as SlideData[]);
      } else if (item.type === "slides") {
        const row = serviceItem(item.id);
        if (!row) throw new Error("This section changed. Reload and try again.");
        const next = change(readCustomSlides(row.payload));
        if (next) await updateServiceItem(row.id, { payload: { ...row.payload, slides: next } });
      }
    });

  const groupOf = (item: BundleItem, slideIndex: number) => item.slides[slideIndex]?.source?.slide_indexes ?? [];

  const addKindsFor = (item: BundleItem | undefined): GridAddKind[] => {
    if (!item) return [];
    if (item.type === "sermon" && item.sermon_id) return [{ kind: "title", label: "Title" }, { kind: "point", label: "Point" }, { kind: "scripture", label: "Scripture" }, { kind: "blank", label: "Blank" }];
    if (item.type === "slides") return [{ kind: "blank", label: "Blank" }, { kind: "title", label: "Title" }, { kind: "text", label: "Text" }, { kind: "graphic", label: "Picture or logo" }, { kind: "video", label: "Video" }];
    return [];
  };

  const addSlide = (item: BundleItem, kind: string, after: number | null, extra: Partial<CustomSlide> = {}) => {
    if (item.type === "slides" && kind === "graphic" && !extra.backgroundImage) {
      pendingGraphic.current = { item, after };
      graphicInput.current?.click();
      return;
    }
    if (item.type === "slides" && kind === "video" && !extra.media_id) {
      pendingVideo.current = { item, after };
      openPicker("video");
      return;
    }
    void mutateSlides(item, "Could not add the slide", (list) => {
      const at = after === null ? list.length : Math.max(...groupOf(item, after)) + 1;
      const fresh = item.type === "sermon"
        ? newSermonSlide(kind as NewSermonSlideKind, (list[Math.max(0, at - 1)] as SlideData | undefined))
        : newCustomSlide(kind as CustomSlide["kind"], extra);
      return insertAt(list, at, [fresh]);
    });
  };

  const moveSlide = (item: BundleItem, from: number, before: number) =>
    void mutateSlides(item, "Could not move the slide", (list) => {
      const target = before < item.slides.length ? groupOf(item, before)[0] ?? list.length : list.length;
      return moveGroup(list, groupOf(item, from), target);
    });

  const duplicateSlide = (item: BundleItem, i: number) =>
    void mutateSlides(item, "Could not duplicate the slide", (list) => duplicateGroup(list, groupOf(item, i)));

  const deleteSlide = (item: BundleItem, i: number) => {
    let previous: Array<SlideData | CustomSlide> | null = null;
    void mutateSlides(item, "Could not delete the slide", (list) => {
      previous = list;
      return removeGroup(list, groupOf(item, i));
    }).then(() => {
      if (!previous) return;
      const restore = previous;
      toast("Slide deleted", { action: { label: "Undo", onClick: () => void mutateSlides(item, "Could not undo", () => restore) } });
    });
  };

  /** Set or remove the background picture on one or more slides of a section, in one save. */
  const setSlidePicture = (item: BundleItem, indexes: number | number[], ref: string | null) => {
    const targets = (Array.isArray(indexes) ? indexes : [indexes]).map((i) => item.slides[i]).filter((slide) => slide?.source);
    if (targets.length === 0) return;
    void mutateSlides(item, ref ? "Could not set the background" : "Could not remove the picture", (list) => {
      let next = list;
      for (const slide of targets) {
        if (item.type === "slides") {
          const r = applyCustomSlideEdit(next as CustomSlide[], slide.source!.slide_indexes[0], { backgroundImage: ref });
          if (r.ok === false) throw new Error(r.reason);
          next = r.slides;
        } else {
          const expected = slide.kind === "missing" ? "missing" : (slide.kind as "title" | "point" | "scripture" | "blank");
          const r = applySlideEdit(next as SlideData[], slide.source!.slide_indexes, expected as never, { backgroundImage: ref });
          if (r.ok === false) throw new Error(r.reason);
          next = r.slides;
        }
      }
      return next;
    }).then((ok) => {
      if (ok && targets.length > 1) toast.success(ref ? `Background set on ${targets.length} slides` : `Pictures removed from ${targets.length} slides`);
    });
  };

  const dropImage = async (item: BundleItem, file: File, slideIndexes: number[] | null) => {
    const problem = fileProblem(file);
    if (problem || classifyFile(file) !== "image") return void toast.error(problem ?? `${file.name} isn't a picture.`);
    const slideIndex = slideIndexes?.[0] ?? null;
    const target = slideIndex !== null ? item.slides[slideIndex] : null;
    if (item.type === "song" && item.song_id) {
      // A picture on any of a song's slides becomes that song's background, everywhere it's used.
      const songId = item.song_id;
      setUploading(`Uploading ${file.name}`);
      try {
        const ref = await uploadSongBackground(file, songId);
        if (await run("Could not set the song background", () => setSongBackground(songId, { background: null, backgroundImage: ref }))) {
          toast.success("Song background set", { description: "Used for this song in every service. Change it in the song." });
        }
      } catch (error) {
        toast.error("Could not upload the picture", { description: (error as Error).message });
      } finally {
        setUploading(null);
      }
      return;
    }
    if (target && !target.source) return void toast("Pictures can be added to sermon, song, and blank slides. Readings use their own settings.");
    if (!target && item.type !== "slides") return void toast("Drop the picture onto a slide to make it the background, or add a Slides section for graphics.");
    setBusySlideId(target?.id ?? null);
    setUploading(`Uploading ${file.name}`);
    try {
      const ref = await uploadSlideImage(file, serviceId, target?.id.replace(/[^A-Za-z0-9-]/g, "") || "graphic");
      if (target && slideIndexes) setSlidePicture(item, slideIndexes, ref);
      else addSlide(item, "graphic", null, { backgroundImage: ref });
    } catch (error) {
      toast.error("Could not upload the picture", { description: (error as Error).message });
    } finally {
      setUploading(null);
      setBusySlideId(null);
    }
  };

  /** A new Blank slide section right after the one you're viewing. */
  const addBlankSection = (first: CustomSlide = newCustomSlide("blank")) => {
    const after = bundle?.items[viewItem]?.id;
    add({ type: "slides", payload: { slides: [first] }, label: "Blank slide", afterItemId: serviceItem(after ?? "")?.id ?? null });
  };

  /**
   * Put a library video into the service as a slide: where "Add slide" asked
   * for it, else at the end of the Blank slide section you're viewing, else in
   * a new Blank slide section after the section you're viewing.
   */
  const placeVideo = (mediaId: string) => {
    const target = pendingVideo.current;
    pendingVideo.current = null;
    const video = { media_id: mediaId, loop: false, end_action: "hold" as const };
    const shown = bundle?.items[viewItem];
    if (target) addSlide(target.item, "video", target.after, video);
    else if (shown?.type === "slides") addSlide(shown, "video", null, video);
    else addBlankSection(newCustomSlide("video", video));
  };

  /** Upload a video to the library, then place it (see placeVideo). */
  const addVideoFile = async (file: File) => {
    const problem = fileProblem(file);
    if (problem || classifyFile(file) !== "video") return void toast.error(problem ?? `${file.name} isn't a video.`);
    if (!service) return;
    setUploading(`Uploading ${file.name}. Large videos can take a few minutes.`);
    try {
      placeVideo(await uploadVideo(file));
    } catch (error) {
      toast.error("Could not upload the video", { description: (error as Error).message });
    } finally {
      setUploading(null);
    }
  };

  /** Open the sermon or song picker to fill (or change) an existing section. */
  const chooseFor = (row: ServiceItem, kind: "sermon" | "song") => {
    fillRow.current = row.id;
    openPicker(kind);
  };

  const pickInto = (kind: "sermon" | "song", id: string) => {
    const rowId = fillRow.current;
    fillRow.current = null;
    if (!rowId) return add(kind === "sermon" ? { type: "sermon", sermonId: id } : { type: "song", songId: id });
    void run(`Could not choose the ${kind}`, () => updateServiceItem(rowId, kind === "sermon" ? { sermonId: id } : { songId: id }));
  };

  const saveTemplate = async () => {
    if (!service || templateName === null) return;
    setSavingTemplate(true);
    try {
      await saveAsTemplate(service.id, templateName.trim() || service.title);
      toast.success("Template saved", { description: "Pick it under New Service on the Services page." });
      setTemplateName(null);
    } catch (error) {
      toast.error("Could not save the template", { description: (error as Error).message });
    } finally {
      setSavingTemplate(false);
    }
  };

  // ── windows ──
  const openWindow = (kind: WindowKind, display: DisplayInfo | null, remember = false) => {
    setDisplays(null);
    if (desktop && remember && display) {
      void desktop.screens.set(kind, display.id).then(() =>
        toast(`Saved ${display.label} as the ${kind === "main" ? "main screen" : "stage display"}.`, { description: "Change it anytime in Screens > Set Up Screens." }));
    }
    const path = kind === "main" ? "output" : "stage";
    const url = `/present/${serviceId}/${path}?channel=${encodeURIComponent(session.nonce)}`;
    if (desktop) {
      // Desktop: a native full-screen window on the chosen screen.
      void desktop.openPresenterWindow(kind, url, display?.id ?? null).then((ok) => {
        if (!ok) toast.error("Could not open the window on that screen.");
      });
      return;
    }
    const win = openOutputWindow(window, url, display, kind === "main" ? undefined : STAGE_WINDOW_NAME);
    if (!win) {
      toast.error("Your browser blocked the window. Allow pop-ups for this site, then try again.");
      return;
    }
    if (kind === "main") session.attachProjectorWindow(win);
    else session.attachStageWindow(win);
    if (!display) toast("Drag the new window to its screen, then click Go full screen.");
  };
  const chooseScreen = async (kind: WindowKind) => {
    if (desktop) {
      // The screen saved in Screens > Set Up Screens, if it's plugged in.
      const setup = await desktop.screens.get();
      const saved = setup?.displays.find((d) => d.id === setup[kind].connectedId);
      if (saved) return openWindow(kind, saved);
      const list = setup?.displays ?? (await desktop.listDisplays());
      return list.length < 2 ? openWindow(kind, list[0] ?? null) : setDisplays({ kind, list });
    }
    if (!supportsWindowManagement(window)) return openWindow(kind, null);
    const result = await listDisplays(window);
    if (!result.supported || result.displays.length < 2) return openWindow(kind, null);
    setDisplays({ kind, list: result.displays });
  };
  chooseScreenRef.current = session.load.kind === "ready" ? chooseScreen : null;

  // ── editing ──
  const editSlide = (item: BundleItem, slide: PresenterSlide) => {
    const row = serviceItem(item.id);
    const custom = slide.source?.item_id && row ? readCustomSlides(row.payload)[slide.source.slide_indexes[0]] : undefined;
    if (custom?.kind === "video") {
      setVideoSettings({ target: { kind: "slide", item, index: slide.source!.slide_indexes[0] }, loop: custom.loop === true, endAction: custom.end_action ?? "hold" });
    } else if (slide.source && (slide.kind === "title" || slide.kind === "point" || slide.kind === "scripture" || slide.kind === "missing" || slide.kind === "graphic" || (slide.kind === "blank" && slide.source.item_id))) {
      setEditingSlide(slide);
    } else if (item.type === "video" && row) {
      setVideoSettings({ target: { kind: "item", row }, loop: row.payload.loop === true, endAction: row.payload.end_action === "clear" || row.payload.end_action === "next" ? row.payload.end_action : "hold" });
    } else if (item.type === "song" && item.song_id) {
      setSongEditor({ songId: item.song_id, addToService: false });
    } else if (item.type === "scripture" && row) {
      const p = readScripturePayload(row.payload);
      setReading({ itemId: row.id, draft: { text: p.passages.map(formatReference).join("; "), translation: p.translation_id, layout: p.layout } });
    } else if (item.type === "sermon" && item.sermon_id) {
      toast("This sermon was built without editor slides. Open it in the editor to customize its slides.");
    }
  };

  const saveSlideEdit = async (edit: SlideEdit) => {
    const slide = editingSlide;
    if (!slide?.source) return;
    try {
      if (slide.source.item_id) {
        const row = serviceItem(slide.source.item_id);
        if (!row) throw new Error("This section changed. Reload and try again.");
        const r = applyCustomSlideEdit(readCustomSlides(row.payload), slide.source.slide_indexes[0], edit);
        if (r.ok === false) throw new Error(r.reason);
        await updateServiceItem(row.id, { payload: { ...row.payload, slides: r.slides } });
        setEditingSlide(null);
        await Promise.all([loadService(), session.reload()]);
        toast.success("Slide saved");
        return;
      }
      if (!slide.source.sermon_id) return;
      const sermon = await getEditorPresentationState(slide.source.sermon_id);
      if (!sermon?.editorSlides) throw new Error("This sermon has no editor slides yet. Open it in the editor first.");
      const expected = slide.kind === "missing" ? "missing" : (slide.kind as "title" | "point" | "scripture");
      const result = applySlideEdit(sermon.editorSlides, slide.source.slide_indexes, expected, edit);
      if (result.ok === false) throw new Error(result.reason);
      await saveEditorSlides(slide.source.sermon_id, result.slides);
      setEditingSlide(null);
      await session.reload();
      toast.success("Slide saved");
    } catch (error) {
      toast.error("Could not save the slide", { description: (error as Error).message });
    }
  };

  const saveReading = (payload: ScripturePayload) => {
    const target = reading;
    setReading(null);
    if (!target || !service) return;
    void run("Could not save the reading", () =>
      target.itemId
        ? updateServiceItem(target.itemId, { payload: { ...(serviceItem(target.itemId)?.payload ?? {}), ...payload } })
        : addServiceItem(service, { type: "scripture", payload: { ...payload } }));
  };

  // ── render ──
  if (service === null || (session.load.kind === "error" && !bundle)) {
    const message = session.load.kind === "error" ? LOAD_ERRORS[session.load.error] : LOAD_ERRORS.not_found;
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-neutral-950 px-4 text-neutral-100">
        <div className="max-w-md text-center">
          <p className="mb-6">{message}</p>
          <div className="flex justify-center gap-2">
            <Button variant="secondary" onClick={() => { session.retry(); void loadService(); }}>Try again</Button>
            <Link to="/dashboard/services"><Button variant="ghost" className="text-neutral-300">Back to services</Button></Link>
          </div>
        </div>
      </div>
    );
  }

  if (service === undefined || !bundle) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-neutral-950 text-neutral-300">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading the service...
      </div>
    );
  }

  const shownItem = bundle.items[viewItem] ?? bundle.items[0];
  const shownIndex = bundle.items.indexOf(shownItem);
  const shownRow = shownItem ? serviceItem(shownItem.id) : null;
  const translations = Object.values(bundle.translations);
  const timerMs = timerRemainingMs(stage.timer, now);
  const modeButton = (active: boolean) =>
    active ? "bg-amber-400 text-neutral-950 hover:bg-amber-300" : "bg-neutral-800 text-neutral-100 hover:bg-neutral-700";
  const panelTitle = "mb-2 text-[11px] font-medium uppercase tracking-wider text-neutral-400";

  return (
    <div className="fixed inset-0 flex flex-col bg-neutral-950 text-neutral-100">
      {/* ── top bar ── */}
      <header className="flex flex-wrap items-center gap-2 border-b border-neutral-800 px-3 py-2">
        <Link
          to="/dashboard/services"
          onClick={() => {
            session.endSession();
            void desktop?.closePresenterWindow("main");
            void desktop?.closePresenterWindow("stage");
          }}
        >
          <Button variant="ghost" size="sm" className="text-neutral-300 hover:bg-neutral-800 hover:text-white">
            <ArrowLeft className="h-4 w-4" /> Services
          </Button>
        </Link>
        <Input
          aria-label="Service name"
          className="h-8 w-56 border-transparent bg-transparent font-serif text-base text-neutral-100 hover:border-neutral-700 focus:border-neutral-600"
          value={title}
          maxLength={120}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => {
            if (title.trim() && title.trim() !== service.title) void run("Could not rename the service", () => updateService(service.id, { title }));
            else setTitle(service.title);
          }}
        />
        {service.isTemplate ? (
          <span className="mr-auto rounded-md bg-primary/20 px-2 py-1 text-xs text-primary" title="Changes here change the template, not services already made from it">
            Template
          </span>
        ) : (
          <span className="mr-auto text-xs text-neutral-500">{service.serviceDate ? formatDateOnlyForDisplay(service.serviceDate) : ""}</span>
        )}

        {session.usingOfflineCopy && (
          <span className="rounded-md bg-sky-500/15 px-2 py-1 text-xs text-sky-300" title="This service was saved on this computer the last time it loaded">
            Offline copy
          </span>
        )}
        {!online && (
          <span className="flex items-center gap-1.5 rounded-md bg-amber-500/15 px-2 py-1 text-xs text-amber-300">
            <WifiOff className="h-3.5 w-3.5" /> Offline. Still presenting what's loaded.
          </span>
        )}
        {!session.canPresent && <span className="rounded-md bg-amber-500/15 px-2 py-1 text-xs text-amber-300">Plan not active</span>}
        {session.fumsPending > 0 && (
          <span className="rounded-md bg-neutral-800 px-2 py-1 text-xs text-neutral-400" title="Scripture display reports waiting to send">
            {session.fumsPending} report{session.fumsPending === 1 ? "" : "s"} waiting
          </span>
        )}
        <Button size="sm" variant="secondary" onClick={() => void chooseScreen("main")}>
          <MonitorUp className="h-4 w-4" /> {projectorConnected ? "Reopen main screen" : "Main screen"}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => void chooseScreen("stage")}>
          <Tv className="h-4 w-4" /> {stageConnected ? "Reopen stage display" : "Stage display"}
        </Button>
        <Button size="sm" variant="ghost" className="text-neutral-300 hover:bg-neutral-800 hover:text-white" onClick={() => setShowNotices(true)} aria-label="Copyright notices">
          <ScrollText className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="ghost" className="text-neutral-300 hover:bg-neutral-800 hover:text-white" onClick={() => setShowShortcuts(true)} aria-label="Keyboard shortcuts">
          <Keyboard className="h-4 w-4" />
        </Button>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* ── service order ── */}
        <nav aria-label="Service order" className="flex w-64 shrink-0 flex-col border-r border-neutral-800">
          <div className="flex items-center justify-between px-3 pb-1 pt-3">
            <p className={panelTitle}>Service order</p>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost" className="h-7 text-neutral-300 hover:bg-neutral-800 hover:text-white" disabled={busy}>
                  <Plus className="h-4 w-4" /> Add
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => openPicker("sermon")}><Presentation className="h-4 w-4" /> Sermon</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => openPicker("song")}><Music className="h-4 w-4" /> Song</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => addBlankSection()}><Square className="h-4 w-4" /> Blank slide</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <ol className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-3">
            {bundle.items.map((item, i) => {
              const Icon = ITEM_ICON[item.type] ?? Square;
              const row = serviceItem(item.id);
              const orderIndex = row ? orderIds.indexOf(row.id) : -1;
              const isLiveItem = i === state.cursor.item && state.mode === "live";
              const unavailable = item.slides.some((s) => s.kind === "missing");
              return (
                <li
                  key={item.id}
                  draggable={Boolean(row) && !busy && !renaming}
                  onDragStart={() => setDragFrom(orderIndex)}
                  onDragOver={(e) => row && e.preventDefault()}
                  onDrop={() => row && dropAt(orderIndex)}
                  className={`group flex items-center gap-1 rounded-md pr-1 ${i === shownIndex ? "bg-primary/25" : "hover:bg-neutral-900"} ${dragFrom === orderIndex ? "opacity-40" : ""}`}
                >
                  <span className="cursor-grab px-1 text-neutral-600 opacity-0 group-hover:opacity-100" aria-hidden>{row ? <GripVertical className="h-4 w-4" /> : null}</span>
                  {renaming && row && renaming.rowId === row.id ? (
                    <div className="flex min-w-0 flex-1 items-center gap-2 py-1.5">
                      <Icon className="h-4 w-4 shrink-0 text-neutral-400" />
                      <Input
                        autoFocus
                        aria-label="Section name"
                        className="h-7 border-neutral-700 bg-neutral-950 px-2 text-sm text-neutral-100"
                        value={renaming.value}
                        maxLength={120}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => setRenaming({ rowId: row.id, value: e.target.value })}
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === "Enter") saveRename();
                          if (e.key === "Escape") setRenaming(null);
                        }}
                        onBlur={saveRename}
                      />
                    </div>
                  ) : (
                  <button
                    type="button"
                    onClick={() => setViewItem(i)}
                    onDoubleClick={() => row && setRenaming({ rowId: row.id, value: item.label })}
                    className="flex min-w-0 flex-1 items-start gap-2 py-2 text-left text-sm"
                  >
                    <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${isLiveItem ? "text-red-400" : "text-neutral-400"}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-neutral-100">{item.label}</span>
                      <span className="block text-xs text-neutral-500">
                        {item.slides.length} slide{item.slides.length === 1 ? "" : "s"}
                        {item.stage.timer_seconds ? ` · ${formatCountdown(item.stage.timer_seconds * 1000)}` : ""}
                        {unavailable && <span className="text-amber-400"> · check slides</span>}
                      </span>
                    </span>
                  </button>
                  )}
                  {row && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-neutral-400 opacity-0 hover:bg-neutral-800 hover:text-white group-hover:opacity-100 data-[state=open]:opacity-100" aria-label={`${item.label} options`}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56" onCloseAutoFocus={(e) => renamingRef.current && e.preventDefault()}>
                        <DropdownMenuItem onSelect={() => { renamingRef.current = true; setRenaming({ rowId: row.id, value: item.label }); }}><Pencil className="h-4 w-4" /> Rename</DropdownMenuItem>
                        {item.type === "sermon" && <DropdownMenuItem onSelect={() => chooseFor(row, "sermon")}>{item.sermon_id ? "Change sermon" : "Choose sermon"}</DropdownMenuItem>}
                        {item.type === "song" && <DropdownMenuItem onSelect={() => chooseFor(row, "song")}>{item.song_id ? "Change song" : "Choose song"}</DropdownMenuItem>}
                        {item.type === "song" && item.song_id && (
                          <DropdownMenuItem onSelect={() => setArranging({ row, songId: item.song_id! })}>
                            Arrangement for this service{Array.isArray(row.payload.arrangement) && row.payload.arrangement.length ? " (custom)" : ""}
                          </DropdownMenuItem>
                        )}
                        {item.type === "song" && item.song_id && <DropdownMenuItem onSelect={() => setSongEditor({ songId: item.song_id!, addToService: false })}>Edit song</DropdownMenuItem>}
                        {item.type === "scripture" && <DropdownMenuItem onSelect={() => editSlide(item, item.slides[0] ?? { id: "x", kind: "blank", style: { background: "#000", fontFamily: "Georgia", textColor: "#fff" } })}>Edit reading</DropdownMenuItem>}
                        {item.type === "sermon" && item.sermon_id && <DropdownMenuItem onSelect={() => navigate(`/editor/${item.sermon_id}`)}>Open in sermon editor</DropdownMenuItem>}
                        {TEXT_SECTION_TYPES.has(item.type) && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Text position</DropdownMenuLabel>
                            <DropdownMenuRadioGroup
                              value={typeof row.payload.text_position === "string" ? row.payload.text_position : "default"}
                              onValueChange={(v) => {
                                const payload = { ...row.payload };
                                if (v === "default") delete payload.text_position;
                                else payload.text_position = v;
                                void run("Could not save the text position", () => updateServiceItem(row.id, { payload }));
                              }}
                            >
                              <DropdownMenuRadioItem value="default">{item.type === "song" ? "The song's setting" : "Center (default)"}</DropdownMenuRadioItem>
                              {(Object.keys(POSITION_LABELS) as Array<keyof typeof POSITION_LABELS>).map((p) => (
                                <DropdownMenuRadioItem key={p} value={p}>{POSITION_LABELS[p]}</DropdownMenuRadioItem>
                              ))}
                            </DropdownMenuRadioGroup>
                          </>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Stage display</DropdownMenuLabel>
                        <DropdownMenuRadioGroup
                          value={typeof row.payload.stage_template === "string" ? row.payload.stage_template : "default"}
                          onValueChange={(v) => void run("Could not save the stage setting", () => setItemStageSettings(row, { template: v === "default" ? null : (v as StageTemplate) }))}
                        >
                          <DropdownMenuRadioItem value="default">Default for this item</DropdownMenuRadioItem>
                          {STAGE_TEMPLATES.map((t) => <DropdownMenuRadioItem key={t} value={t}>{STAGE_TEMPLATE_LABELS[t]}</DropdownMenuRadioItem>)}
                        </DropdownMenuRadioGroup>
                        <DropdownMenuItem onSelect={() => { setCountdownFor(row); setCountdownMinutes(item.stage.timer_seconds ? String(Math.round(item.stage.timer_seconds / 60)) : ""); }}>
                          <Clock className="h-4 w-4" /> {item.stage.timer_seconds ? "Change countdown" : "Set countdown"}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive" onSelect={() => void run("Could not remove the item", () => removeServiceItem(row.id))}>
                          Remove from service
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </li>
              );
            })}
          </ol>
          {bundle.items.length === 0 && (
            <p className="px-4 pb-6 text-sm text-neutral-500">Start with Add: a sermon, a song, or a blank slide. A blank slide can hold text, pictures, logos, and videos.</p>
          )}
          {!service.isTemplate && bundle.items.length > 0 && (
            <div className="border-t border-neutral-800 p-3">
              <Button
                size="sm"
                variant="outline"
                className="w-full border-neutral-700 bg-transparent text-neutral-200 hover:bg-neutral-800 hover:text-white"
                onClick={() => setTemplateName(service.title)}
              >
                <LayoutTemplate className="h-4 w-4" /> Save as template
              </Button>
              <p className="mt-1.5 text-center text-[11px] text-neutral-500">Saves this service order to reuse</p>
            </div>
          )}
        </nav>

        {/* ── slides of the selected item ── */}
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-2 border-b border-neutral-800 px-4 py-2">
            <p className="truncate font-medium">{shownItem?.label ?? "No items yet"}</p>
            {shownItem && <span className="rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400">Stage: {STAGE_TEMPLATE_LABELS[shownItem.stage.template]}</span>}
            {shownRow && typeof shownRow.payload.text_position === "string" && shownRow.payload.text_position in POSITION_LABELS && (
              <span className="rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400">Text: {POSITION_LABELS[shownRow.payload.text_position as keyof typeof POSITION_LABELS]}</span>
            )}
            <span className="ml-auto text-xs text-neutral-500">Click a slide to show it. Double-click to edit.</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {shownItem && shownRow && shownItem.slides.length === 0 && ((shownItem.type === "sermon" && !shownItem.sermon_id) || (shownItem.type === "song" && !shownItem.song_id)) ? (
              <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-neutral-700 text-center">
                {shownItem.type === "sermon" ? <Presentation className="h-8 w-8 text-neutral-500" /> : <Music className="h-8 w-8 text-neutral-500" />}
                <p className="text-sm text-neutral-400">No {shownItem.type} chosen yet.</p>
                <Button onClick={() => chooseFor(shownRow, shownItem.type as "sermon" | "song")}>
                  {shownItem.type === "sermon" ? "Choose sermon" : "Choose song"}
                </Button>
              </div>
            ) : shownItem && shownItem.slides.length === 0 && (
              <p className="text-sm text-neutral-500">
                This item has no slides yet.{" "}
                {shownItem.type === "scripture" && shownRow && (
                  <button type="button" className="underline" onClick={() => editSlide(shownItem, { id: "x", kind: "blank", style: { background: "#000", fontFamily: "Georgia", textColor: "#fff" } })}>Add references</button>
                )}
              </p>
            )}
            {shownItem && (
              <SlideGrid
                slides={shownItem.slides}
                itemIndex={shownIndex}
                cursor={state.cursor}
                live={state.mode === "live"}
                images={images}
                videos={session.videoUrls}
                editable={addKindsFor(shownItem).length > 0 && !busy}
                addKinds={addKindsFor(shownItem)}
                acceptsGraphicDrop={shownItem.type === "slides"}
                busySlideId={busySlideId}
                caption={slideCaption}
                onSelect={(i) => dispatch({ type: "goToSlide", item: shownIndex, slide: i })}
                onEdit={(slide) => editSlide(shownItem, slide)}
                onMove={(from, before) => moveSlide(shownItem, from, before)}
                onAdd={(kind, after) => addSlide(shownItem, kind, after)}
                onDuplicate={(i) => duplicateSlide(shownItem, i)}
                onDelete={(i) => deleteSlide(shownItem, i)}
                onRemovePicture={(i) => setSlidePicture(shownItem, i, null)}
                onDropImage={(file, indexes) => void dropImage(shownItem, file, indexes)}
                onRemovePictures={(indexes) => setSlidePicture(shownItem, indexes, null)}
                onDropVideo={(file) => void addVideoFile(file)}
              />
            )}
            {uploading && (
              <p className="mt-3 flex items-center gap-2 text-xs text-neutral-400"><Loader2 className="h-3.5 w-3.5 animate-spin" /> {uploading}</p>
            )}
          </div>
        </main>

        {/* ── main screen and stage display ── */}
        <aside className="flex w-[380px] shrink-0 flex-col gap-4 overflow-y-auto border-l border-neutral-800 p-3">
          <section aria-label="Main screen">
            <div className="flex items-center justify-between">
              <p className={panelTitle}>Main screen{state.mode !== "live" && <span className="text-amber-400"> · {state.mode === "black" ? "cleared" : "logo"}</span>}</p>
              <span className={`mb-2 flex items-center gap-1 text-[11px] ${projectorConnected ? "text-emerald-400" : "text-neutral-500"}`}>
                <Radio className="h-3 w-3" /> {projectorConnected ? "Connected" : "Not open"}
              </span>
            </div>
            <SlideView
              frame={frame}
              images={images}
              videos={session.videoUrls}
              renderVideo={(slide) =>
                projectorConnected ? (
                  <VideoPlayer slide={slide} src={session.videoUrls[slide.video?.media_id ?? ""]} mode="follower" follow={session.videoStatus} />
                ) : (
                  <VideoPlayer slide={slide} src={session.videoUrls[slide.video?.media_id ?? ""]} mode="leader" registerController={session.setLocalVideoPlayer} onStatus={session.reportLocalVideoStatus} />
                )
              }
              fallbackTitle={bundle.service.title}
              className="rounded-md ring-2 ring-red-500/70"
            />
            {session.current?.kind === "missing" && (
              <p className="mt-2 rounded bg-amber-500/10 px-2 py-1.5 text-xs text-amber-300">{missingText(session.current.missing_reason)}</p>
            )}
            <div className="mt-2 grid grid-cols-4 gap-1.5">
              <Button size="sm" className={modeButton(false)} onClick={() => dispatch({ type: "prev" })} aria-label="Previous slide"><ChevronLeft className="h-4 w-4" /></Button>
              <Button size="sm" className={modeButton(state.mode === "black")} onClick={() => dispatch({ type: "toggleBlack" })}>Clear</Button>
              <Button size="sm" className={modeButton(false)} disabled={state.mode === "live"} onClick={() => dispatch({ type: "live" })}>Show</Button>
              <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => dispatch({ type: "next" })} aria-label="Next slide"><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </section>

          {session.current?.kind === "video" && (
            <VideoControls slide={session.current} status={session.videoStatus} now={now} onCommand={session.sendVideo} rehearsing={!projectorConnected} />
          )}

          <section aria-label="Stage display controls">
            <div className="flex items-center justify-between">
              <p className={panelTitle}>Stage display</p>
              <span className={`mb-2 flex items-center gap-1 text-[11px] ${stageConnected ? "text-emerald-400" : "text-neutral-500"}`}>
                <Radio className="h-3 w-3" /> {stageConnected ? "Connected" : "Not open"}
              </span>
            </div>
            <StageView frame={stageFrame} now={now} className="rounded-md ring-1 ring-neutral-700" />

            <div className="mt-3 space-y-3 rounded-md bg-neutral-900 p-3">
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Stage layout">
                <Button size="sm" className={`h-7 text-xs ${modeButton(stage.templateOverride === null)}`} onClick={() => dispatchStage({ type: "setTemplate", template: null })} role="radio" aria-checked={stage.templateOverride === null}>
                  Follow item
                </Button>
                {STAGE_TEMPLATES.map((t) => (
                  <Button key={t} size="sm" className={`h-7 text-xs ${modeButton(stage.templateOverride === t)}`} onClick={() => dispatchStage({ type: "setTemplate", template: t })} role="radio" aria-checked={stage.templateOverride === t}>
                    {STAGE_TEMPLATE_LABELS[t]}
                  </Button>
                ))}
              </div>

              <div className="flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-neutral-400" aria-hidden />
                <span className={`w-16 tabular-nums text-sm ${timerMs < 0 ? "text-red-400" : "text-neutral-100"}`}>{formatCountdown(timerMs)}</span>
                {stage.timer.startedAt === null ? (
                  <Button size="sm" className={`h-7 ${modeButton(false)}`} disabled={stage.timer.durationMs <= 0} onClick={() => dispatchStage({ type: "timerStart", now: Date.now() })} aria-label="Start countdown"><Play className="h-3.5 w-3.5" /></Button>
                ) : (
                  <Button size="sm" className={`h-7 ${modeButton(true)}`} onClick={() => dispatchStage({ type: "timerPause", now: Date.now() })} aria-label="Pause countdown"><Pause className="h-3.5 w-3.5" /></Button>
                )}
                <Button size="sm" className={`h-7 ${modeButton(false)}`} onClick={() => dispatchStage({ type: "timerReset" })} aria-label="Reset countdown"><RotateCcw className="h-3.5 w-3.5" /></Button>
                <Button size="sm" className={`h-7 px-2 text-xs ${modeButton(false)}`} onClick={() => dispatchStage({ type: "timerAdjust", seconds: -60 })}>-1m</Button>
                <Button size="sm" className={`h-7 px-2 text-xs ${modeButton(false)}`} onClick={() => dispatchStage({ type: "timerAdjust", seconds: 60 })}>+1m</Button>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="stage-message" className="flex items-center gap-1.5 text-xs text-neutral-300"><MessageSquare className="h-3.5 w-3.5" /> Message to stage</Label>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-neutral-500">{stage.showMessage ? "Showing" : "Hidden"}</span>
                    <Switch
                      aria-label="Show message on stage display"
                      checked={stage.showMessage}
                      disabled={!stage.message.trim()}
                      onCheckedChange={(v) => dispatchStage({ type: "showMessage", show: v })}
                    />
                  </div>
                </div>
                <Input
                  id="stage-message"
                  className="h-8 border-neutral-700 bg-neutral-950 text-sm text-neutral-100"
                  placeholder="Five minutes left"
                  value={stage.message}
                  onChange={(e) => dispatchStage({ type: "setMessage", text: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") dispatchStage({ type: "showMessage", show: true });
                  }}
                />
              </div>
            </div>
          </section>
        </aside>
      </div>

      {/* ── dialogs ── */}
      <PickerDialog
        open={picker === "sermon"}
        title="Add a sermon"
        description="Its slides play in the order you built them."
        options={sermons?.map((s) => ({ id: s.id, title: s.title, detail: s.presentationDate ? formatDateOnlyForDisplay(s.presentationDate) : undefined })) ?? null}
        emptyText="You have no sermons yet. Create one from the dashboard first."
        onPick={(id) => { setPicker(null); pickInto("sermon", id); }}
        onClose={() => { fillRow.current = null; setPicker(null); }}
      />
      <PickerDialog
        open={picker === "song"}
        title="Add a song"
        description="Songs from your church's library."
        options={songs?.map((s) => ({ id: s.id, title: s.title, detail: [s.author, s.ccliSongNumber && `CCLI ${s.ccliSongNumber}`].filter(Boolean).join(" · ") || undefined })) ?? null}
        emptyText="Your song library is empty. Add your first song."
        onPick={(id) => { setPicker(null); pickInto("song", id); }}
        onClose={() => { fillRow.current = null; setPicker(null); }}
        footer={
          <Button variant="outline" onClick={() => { setPicker(null); setSongEditor({ songId: null, addToService: true }); }}>
            <ListMusic className="h-4 w-4" /> New song
          </Button>
        }
      />
      <ReadingDialog open={reading !== null} initial={reading?.draft ?? null} onSave={saveReading} onClose={() => setReading(null)} />
      <SongEditorDialog
        open={songEditor !== null}
        songId={songEditor?.songId ?? null}
        onClose={() => setSongEditor(null)}
        onSaved={(songId) => {
          const addIt = songEditor?.addToService;
          setSongEditor(null);
          if (addIt) add({ type: "song", songId });
          else void session.reload();
        }}
      />
      <SlideEditDialog
        slide={editingSlide}
        images={images}
        onSave={saveSlideEdit}
        onClose={() => setEditingSlide(null)}
        onUploadImage={(file) => {
          const problem = fileProblem(file);
          if (problem || classifyFile(file) !== "image") return Promise.reject(new Error(problem ?? "Choose a PNG, JPG, WebP, or GIF picture."));
          return uploadSlideImage(file, serviceId, editingSlide?.id.replace(/[^A-Za-z0-9-]/g, "") || "slide");
        }}
      />
      <PickerDialog
        open={picker === "video"}
        title="Add a video"
        description="Videos in your church's library. You can also drag a video file onto the slides area."
        options={videoLibrary?.map((v) => ({ id: v.id, title: v.fileName, detail: v.durationSeconds ? formatDuration(v.durationSeconds) : undefined })) ?? null}
        emptyText="No videos yet. Upload your first one."
        onPick={(id) => { setPicker(null); placeVideo(id); }}
        onClose={() => { pendingVideo.current = null; setPicker(null); }}
        footer={
          <Button variant="outline" disabled={uploading !== null} onClick={() => videoInput.current?.click()}>
            <Upload className="h-4 w-4" /> Upload video
          </Button>
        }
      />
      <input
        ref={videoInput}
        type="file"
        accept="video/mp4,video/quicktime,video/webm"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) { setPicker(null); void addVideoFile(file); }
        }}
      />
      <input
        ref={graphicInput}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          const pending = pendingGraphic.current;
          pendingGraphic.current = null;
          if (file && pending) void dropImage(pending.item, file, null);
        }}
      />
      <ServiceArrangementDialog
        target={arranging ? { songId: arranging.songId, current: Array.isArray(arranging.row.payload.arrangement) ? (arranging.row.payload.arrangement as string[]) : [] } : null}
        onClose={() => setArranging(null)}
        onSave={async (arrangement) => {
          const row = arranging?.row;
          if (!row) return;
          const payload = { ...row.payload };
          if (arrangement.length) payload.arrangement = arrangement;
          else delete payload.arrangement;
          if (await run("Could not save the arrangement", () => updateServiceItem(row.id, { payload }))) setArranging(null);
        }}
      />
      <Dialog open={templateName !== null} onOpenChange={(o) => !o && !savingTemplate && setTemplateName(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save as template</DialogTitle>
            <DialogDescription>
              Saves this order of sections, their names, blank slides, and stage settings. Sermons and songs are left empty so you can pick new ones each week.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-1">
            <Label htmlFor="template-name">Template name</Label>
            <Input
              id="template-name"
              value={templateName ?? ""}
              maxLength={120}
              placeholder="Sunday Morning"
              onChange={(e) => setTemplateName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void saveTemplate()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateName(null)} disabled={savingTemplate}>Cancel</Button>
            <Button onClick={() => void saveTemplate()} disabled={savingTemplate}>
              {savingTemplate && <Loader2 className="h-4 w-4 animate-spin" />}
              Save template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={videoSettings !== null} onOpenChange={(o) => !o && setVideoSettings(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Video settings</DialogTitle>
            <DialogDescription>What happens when this video finishes.</DialogDescription>
          </DialogHeader>
          {videoSettings && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="video-loop">Loop until I move on</Label>
                <Switch id="video-loop" checked={videoSettings.loop} onCheckedChange={(v) => setVideoSettings({ ...videoSettings, loop: v })} />
              </div>
              <div className="space-y-1.5" role="radiogroup" aria-label="When it ends">
                <Label>When it ends</Label>
                {([["hold", "Stay on the last frame"], ["clear", "Clear the screen"], ["next", "Go to the next item"]] as const).map(([value, label]) => (
                  <label key={value} className="flex items-center gap-2 text-sm">
                    <input type="radio" name="video-end" disabled={videoSettings.loop} checked={videoSettings.endAction === value} onChange={() => setVideoSettings({ ...videoSettings, endAction: value })} />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setVideoSettings(null)}>Cancel</Button>
            <Button
              onClick={() => {
                const v = videoSettings;
                if (!v) return;
                setVideoSettings(null);
                if (v.target.kind === "item") {
                  const row = v.target.row;
                  void run("Could not save the video settings", () => updateServiceItem(row.id, { payload: { ...row.payload, loop: v.loop, end_action: v.endAction } }));
                } else {
                  const index = v.target.index;
                  void mutateSlides(v.target.item, "Could not save the video settings", (list) =>
                    list.map((s, i) => (i === index ? { ...(s as CustomSlide), loop: v.loop, end_action: v.endAction } : s)));
                }
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={countdownFor !== null} onOpenChange={(o) => !o && setCountdownFor(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Countdown</DialogTitle>
            <DialogDescription>Shows on the Message and Video stage layouts. Leave empty for none.</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <Input aria-label="Minutes" inputMode="numeric" className="w-24" value={countdownMinutes} onChange={(e) => setCountdownMinutes(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))} />
            <span className="text-sm text-muted-foreground">minutes</span>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCountdownFor(null)}>Cancel</Button>
            <Button
              onClick={() => {
                const row = countdownFor;
                setCountdownFor(null);
                if (row) void run("Could not save the countdown", () => setItemStageSettings(row, { timerSeconds: countdownMinutes ? Number(countdownMinutes) * 60 : null }));
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={displays !== null} onOpenChange={(o) => !o && setDisplays(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{displays?.kind === "stage" ? "Which screen is the stage display?" : "Which screen is the main screen?"}</DialogTitle>
            <DialogDescription>It opens full size on the screen you pick.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {(displays?.list ?? []).map((d) => (
              <Button key={d.id} variant={d === pickDefaultDisplay(displays?.list ?? []) ? "default" : "outline"} className="w-full justify-between" onClick={() => displays && openWindow(displays.kind, d, true)}>
                <span>{d.label}{d.isCurrent ? " (this screen)" : ""}</span>
                <span className="text-xs opacity-70">{d.width} x {d.height}</span>
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showShortcuts} onOpenChange={setShowShortcuts}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Keyboard shortcuts</DialogTitle></DialogHeader>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            {SHORTCUTS.map((s) => (
              <div key={s.keys} className="contents">
                <dt className="font-mono text-muted-foreground">{s.keys}</dt>
                <dd>{s.action}</dd>
              </div>
            ))}
          </dl>
        </DialogContent>
      </Dialog>

      <Dialog open={showNotices} onOpenChange={setShowNotices}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Copyright notices</DialogTitle>
            <DialogDescription>The translations used in this service.</DialogDescription>
          </DialogHeader>
          {translations.length === 0 ? (
            <p className="text-sm text-muted-foreground">This service shows no scripture.</p>
          ) : (
            <ul className="space-y-3 text-sm">
              {translations.map((t) => <li key={t.id}><span className="font-semibold">{t.name} ({t.id}).</span> {t.notice}</li>)}
            </ul>
          )}
        </DialogContent>
      </Dialog>

      {busy && (
        <div className="pointer-events-none fixed bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-neutral-800 px-3 py-1.5 text-xs text-neutral-200">
          <Loader2 className="mr-1.5 inline h-3 w-3 animate-spin" /> Saving
        </div>
      )}
    </div>
  );
};

export default ServiceWorkspace;
