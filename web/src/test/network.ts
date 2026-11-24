// An in-memory stand-in for the real network, for tests (design.md decision 1).
// Connections with the same room key reach each other. Tests can hold
// deliveries back, drop them, and cut a browser off and bring it back.

import { toWire, type OnlineMessage } from '../online/protocol';
import type { Connect, PeerId, RoomConnection } from '../online/transport';

type Event =
  | { kind: 'join'; peer: PeerId }
  | { kind: 'leave'; peer: PeerId }
  | { kind: 'message'; data: unknown; from: PeerId };

interface Handlers {
  join?: (peer: PeerId) => void;
  leave?: (peer: PeerId) => void;
  message?: (data: unknown, from: PeerId) => void;
}

class Endpoint {
  readonly handlers: Handlers = {};
  /** Events that arrived before their handler was set, delivered once it is. */
  private waiting: Event[] = [];
  online = true;

  constructor(
    readonly id: PeerId,
    readonly key: string,
  ) {}

  receive(event: Event) {
    const handler = this.handlerFor(event);
    if (handler) handler();
    else this.waiting.push(event);
  }

  /** Delivers any events that were waiting for a handler that now exists. */
  flushWaiting() {
    const waiting = this.waiting;
    this.waiting = [];
    waiting.forEach((event) => this.receive(event));
  }

  private handlerFor(event: Event): (() => void) | null {
    switch (event.kind) {
      case 'join':
        return this.handlers.join ? () => this.handlers.join!(event.peer) : null;
      case 'leave':
        return this.handlers.leave ? () => this.handlers.leave!(event.peer) : null;
      case 'message':
        return this.handlers.message ? () => this.handlers.message!(event.data, event.from) : null;
    }
  }
}

export interface Network {
  connect: Connect;
  /** The peer ids connected (and online) in a room. */
  peers(key: string): PeerId[];
  /** Every message sent so far, for checking what went over the wire. */
  sent: { from: PeerId; to: PeerId; data: unknown }[];
  /** Holds messages back (in order) until `release()`, or drops them. */
  hold(): void;
  release(): void;
  dropHeld(): void;
  /** Cuts a browser off (the others see it leave), or brings it back (both sides see a join). */
  cut(peer: PeerId): void;
  restore(peer: PeerId): void;
  /** Sends raw data as if from `from`, bypassing `send`'s typing (for bad-data tests). */
  inject(key: string, from: PeerId, data: unknown): void;
}

export function createNetwork(): Network {
  const endpoints: Endpoint[] = [];
  let next = 1;
  let holding = false;
  let held: (() => void)[] = [];
  const sent: Network['sent'] = [];

  const inRoom = (key: string) => endpoints.filter((e) => e.key === key && e.online);
  const byId = (id: PeerId) => endpoints.find((e) => e.id === id);

  /** Messages always arrive asynchronously, like the real network. */
  const later = (deliver: () => void) => {
    if (holding) held.push(deliver);
    else queueMicrotask(deliver);
  };

  const deliverMessage = (from: Endpoint, to: Endpoint, data: unknown) => {
    sent.push({ from: from.id, to: to.id, data });
    later(() => {
      // Delivered only if both are still connected when it arrives.
      if (from.online && to.online && endpoints.includes(to)) to.receive({ kind: 'message', data, from: from.id });
    });
  };

  const announce = (who: Endpoint, kind: 'join' | 'leave') => {
    for (const other of inRoom(who.key)) {
      if (other === who) continue;
      queueMicrotask(() => {
        other.receive({ kind, peer: who.id });
        if (kind === 'join') who.receive({ kind: 'join', peer: other.id });
      });
    }
  };

  const connect: Connect = async (key) => {
    const me = new Endpoint(`peer${next++}`, key);
    endpoints.push(me);
    announce(me, 'join');
    const connection: RoomConnection = {
      send(message: OnlineMessage, to?: PeerId) {
        if (!me.online || !endpoints.includes(me)) return;
        const data = toWire(message);
        for (const other of inRoom(key)) {
          if (other !== me && (to === undefined || other.id === to)) deliverMessage(me, other, data);
        }
      },
      onMessage(handler) {
        me.handlers.message = handler;
        me.flushWaiting();
      },
      onPeerJoin(handler) {
        me.handlers.join = handler;
        me.flushWaiting();
      },
      onPeerLeave(handler) {
        me.handlers.leave = handler;
        me.flushWaiting();
      },
      leave() {
        if (!endpoints.includes(me)) return;
        if (me.online) announce(me, 'leave');
        endpoints.splice(endpoints.indexOf(me), 1);
      },
    };
    return connection;
  };

  return {
    connect,
    sent,
    peers: (key) => inRoom(key).map((e) => e.id),
    hold: () => {
      holding = true;
    },
    release: () => {
      holding = false;
      const deliveries = held;
      held = [];
      deliveries.forEach((deliver) => queueMicrotask(deliver));
    },
    dropHeld: () => {
      holding = false;
      held = [];
    },
    cut: (peer) => {
      const endpoint = byId(peer);
      if (!endpoint || !endpoint.online) return;
      announce(endpoint, 'leave');
      for (const other of inRoom(endpoint.key)) {
        if (other !== endpoint) queueMicrotask(() => endpoint.receive({ kind: 'leave', peer: other.id }));
      }
      endpoint.online = false;
    },
    restore: (peer) => {
      const endpoint = byId(peer);
      if (!endpoint || endpoint.online) return;
      endpoint.online = true;
      announce(endpoint, 'join');
    },
    inject: (key, from, data) => {
      for (const other of inRoom(key)) {
        if (other.id !== from) queueMicrotask(() => other.receive({ kind: 'message', data, from }));
      }
    },
  };
}
