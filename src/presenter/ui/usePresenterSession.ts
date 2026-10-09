// The operator's controller. Wires the framework-free core modules into React:
// loads the bundle, keeps it pruned (expiry and revocation), polls status,
// drives the projector window over the transport, and reports FUMS when the
// projector confirms a scripture slide is on screen.

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  bundleTranslationIds,
  type BundleFetchError,
  createFumsSender,
  diffStatus,
  fetchBundle,
  fetchStatus,
  type Invoke,
} from "../core/bundle-client";
import { msUntilRefresh, pruneBundle } from "../core/expiry";
import { createFumsQueue, type FumsQueue, type FumsQueueStorage } from "../core/fums-queue";
import { currentSlide, initialPresenterState, nextSlide, outputFrame, type PresenterAction, presenterReducer } from "../core/state";
import { buildStageFrame, initialStageControls, type StageAction, type StageControls, type StageFrame, stageReducer } from "../core/stage";
import type { PresenterTransport } from "../core/transport";
import type { OutputFrame, PresenterSlide, ServiceBundle } from "../core/types";

export const STATUS_POLL_MS = 60_000;
export const PRUNE_TICK_MS = 30_000;
export const FUMS_FLUSH_MS = 30_000;
const REFRESH_RETRY_MS = 60_000;

export interface PresenterSessionDeps {
  invoke: Invoke;
  createTransport: (nonce: string) => PresenterTransport;
  queueStorage: FumsQueueStorage;
  deviceId: string;
  /** Resolves stored background refs to URLs (signed storage URLs, data URLs). */
  resolveImages: (refs: string[]) => Promise<Record<string, string>>;
  newNonce: () => string;
  now?: () => number;
  /** For toasts: something changed that the operator should know. */
  onNotice?: (notice: { kind: "revoked" | "plan" | "refresh_failed"; message: string }) => void;
  /**
   * Desktop app only: an encrypted offline copy of the bundle, used when the
   * service can't be loaded because there's no internet. See desktop/src/offline-cache.ts.
   */
  offlineCache?: {
    save(serviceId: string, bundle: ServiceBundle): Promise<void>;
    load(serviceId: string): Promise<ServiceBundle | null>;
    remove(serviceId: string): Promise<void>;
  };
}

export type LoadState =
  | { kind: "loading" }
  | { kind: "error"; error: BundleFetchError }
  | { kind: "ready" };

export interface PresenterSession {
  load: LoadState;
  bundle: ServiceBundle | null;
  state: ReturnType<typeof presenterReducer>;
  dispatch: (action: PresenterAction) => void;
  current: PresenterSlide | null;
  next: PresenterSlide | null;
  /** What the projector is showing (or would show once connected). */
  frame: OutputFrame;
  images: Record<string, string>;
  nonce: string;
  projectorConnected: boolean;
  canPresent: boolean;
  fumsPending: number;
  retry: () => void;
  /** Register the projector window we opened, so we notice when it closes. */
  attachProjectorWindow: (win: Window | null) => void;
  /** Stage display: operator controls, the frame the stage window shows, and its window. */
  stage: StageControls;
  stageFrame: StageFrame;
  dispatchStage: (action: StageAction) => void;
  stageConnected: boolean;
  attachStageWindow: (win: Window | null) => void;
  /** Refetch the bundle quietly, for example after an edit. */
  reload: () => Promise<boolean>;
  /** True while presenting from the offline copy because the service couldn't be loaded. */
  usingOfflineCopy: boolean;
  /** Tell the session a presenter window closed (the desktop app reports this). */
  windowClosed: (kind: "main" | "stage") => void;
  endSession: () => void;
}

/** Swap stored background refs for resolved URLs before a frame leaves the operator. */
function withResolvedImages(frame: OutputFrame, images: Record<string, string>): OutputFrame {
  if (frame.kind !== "slide") return frame;
  const ref = frame.slide.style.backgroundImage;
  if (!ref) return frame;
  return { kind: "slide", slide: { ...frame.slide, style: { ...frame.slide.style, backgroundImage: images[ref] ?? null } } };
}

