// A fake Nostr relay for tests: sockets that open when told to, and a hub that
// delivers published events to every matching subscription, like a real relay.

import type { NostrEvent } from '../online/nostr';
import type { SocketFactory, SocketLike } from '../online/relayClient';

export class FakeSocket implements SocketLike {
  readyState = 0;
  sent: unknown[][] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  constructor(
    readonly url: string,
    private readonly hub: FakeRelays,
  ) {}
  send(data: string) {
    const frame = JSON.parse(data) as unknown[];
    this.sent.push(frame);
    this.hub.received(this, frame);
  }
  close() {
    this.readyState = 3;
  }
  /** The relay accepts the connection. */
  accept() {
    this.readyState = 1;
    this.onopen?.();
  }
  /** The connection fails or drops. */
  drop() {
    this.readyState = 3;
    this.onclose?.();
  }
  deliver(frame: unknown[]) {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }
}

/** Every relay URL the app knows, served by one in-memory hub. */
export class FakeRelays {
  sockets: FakeSocket[] = [];
  /** When false, new sockets wait (unreachable) until `openAll()`. */
  autoOpen = true;
  /** When true, published events are swallowed (to act out a lost message). */
  dropping = false;
  private subscriptions: { socket: FakeSocket; id: string; filter: Record<string, unknown> }[] = [];

  factory: SocketFactory = (url) => {
    const socket = new FakeSocket(url, this);
    this.sockets.push(socket);
    if (this.autoOpen) queueMicrotask(() => socket.readyState === 0 && socket.accept());
    return socket;
  };

  openAll() {
    this.autoOpen = true;
    this.sockets.filter((s) => s.readyState === 0).forEach((s) => s.accept());
  }

  received(socket: FakeSocket, frame: unknown[]) {
    if (frame[0] === 'REQ') {
      this.subscriptions.push({ socket, id: frame[1] as string, filter: frame[2] as Record<string, unknown> });
    } else if (frame[0] === 'CLOSE') {
      this.subscriptions = this.subscriptions.filter((s) => !(s.socket === socket && s.id === frame[1]));
    } else if (frame[0] === 'EVENT' && !this.dropping) {
      const event = frame[1] as NostrEvent;
      for (const sub of this.subscriptions) {
        // A relay delivers to every subscriber on *its own* URL whose filter matches.
        if (sub.socket.url !== socket.url || sub.socket.readyState !== 1) continue;
        const kinds = sub.filter.kinds as number[] | undefined;
        const tags = sub.filter['#x'] as string[] | undefined;
        if (kinds && !kinds.includes(event.kind)) continue;
        if (tags && !event.tags.some((t) => t[0] === 'x' && tags.includes(t[1]))) continue;
        queueMicrotask(() => sub.socket.deliver(['EVENT', sub.id, event]));
      }
    }
  }
}
