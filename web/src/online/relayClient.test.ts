import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeRelays } from '../test/relay';
import { backoff, createRelayClient } from './relayClient';
import type { NostrEvent } from './nostr';

const URLS = ['wss://a.example', 'wss://b.example'];
const EVENT: NostrEvent = { id: 'e1', pubkey: 'p', created_at: 1, kind: 21000, tags: [['x', 'topic']], content: 'c', sig: 's' };
const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }));
afterEach(() => vi.useRealTimers());

function client(relays: FakeRelays, received: NostrEvent[] = [], reach: boolean[] = []) {
  return createRelayClient({
    urls: URLS,
    filter: { kinds: [21000], '#x': ['topic'] },
    onEvent: (e) => received.push(e),
    onReachable: (r) => reach.push(r),
    socket: relays.factory,
  });
}

describe('the relay client', () => {
  it('subscribes on every relay once it opens', async () => {
    const relays = new FakeRelays();
    client(relays);
    await flush();
    expect(relays.sockets).toHaveLength(2);
    for (const socket of relays.sockets) {
      expect(socket.sent[0]).toEqual(['REQ', expect.stringMatching(/^mancala-/), { kinds: [21000], '#x': ['topic'] }]);
    }
  });

  it('publishes to every open relay, and receives what matches', async () => {
    const relays = new FakeRelays();
    const got: NostrEvent[] = [];
    const sender = client(relays);
    client(relays, got);
    await flush();
    sender.publish(EVENT);
    await flush();
    expect(got).toEqual([EVENT, EVENT]); // once from each relay; the transport removes duplicates
  });

  it('reports when it becomes reachable, and when every relay is lost', async () => {
    const relays = new FakeRelays();
    relays.autoOpen = false;
    const reach: boolean[] = [];
    const c = client(relays, [], reach);
    expect(c.reachable()).toBe(false);
    relays.openAll();
    expect(reach).toEqual([true]);
    relays.sockets.forEach((s) => s.drop());
    expect(reach).toEqual([true, false]);
  });

  it('reconnects with growing delays, and subscribes again', async () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(backoff)).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000]);
    const relays = new FakeRelays();
    client(relays);
    await flush();
    const first = relays.sockets[0];
    first.drop();
    expect(relays.sockets).toHaveLength(2); // not yet
    vi.advanceTimersByTime(1000);
    await flush();
    const again = relays.sockets.at(-1)!;
    expect(again.url).toBe(first.url);
    expect(again.sent[0][0]).toBe('REQ');
  });

  it('close stops everything and reconnects no more', async () => {
    const relays = new FakeRelays();
    const c = client(relays);
    await flush();
    c.close();
    expect(relays.sockets.every((s) => s.readyState === 3)).toBe(true);
    vi.advanceTimersByTime(60_000);
    expect(relays.sockets).toHaveLength(2);
  });
});
