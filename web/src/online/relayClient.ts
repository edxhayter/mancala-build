// Talking to a few Nostr relays at once (add-online-play design.md decision 1):
// one websocket per relay, one subscription each, publishing to every open
// relay, and reconnecting with growing delays when a relay drops.

import type { NostrEvent } from './nostr';

/** The relays, chosen by probing in task 8.1 (design.md decision 1). */
export const RELAYS = [
  'wss://nos.lol',
  'wss://relay.primal.net',
  'wss://nostr.mom',
  'wss://relay.snort.social',
  'wss://relay.nostr.net',
];

/** Waits before reconnecting: 1 s, 2 s, 4 s … never more than 30 s. */
export function backoff(attempt: number): number {
  return Math.min(30_000, 1000 * 2 ** attempt);
}

/** The parts of the browser's WebSocket this needs, so tests can pass a fake. */
export interface SocketLike {
  readyState: number;
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
}
export type SocketFactory = (url: string) => SocketLike;

const OPEN = 1;

export interface RelayClientOptions {
  urls: string[];
  /** The subscription filter, e.g. `{ kinds: [21234], '#x': [topic] }`. */
  filter: Record<string, unknown>;
  onEvent: (event: NostrEvent) => void;
  /** Called when "is any relay open?" changes. */
  onReachable: (reachable: boolean) => void;
  socket?: SocketFactory;
}

export interface RelayClient {
  publish(event: NostrEvent): void;
  reachable(): boolean;
  close(): void;
}

export function createRelayClient(options: RelayClientOptions): RelayClient {
  const makeSocket: SocketFactory = options.socket ?? ((url) => new WebSocket(url) as unknown as SocketLike);
  const subId = `mancala-${Math.random().toString(36).slice(2, 10)}`;
  const sockets = new Map<string, SocketLike>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const attempts = new Map<string, number>();
  let closed = false;
  let wasReachable = false;

  const reachable = () => Array.from(sockets.values()).some((s) => s.readyState === OPEN);
  const report = () => {
    const now = reachable();
    if (now !== wasReachable) {
      wasReachable = now;
      options.onReachable(now);
    }
  };

  function connect(url: string) {
    if (closed) return;
    let socket: SocketLike;
    try {
      socket = makeSocket(url);
    } catch {
      return retry(url);
    }
    sockets.set(url, socket);
    socket.onopen = () => {
      attempts.set(url, 0);
      socket.send(JSON.stringify(['REQ', subId, options.filter]));
      report();
    };
    socket.onmessage = (message) => {
      if (typeof message.data !== 'string') return;
      try {
        const frame = JSON.parse(message.data) as unknown[];
        if (frame[0] === 'EVENT' && frame[1] === subId && typeof frame[2] === 'object' && frame[2] !== null) {
          options.onEvent(frame[2] as NostrEvent);
        }
      } catch {
        // not JSON: ignore
      }
    };
    const lost = () => {
      if (sockets.get(url) !== socket) return; // already replaced
      sockets.delete(url);
      report();
      retry(url);
    };
    socket.onclose = lost;
    socket.onerror = lost;
  }

  function retry(url: string) {
    if (closed || timers.has(url)) return;
    const attempt = attempts.get(url) ?? 0;
    attempts.set(url, attempt + 1);
    timers.set(
      url,
      setTimeout(() => {
        timers.delete(url);
        connect(url);
      }, backoff(attempt)),
    );
  }

  options.urls.forEach(connect);

  return {
    publish(event) {
      const frame = JSON.stringify(['EVENT', event]);
      for (const socket of sockets.values()) {
        if (socket.readyState === OPEN) socket.send(frame);
      }
    },
    reachable,
    close() {
      closed = true;
      timers.forEach(clearTimeout);
      timers.clear();
      for (const socket of sockets.values()) {
        socket.onclose = socket.onerror = socket.onmessage = socket.onopen = null;
        if (socket.readyState === OPEN) socket.send(JSON.stringify(['CLOSE', subId]));
        socket.close();
      }
      sockets.clear();
    },
  };
}
