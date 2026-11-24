import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeRelays } from '../test/relay';
import { BEAT_MS, SILENCE_MS, relayConnector } from './relays';
import { deriveKey, newIdentity, roomKind, roomTopic, signEvent } from './nostr';
import type { PeerId, RoomConnection } from './transport';

const URLS = ['wss://a.example', 'wss://b.example'];

/** Lets sockets open, crypto finish and deliveries run (crypto.subtle needs real event-loop turns). */
async function settle(times = 8) {
  for (let i = 0; i < times; i++) await new Promise((r) => setTimeout(r, 0));
}

async function listen(relays: FakeRelays, room = 'friday rematch') {
  const conn = await relayConnector({ urls: URLS, socket: relays.factory })(room);
  const log: string[] = [];
  const data: unknown[] = [];
  const peers: PeerId[] = [];
  conn.onPeerJoin((p) => {
    peers.push(p);
    log.push('join');
  });
  conn.onPeerLeave(() => log.push('leave'));
  conn.onMessage((d) => data.push(d));
  const reach: boolean[] = [];
  conn.onReachable((r) => reach.push(r));
  return { conn, log, data, peers, reach };
}

afterEach(() => vi.useRealTimers());

describe('the connection through relays', () => {
  // Scenario: Two players on the same Wi-Fi
  // Everything goes through the relays, so it doesn't matter which networks the
  // two tabs are on; the real same-Wi-Fi check is task 8.8.
  it('two tabs in a room meet and exchange messages', async () => {
    const relays = new FakeRelays();
    const a = await listen(relays);
    const b = await listen(relays);
    await vi.waitFor(() => {
      expect(a.log).toEqual(['join']);
      expect(b.log).toEqual(['join']);
    });

    a.conn.send({ type: 'rematch', game: 0 });
    // Sent to two relays, handled once.
    await vi.waitFor(() => expect(b.data).toEqual([{ type: 'rematch', game: 0, v: 1 }]));
    await settle();
    expect(b.data).toHaveLength(1);
    a.conn.leave();
    b.conn.leave();
  });

  it('keeps messages in the order they were sent', async () => {
    const relays = new FakeRelays();
    const a = await listen(relays);
    const b = await listen(relays);
    await vi.waitFor(() => expect(b.log).toEqual(['join']));
    for (let game = 0; game < 5; game++) a.conn.send({ type: 'rematch', game });
    await vi.waitFor(() => expect(b.data).toHaveLength(5));
    expect(b.data.map((d) => (d as { game: number }).game)).toEqual([0, 1, 2, 3, 4]);
    a.conn.leave();
    b.conn.leave();
  });

  it('a message for one peer reaches only that peer', async () => {
    const relays = new FakeRelays();
    const a = await listen(relays);
    const b = await listen(relays);
    const c = await listen(relays);
    await vi.waitFor(() => expect(a.peers).toHaveLength(2));
    a.conn.send({ type: 'inUse' }, c.peers.includes(a.peers[0]) ? a.peers[0] : a.peers[1]);
    await vi.waitFor(() => expect(b.data.length + c.data.length).toBe(1));
    await settle();
    const got = [b.data.length, c.data.length].sort();
    expect(got).toEqual([0, 1]);
    [a, b, c].forEach((t) => t.conn.leave());
  });

  it('other rooms are never heard', async () => {
    const relays = new FakeRelays();
    const a = await listen(relays, 'friday rematch');
    const b = await listen(relays, 'saturday game');
    await settle();
    a.conn.send({ type: 'leave' });
    await settle();
    expect(b.log).toEqual([]);
    expect(b.data).toEqual([]);
    a.conn.leave();
    b.conn.leave();
  });

  it('leaving sends a goodbye, so the other tab sees it leave at once', async () => {
    const relays = new FakeRelays();
    const a = await listen(relays);
    const b = await listen(relays);
    await vi.waitFor(() => expect(b.log).toEqual(['join']));
    a.conn.leave();
    await vi.waitFor(() => expect(b.log).toEqual(['join', 'leave']));
    b.conn.leave();
  });

  it('a message sent just before leaving still goes out, before the goodbye', async () => {
    const relays = new FakeRelays();
    const a = await listen(relays);
    const b = await listen(relays);
    await vi.waitFor(() => expect(b.log).toEqual(['join']));
    a.conn.send({ type: 'leave' });
    a.conn.leave();
    await vi.waitFor(() => expect(b.log).toEqual(['join', 'leave']));
    expect(b.data).toEqual([{ type: 'leave', v: 1 }]);
    b.conn.leave();
  });

  it('a tab that falls silent for 15 seconds has left', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    const relays = new FakeRelays();
    const a = await listen(relays);
    const b = await listen(relays);
    await vi.waitFor(() => expect(b.log).toEqual(['join']));
    // a goes quiet without a goodbye (its network is cut): stop delivering a's events.
    relays.dropping = true;
    for (let t = 0; t <= SILENCE_MS + BEAT_MS; t += BEAT_MS) {
      vi.advanceTimersByTime(BEAT_MS);
      await settle();
    }
    expect(b.log).toEqual(['join', 'leave']);
    a.conn.leave();
    b.conn.leave();
  });

  it('reports whether the relays can be reached', async () => {
    const relays = new FakeRelays();
    relays.autoOpen = false;
    const a = await listen(relays);
    expect(a.reach).toEqual([false]);
    relays.openAll();
    await vi.waitFor(() => expect(a.reach).toEqual([false, true]));
    a.conn.leave();
  });

  it('drops events it cannot open: other apps, or junk with the right tag', async () => {
    const relays = new FakeRelays();
    const a = await listen(relays);
    await settle();
    const topic = await roomTopic('friday rematch');
    const stranger = newIdentity();
    const junk = await signEvent(stranger, roomKind(topic), [['x', topic]], 'not sealed');
    // Sealed with the wrong key:
    const wrongKey = await deriveKey('another room');
    const { seal } = await import('./nostr');
    const wrong = await signEvent(stranger, roomKind(topic), [['x', topic]], await seal(wrongKey, { id: 'x1', t: 'beat' }));
    for (const socket of relays.sockets) {
      socket.deliver(['EVENT', 'any', junk]);
      socket.deliver(['EVENT', 'any', wrong]);
    }
    await settle();
    expect(a.log).toEqual([]);
    a.conn.leave();
  });
});

export type { RoomConnection };
