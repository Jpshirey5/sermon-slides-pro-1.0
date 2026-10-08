// The operator view: what is on the projector, what is next, the whole
// service order, and the controls to run it.

import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  Keyboard,
  Loader2,
  MonitorPlay,
  MonitorUp,
  Radio,
  ScrollText,
  Square,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { resolveBackgroundImages } from "@/lib/background-assets";
import { holdSessionWhilePresenting } from "@/lib/session-security";
import type { BundleFetchError, Invoke } from "@/presenter/core/bundle-client";
import {
  type DisplayInfo,
  listDisplays,
  openOutputWindow,
  pickDefaultDisplay,
  supportsWindowManagement,
} from "@/presenter/core/displays";
import { createIndexedDbQueueStorage, getDeviceId } from "@/presenter/core/fums-queue";
import { createBroadcastTransport, newChannelNonce } from "@/presenter/core/transport";
import type { OutputFrame, PresenterSlide } from "@/presenter/core/types";
import { missingText, SlideView } from "@/presenter/ui/SlideView";
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
  not_found: "We could not find this service. It may have been deleted, or it belongs to another church.",
  plan_required: "Presenting needs an active plan. Check your billing on the Account page.",
  rate_limited: "Too many requests just now. Wait a moment and try again.",
  too_large: "This service has more scripture than we can load at once. Split long readings into smaller ones.",
  network: "We could not reach Sermon Slide Pro. Check the internet connection and try again.",
  server: "Something went wrong loading this service. Try again in a moment.",
};

const asFrame = (slide: PresenterSlide | null): OutputFrame => (slide ? { kind: "slide", slide } : { kind: "black" });

