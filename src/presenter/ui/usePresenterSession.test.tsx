import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Invoke } from "../core/bundle-client";
import { createMemoryQueueStorage } from "../core/fums-queue";
import { createMemoryTransportPair, type PresenterMessage, type PresenterTransport } from "../core/transport";
import { makeBundle, T0 } from "../core/test-fixtures";
import type { ServiceBundle } from "../core/types";
import { STATUS_POLL_MS, usePresenterSession, type PresenterSessionDeps } from "./usePresenterSession";

function setup(opts: { bundle?: ServiceBundle; bundleError?: number; status?: () => unknown; offlineCache?: PresenterSessionDeps["offlineCache"] } = {}) {
  const bundle = opts.bundle ?? makeBundle();
  const [operatorSide, projectorSide] = createMemoryTransportPair();
  const received: PresenterMessage[] = [];
  projectorSide.onMessage((m) => received.push(m));
  const fumsBatches: unknown[][] = [];
  const notices: string[] = [];

  const invoke: Invoke = vi.fn(async (fn: string, body: unknown) => {
    if (fn === "service-bundle") {
      return opts.bundleError !== undefined
        ? { data: null, error: { status: opts.bundleError, message: "x" } }
        : { data: structuredClone(bundle), error: null };
    }
    if (fn === "presenter-status") {
      return { data: opts.status?.() ?? { revocation_epoch: 1, unavailable_translations: [], can_present: true, checked_at: "" }, error: null };
    }
    if (fn === "fums-report") {
      fumsBatches.push((body as { events: unknown[] }).events);
      return { data: {}, error: null };
    }
    throw new Error(`unexpected ${fn}`);
  });

  const storage = createMemoryQueueStorage();
  const deps: PresenterSessionDeps = {
    invoke,
    createTransport: () => operatorSide as PresenterTransport,
    queueStorage: storage,
    deviceId: "device",
    resolveImages: async (refs) => Object.fromEntries(refs.map((r) => [r, `https://img.test/${r}`])),
    newNonce: () => "nonce",
    now: () => T0,
    onNotice: (n) => notices.push(n.message),
    offlineCache: opts.offlineCache,
  };
  const hook = renderHook(() => usePresenterSession("svc", deps));

  /** The projector confirms the latest frame is on screen. */
  const ackLatest = () => {
    const frames = received.filter((m): m is Extract<PresenterMessage, { type: "frame" }> => m.type === "frame");
    const last = frames.at(-1)!;
    act(() => projectorSide.send({ type: "displayed", seq: last.seq, slideId: last.frame.kind === "slide" ? last.frame.slide.id : null }));
    return last;
  };
  const lastFrame = () => received.filter((m) => m.type === "frame").at(-1) as Extract<PresenterMessage, { type: "frame" }>;

  return { hook, received, projectorSide, storage, fumsBatches, notices, invoke, ackLatest, lastFrame };
}

