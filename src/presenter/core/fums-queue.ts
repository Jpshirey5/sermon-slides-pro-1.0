// FUMS queue. Every time a scripture slide goes on the projector we record
// one event per FUMS token and send them to fums-report in batches. Events
// are stored first and removed only after the server accepts them, so a lost
// connection or a page reload never loses a report.
//
// Stored events hold tokens and ids only, never verse text. Storage is
// injected: IndexedDB in the browser, the desktop shell's own store later.

import type { PresenterSlide } from "./types";

export interface FumsEvent {
  client_event_id: string;
  fums_token: string;
  translation_id: string;
  device_id: string;
  session_id: string;
  displayed_at: string;
}

export interface FumsQueueStorage {
  all(): Promise<FumsEvent[]>;
  put(events: readonly FumsEvent[]): Promise<void>;
  remove(ids: readonly string[]): Promise<void>;
}

/** What happened when we tried to send a batch. */
export type SendOutcome =
  /** Server stored them (including duplicates). Remove from the queue. */
  | "accepted"
  /** Network or server trouble. Keep and retry later. */
  | "retry"
  /** Server refused the batch as invalid. Remove, or it would block the queue forever. */
  | "rejected";

export interface FumsQueueOptions {
  storage: FumsQueueStorage;
  send: (events: FumsEvent[]) => Promise<SendOutcome>;
  deviceId: string;
  sessionId: string;
  now?: () => number;
  newId?: () => string;
  batchSize?: number;
  /** Retry delays in ms, last value repeats. */
  backoffMs?: readonly number[];
}

export interface FumsQueue {
  /** Record a display of this slide. Does nothing for non-scripture slides. */
  recordDisplay(slide: PresenterSlide): Promise<number>;
  /** Try to send everything queued. Safe to call often; only one runs at a time. */
  flush(): Promise<{ sent: number; remaining: number }>;
  /** When the next retry is allowed, in ms from now (0 = now). */
  retryInMs(): number;
  pending(): Promise<number>;
}

const DEFAULT_BACKOFF = [5_000, 15_000, 60_000, 5 * 60_000];

export function createFumsQueue(options: FumsQueueOptions): FumsQueue {
  const now = options.now ?? (() => Date.now());
  const newId = options.newId ?? (() => crypto.randomUUID());
  const batchSize = options.batchSize ?? 50;
  const backoff = options.backoffMs ?? DEFAULT_BACKOFF;
  let failures = 0;
  let nextAttemptAt = 0;
  let running: Promise<{ sent: number; remaining: number }> | null = null;

  const flushOnce = async () => {
    let sent = 0;
    let queued = await options.storage.all();
    queued.sort((a, b) => a.displayed_at.localeCompare(b.displayed_at));
    while (queued.length > 0) {
      const batch = queued.slice(0, batchSize);
      let outcome: SendOutcome;
      try {
        outcome = await options.send(batch);
      } catch {
        outcome = "retry";
      }
      if (outcome === "retry") {
        failures++;
        nextAttemptAt = now() + backoff[Math.min(failures - 1, backoff.length - 1)];
        break;
      }
      await options.storage.remove(batch.map((e) => e.client_event_id));
      if (outcome === "accepted") sent += batch.length;
      failures = 0;
      nextAttemptAt = 0;
      queued = queued.slice(batch.length);
    }
    return { sent, remaining: queued.length };
  };

  return {
    async recordDisplay(slide) {
      if (slide.kind !== "scripture" || !slide.translation_id || !slide.fums_tokens?.length) return 0;
      const displayedAt = new Date(now()).toISOString();
      const events = slide.fums_tokens.map((token) => ({
        client_event_id: newId(),
        fums_token: token,
        translation_id: slide.translation_id!,
        device_id: options.deviceId,
        session_id: options.sessionId,
        displayed_at: displayedAt,
      }));
      await options.storage.put(events);
      return events.length;
    },

    flush() {
      if (running) return running;
      if (now() < nextAttemptAt) {
        return options.storage.all().then((q) => ({ sent: 0, remaining: q.length }));
      }
      running = flushOnce().finally(() => {
        running = null;
      });
      return running;
    },

    retryInMs: () => Math.max(0, nextAttemptAt - now()),
    pending: async () => (await options.storage.all()).length,
  };
}

export function createMemoryQueueStorage(): FumsQueueStorage & { events: Map<string, FumsEvent> } {
  const events = new Map<string, FumsEvent>();
  return {
    events,
    all: async () => [...events.values()],
    put: async (list) => {
      for (const e of list) events.set(e.client_event_id, e);
    },
    remove: async (ids) => {
      for (const id of ids) events.delete(id);
    },
  };
}

const DB_NAME = "ssp-presenter";
const STORE = "fums-queue";

/** IndexedDB storage for the browser. Falls back to memory if IndexedDB is unavailable. */
export function createIndexedDbQueueStorage(idb: IDBFactory | undefined = globalThis.indexedDB): FumsQueueStorage {
  if (!idb) return createMemoryQueueStorage();
  let dbPromise: Promise<IDBDatabase> | null = null;
  const open = () =>
    (dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
      const req = idb.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "client_event_id" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }));
  const tx = async <T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> => {
    const db = await open();
    return new Promise<T | undefined>((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const req = run(t.objectStore(STORE));
      t.oncomplete = () => resolve(req ? (req.result as T) : undefined);
      t.onerror = () => reject(t.error);
    });
  };
  return {
    all: async () => (await tx<FumsEvent[]>("readonly", (s) => s.getAll())) ?? [],
    put: async (events) => {
      await tx("readwrite", (s) => {
        for (const e of events) s.put(e);
      });
    },
    remove: async (ids) => {
      await tx("readwrite", (s) => {
        for (const id of ids) s.delete(id);
      });
    },
  };
}

/** A stable per-browser id for FUMS (not personal data). */
export function getDeviceId(storage: Pick<Storage, "getItem" | "setItem"> | undefined = globalThis.localStorage): string {
  const key = "ssp-presenter-device-id";
  try {
    const existing = storage?.getItem(key);
    if (existing) return existing;
    const id = crypto.randomUUID();
    storage?.setItem(key, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}
