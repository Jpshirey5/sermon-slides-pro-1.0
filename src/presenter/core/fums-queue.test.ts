import { describe, expect, it } from "vitest";
import { createFumsQueue, createMemoryQueueStorage, type FumsEvent, type SendOutcome } from "./fums-queue";
import { scripture, T0 } from "./test-fixtures";

function setup(outcomes: (SendOutcome | Error)[] = []) {
  let clock = T0;
  let n = 0;
  const storage = createMemoryQueueStorage();
  const sent: FumsEvent[][] = [];
  const queue = createFumsQueue({
    storage,
    deviceId: "dev",
    sessionId: "sess",
    now: () => clock,
    newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
    batchSize: 2,
    backoffMs: [1000, 5000],
    send: async (events) => {
      sent.push(events);
      const next = outcomes.shift() ?? "accepted";
      if (next instanceof Error) throw next;
      return next;
    },
  });
  return { queue, storage, sent, advance: (ms: number) => (clock += ms) };
}

describe("FUMS queue", () => {
  it("records one event per token for scripture slides only", async () => {
    const { queue, storage } = setup();
    expect(await queue.recordDisplay(scripture("a", "NIV", { fums_tokens: ["t1", "t2"] }))).toBe(2);
    expect(await queue.recordDisplay({ id: "x", kind: "title", style: { background: "", fontFamily: "", textColor: "" } })).toBe(0);
    expect(await queue.recordDisplay(scripture("b", "NIV", { fums_tokens: [] }))).toBe(0);
    const events = [...storage.events.values()];
    expect(events.map((e) => e.fums_token)).toEqual(["t1", "t2"]);
    expect(events[0]).toMatchObject({ translation_id: "NIV", device_id: "dev", session_id: "sess", displayed_at: new Date(T0).toISOString() });
  });

  it("never stores verse text", async () => {
    const { queue, storage } = setup();
    await queue.recordDisplay(scripture("a", "NIV"));
    expect(JSON.stringify([...storage.events.values()])).not.toContain("Text of a");
  });

  it("each display is a separate report, even for the same slide", async () => {
    const { queue } = setup();
    await queue.recordDisplay(scripture("a", "NIV"));
    await queue.recordDisplay(scripture("a", "NIV"));
    expect(await queue.pending()).toBe(2);
  });

  it("sends in batches and empties the queue when accepted", async () => {
    const { queue, sent } = setup();
    for (const id of ["a", "b", "c"]) await queue.recordDisplay(scripture(id, "NIV"));
    expect(await queue.flush()).toEqual({ sent: 3, remaining: 0 });
    expect(sent.map((b) => b.length)).toEqual([2, 1]);
  });

  it("offline: keeps everything, backs off, and sends once back online", async () => {
    const { queue, sent, advance } = setup(["retry", new Error("offline")]);
    await queue.recordDisplay(scripture("a", "NIV"));
    expect(await queue.flush()).toEqual({ sent: 0, remaining: 1 });
    expect(queue.retryInMs()).toBe(1000);

    // During the backoff window, flush does not call the network.
    expect(await queue.flush()).toEqual({ sent: 0, remaining: 1 });
    expect(sent.length).toBe(1);

    advance(1000);
    expect(await queue.flush()).toEqual({ sent: 0, remaining: 1 });
    expect(queue.retryInMs()).toBe(5000);

    await queue.recordDisplay(scripture("b", "NIV"));
    advance(5000);
    expect(await queue.flush()).toEqual({ sent: 2, remaining: 0 });
    expect(queue.retryInMs()).toBe(0);
  });

  it("survives a reload: a new queue on the same storage sends what the old one left", async () => {
    const first = setup(["retry"]);
    await first.queue.recordDisplay(scripture("a", "NIV"));
    await first.queue.flush();

    const sent: FumsEvent[][] = [];
    const reloaded = createFumsQueue({
      storage: first.storage,
      deviceId: "dev",
      sessionId: "sess2",
      send: async (e) => (sent.push(e), "accepted"),
    });
    expect(await reloaded.flush()).toEqual({ sent: 1, remaining: 0 });
    expect(sent[0][0].fums_token).toBe("tok-a");
  });

  it("a batch the server rejects as invalid is dropped so it cannot block later reports", async () => {
    const { queue } = setup(["rejected", "accepted"]);
    for (const id of ["a", "b", "c"]) await queue.recordDisplay(scripture(id, "NIV"));
    expect(await queue.flush()).toEqual({ sent: 1, remaining: 0 });
  });

  it("only one flush runs at a time", async () => {
    const { queue, sent } = setup();
    await queue.recordDisplay(scripture("a", "NIV"));
    const [a, b] = await Promise.all([queue.flush(), queue.flush()]);
    expect(a).toEqual(b);
    expect(sent.length).toBe(1);
  });
});
