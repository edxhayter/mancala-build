// The real connection: every message goes through public Nostr relays
// (add-online-play design.md decision 1, revised 2026-11-24). Messages are
// sealed with the room key; presence comes from a small "beat" every 5 s.

import { toWire, type OnlineMessage } from './protocol';
import { deriveKey, newIdentity, open, roomKind, roomTopic, seal, signEvent, type NostrEvent } from './nostr';
import { RELAYS, createRelayClient, type SocketFactory } from './relayClient';
import type { Connect, PeerId, RoomConnection } from './transport';

/** How often each tab says it's still here. */
export const BEAT_MS = 5000;
/** A peer not heard from for this long has left. */
export const SILENCE_MS = 15_000;

/** What travels inside a sealed event. `t`: a message, a beat, or a goodbye. */
type Envelope = { id: string; t: 'msg'; to?: PeerId; data: unknown } | { id: string; t: 'beat' } | { id: string; t: 'bye' };

function readEnvelope(x: unknown): Envelope | null {
  if (typeof x !== 'object' || x === null) return null;
  const e = x as Record<string, unknown>;
  if (typeof e.id !== 'string' || e.id.length > 40) return null;
  if (e.t === 'beat' || e.t === 'bye') return { id: e.id, t: e.t };
  if (e.t === 'msg' && (e.to === undefined || typeof e.to === 'string')) {
    return { id: e.id, t: 'msg', to: e.to as PeerId | undefined, data: e.data };
  }
  return null;
}

const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(36)).join('').slice(0, 24);

export interface RelayOptions {
  urls?: string[];
  socket?: SocketFactory;
}

/** Joins a room on the relays. `options` lets tests use a fake relay. */
export function relayConnector(options: RelayOptions = {}): Connect {
  return async (roomKey) => {
    const topic = await roomTopic(roomKey);
    const kind = roomKind(topic);
    const key = await deriveKey(roomKey);
    const me = newIdentity();

    // Handlers, and events that arrived before a handler was set.
    let onMessage: ((data: unknown, from: PeerId) => void) | null = null;
    let onJoin: ((peer: PeerId) => void) | null = null;
    let onLeave: ((peer: PeerId) => void) | null = null;
    let onReach: ((reachable: boolean) => void) | null = null;
    const early: (() => void)[] = [];
    const call = (run: () => boolean) => {
      if (!run()) early.push(() => void run());
    };
    const flushEarly = () => early.splice(0).forEach((run) => run());

    const heard = new Map<PeerId, number>(); // peer → when last heard
    const seen = new Set<string>(); // envelope ids already handled
    let left = false;

    const join = (peer: PeerId) => {
      const isNew = !heard.has(peer);
      heard.set(peer, Date.now());
      if (!isNew) return;
      call(() => (onJoin ? (onJoin(peer), true) : false));
      // They may have missed our last beat (sent before they arrived): answer at once.
      void publish({ id: newId(), t: 'beat' });
    };
    const leavePeer = (peer: PeerId) => {
      if (heard.delete(peer)) call(() => (onLeave ? (onLeave(peer), true) : false));
    };

    async function receive(event: NostrEvent) {
      if (left || event.pubkey === me.publicKey || typeof event.content !== 'string') return;
      const envelope = readEnvelope(await open(key, event.content));
      if (envelope === null || seen.has(envelope.id)) return; // not ours, or a copy from another relay
      seen.add(envelope.id);
      if (seen.size > 2000) seen.delete(seen.values().next().value!);
      const peer = event.pubkey;
      if (envelope.t === 'bye') return leavePeer(peer);
      join(peer);
      if (envelope.t === 'msg' && (envelope.to === undefined || envelope.to === me.publicKey)) {
        const data = envelope.data;
        call(() => (onMessage ? (onMessage(data, peer), true) : false));
      }
    }

    const client = createRelayClient({
      urls: options.urls ?? RELAYS,
      filter: { kinds: [kind], '#x': [topic] },
      onEvent: (event) => void receive(event),
      onReachable: (reachable) => {
        call(() => (onReach ? (onReach(reachable), true) : false));
        if (reachable) void beat(); // say hello straight away
      },
      socket: options.socket,
    });

    // Sending, one at a time so messages leave in the order they were sent.
    let queue: Promise<void> = Promise.resolve();
    const publish = (envelope: Envelope) => {
      // Decided when sent, not when the queue gets to it: a message sent just
      // before leave() (such as the 'leave' message itself) still goes out.
      if (left && envelope.t !== 'bye') return queue;
      queue = queue.then(async () => {
        const event = await signEvent(me, kind, [['x', topic]], await seal(key, envelope));
        client.publish(event);
      });
      return queue;
    };

    // A goodbye kept ready, so it can go out at once when the page closes.
    let readyBye: NostrEvent | null = null;
    const prepareBye = async () => {
      readyBye = await signEvent(me, kind, [['x', topic]], await seal(key, { id: newId(), t: 'bye' }));
    };

    async function beat() {
      if (left) return;
      await publish({ id: newId(), t: 'beat' });
      const now = Date.now();
      for (const [peer, at] of heard) if (now - at > SILENCE_MS) leavePeer(peer);
      await prepareBye();
    }
    const timer = setInterval(() => void beat(), BEAT_MS);

    const onPageHide = () => {
      if (readyBye) client.publish(readyBye);
    };
    window.addEventListener('pagehide', onPageHide);

    const connection: RoomConnection = {
      send(message: OnlineMessage, to?: PeerId) {
        void publish({ id: newId(), t: 'msg', to, data: toWire(message) });
      },
      onMessage(handler) {
        onMessage = handler;
        flushEarly();
      },
      onPeerJoin(handler) {
        onJoin = handler;
        flushEarly();
      },
      onPeerLeave(handler) {
        onLeave = handler;
        flushEarly();
      },
      onReachable(handler) {
        onReach = handler;
        handler(client.reachable());
        flushEarly();
      },
      leave() {
        if (left) return;
        left = true;
        clearInterval(timer);
        window.removeEventListener('pagehide', onPageHide);
        // Say goodbye, then close once it has gone out.
        void publish({ id: newId(), t: 'bye' }).finally(() => client.close());
      },
    };
    return connection;
  };
}

/** The connection the page uses: the real relays. */
export const connectWithRelays: Connect = relayConnector();
