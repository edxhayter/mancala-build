import { describe, expect, it } from 'vitest';
import { deriveKey, eventId, newIdentity, open, roomKind, roomTopic, seal, signEvent, verifyEvent } from './nostr';
import { roomKey } from './rooms';

describe('where a room lives on the relays', () => {
  it('the same room name, however it is typed, gives the same topic and kind', async () => {
    const a = await roomTopic(roomKey('Friday Rematch')!);
    const b = await roomTopic(roomKey('  friday   REMATCH ')!);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(roomKind(a)).toBe(roomKind(b));
  });

  it('different rooms get different topics, and kinds are ephemeral', async () => {
    const a = await roomTopic('friday rematch');
    const b = await roomTopic('saturday game');
    expect(a).not.toBe(b);
    for (const topic of [a, b]) {
      expect(roomKind(topic)).toBeGreaterThanOrEqual(20000);
      expect(roomKind(topic)).toBeLessThan(30000);
    }
  });

  it('the topic never contains the room name', async () => {
    expect(await roomTopic('friday rematch')).not.toContain('friday');
  });
});

describe('sealing messages', () => {
  it('round-trips a message, with a fresh IV each time', async () => {
    const key = await deriveKey('friday rematch');
    const message = { type: 'chat', text: 'good luck <b>Ed</b>', v: 1 };
    const one = await seal(key, message);
    const two = await seal(key, message);
    expect(one).not.toBe(two);
    expect(await open(key, one)).toEqual(message);
    expect(one).not.toContain('good luck');
  });

  it('gives null for the wrong room, tampering, or junk', async () => {
    const key = await deriveKey('friday rematch');
    const other = await deriveKey('saturday game');
    const sealed = await seal(key, { hello: 1 });
    expect(await open(other, sealed)).toBeNull();
    const tampered = sealed.slice(0, -4) + (sealed.endsWith('AAAA') ? 'BBBB' : 'AAAA');
    expect(await open(key, tampered)).toBeNull();
    expect(await open(key, 'not base64 !!')).toBeNull();
    expect(await open(key, '')).toBeNull();
  });
});

describe('signing events', () => {
  it('makes a NIP-01 event whose id and signature check out', async () => {
    const me = newIdentity();
    expect(me.publicKey).toMatch(/^[0-9a-f]{64}$/);
    const event = await signEvent(me, 21234, [['x', 'abc']], 'hello');
    expect(event).toMatchObject({ pubkey: me.publicKey, kind: 21234, tags: [['x', 'abc']], content: 'hello' });
    expect(event.id).toBe(await eventId(event));
    expect(await verifyEvent(event)).toBe(true);
    expect(await verifyEvent({ ...event, content: 'changed', id: await eventId({ ...event, content: 'changed' }) })).toBe(false);
  });

  it('matches a known NIP-01 id', async () => {
    // Worked out independently: sha256 of [0,"<pubkey>",1700000000,1,[],"hi"].
    const id = await eventId({ pubkey: 'a'.repeat(64), created_at: 1_700_000_000, kind: 1, tags: [], content: 'hi' });
    const expected = Array.from(
      new Uint8Array(
        await crypto.subtle.digest(
          'SHA-256',
          new TextEncoder().encode(`[0,"${'a'.repeat(64)}",1700000000,1,[],"hi"]`),
        ),
      ),
      (b) => b.toString(16).padStart(2, '0'),
    ).join('');
    expect(id).toBe(expected);
  });
});
