// The room record both browsers keep, and the pure rules that let them agree
// without a server (add-online-play design.md decision 3).

import { replayMoves, type BoardSnapshot, type Player } from '../engine';
import type { RoomRecord, Seat, SeatName } from './protocol';
import { displayName, roomKey, samePlayerName } from './rooms';

export type { RoomRecord, Seat, SeatName };

/** A brand-new room with one player in it. `typedName` must be an allowed room name. */
export function newRecord(typedName: string, first: Seat, now: number): RoomRecord {
  const name = displayName(typedName);
  const key = roomKey(typedName);
  if (name === null || key === null) throw new Error(`not a room name: ${typedName}`);
  return {
    key,
    name,
    openedAt: now,
    seats: { first, second: null },
    game: 0,
    moves: [],
    rematch: { first: false, second: false },
    results: [],
  };
}

/** Which seat `seatId` has in the room, or null if none. */
export function seatOf(record: RoomRecord, seatId: string): SeatName | null {
  if (record.seats.first.id === seatId) return 'first';
  if (record.seats.second?.id === seatId) return 'second';
  return null;
}

/** The side a seat plays: the first player is South in even games, North in odd ones. */
export function sideOfSeat(record: RoomRecord, seat: SeatName): Player {
  const firstIsSouth = record.game % 2 === 0;
  return (seat === 'first') === firstIsSouth ? 'south' : 'north';
}

/** The side `seatId` plays, or null if they have no seat. */
export function sideOf(record: RoomRecord, seatId: string): Player | null {
  const seat = seatOf(record, seatId);
  return seat === null ? null : sideOfSeat(record, seat);
}

/** Who sits on `side` in this game. */
export function playerOn(record: RoomRecord, side: Player): Seat | null {
  return sideOfSeat(record, 'first') === side ? record.seats.first : record.seats.second;
}

/** The position after this game's moves, or null if they can't all be played. */
export function boardOf(record: RoomRecord): BoardSnapshot | null {
  try {
    return replayMoves(record.moves);
  } catch {
    return null;
  }
}

// --- Agreeing on one record ---------------------------------------------------

/**
 * How far on a record is, compared left to right: later game, more moves,
 * more players seated, more rematch requests. A fuller room beats a brand-new
 * one, so a newcomer's fresh record never replaces a room already in use.
 */
function progress(record: RoomRecord): number[] {
  const seated = record.seats.second === null ? 1 : 2;
  const asked = Number(record.rematch.first) + Number(record.rematch.second);
  return [record.game, record.moves.length, seated, asked];
}

/** Negative if `a` is further on than `b`, positive if `b` is, 0 if level. */
function compareProgress(a: RoomRecord, b: RoomRecord): number {
  const pa = progress(a);
  const pb = progress(b);
  for (let i = 0; i < pa.length; i++) {
    if (pa[i] !== pb[i]) return pb[i] - pa[i];
  }
  return 0;
}

/**
 * The record both browsers settle on, whoever runs it:
 * 1. a record whose moves don't replay is ignored;
 * 2. the further-on record wins;
 * 3. on a tie, the earlier-opened room wins, then the lower first-seat id.
 *    The clocks needn't agree: both browsers compare the same two numbers.
 */
export function reconcile(mine: RoomRecord, theirs: RoomRecord | null): RoomRecord {
  if (theirs === null || theirs.key !== mine.key || boardOf(theirs) === null) return mine;
  if (boardOf(mine) === null) return theirs;
  const byProgress = compareProgress(mine, theirs);
  if (byProgress !== 0) return byProgress < 0 ? mine : theirs;
  if (mine.openedAt !== theirs.openedAt) return mine.openedAt < theirs.openedAt ? mine : theirs;
  return mine.seats.first.id <= theirs.seats.first.id ? mine : theirs;
}

// --- Who may sit where --------------------------------------------------------

