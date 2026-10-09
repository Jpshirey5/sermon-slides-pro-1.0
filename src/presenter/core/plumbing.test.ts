import { describe, expect, it, vi } from "vitest";
import {
  bundleTranslationIds,
  createFumsSender,
  diffStatus,
  fetchBundle,
  fetchStatus,
  type Invoke,
} from "./bundle-client";
import { listDisplays, openOutputWindow, pickDefaultDisplay, windowFeatures } from "./displays";
import { channelName, createBroadcastTransport, createMemoryTransportPair, newChannelNonce, type PresenterMessage } from "./transport";
import { makeBundle } from "./test-fixtures";

describe("transport", () => {
  it("memory pair delivers each side's messages to the other only", () => {
    const [operator, output] = createMemoryTransportPair();
    const toOutput: PresenterMessage[] = [];
    const toOperator: PresenterMessage[] = [];
    output.onMessage((m) => toOutput.push(m));
    operator.onMessage((m) => toOperator.push(m));
    operator.send({ type: "frame", seq: 1, frame: { kind: "black" } });
    output.send({ type: "displayed", seq: 1, slideId: null });
    expect(toOutput).toEqual([{ type: "frame", seq: 1, frame: { kind: "black" } }]);
    expect(toOperator).toEqual([{ type: "displayed", seq: 1, slideId: null }]);
  });

  it("nonces are url-safe and channels are namespaced", () => {
    expect(newChannelNonce(() => "ab/c?d")).toBe("abcd");
    expect(channelName("x")).toBe("ssp-presenter:x");
  });

  it("broadcast transport ignores anything that is not a presenter message", () => {
    let instance: { onmessage: ((e: MessageEvent) => void) | null; postMessage: (m: unknown) => void; close: () => void; name: string } | null = null;
    class FakeChannel {
      onmessage: ((e: MessageEvent) => void) | null = null;
      posted: unknown[] = [];
      constructor(public name: string) {
        instance = this as never;
      }
      postMessage(m: unknown) {
        this.posted.push(m);
      }
      close() {}
    }
    const t = createBroadcastTransport("n1", FakeChannel as unknown as typeof BroadcastChannel);
    const got: PresenterMessage[] = [];
    t.onMessage((m) => got.push(m));
    instance!.onmessage!({ data: { type: "evil", payload: 1 } } as MessageEvent);
    instance!.onmessage!({ data: "string" } as MessageEvent);
    instance!.onmessage!({ data: { type: "ready" } } as MessageEvent);
    expect(got).toEqual([{ type: "ready" }]);
    expect(instance!.name).toBe("ssp-presenter:n1");
  });

  it("fails clearly where BroadcastChannel does not exist", () => {
    expect(() => createBroadcastTransport("n", null)).toThrow(/BroadcastChannel/);
  });
});

describe("displays", () => {
  const screens = [
    { label: "Built-in", isPrimary: true, availLeft: 0, availTop: 0, width: 1440, height: 900 },
    { label: "Projector", isPrimary: false, availLeft: 1440, availTop: 0, width: 1920, height: 1080 },
  ];

  it("falls back cleanly when the Window Management API is missing", async () => {
    expect(await listDisplays({ open: vi.fn() })).toEqual({ supported: false, reason: "unsupported" });
  });

  it("lists screens and picks the one the operator is not on", async () => {
    const win = { open: vi.fn(), getScreenDetails: async () => ({ screens, currentScreen: screens[0] }) };
    const result = await listDisplays(win);
    expect(result.supported).toBe(true);
    if (!result.supported) return;
    expect(result.displays.map((d) => [d.label, d.isCurrent])).toEqual([["Built-in", true], ["Projector", false]]);
    expect(pickDefaultDisplay(result.displays)!.label).toBe("Projector");
  });

  it("reports a refused permission as denied", async () => {
    const win = { open: vi.fn(), getScreenDetails: async () => { throw Object.assign(new Error("no"), { name: "NotAllowedError" }); } };
    expect(await listDisplays(win)).toEqual({ supported: false, reason: "denied" });
  });

  it("opens the output on the chosen screen, or a default window without one", () => {
    const open = vi.fn().mockReturnValue(null);
    const display = { id: "1", label: "P", isPrimary: false, isCurrent: false, left: 1440, top: 0, width: 1920, height: 1080 };
    expect(openOutputWindow({ open }, "/present/x/output", display)).toBeNull();
    expect(open).toHaveBeenCalledWith("/present/x/output", "ssp-presenter-output", "popup,left=1440,top=0,width=1920,height=1080");
    expect(windowFeatures(null)).toBe("popup,width=1280,height=720");
    expect(pickDefaultDisplay([])).toBeNull();
  });
});