function slideLabel(slide: PresenterSlide): string {
  switch (slide.kind) {
    case "scripture":
      return slide.reference ?? "Scripture";
    case "title":
    case "point":
      return slide.title ?? "Slide";
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

const Present = () => {
  const { serviceId = "" } = useParams();
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [displays, setDisplays] = useState<DisplayInfo[] | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showNotices, setShowNotices] = useState(false);

  const deps = useMemo(() => ({
    invoke,
    createTransport: createBroadcastTransport,
    queueStorage: createIndexedDbQueueStorage(),
    deviceId: getDeviceId(),
    resolveImages: resolveBackgroundImages,
    newNonce: () => newChannelNonce(),
    onNotice: ({ kind, message }: { kind: string; message: string }) =>
      kind === "revoked" ? toast.warning(message, { duration: 10_000 }) : toast(message),
  }), []);

  const session = usePresenterSession(serviceId, deps);
  const { bundle, state, dispatch, frame, images, projectorConnected } = session;

  useKeyboardShortcuts(dispatch, session.load.kind === "ready");

  // Keep the operator signed in while presenting (see holdSessionWhilePresenting).
  useEffect(() => holdSessionWhilePresenting(), []);

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

  // Warn before leaving while the projector is live. The bundle is held in
  // memory only, so a reload without internet would lose the service.
  useEffect(() => {
    if (!projectorConnected) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [projectorConnected]);

  useEffect(() => {
    if (bundle) document.title = `Presenting: ${bundle.service.title}`;
  }, [bundle]);

  const outputUrl = `/present/${serviceId}/output?channel=${encodeURIComponent(session.nonce)}`;

  const openOn = (display: DisplayInfo | null) => {
    setDisplays(null);
    const win = openOutputWindow(window, outputUrl, display);
    if (!win) {
      toast.error("Your browser blocked the projector window. Allow pop-ups for this site, then try again.");
      return;
    }
    session.attachProjectorWindow(win);
    if (!display) toast("Drag the new window to the projector, then click Go full screen.");
  };

  const openProjector = async () => {
    if (!supportsWindowManagement(window)) return openOn(null);
    const result = await listDisplays(window);
    if (!result.supported || result.displays.length < 2) return openOn(null);
    setDisplays(result.displays);
  };

  if (session.load.kind === "loading" && !bundle) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-neutral-950 text-neutral-300">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading the service...
      </div>
    );
  }

  if (session.load.kind === "error" && !bundle) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-neutral-950 px-4 text-neutral-100">
        <div className="max-w-md text-center">
          <p className="mb-6">{LOAD_ERRORS[session.load.error]}</p>
          <div className="flex justify-center gap-2">
            <Button variant="secondary" onClick={session.retry}>Try again</Button>
            <Link to={`/dashboard/services/${serviceId}`}><Button variant="ghost" className="text-neutral-300">Back to the service</Button></Link>
          </div>
        </div>
      </div>
    );
  }

  if (!bundle) return null;

  const currentItem = bundle.items[state.cursor.item];
  const translations = Object.values(bundle.translations);
  const modeButton = (active: boolean) =>
    active ? "bg-amber-500 text-black hover:bg-amber-400" : "bg-neutral-800 text-neutral-100 hover:bg-neutral-700";

  return (
    <div className="fixed inset-0 flex flex-col bg-neutral-950 text-neutral-100">
      {/* Top bar */}
      <header className="flex flex-wrap items-center gap-2 border-b border-neutral-800 px-4 py-2">
        <Link to={`/dashboard/services/${serviceId}`} onClick={() => session.endSession()}>
          <Button variant="ghost" size="sm" className="text-neutral-300 hover:bg-neutral-800 hover:text-white">
            <ArrowLeft className="h-4 w-4" /> Exit
          </Button>
        </Link>
        <h1 className="mr-auto truncate font-serif text-lg">{bundle.service.title}</h1>

        {!online && (
          <span className="flex items-center gap-1.5 rounded-md bg-amber-500/15 px-2 py-1 text-xs text-amber-300">
            <WifiOff className="h-3.5 w-3.5" /> Offline. Still presenting what is loaded.
          </span>
        )}
        {!session.canPresent && (
          <span className="rounded-md bg-amber-500/15 px-2 py-1 text-xs text-amber-300">Plan not active</span>
        )}
        <span className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs ${projectorConnected ? "bg-emerald-500/15 text-emerald-300" : "bg-neutral-800 text-neutral-400"}`}>
          <Radio className="h-3.5 w-3.5" /> {projectorConnected ? "Projector connected" : "Projector not open"}
        </span>
        {session.fumsPending > 0 && (
          <span className="rounded-md bg-neutral-800 px-2 py-1 text-xs text-neutral-400" title="Scripture display reports waiting to send">
            {session.fumsPending} report{session.fumsPending === 1 ? "" : "s"} waiting
          </span>
        )}
        <Button size="sm" variant="secondary" onClick={() => void openProjector()}>
          <MonitorUp className="h-4 w-4" /> {projectorConnected ? "Reopen projector" : "Open projector"}
        </Button>
        <Button size="sm" variant="ghost" className="text-neutral-300 hover:bg-neutral-800 hover:text-white" onClick={() => setShowNotices(true)} aria-label="Copyright notices">
          <ScrollText className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="ghost" className="text-neutral-300 hover:bg-neutral-800 hover:text-white" onClick={() => setShowShortcuts(true)} aria-label="Keyboard shortcuts">
          <Keyboard className="h-4 w-4" />
        </Button>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Service order */}
        <nav aria-label="Service order" className="w-64 shrink-0 overflow-y-auto border-r border-neutral-800 p-2">
          <ol className="space-y-1">
            {bundle.items.map((item, i) => {
              const active = i === state.cursor.item;
              const unavailable = item.slides.some((s) => s.kind === "missing");
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    disabled={item.slides.length === 0}
                    onClick={() => dispatch({ type: "goToItem", item: i })}
                    className={`flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-sm disabled:opacity-40 ${active ? "bg-primary/25 text-white" : "text-neutral-300 hover:bg-neutral-800"}`}
                  >
                    <span className="w-5 shrink-0 text-right tabular-nums text-neutral-500">{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{item.label}</span>
                      <span className="block text-xs text-neutral-500">
                        {item.slides.length} slide{item.slides.length === 1 ? "" : "s"}
                        {unavailable && <span className="text-amber-400"> · some unavailable</span>}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        {/* Current and next */}
        <main className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <section aria-label="On the projector">
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-neutral-400">
                On the projector{state.mode !== "live" && <span className="text-amber-400"> · {state.mode === "black" ? "black screen" : "logo"}</span>}
              </p>
              <SlideView frame={frame} images={images} fallbackTitle={bundle.service.title} className="rounded-md ring-2 ring-red-500/80" />
              {state.mode !== "live" && session.current && (
                <p className="mt-1.5 text-xs text-neutral-400">Ready to show: {slideLabel(session.current)}. Press Esc to show it.</p>
              )}
            </section>
            <section aria-label="Next">
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-neutral-400">Next</p>
              <SlideView frame={asFrame(session.next)} images={images} showMissing className="rounded-md opacity-90 ring-1 ring-neutral-700" />
            </section>
          </div>

          {session.current?.kind === "missing" && (
            <p className="rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
              {missingText(session.current.missing_reason)} The projector shows black for this slide.
            </p>
          )}

          {/* Slides in the current item */}
          {currentItem && (
            <section aria-label={`Slides in ${currentItem.label}`}>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-neutral-400">{currentItem.label}</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
                {currentItem.slides.map((slide, i) => (
                  <button
                    key={slide.id}
                    type="button"
                    onClick={() => dispatch({ type: "goToSlide", item: state.cursor.item, slide: i })}
                    className={`rounded-md p-0.5 text-left ${i === state.cursor.slide ? "ring-2 ring-primary" : "ring-1 ring-neutral-800 hover:ring-neutral-600"}`}
                  >
                    <SlideView frame={asFrame(slide)} images={images} showMissing className="rounded" />
                    <span className="mt-1 block truncate px-1 text-xs text-neutral-400">{slideLabel(slide)}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </main>
      </div>

      {/* Controls */}
      <footer className="flex flex-wrap items-center justify-center gap-2 border-t border-neutral-800 px-4 py-3">
        <Button className={modeButton(false)} onClick={() => dispatch({ type: "prev" })}><ChevronLeft className="h-4 w-4" /> Previous</Button>
        <Button className={modeButton(state.mode === "black")} onClick={() => dispatch({ type: "toggleBlack" })}><Square className="h-4 w-4" /> Black</Button>
        <Button className={modeButton(state.mode === "logo")} onClick={() => dispatch({ type: "toggleLogo" })}><ImageIcon className="h-4 w-4" /> Logo</Button>
        <Button className={modeButton(false)} disabled={state.mode === "live"} onClick={() => dispatch({ type: "live" })}><MonitorPlay className="h-4 w-4" /> Show slide</Button>
        <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => dispatch({ type: "next" })}>Next <ChevronRight className="h-4 w-4" /></Button>
      </footer>

      <Dialog open={displays !== null} onOpenChange={(open) => !open && setDisplays(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Which screen is the projector?</DialogTitle>
            <DialogDescription>The slides open full size on the screen you pick.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {(displays ?? []).map((d) => (
              <Button key={d.id} variant={d === pickDefaultDisplay(displays ?? []) ? "default" : "outline"} className="w-full justify-between" onClick={() => openOn(d)}>
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
              {translations.map((t) => (
                <li key={t.id}><span className="font-semibold">{t.name} ({t.id}).</span> {t.notice}</li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Present;
