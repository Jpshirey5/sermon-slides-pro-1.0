// Operator and output windows talk over a channel. In the browser that is a
// BroadcastChannel named with a random nonce; the desktop shell will provide
// an IPC implementation of the same interface.
//
// The output window never fetches anything. The operator sends it fully
// rendered frames, and the output tells the operator what it actually put on
// screen, which is what triggers FUMS reporting.

import type { OutputFrame } from "./types";

export type OperatorMessage =
  | { type: "frame"; seq: number; frame: OutputFrame }
  /** Sent when the operator closes the service. The output goes black. */
  | { type: "end" };

export type OutputMessage =
  /** Output opened and is ready for frames. */
  | { type: "ready" }
  /** A frame is on screen. */
  | { type: "displayed"; seq: number; slideId: string | null };

export type PresenterMessage = OperatorMessage | OutputMessage;

export interface PresenterTransport {
  send(message: PresenterMessage): void;
  /** Returns an unsubscribe function. */
  onMessage(handler: (message: PresenterMessage) => void): () => void;
  close(): void;
}

const CHANNEL_PREFIX = "ssp-presenter:";

export function channelName(nonce: string): string {
  return `${CHANNEL_PREFIX}${nonce}`;
}

/** A random channel nonce, so two services on one machine never cross. */
export function newChannelNonce(random: () => string = () => crypto.randomUUID()): string {
  return random().replace(/[^a-zA-Z0-9-]/g, "");
}

function isPresenterMessage(value: unknown): value is PresenterMessage {
  if (!value || typeof value !== "object") return false;
  const type = (value as { type?: unknown }).type;
  return type === "frame" || type === "end" || type === "ready" || type === "displayed";
}

type ChannelCtor = new (name: string) => BroadcastChannel;

export function createBroadcastTransport(
  nonce: string,
  /** Null means "not available"; omit to use the browser's BroadcastChannel. */
  Channel: ChannelCtor | null = typeof BroadcastChannel === "undefined" ? null : BroadcastChannel,
): PresenterTransport {
  if (!Channel) throw new Error("BroadcastChannel is not available in this browser");
  const channel = new Channel(channelName(nonce));
  const handlers = new Set<(m: PresenterMessage) => void>();
  channel.onmessage = (event: MessageEvent) => {
    if (!isPresenterMessage(event.data)) return;
    for (const handler of handlers) handler(event.data);
  };
  return {
    send: (message) => channel.postMessage(message),
    onMessage(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    close() {
      handlers.clear();
      channel.close();
    },
  };
}

/** Two connected in-memory transports, for tests and same-window previews. */
export function createMemoryTransportPair(): [PresenterTransport, PresenterTransport] {
  const make = (peer: () => Set<(m: PresenterMessage) => void>) => {
    const handlers = new Set<(m: PresenterMessage) => void>();
    let open = true;
    const transport: PresenterTransport & { handlers: typeof handlers } = {
      handlers,
      send(message) {
        if (!open) return;
        const copy = structuredClone(message);
        for (const h of peer()) h(copy);
      },
      onMessage(handler) {
        handlers.add(handler);
        return () => handlers.delete(handler);
      },
      close() {
        open = false;
        handlers.clear();
      },
    };
    return transport;
  };
  // eslint-disable-next-line prefer-const
  let b: ReturnType<typeof make>;
  const a = make(() => b.handlers);
  b = make(() => a.handlers);
  return [a, b];
}
