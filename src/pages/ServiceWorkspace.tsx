// The service workspace: lay out, edit, and run a service in one place.
//
//   left    service order: add, drag to reorder, per-item stage settings
//   middle  every slide of the selected item; click to show, double-click to edit
//   right   main screen preview and controls, stage display preview and controls
//
// Our own layout and visual design (see CLAUDE.md: no ProPresenter trade dress).

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Clock,
  GripVertical,
  Image as ImageIcon,
  Keyboard,
  ListMusic,
  Loader2,
  MessageSquare,
  MonitorPlay,
  MonitorUp,
  MoreHorizontal,
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
  type ScripturePayload,
  type SermonOption,
  type ServiceDetail,
  type ServiceItem,
  setItemStageSettings,
  updateService,
  updateServiceItem,
} from "@/lib/services";
import { holdSessionWhilePresenting } from "@/lib/session-security";
import { listSongs, type Song } from "@/lib/songs";
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
import type { BundleItem, OutputFrame, PresenterSlide } from "@/presenter/core/types";
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

const ITEM_ICON: Record<BundleItem["type"], typeof Square> = {
  sermon: Presentation,
  scripture: BookOpen,
  song: Music,
  logo: ImageIcon,
  blank: Square,
  credits: ScrollText,
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
type AddKind = "sermon" | "song";

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
  const [sermons, setSermons] = useState<SermonOption[] | null>(null);
  const [songs, setSongs] = useState<Song[] | null>(null);
  const [reading, setReading] = useState<{ itemId: string | null; draft: ReadingDraft | null } | null>(null);
  const [songEditor, setSongEditor] = useState<{ songId: string | null; addToService: boolean } | null>(null);
  const [editingSlide, setEditingSlide] = useState<PresenterSlide | null>(null);
  const [countdownFor, setCountdownFor] = useState<ServiceItem | null>(null);
  const [countdownMinutes, setCountdownMinutes] = useState("");
  const [displays, setDisplays] = useState<{ kind: WindowKind; list: DisplayInfo[] } | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showNotices, setShowNotices] = useState(false);
  const [dragFrom, setDragFrom] = useState<number | null>(null);

  const deps = useMemo(() => ({
    invoke,
    createTransport: createBroadcastTransport,
    queueStorage: createIndexedDbQueueStorage(),
    deviceId: getDeviceId(),
    resolveImages: resolveBackgroundImages,
    newNonce: () => newChannelNonce(),
    onNotice: ({ kind, message }: { kind: string; message: string }) =>
      kind === "revoked" ? toast.warning(message, { duration: 10_000 }) : kind === "refresh_failed" ? undefined : toast(message),
  }), []);

  const session = usePresenterSession(serviceId, deps);
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

  const anyDialogOpen = Boolean(picker || reading || songEditor || editingSlide || countdownFor || displays || showShortcuts || showNotices);
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
  const run = async (label: string, action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      await Promise.all([loadService(), session.reload()]);
    } catch (error) {
      toast.error(label, { description: (error as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const serviceItem = (bundleItemId: string) => service?.items.find((i) => i.id === bundleItemId) ?? null;

  // ── adding items ──
  const openPicker = (kind: AddKind) => {
    setPicker(kind);
    if (kind === "sermon") listSermonOptions().then(setSermons).catch(() => setSermons([]));
    else listSongs().then(setSongs).catch(() => setSongs([]));
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

  // ── windows ──
  const openWindow = (kind: WindowKind, display: DisplayInfo | null) => {
    setDisplays(null);
    const path = kind === "main" ? "output" : "stage";
    const url = `/present/${serviceId}/${path}?channel=${encodeURIComponent(session.nonce)}`;
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
    if (!supportsWindowManagement(window)) return openWindow(kind, null);
    const result = await listDisplays(window);
    if (!result.supported || result.displays.length < 2) return openWindow(kind, null);
    setDisplays({ kind, list: result.displays });
  };

  // ── editing ──
  const editSlide = (item: BundleItem, slide: PresenterSlide) => {
    const row = serviceItem(item.id);
    if (slide.source && (slide.kind === "title" || slide.kind === "point" || slide.kind === "scripture" || slide.kind === "missing")) {
      setEditingSlide(slide);
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
        <Link to="/dashboard/services" onClick={() => session.endSession()}>
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
        <span className="mr-auto text-xs text-neutral-500">{service.serviceDate ? formatDateOnlyForDisplay(service.serviceDate) : ""}</span>

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
                <DropdownMenuItem onSelect={() => setReading({ itemId: null, draft: null })}><BookOpen className="h-4 w-4" /> Reading</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => add({ type: "logo" })}><ImageIcon className="h-4 w-4" /> Logo screen</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => add({ type: "blank" })}><Square className="h-4 w-4" /> Black screen</DropdownMenuItem>
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
                  draggable={Boolean(row) && !busy}
                  onDragStart={() => setDragFrom(orderIndex)}
                  onDragOver={(e) => row && e.preventDefault()}
                  onDrop={() => row && dropAt(orderIndex)}
                  className={`group flex items-center gap-1 rounded-md pr-1 ${i === shownIndex ? "bg-primary/25" : "hover:bg-neutral-900"} ${dragFrom === orderIndex ? "opacity-40" : ""}`}
                >
                  <span className="cursor-grab px-1 text-neutral-600 opacity-0 group-hover:opacity-100" aria-hidden>{row ? <GripVertical className="h-4 w-4" /> : null}</span>
                  <button type="button" onClick={() => setViewItem(i)} className="flex min-w-0 flex-1 items-start gap-2 py-2 text-left text-sm">
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
                  {row && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-neutral-400 opacity-0 hover:bg-neutral-800 hover:text-white group-hover:opacity-100 data-[state=open]:opacity-100" aria-label={`${item.label} options`}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        {item.type === "song" && item.song_id && <DropdownMenuItem onSelect={() => setSongEditor({ songId: item.song_id!, addToService: false })}>Edit song</DropdownMenuItem>}
                        {item.type === "scripture" && <DropdownMenuItem onSelect={() => editSlide(item, item.slides[0] ?? { id: "x", kind: "blank", style: { background: "#000", fontFamily: "Georgia", textColor: "#fff" } })}>Edit reading</DropdownMenuItem>}
                        {item.type === "sermon" && item.sermon_id && <DropdownMenuItem onSelect={() => navigate(`/editor/${item.sermon_id}`)}>Open in sermon editor</DropdownMenuItem>}
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
            <p className="px-4 pb-6 text-sm text-neutral-500">Start with Add: a sermon, songs, readings, and logo or black screens.</p>
          )}
        </nav>

        {/* ── slides of the selected item ── */}
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-2 border-b border-neutral-800 px-4 py-2">
            <p className="truncate font-medium">{shownItem?.label ?? "No items yet"}</p>
            {shownItem && <span className="rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400">Stage: {STAGE_TEMPLATE_LABELS[shownItem.stage.template]}</span>}
            <span className="ml-auto text-xs text-neutral-500">Click a slide to show it. Double-click to edit.</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {shownItem && shownItem.slides.length === 0 && (
              <p className="text-sm text-neutral-500">
                This item has no slides yet.{" "}
                {shownItem.type === "scripture" && shownRow && (
                  <button type="button" className="underline" onClick={() => editSlide(shownItem, { id: "x", kind: "blank", style: { background: "#000", fontFamily: "Georgia", textColor: "#fff" } })}>Add references</button>
                )}
              </p>
            )}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-4">
              {shownItem?.slides.map((slide, i) => {
                const isCursor = state.cursor.item === shownIndex && state.cursor.slide === i;
                const isLive = isCursor && state.mode === "live";
                return (
                  <button
                    key={slide.id}
                    type="button"
                    onClick={() => dispatch({ type: "goToSlide", item: shownIndex, slide: i })}
                    onDoubleClick={() => editSlide(shownItem, slide)}
                    className={`rounded-md p-1 text-left transition-colors ${isLive ? "bg-red-500/20 ring-2 ring-red-500" : isCursor ? "ring-2 ring-primary" : "ring-1 ring-neutral-800 hover:ring-neutral-600"}`}
                    aria-label={`Slide ${i + 1}: ${slideCaption(slide)}`}
                    aria-current={isCursor ? "true" : undefined}
                  >
                    <SlideView frame={asFrame(slide)} images={images} showMissing className="rounded" />
                    <span className="mt-1 flex items-center gap-1.5 px-1 text-xs text-neutral-400">
                      <span className="tabular-nums text-neutral-500">{i + 1}</span>
                      <span className="truncate">{slideCaption(slide)}</span>
                      {slide.notes && <StickyNote className="ml-auto h-3 w-3 shrink-0 text-amber-300" aria-label="Has speaker notes" />}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </main>

        {/* ── main screen and stage display ── */}
        <aside className="flex w-[380px] shrink-0 flex-col gap-4 overflow-y-auto border-l border-neutral-800 p-3">
          <section aria-label="Main screen">
            <div className="flex items-center justify-between">
              <p className={panelTitle}>Main screen{state.mode !== "live" && <span className="text-amber-400"> · {state.mode === "black" ? "black" : "logo"}</span>}</p>
              <span className={`mb-2 flex items-center gap-1 text-[11px] ${projectorConnected ? "text-emerald-400" : "text-neutral-500"}`}>
                <Radio className="h-3 w-3" /> {projectorConnected ? "Connected" : "Not open"}
              </span>
            </div>
            <SlideView frame={frame} images={images} fallbackTitle={bundle.service.title} className="rounded-md ring-2 ring-red-500/70" />
            {session.current?.kind === "missing" && (
              <p className="mt-2 rounded bg-amber-500/10 px-2 py-1.5 text-xs text-amber-300">{missingText(session.current.missing_reason)}</p>
            )}
            <div className="mt-2 grid grid-cols-5 gap-1.5">
              <Button size="sm" className={modeButton(false)} onClick={() => dispatch({ type: "prev" })} aria-label="Previous slide"><ChevronLeft className="h-4 w-4" /></Button>
              <Button size="sm" className={modeButton(state.mode === "black")} onClick={() => dispatch({ type: "toggleBlack" })}>Black</Button>
              <Button size="sm" className={modeButton(state.mode === "logo")} onClick={() => dispatch({ type: "toggleLogo" })}>Logo</Button>
              <Button size="sm" className={modeButton(false)} disabled={state.mode === "live"} onClick={() => dispatch({ type: "live" })}>Show</Button>
              <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => dispatch({ type: "next" })} aria-label="Next slide"><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </section>

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
        onPick={(id) => { setPicker(null); add({ type: "sermon", sermonId: id }); }}
        onClose={() => setPicker(null)}
      />
      <PickerDialog
        open={picker === "song"}
        title="Add a song"
        description="Songs from your church's library."
        options={songs?.map((s) => ({ id: s.id, title: s.title, detail: [s.author, s.ccliSongNumber && `CCLI ${s.ccliSongNumber}`].filter(Boolean).join(" · ") || undefined })) ?? null}
        emptyText="Your song library is empty. Add your first song."
        onPick={(id) => { setPicker(null); add({ type: "song", songId: id }); }}
        onClose={() => setPicker(null)}
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
      <SlideEditDialog slide={editingSlide} onSave={saveSlideEdit} onClose={() => setEditingSlide(null)} />

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
              <Button key={d.id} variant={d === pickDefaultDisplay(displays?.list ?? []) ? "default" : "outline"} className="w-full justify-between" onClick={() => displays && openWindow(displays.kind, d)}>
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