describe("bundle client", () => {
  const invokeReturning = (result: Awaited<ReturnType<Invoke>> | Error): Invoke => async () => {
    if (result instanceof Error) throw result;
    return result;
  };

  it("returns a bundle, or a clear error by status", async () => {
    const bundle = makeBundle();
    expect(await fetchBundle(invokeReturning({ data: bundle, error: null }), "svc")).toEqual({ ok: true, bundle });
    const cases: [number | undefined, string][] = [[404, "not_found"], [403, "plan_required"], [429, "rate_limited"], [422, "too_large"], [500, "server"], [undefined, "network"]];
    for (const [status, error] of cases) {
      expect(await fetchBundle(invokeReturning({ data: null, error: { status, message: "x" } }), "svc")).toEqual({ ok: false, error });
    }
    expect(await fetchBundle(invokeReturning(new Error("offline")), "svc")).toEqual({ ok: false, error: "network" });
    expect(await fetchBundle(invokeReturning({ data: { nope: 1 }, error: null }), "svc")).toEqual({ ok: false, error: "server" });
  });

  it("fills in stage settings an older server does not send", async () => {
    const old = makeBundle();
    for (const item of old.items) delete (item as { stage?: unknown }).stage;
    const result = await fetchBundle(invokeReturning({ data: old, error: null }), "svc");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.bundle.items[1].stage).toEqual({ template: "message", timer_seconds: null });
    expect(result.bundle.items[0].stage).toEqual({ template: "simple", timer_seconds: null });
  });

  it("status returns null on any failure so polling can just try again", async () => {
    const status = { revocation_epoch: 2, unavailable_translations: [], can_present: true, checked_at: "x" };
    expect(await fetchStatus(invokeReturning({ data: status, error: null }), "svc", ["KJV"])).toEqual(status);
    expect(await fetchStatus(invokeReturning({ data: null, error: { status: 500, message: "x" } }), "svc", [])).toBeNull();
    expect(await fetchStatus(invokeReturning(new Error("offline")), "svc", [])).toBeNull();
  });

  it("FUMS sender maps responses to queue outcomes", async () => {
    expect(await createFumsSender(invokeReturning({ data: {}, error: null }))([])).toBe("accepted");
    expect(await createFumsSender(invokeReturning({ data: null, error: { status: 400, message: "x" } }))([])).toBe("rejected");
    expect(await createFumsSender(invokeReturning({ data: null, error: { status: 503, message: "x" } }))([])).toBe("retry");
    expect(await createFumsSender(invokeReturning(new Error("offline")))([])).toBe("retry");
  });

  it("collects translations and diffs status", () => {
    expect(bundleTranslationIds(makeBundle())).toEqual(["KJV", "NIV"]);
    expect(diffStatus({ epoch: 1, unavailable: new Set() }, { revocation_epoch: 2, unavailable_translations: ["NIV"], can_present: true, checked_at: "x" }))
      .toEqual({ newlyUnavailable: ["NIV"], epochChanged: true, canPresent: true });
    expect(diffStatus({ epoch: 2, unavailable: new Set(["NIV"]) }, { revocation_epoch: 2, unavailable_translations: ["NIV"], can_present: false, checked_at: "x" }))
      .toEqual({ newlyUnavailable: [], epochChanged: false, canPresent: false });
  });
});