/** What happens to someone who wants a place in the room. */
export type Admission = 'seated' | 'second' | 'takeover' | 'inUse';

/**
 * Whether `newcomer` may sit in the room, given which seat ids are connected
 * right now (as this browser sees it):
 * - already seated: nothing to do;
 * - the second seat is empty: they take it;
 * - a seat's player isn't connected and has the same name: they take over;
 * - otherwise the room is in use.
 */
export function seatFor(record: RoomRecord, newcomer: Seat, connected: ReadonlySet<string>): Admission {
  if (seatOf(record, newcomer.id) !== null) return 'seated';
  if (record.seats.second === null) return 'second';
  for (const seat of [record.seats.first, record.seats.second]) {
    if (!connected.has(seat.id) && samePlayerName(seat.name, newcomer.name)) return 'takeover';
  }
  return 'inUse';
}

/** The record after `newcomer` is admitted (unchanged if 'seated' or 'inUse'). */
export function admit(record: RoomRecord, newcomer: Seat, connected: ReadonlySet<string>): RoomRecord {
  switch (seatFor(record, newcomer, connected)) {
    case 'second':
      return { ...record, seats: { ...record.seats, second: newcomer } };
    case 'takeover': {
      const { first, second } = record.seats;
      const takesFirst = !connected.has(first.id) && samePlayerName(first.name, newcomer.name);
      return { ...record, seats: takesFirst ? { first: newcomer, second } : { first, second: newcomer } };
    }
    default:
      return record;
  }
}

/** The outcome of two browsers meeting: the agreed record, and whether each of them is in. */
export interface Meeting {
  record: RoomRecord;
  meIn: boolean;
  themIn: boolean;
}

/**
 * Two browsers meet: settle the record, then admit both players in order of
 * seat id, so both browsers seat them the same way. `connected` holds the
 * seat ids connected right now, including both of these.
 */
export function meet(
  mine: RoomRecord,
  theirs: RoomRecord | null,
  me: Seat,
  them: Seat,
  connected: ReadonlySet<string>,
): Meeting {
  let record = reconcile(mine, theirs);
  for (const seat of [me, them].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    record = admit(record, seat, connected);
  }
  return { record, meIn: seatOf(record, me.id) !== null, themIn: seatOf(record, them.id) !== null };
}

// --- Rematches ------------------------------------------------------------------

/**
 * The record after `seat` asks for a rematch. Once both have, the finished
 * game's result joins `results` and the next game starts.
 */
export function askRematch(record: RoomRecord, seat: SeatName): RoomRecord {
  const rematch = { ...record.rematch, [seat]: true };
  const result = gameResult(record);
  if (rematch.first && rematch.second && result !== null) {
    return {
      ...record,
      game: record.game + 1,
      moves: [],
      rematch: { first: false, second: false },
      results: [...record.results, result],
    };
  }
  return { ...record, rematch };
}

// --- The match score (spec: Match score) -----------------------------------------

/** The current game's result (first player's store minus second's), or null while it's being played. */
export function gameResult(record: RoomRecord): number | null {
  const board = boardOf(record);
  if (board === null || board.status.kind === 'playing') return null;
  const first = sideOfSeat(record, 'first');
  const second = first === 'south' ? 'north' : 'south';
  return board.stores[first] - board.stores[second];
}

export interface MatchScore {
  /** Finished games, including one that has just ended. */
  games: number;
  wins: Record<SeatName, number>;
  /** The first player's total seed difference over those games (the tie-break). */
  seeds: number;
}

/** The score so far: earlier games, plus the current one if it has finished. */
export function matchScore(record: RoomRecord): MatchScore {
  const current = gameResult(record);
  const all = current === null ? record.results : [...record.results, current];
  return {
    games: all.length,
    wins: { first: all.filter((r) => r > 0).length, second: all.filter((r) => r < 0).length },
    seeds: all.reduce((sum, r) => sum + r, 0),
  };
}
