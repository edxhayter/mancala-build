// The messages two browsers send each other, and the checks every incoming
// message passes before anything uses it (add-online-play design.md decision 4).
//
// Anything from the network arrives as `unknown`: it came from someone else's
// browser, so it could be anything. `parseMessage` either returns a message
// whose every field has been checked, or `null`.

import { cleanPlayerName, displayName, roomKey } from './rooms';

/** The protocol version. A browser ignores messages from a different version. */
export const PROTOCOL = 1;

/** Longest chat message, in characters. */
export const MAX_CHAT = 300;
/** Far more moves than any real game (one rarely passes 80). */
export const MAX_MOVES = 200;
/** Far more rematches than one sitting will ever play. */
const MAX_GAMES = 10_000;

export interface Seat {
  /** Random per tab: how a refreshed tab proves it's the same player. */
  id: string;
  name: string;
}

/** Which of the room's two seats: whoever was in the room first, or second. */
export type SeatName = 'first' | 'second';

/** The room as each browser keeps it (design.md decision 3). */
export interface RoomRecord {
  /** The room key (lower-case name) and the name as shown. */
  key: string;
  name: string;
  /** When the first player opened the room, by their clock. Only for the tie-break. */
  openedAt: number;
  seats: { first: Seat; second: Seat | null };
  /** 0 for the first game, +1 for each rematch. */
  game: number;
  /** This game's pits in order from the starting position, each 0..=5. */
  moves: number[];
  rematch: Record<SeatName, boolean>;
  /**
   * One per earlier game in this room: the first player's store minus the
   * second's when it ended (positive: they won; 0: a draw). For the match score.
   */
  results: number[];
}

export type OnlineMessage =
  | { type: 'hello'; seatId: string; name: string; record: RoomRecord | null }
  | { type: 'move'; game: number; index: number; pit: number }
  | { type: 'chat'; id: string; text: string }
  | { type: 'rematch'; game: number }
  | { type: 'leave' }
  | { type: 'inUse' };

/** What goes on the wire: a message plus the protocol version. */
export type Wire = OnlineMessage & { v: typeof PROTOCOL };

export function toWire(message: OnlineMessage): Wire {
  return { ...message, v: PROTOCOL };
}

// --- Small checks -------------------------------------------------------------

type Fields = Record<string, unknown>;

const isObject = (x: unknown): x is Fields => typeof x === 'object' && x !== null && !Array.isArray(x);
const isInt = (x: unknown, min: number, max: number): x is number =>
  Number.isInteger(x) && (x as number) >= min && (x as number) <= max;
/** Seat and message ids: 8–32 lower-case letters and digits. */
const isId = (x: unknown): x is string => typeof x === 'string' && /^[a-z0-9]{8,32}$/.test(x);

/** Chat text: 1–300 characters once trimmed. Returns the trimmed text, or null. */
export function cleanChatText(x: unknown): string | null {
  if (typeof x !== 'string') return null;
  const text = x.trim();
  const length = [...text].length;
  return length >= 1 && length <= MAX_CHAT ? text : null;
}

/** A player's name that is already clean (as a well-behaved browser sends it). */
function isPlayerName(x: unknown): x is string {
  return typeof x === 'string' && cleanPlayerName(x) === x;
}

function parseSeat(x: unknown): Seat | null {
  if (!isObject(x) || !isId(x.id) || !isPlayerName(x.name)) return null;
  return { id: x.id, name: x.name };
}

/** Checks a record's shape. Whether its moves are legal is `reconcile`'s job. */
export function parseRecord(x: unknown): RoomRecord | null {
  if (!isObject(x)) return null;
  const { key, name, openedAt, seats, game, moves, rematch, results } = x;
  if (typeof name !== 'string' || displayName(name) !== name) return null;
  const expectedKey = roomKey(name);
  if (expectedKey === null || key !== expectedKey) return null;
  if (typeof openedAt !== 'number' || !Number.isFinite(openedAt) || openedAt < 0) return null;
  if (!isObject(seats)) return null;
  const first = parseSeat(seats.first);
  const second = seats.second === null ? null : parseSeat(seats.second);
  if (first === null || (seats.second !== null && second === null)) return null;
  if (second !== null && second.id === first.id) return null;
  if (!isInt(game, 0, MAX_GAMES)) return null;
  if (!Array.isArray(moves) || moves.length > MAX_MOVES || !moves.every((m) => isInt(m, 0, 5))) return null;
  if (!isObject(rematch) || typeof rematch.first !== 'boolean' || typeof rematch.second !== 'boolean') return null;
  // Exactly one result per earlier game; a store difference is at most 48.
  if (!Array.isArray(results) || results.length !== game || !results.every((r) => isInt(r, -48, 48))) return null;
  return {
    key: expectedKey,
    name,
    openedAt,
    seats: { first, second },
    game,
    moves: [...moves],
    rematch: { first: rematch.first, second: rematch.second },
    results: [...results],
  };
}

/** Checks a message from the other browser. `null` means: ignore it. */
export function parseMessage(data: unknown): OnlineMessage | null {
  if (!isObject(data) || data.v !== PROTOCOL) return null;
  switch (data.type) {
    case 'hello': {
      if (!isId(data.seatId) || !isPlayerName(data.name)) return null;
      const record = data.record === null ? null : parseRecord(data.record);
      if (data.record !== null && record === null) return null;
      return { type: 'hello', seatId: data.seatId, name: data.name, record };
    }
    case 'move':
      if (!isInt(data.game, 0, MAX_GAMES) || !isInt(data.index, 0, MAX_MOVES) || !isInt(data.pit, 0, 5)) return null;
      return { type: 'move', game: data.game, index: data.index, pit: data.pit };
    case 'chat': {
      const text = cleanChatText(data.text);
      if (!isId(data.id) || text === null) return null;
      return { type: 'chat', id: data.id, text };
    }
    case 'rematch':
      return isInt(data.game, 0, MAX_GAMES) ? { type: 'rematch', game: data.game } : null;
    case 'leave':
      return { type: 'leave' };
    case 'inUse':
      return { type: 'inUse' };
    default:
      return null;
  }
}

/** A random id for a seat or a chat message: 16 lower-case letters and digits. */
export function randomId(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}