describe("usePresenterSession", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("loads the bundle and starts black", async () => {
    const { hook, lastFrame } = setup();
    await waitFor(() => expect(hook.result.current.load.kind).toBe("ready"));
    expect(hook.result.current.bundle?.service.title).toBe("Sunday");
    expect(hook.result.current.frame).toEqual({ kind: "black" });
    expect(lastFrame().frame).toEqual({ kind: "black" });
  });

  it("reports a load failure in plain terms", async () => {
    const { hook } = setup({ bundleError: 403 });
    await waitFor(() => expect(hook.result.current.load).toEqual({ kind: "error", error: "plan_required" }));
  });

  it("sends each change to the projector", async () => {
    const { hook, lastFrame } = setup();
    await waitFor(() => expect(hook.result.current.load.kind).toBe("ready"));
    act(() => hook.result.current.dispatch({ type: "goToItem", item: 3 }));
    await waitFor(() => expect(lastFrame().frame).toMatchObject({ kind: "slide", slide: { id: "kjv-1", attribution: "KJV notice" } }));
    act(() => hook.result.current.dispatch({ type: "black" }));
    await waitFor(() => expect(lastFrame().frame).toEqual({ kind: "black" }));
  });

  it("counts nothing until the projector confirms a scripture slide is on screen", async () => {
    const { hook, storage, fumsBatches, ackLatest } = setup();
    await waitFor(() => expect(hook.result.current.load.kind).toBe("ready"));

    act(() => hook.result.current.dispatch({ type: "goToItem", item: 3 }));
    await waitFor(() => expect(hook.result.current.frame.kind).toBe("slide"));
    await act(async () => { await vi.advanceTimersByTimeAsync(50); });
    expect(storage.events.size).toBe(0);
    expect(fumsBatches.flat()).toEqual([]);

    ackLatest();
    await waitFor(() => expect(fumsBatches.flat()).toHaveLength(1));
    expect(fumsBatches.flat()[0]).toMatchObject({ fums_token: "tok-kjv-1", translation_id: "KJV", device_id: "device", session_id: "nonce" });
    expect(storage.events.size).toBe(0);
  });

  it("each new appearance is one report; re-confirming the same slide is not", async () => {
    const { hook, ackLatest, fumsBatches } = setup();
    await waitFor(() => expect(hook.result.current.load.kind).toBe("ready"));
    const reported = () => fumsBatches.flat().map((e) => (e as { fums_token: string }).fums_token);

    act(() => hook.result.current.dispatch({ type: "goToItem", item: 3 }));
    await waitFor(() => expect(hook.result.current.frame.kind).toBe("slide"));
    ackLatest();
    await waitFor(() => expect(reported()).toEqual(["tok-kjv-1"]));

    ackLatest(); // same frame confirmed again
    act(() => hook.result.current.dispatch({ type: "live" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    expect(reported()).toEqual(["tok-kjv-1"]);

    // Black, then the same slide again: that is a second display.
    act(() => hook.result.current.dispatch({ type: "black" }));
    await waitFor(() => expect(hook.result.current.frame.kind).toBe("black"));
    ackLatest();
    act(() => hook.result.current.dispatch({ type: "live" }));
    await waitFor(() => expect(hook.result.current.frame.kind).toBe("slide"));
    ackLatest();
    await waitFor(() => expect(reported()).toEqual(["tok-kjv-1", "tok-kjv-1"]));

    // Non-scripture slides are never reported.
    act(() => hook.result.current.dispatch({ type: "goToItem", item: 1 }));
    await waitFor(() => expect(hook.result.current.current?.id).toBe("title"));
    ackLatest();
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    expect(reported()).toEqual(["tok-kjv-1", "tok-kjv-1"]);
  });

  it("a projector that opens late gets the current frame", async () => {
    const { hook, projectorSide, lastFrame } = setup();
    await waitFor(() => expect(hook.result.current.load.kind).toBe("ready"));
    act(() => hook.result.current.dispatch({ type: "goToItem", item: 3 }));
    await waitFor(() => expect(hook.result.current.frame.kind).toBe("slide"));
    const before = lastFrame().seq;
    act(() => projectorSide.send({ type: "ready" }));
    await waitFor(() => expect(lastFrame().seq).toBeGreaterThan(before));
    expect(lastFrame().frame).toMatchObject({ kind: "slide", slide: { id: "kjv-1" } });
    expect(hook.result.current.projectorConnected).toBe(true);
  });

  it("background images go to the projector as resolved URLs", async () => {
    const bundle = makeBundle();
    bundle.items[3].slides[0].style = { ...bundle.items[3].slides[0].style, backgroundImage: "storage:bg.png" };
    const { hook, lastFrame } = setup({ bundle });
    await waitFor(() => expect(hook.result.current.load.kind).toBe("ready"));
    await waitFor(() => expect(hook.result.current.images["storage:bg.png"]).toBe("https://img.test/storage:bg.png"));
    act(() => hook.result.current.dispatch({ type: "goToItem", item: 3 }));
    await waitFor(() => expect(lastFrame().frame).toMatchObject({ kind: "slide", slide: { style: { backgroundImage: "https://img.test/storage:bg.png" } } }));
  });

  it("a revocation found by the status check removes the text and blacks out the projector", async () => {
    let status = { revocation_epoch: 1, unavailable_translations: [] as string[], can_present: true, checked_at: "" };
    const { hook, lastFrame, notices } = setup({ status: () => status });
    await waitFor(() => expect(hook.result.current.load.kind).toBe("ready"));
    act(() => hook.result.current.dispatch({ type: "goToItem", item: 3 }));
    await waitFor(() => expect(lastFrame().frame.kind).toBe("slide"));

    status = { revocation_epoch: 2, unavailable_translations: ["KJV"], can_present: true, checked_at: "" };
    await act(async () => { await vi.advanceTimersByTimeAsync(STATUS_POLL_MS); });

    await waitFor(() => expect(hook.result.current.current?.kind).toBe("missing"));
    expect(hook.result.current.current?.missing_reason).toBe("revoked");
    await waitFor(() => expect(lastFrame().frame).toEqual({ kind: "black" }));
    expect(JSON.stringify(hook.result.current.bundle)).not.toContain("Text of kjv-1");
    expect(notices.some((n) => n.includes("KJV is no longer available"))).toBe(true);
    // The NIV slides in the sermon are untouched.
    expect(hook.result.current.bundle!.items[1].slides[1].kind).toBe("scripture");
  });

  it("tells the projector to go black when the operator leaves", async () => {
    const { hook, received } = setup();
    await waitFor(() => expect(hook.result.current.load.kind).toBe("ready"));
    hook.unmount();
    expect(received.at(-1)).toEqual({ type: "end" });
  });
});

describe("usePresenterSession offline copy (desktop app)", () => {
  const memoryCache = () => {
    const store = new Map<string, ServiceBundle>();
    return {
      store,
      save: vi.fn(async (id: string, b: ServiceBundle) => void store.set(id, structuredClone(b))),
      load: vi.fn(async (id: string) => store.get(id) ?? null),
      remove: vi.fn(async (id: string) => void store.delete(id)),
    };
  };

  it("saves a copy every time the service loads", async () => {
    const cache = memoryCache();
    const { hook } = setup({ offlineCache: cache });
    await waitFor(() => expect(hook.result.current.load.kind).toBe("ready"));
    await waitFor(() => expect(cache.save).toHaveBeenCalledWith("svc", expect.objectContaining({ revocation_epoch: 1 })));
    expect(hook.result.current.usingOfflineCopy).toBe(false);
  });

  it("with no internet, presents from the copy", async () => {
    const cache = memoryCache();
    cache.store.set("svc", makeBundle());
    const { hook } = setup({ offlineCache: cache, bundleError: 0 });
    await waitFor(() => expect(hook.result.current.load.kind).toBe("ready"));
    expect(hook.result.current.usingOfflineCopy).toBe(true);
    expect(hook.result.current.bundle?.items.length).toBe(6);
  });

  it("the copy still goes through expiry: expired scripture is removed", async () => {
    vi.useRealTimers();
    const cache = memoryCache();
    const old = makeBundle({ bundle_expires_at: new Date(T0 - 1).toISOString() });
    cache.store.set("svc", old);
    const { hook } = setup({ offlineCache: cache, bundleError: 0 });
    await waitFor(() => expect(hook.result.current.load.kind).toBe("ready"));
    expect(JSON.stringify(hook.result.current.bundle)).not.toContain("Text of kjv-1");
  });

  it("losing access deletes the copy instead of using it", async () => {
    const cache = memoryCache();
    cache.store.set("svc", makeBundle());
    const { hook } = setup({ offlineCache: cache, bundleError: 403 });
    await waitFor(() => expect(hook.result.current.load).toEqual({ kind: "error", error: "plan_required" }));
    expect(cache.remove).toHaveBeenCalledWith("svc");
    expect(cache.store.has("svc")).toBe(false);
  });

  it("no copy and no internet is a plain network error", async () => {
    const { hook } = setup({ offlineCache: memoryCache(), bundleError: 0 });
    await waitFor(() => expect(hook.result.current.load).toEqual({ kind: "error", error: "network" }));
  });
});
