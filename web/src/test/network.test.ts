import { describe, expect, it } from 'vitest';
import type { PeerId, RoomConnection } from '../online/transport';
import { createNetwork } from './network';

/** Lets queued deliveries run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A connection with everything it receives written down. */
async function listen(connect: (key: string) => Promise<RoomConnection>, key: string) {
  const connection = await connect(key);
  const log: string[] = [];
  const received: unknown[] = [];
  connection.onPeerJoin((peer: PeerId) => log.push(`join ${peer}`));
  connection.onPeerLeave((peer: PeerId) => log.push(`leave ${peer}`));
  connection.onMessage((data, from) => {
    log.push(`message from ${from}`);
    received.push(data);
  });
  return { connection, log, received };
}

describe('the in-memory network', () => {
  it('connections in the same room see each other join and exchange messages', async () => {
    const net = createNetwork();
    const a = await listen(net.connect, 'friday');
    const b = await listen(net.connect, 'friday');
    await settle();
    expect(a.log).toEqual(['join peer2']);
    expect(b.log).toEqual(['join peer1']);

    a.connection.send({ type: 'leave' });
    await settle();
    expect(b.received).toEqual([{ type: 'leave', v: 1 }]);
  });

  it('connections in different rooms never meet', async () => {
    const net = createNetwork();
    const a = await listen(net.connect, 'friday');
    const b = await listen(net.connect, 'saturday');
    a.connection.send({ type: 'inUse' });
    await settle();
    expect(a.log).toEqual([]);
    expect(b.log).toEqual([]);
  });

  it('can send to one peer only', async () => {
    const net = createNetwork();
    const a = await listen(net.connect, 'friday');
    const b = await listen(net.connect, 'friday');
    const c = await listen(net.connect, 'friday');
    await settle();
    a.connection.send({ type: 'inUse' }, 'peer3');
    await settle();
    expect(b.received).toEqual([]);
    expect(c.received).toEqual([{ type: 'inUse', v: 1 }]);
  });

  it('leaving tells the others', async () => {
    const net = createNetwork();
    const a = await listen(net.connect, 'friday');
    const b = await listen(net.connect, 'friday');
    await settle();
    b.connection.leave();
    await settle();
    expect(a.log).toEqual(['join peer2', 'leave peer2']);
    expect(net.peers('friday')).toEqual(['peer1']);
  });

  it('a cut browser is seen to leave, and to join again when restored', async () => {
    const net = createNetwork();
    const a = await listen(net.connect, 'friday');
    const b = await listen(net.connect, 'friday');
    await settle();
    net.cut('peer2');
    a.connection.send({ type: 'inUse' }); // lost: b is cut off
    await settle();
    expect(a.log).toEqual(['join peer2', 'leave peer2']);
    expect(b.log).toEqual(['join peer1', 'leave peer1']);
    expect(b.received).toEqual([]);

    net.restore('peer2');
    await settle();
    expect(a.log.at(-1)).toBe('join peer2');
    expect(b.log.at(-1)).toBe('join peer1');
  });

  it('held messages arrive in order on release, or never if dropped', async () => {
    const net = createNetwork();
    const a = await listen(net.connect, 'friday');
    const b = await listen(net.connect, 'friday');
    await settle();
    net.hold();
    a.connection.send({ type: 'rematch', game: 0 });
    a.connection.send({ type: 'rematch', game: 1 });
    await settle();
    expect(b.received).toEqual([]);
    net.release();
    await settle();
    expect(b.received).toEqual([
      { type: 'rematch', game: 0, v: 1 },
      { type: 'rematch', game: 1, v: 1 },
    ]);

    net.hold();
    a.connection.send({ type: 'leave' });
    net.dropHeld();
    await settle();
    expect(b.received).toHaveLength(2);
  });

  it('events that arrive before a handler is set wait for it', async () => {
    const net = createNetwork();
    await net.connect('friday');
    const late = await net.connect('friday');
    await settle();
    const joins: string[] = [];
    late.onPeerJoin((peer) => joins.push(peer));
    expect(joins).toEqual(['peer1']);
  });

  it('can inject raw data, for bad-data tests', async () => {
    const net = createNetwork();
    const a = await listen(net.connect, 'friday');
    net.inject('friday', 'mallory', { v: 1, type: 'move', pit: 99 });
    await settle();
    expect(a.received).toEqual([{ v: 1, type: 'move', pit: 99 }]);
  });
});
