import { describe, expect, it } from 'vitest';
import { parseMessage, parseRecord, randomId, toWire, type OnlineMessage, type RoomRecord } from './protocol';

const RECORD: RoomRecord = {
  key: 'friday rematch',
  name: 'Friday Rematch',
  openedAt: 1_700_000_000_000,
  seats: { first: { id: 'edseat000001', name: 'Ed' }, second: { id: 'samseat00001', name: 'Sam' } },
  game: 0,
  moves: [2, 5, 0],
  rematch: { first: false, second: false },
  results: [],
};

const VALID: OnlineMessage[] = [
  { type: 'hello', seatId: 'samseat00001', name: 'Sam', record: null },
  { type: 'hello', seatId: 'edseat000001', name: 'Ed', record: RECORD },
  { type: 'hello', seatId: 'edseat000001', name: 'Ed', record: { ...RECORD, seats: { ...RECORD.seats, second: null } } },
  { type: 'move', game: 0, index: 3, pit: 5 },
  { type: 'chat', id: 'msg000000001', text: 'good luck' },
  { type: 'rematch', game: 0 },
  { type: 'leave' },
  { type: 'inUse' },
];

/** The wire form with some fields replaced. */
const tweak = (message: OnlineMessage, change: Record<string, unknown>) => ({ ...toWire(message), ...change });

describe('parseMessage', () => {
  it.each(VALID.map((m) => [m.type, m]))('accepts a valid %s', (_type, message) => {
    expect(parseMessage(toWire(message))).toEqual(message);
  });

  it('trims chat text', () => {
    expect(parseMessage(tweak(VALID[4], { text: '  hi  ' }))).toEqual({ ...VALID[4], text: 'hi' });
  });

  it.each([
    ['not an object', null],
    ['a string', 'hello'],
    ['an array', [toWire(VALID[3])]],
    ['an unknown type', { v: 1, type: 'shout' }],
    ['another protocol version', tweak(VALID[3], { v: 2 })],
    ['no version', { ...VALID[3] }],
    ['hello: a bad seat id', tweak(VALID[0], { seatId: 'X!' })],
    ['hello: a 21-character name', tweak(VALID[0], { name: 'a'.repeat(21) })],
    ['hello: an untidy name', tweak(VALID[0], { name: ' Sam' })],
    ['hello: a record with a bad room name', tweak(VALID[1], { record: { ...RECORD, name: '<b>', key: '<b>' } })],
    ['hello: a record whose key does not match', tweak(VALID[1], { record: { ...RECORD, key: 'other room' } })],
    ['hello: a record with a pit of 6', tweak(VALID[1], { record: { ...RECORD, moves: [2, 6] } })],
    ['hello: a record with too many moves', tweak(VALID[1], { record: { ...RECORD, moves: Array(201).fill(0) } })],
    ['hello: a record with one player in both seats', tweak(VALID[1], { record: { ...RECORD, seats: { first: RECORD.seats.first, second: RECORD.seats.first } } })],
    ['hello: a record that is a string', tweak(VALID[1], { record: 'x' })],
    ['move: pit 6', tweak(VALID[3], { pit: 6 })],
    ['move: pit -1', tweak(VALID[3], { pit: -1 })],
    ['move: pit 2.5', tweak(VALID[3], { pit: 2.5 })],
    ['move: pit as text', tweak(VALID[3], { pit: '2' })],
    ['move: a huge index', tweak(VALID[3], { index: 10_000 })],
    ['chat: empty text', tweak(VALID[4], { text: '   ' })],
    // Scenario: A bad message is ignored
    ['chat: 1,000 characters', tweak(VALID[4], { text: 'a'.repeat(1000) })],
    ['chat: text that is not text', tweak(VALID[4], { text: { html: '<b>' } })],
    ['chat: a bad id', tweak(VALID[4], { id: 'short' })],
    ['rematch: a negative game', tweak(VALID[5], { game: -1 })],
    ['hello: results that do not match the game number', tweak(VALID[1], { record: { ...RECORD, game: 2, results: [4] } })],
    ['hello: a result over 48', tweak(VALID[1], { record: { ...RECORD, game: 1, results: [49] } })],
    ['hello: a result that is not a whole number', tweak(VALID[1], { record: { ...RECORD, game: 1, results: [2.5] } })],
  ])('rejects %s', (_why, data) => {
    expect(parseMessage(data)).toBeNull();
  });

  it('accepts 300 characters of chat but not 301', () => {
    expect(parseMessage(tweak(VALID[4], { text: 'a'.repeat(300) }))).not.toBeNull();
    expect(parseMessage(tweak(VALID[4], { text: 'a'.repeat(301) }))).toBeNull();
  });

  it('copies a record, so changing the received data changes nothing', () => {
    const moves = [2, 5];
    const parsed = parseRecord({ ...RECORD, moves });
    moves.push(0);
    expect(parsed?.moves).toEqual([2, 5]);
  });
});

describe('randomId', () => {
  it('makes ids the parser accepts, all different', () => {
    const ids = new Set(Array.from({ length: 1000 }, randomId));
    expect(ids.size).toBe(1000);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]{16}$/);
  });
});