export function usePresenterSession(serviceId: string, deps: PresenterSessionDeps): PresenterSession {
  const now = deps.now ?? Date.now;
  const depsRef = useRef(deps);
  depsRef.current = deps;

  const [state, dispatch] = useReducer(presenterReducer, initialPresenterState);
  const [load, setLoad] = useState<LoadState>({ kind: "loading" });
  const [images, setImages] = useState<Record<string, string>>({});
  const [tick, setTick] = useState(0);
  const [projectorConnected, setProjectorConnected] = useState(false);
  const [stageConnected, setStageConnected] = useState(false);
  const [stage, dispatchStage] = useReducer(stageReducer, initialStageControls);
  const [canPresent, setCanPresent] = useState(true);
  const [fumsPending, setFumsPending] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [usingOfflineCopy, setUsingOfflineCopy] = useState(false);

  const nonce = useMemo(() => deps.newNonce(), []); // eslint-disable-line react-hooks/exhaustive-deps
  const unavailable = useRef<Set<string>>(new Set());
  const epoch = useRef<number | null>(null);
  const bundleRef = useRef<ServiceBundle | null>(null);
  bundleRef.current = state.bundle;

  // ── FUMS queue ──
  const queue = useMemo<FumsQueue>(
    () => createFumsQueue({
      storage: deps.queueStorage,
      send: createFumsSender((fn, body) => depsRef.current.invoke(fn, body)),
      deviceId: deps.deviceId,
      sessionId: nonce,
    }),
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const flushFums = useCallback(async () => {
    const result = await queue.flush();
    setFumsPending(result.remaining);
  }, [queue]);

  // ── loading and refreshing the bundle ──
  const applyBundle = useCallback((bundle: ServiceBundle) => {
    const pruned = pruneBundle(bundle, { now: now(), unavailable: unavailable.current }).bundle;
    epoch.current = bundle.revocation_epoch;
    dispatch({ type: "load", bundle: pruned });
    const refs = [...new Set(pruned.items.flatMap((i) => i.slides).map((s) => s.style.backgroundImage).filter((r): r is string => Boolean(r)))];
    if (refs.length) depsRef.current.resolveImages(refs).then(setImages).catch(() => undefined);
  }, [now]);

  const loadBundle = useCallback(async (silent: boolean) => {
    if (!silent) setLoad({ kind: "loading" });
    const result = await fetchBundle(depsRef.current.invoke, serviceId);
    const cache = depsRef.current.offlineCache;
    if (result.ok === true) {
      applyBundle(result.bundle);
      setLoad({ kind: "ready" });
      setUsingOfflineCopy(false);
      void cache?.save(serviceId, result.bundle).catch(() => undefined);
      return true;
    }
    const error = "error" in result ? result.error : "server";
    // Lost access (plan ended, service deleted): the offline copy must not be used.
    if (error === "plan_required" || error === "not_found") void cache?.remove(serviceId).catch(() => undefined);
    // No internet (or the server is down): present from the offline copy if there is one.
    if (cache && !bundleRef.current && (error === "network" || error === "server" || error === "rate_limited")) {
      const copy = await cache.load(serviceId).catch(() => null);
      if (copy) {
        applyBundle(copy);
        setLoad({ kind: "ready" });
        setUsingOfflineCopy(true);
        return false;
      }
    }
    // A failed background refresh keeps the current bundle. Pruning still
    // removes anything that expires, so nothing stale is ever shown.
    if (!silent || !bundleRef.current) setLoad({ kind: "error", error });
    else depsRef.current.onNotice?.({ kind: "refresh_failed", message: "Could not refresh scripture. Still presenting what is loaded." });
    return false;
  }, [applyBundle, serviceId]);

  useEffect(() => {
    void loadBundle(false);
  }, [loadBundle, attempt]);

  // Refresh a little before the bundle expires.
  useEffect(() => {
    if (!state.bundle) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = (ms: number) => {
      timer = setTimeout(async () => {
        if (!(await loadBundle(true))) schedule(REFRESH_RETRY_MS);
      }, ms);
    };
    schedule(msUntilRefresh(state.bundle, now()));
    return () => clearTimeout(timer);
  }, [state.bundle?.issued_at]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── pruning tick: expiry is re-checked even with no network ──
  useEffect(() => {
    const id = setInterval(() => {
      const bundle = bundleRef.current;
      if (bundle) {
        const result = pruneBundle(bundle, { now: now(), unavailable: unavailable.current });
        if (result.changed) dispatch({ type: "load", bundle: result.bundle });
      }
      setTick((t) => t + 1);
    }, PRUNE_TICK_MS);
    return () => clearInterval(id);
  }, [now]);

  // ── status polling: revocation and plan ──
  useEffect(() => {
    if (load.kind !== "ready") return;
    const poll = async () => {
      const bundle = bundleRef.current;
      if (!bundle) return;
      const status = await fetchStatus(depsRef.current.invoke, serviceId, bundleTranslationIds(bundle));
      if (!status) return;
      const change = diffStatus({ epoch: epoch.current ?? status.revocation_epoch, unavailable: unavailable.current }, status);
      setCanPresent(change.canPresent);
      if (!change.canPresent) depsRef.current.onNotice?.({ kind: "plan", message: "Your church's plan is not active. You can finish this service, but please check billing." });
      if (change.newlyUnavailable.length > 0) {
        for (const t of change.newlyUnavailable) unavailable.current.add(t);
        const result = pruneBundle(bundle, { now: now(), unavailable: unavailable.current });
        if (result.changed) dispatch({ type: "load", bundle: result.bundle });
        depsRef.current.onNotice?.({
          kind: "revoked",
          message: `${change.newlyUnavailable.join(", ")} is no longer available. Those slides were removed and will show black.`,
        });
      }
      if (change.epochChanged) void loadBundle(true);
    };
    const id = setInterval(poll, STATUS_POLL_MS);
    return () => clearInterval(id);
  }, [load.kind, loadBundle, now, serviceId]);

  // ── projector link ──
  const transport = useRef<PresenterTransport | null>(null);
  const seq = useRef(0);
  const lastFrame = useRef<OutputFrame>({ kind: "black" });
  const lastAckedSlideId = useRef<string | null>(null);
  const framesBySeq = useRef(new Map<number, OutputFrame>());

  const frame = useMemo(() => outputFrame(state, now()), [state, tick, now]); // eslint-disable-line react-hooks/exhaustive-deps

  const sendFrame = useCallback((f: OutputFrame) => {
    const t = transport.current;
    if (!t) return;
    seq.current += 1;
    framesBySeq.current.set(seq.current, f);
    // Keep only recent frames; acks for older ones no longer matter.
    for (const key of framesBySeq.current.keys()) if (key < seq.current - 20) framesBySeq.current.delete(key);
    t.send({ type: "frame", seq: seq.current, frame: withResolvedImages(f, images) });
  }, [images]);
  const sendFrameRef = useRef(sendFrame);
  sendFrameRef.current = sendFrame;

  useEffect(() => {
    const t = depsRef.current.createTransport(nonce);
    transport.current = t;
    const off = t.onMessage((message) => {
      if (message.type === "ready" && message.role === "stage") {
        setStageConnected(true);
        t.send({ type: "stage", frame: lastStageFrame.current });
      } else if (message.type === "ready") {
        setProjectorConnected(true);
        // A fresh projector has shown nothing yet.
        lastAckedSlideId.current = null;
        sendFrameRef.current(lastFrame.current);
      } else if (message.type === "displayed") {
        setProjectorConnected(true);
        const shown = framesBySeq.current.get(message.seq);
        const slide = shown?.kind === "slide" ? shown.slide : null;
        const shownId = slide?.id ?? null;
        // Count a display when a scripture slide newly appears on the projector.
        if (slide && slide.kind === "scripture" && shownId !== lastAckedSlideId.current) {
          void queue.recordDisplay(slide).then(flushFums);
        }
        lastAckedSlideId.current = shownId;
      }
    });
    return () => {
      off();
      t.send({ type: "end" });
      t.close();
      transport.current = null;
    };
  }, [nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── stage display ──
  const stageFrame = useMemo(() => buildStageFrame(state, stage), [state, stage]);
  const lastStageFrame = useRef<StageFrame>(stageFrame);
  const stageKey = JSON.stringify(stageFrame);
  useEffect(() => {
    lastStageFrame.current = stageFrame;
    transport.current?.send({ type: "stage", frame: stageFrame });
  }, [stageKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Moving to an item with a countdown loads its length (it does not start it).
  const currentItem = state.bundle?.items[state.cursor.item];
  useEffect(() => {
    if (currentItem?.stage.timer_seconds) dispatchStage({ type: "timerLoad", seconds: currentItem.stage.timer_seconds });
  }, [currentItem?.id, currentItem?.stage.timer_seconds]); // eslint-disable-line react-hooks/exhaustive-deps

  const stageWindow = useRef<Window | null>(null);
  const attachStageWindow = useCallback((win: Window | null) => {
    stageWindow.current = win;
  }, []);

  // Send every change of what the projector should show.
  const frameKey = JSON.stringify(frame);
  useEffect(() => {
    lastFrame.current = frame;
    sendFrame(frame);
  }, [frameKey, sendFrame]); // eslint-disable-line react-hooks/exhaustive-deps

  // Notice when the projector window is closed.
  const projectorWindow = useRef<Window | null>(null);
  const attachProjectorWindow = useCallback((win: Window | null) => {
    projectorWindow.current = win;
  }, []);
  useEffect(() => {
    const id = setInterval(() => {
      if (projectorWindow.current?.closed) {
        projectorWindow.current = null;
        setProjectorConnected(false);
        lastAckedSlideId.current = null;
      }
      if (stageWindow.current?.closed) {
        stageWindow.current = null;
        setStageConnected(false);
      }
    }, 2000);
    return () => clearInterval(id);
  }, []);

  // ── FUMS flushing: on a timer and whenever we come back online ──
  useEffect(() => {
    void flushFums();
    const id = setInterval(() => void flushFums(), FUMS_FLUSH_MS);
    const online = () => void flushFums();
    window.addEventListener("online", online);
    return () => {
      clearInterval(id);
      window.removeEventListener("online", online);
    };
  }, [flushFums]);

  const endSession = useCallback(() => {
    transport.current?.send({ type: "end" });
    projectorWindow.current?.close();
    projectorWindow.current = null;
    stageWindow.current?.close();
    stageWindow.current = null;
    setProjectorConnected(false);
    setStageConnected(false);
  }, []);

  return {
    load,
    bundle: state.bundle,
    state,
    dispatch,
    current: currentSlide(state),
    next: nextSlide(state),
    frame,
    images,
    nonce,
    projectorConnected,
    canPresent,
    fumsPending,
    retry: () => setAttempt((a) => a + 1),
    attachProjectorWindow,
    stage,
    stageFrame,
    dispatchStage,
    stageConnected,
    attachStageWindow,
    reload: () => loadBundle(true),
    usingOfflineCopy,
    windowClosed: (kind) => {
      if (kind === "main") {
        projectorWindow.current = null;
        setProjectorConnected(false);
        lastAckedSlideId.current = null;
      } else {
        stageWindow.current = null;
        setStageConnected(false);
      }
    },
    endSession,
  };
}
