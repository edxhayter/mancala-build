import { describe, expect, it } from 'vitest';
import type { RoomRecord, Seat } from './protocol';
import { admit, askRematch, boardOf, meet, newRecord, playerOn, reconcile, seatFor, sideOf } from './record';

const ED: Seat = { id: 'ed0000000001', name: 'Ed' };
const SAM: Seat = { id: 'sam000000001', name: 'Sam' };
const ALEX: Seat = { id: 'alex00000001', name: 'Alex' };
const T = 1_700_000_000_000;

/** Ed's room with Sam in it, and some moves played. */
function playing(moves: number[], extra: Partial<RoomRecord> = {}): RoomRecord {
  return { ...newRecord('Friday Rematch', ED, T), seats: { first: ED, second: SAM }, moves, ...extra };
}

const both = new Set([ED.id, SAM.id]);

describe('a new room', () => {
  it('has the first player and no moves', () => {
    const record = newRecord('  Friday   Rematch ', ED, T);
    expect(record).toMatchObject({ key: 'friday rematch', name: 'Friday Rematch', openedAt: T, game: 0, moves: [] });
    expect(record.seats).toEqual({ first: ED, second: null });
  });

  it('refuses a name that is not allowed', () => {
    expect(() => newRecord('<b>', ED, T)).toThrow();
  });
});

describe('sides', () => {
  it('the first player is South in even games and North in odd ones', () => {
    const record = playing([]);
    expect(sideOf(record, ED.id)).toBe('south');
    expect(sideOf(record, SAM.id)).toBe('north');
    expect(playerOn(record, 'south')).toEqual(ED);

    const next = { ...record, game: 1 };
    expect(sideOf(next, ED.id)).toBe('north');
    expect(sideOf(next, SAM.id)).toBe('south');
    expect(sideOf(next, ALEX.id)).toBeNull();
  });

  it('the board comes from the moves, or null if they do not replay', () => {
    expect(boardOf(playing([2, 5]))?.toMove).toBe('north');
    expect(boardOf(playing([0, 0, 0]))).toBeNull();
  });
});

describe('reconcile', () => {
  it('the further-on record wins, whichever side runs it', () => {
    const behind = playing([2]);
    const ahead = playing([2, 5]);
    expect(reconcile(behind, ahead)).toBe(ahead);
    expect(reconcile(ahead, behind)).toBe(ahead);
    const nextGame = playing([], { game: 1 });
    expect(reconcile(ahead, nextGame)).toBe(nextGame);
  });

  it('recovers a move lost in a drop', () => {
    // Sam's move left Sam's browser but never reached Ed's.
    const eds = playing([2, 5]);
    const sams = playing([2, 5, 1]);
    expect(reconcile(eds, sams).moves).toEqual([2, 5, 1]);
  });

  it('ignores a record whose moves do not replay', () => {
    const mine = playing([2]);
    expect(reconcile(mine, playing([0, 0, 0, 1]))).toBe(mine);
  });

  it('ignores a record for another room', () => {
    const mine = playing([2]);
    expect(reconcile(mine, { ...newRecord('other room', ALEX, T), moves: [2, 5] })).toBe(mine);
  });

  // Scenario: Entering at the same moment
  it('on a tie, the earlier-opened room wins, the same in both browsers', () => {
    const eds = newRecord('friday rematch', ED, T);
    const sams = newRecord('Friday Rematch', SAM, T + 5);
    expect(reconcile(eds, sams)).toBe(eds);
    expect(reconcile(sams, eds)).toBe(eds);
  });

  it('on an exact tie in time, the lower first-seat id wins', () => {
    const eds = newRecord('friday rematch', ED, T);
    const sams = newRecord('friday rematch', SAM, T);
    expect(reconcile(eds, sams)).toBe(eds);
    expect(reconcile(sams, eds)).toBe(eds);
  });

  it('a room already in use beats a brand-new one, even from a slow clock', () => {
    const inUse = playing([]);
    const fresh = newRecord('friday rematch', ALEX, T - 60_000);
    expect(reconcile(fresh, inUse)).toBe(inUse);
  });
});

describe('who may sit where', () => {
  it('a newcomer takes the empty second seat', () => {
    const record = newRecord('friday rematch', ED, T);
    expect(seatFor(record, SAM, new Set([ED.id, SAM.id]))).toBe('second');
    expect(admit(record, SAM, both).seats.second).toEqual(SAM);
  });

  it('someone already seated stays where they are', () => {
    expect(seatFor(playing([]), SAM, both)).toBe('seated');
  });

  it('the room is in use while both players are connected', () => {
    expect(seatFor(playing([]), ALEX, new Set([ED.id, SAM.id, ALEX.id]))).toBe('inUse');
  });

  // Scenario: Taking over a seat that was left behind
  it("a seat left behind can be taken under the same player's name, in any case", () => {
    const newSam: Seat = { id: 'sam000000002', name: 'sam' };
    const connected = new Set([ED.id, newSam.id]);
    expect(seatFor(playing([2]), newSam, connected)).toBe('takeover');
    const after = admit(playing([2]), newSam, connected);
    expect(after.seats).toEqual({ first: ED, second: newSam });
    expect(after.moves).toEqual([2]);
  });

  it('the first seat can be taken back too', () => {
    const newEd: Seat = { id: 'ed0000000002', name: 'Ed' };
    const after = admit(playing([2]), newEd, new Set([SAM.id, newEd.id]));
    expect(after.seats).toEqual({ first: newEd, second: SAM });
  });

  // Scenario: A stranger can't take a seat
  it("a stranger can't take a seat left behind", () => {
    expect(seatFor(playing([2]), ALEX, new Set([ED.id, ALEX.id]))).toBe('inUse');
  });
});

describe('meet', () => {
  it('a first join: both browsers agree on the room and both players are in', () => {
    const eds = newRecord('friday rematch', ED, T);
    const sams = newRecord('Friday Rematch', SAM, T + 1000);
    const fromEd = meet(eds, sams, ED, SAM, both);
    const fromSam = meet(sams, eds, SAM, ED, both);
    expect(fromEd.record).toEqual(fromSam.record);
    expect(fromEd.record.seats).toEqual({ first: ED, second: SAM });
    expect(fromEd).toMatchObject({ meIn: true, themIn: true });
    expect(fromEd.record.name).toBe('friday rematch'); // as Ed, who was first, typed it
  });

  it('a third visitor is out, as both the players and the visitor see it', () => {
    const room = playing([2, 5]);
    const all = new Set([ED.id, SAM.id, ALEX.id]);
    const alexs = newRecord('friday rematch', ALEX, T - 1);
    expect(meet(room, alexs, ED, ALEX, all)).toMatchObject({ record: room, meIn: true, themIn: false });
    expect(meet(alexs, room, ALEX, ED, all)).toMatchObject({ record: room, meIn: false, themIn: true });
  });
});

describe('rematch', () => {
  it('needs both players, then swaps sides and clears the moves', () => {
    const over = playing([2, 5, 0]);
    const asked = askRematch(over, 'first');
    expect(asked.game).toBe(0);
    expect(asked.rematch).toEqual({ first: true, second: false });

    const again = askRematch(asked, 'second');
    expect(again).toMatchObject({ game: 1, moves: [], rematch: { first: false, second: false } });
    expect(again.name).toBe(over.name);
    expect(sideOf(again, SAM.id)).toBe('south');
  });
});
