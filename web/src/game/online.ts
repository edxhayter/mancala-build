// An online game as one pure reducer (add-online-play design.md decision 5;
// spec: online-play). The network is handled by `online/useOnlineRoom.ts`,
// which turns what arrives into these events and sends what this accepts.

import { legalMoves, play, type BoardSnapshot, type Player } from '../engine';
import { askRematch, boardOf, meet, playerOn, seatOf, sideOf } from '../online/record';
import type { RoomRecord, Seat } from '../online/protocol';
import { stepCaption } from './explain';
import type { PlayedMove } from './reducer';

/**
 * The other player, as this browser sees them:
 * - none: never met in this tab yet (waiting, or reconnecting after a refresh)
 * - connected / away: here now / lost connection
 * - left: they left the room on purpose
 * - inUse: this browser was turned away (the room has two other players)
 */
export type Peer = 'none' | 'connected' | 'away' | 'left' | 'inUse';

/** Why the room closed (spec: Rooms close when not full). */
export type ClosedReason = 'nobodyCame' | 'didntComeBack';

export interface OnlineState {
  me: Seat;
  record: RoomRecord;
  /** The position after `record.moves`. */
  board: BoardSnapshot;
  peer: Peer;
  closed: ClosedReason | null;
  /** The move being animated, and any that arrived while it was. */
  lastMove: PlayedMove | null;
  queue: PlayedMove[];
  animating: boolean;
  /** The caption for the latest move, once it has landed. */
  caption: string | null;
}

export type OnlineEvent =
  /** This tab is in the room (new, or restored after a refresh). */
  | { type: 'entered'; me: Seat; record: RoomRecord }
  /** Another browser said hello. `connected` = seat ids connected right now, including both of us. */
  | { type: 'helloReceived'; seat: Seat; record: RoomRecord | null; connected: ReadonlySet<string> }
  | { type: 'peerLeft'; seatId: string }
  | { type: 'movePlayed'; pit: number }
  | { type: 'moveReceived'; seatId: string; game: number; index: number; pit: number }
  | { type: 'animationDone' }
  | { type: 'rematchAsked' }
  | { type: 'rematchReceived'; seatId: string; game: number }
  | { type: 'leftReceived'; seatId: string }
  | { type: 'inUseReceived' }
  | { type: 'roomClosed'; reason: ClosedReason };

/** What the page is doing, worked out from the state. */
export type OnlinePhase =
  | 'waiting' // nobody has joined yet
  | 'connecting' // after a refresh, before meeting the other player again
  | 'away' // the other player lost connection
  | 'yours'
  | 'theirs'
  | 'animating'
  | 'over'
  | 'ended'; // left, in use, or closed: nothing more happens in this room

export function initialOnline(me: Seat, record: RoomRecord): OnlineState {
  return {
    me,
    record,
    board: boardOf(record) ?? boardOf({ ...record, moves: [] })!,
    peer: 'none',
    closed: null,
    lastMove: null,
    queue: [],
    animating: false,
    caption: null,
  };
}

// --- Reading the state ----------------------------------------------------------

/** The side this browser plays (South if not seated, which only happens when turned away). */
export function mySide(state: OnlineState): Player {
  return sideOf(state.record, state.me.id) ?? 'south';
}

/** The other player's seat, if anyone has it. */
export function opponent(state: OnlineState): Seat | null {
  const theirSide: Player = mySide(state) === 'south' ? 'north' : 'south';
  return playerOn(state.record, theirSide);
}

/** "You" for this browser's player, their name for the other. */
export function nameOn(state: OnlineState, side: Player): string {
  return side === mySide(state) ? 'You' : (opponent(state)?.name ?? 'Opponent');
}

export function onlinePhase(state: OnlineState): OnlinePhase {
  if (state.closed !== null || state.peer === 'left' || state.peer === 'inUse') return 'ended';
  if (state.animating) return 'animating';
  if (state.board.status.kind !== 'playing') return 'over';
  if (state.record.seats.second === null) return 'waiting';
  if (state.peer === 'none') return 'connecting';
  if (state.peer === 'away') return 'away';
  return state.board.toMove === mySide(state) ? 'yours' : 'theirs';
}

/** The pits this browser may play right now. */
export function playableOnline(state: OnlineState): number[] {
  return onlinePhase(state) === 'yours' ? legalMoves(state.board) : [];
}

// --- Changing it -------------------------------------------------------------------

/** Plays `pit` for whoever is to move, adding it to the record and queueing its animation. */
function applyMove(state: OnlineState, pit: number): OnlineState {
  const before = state.board;
  const result = play(before, pit);
  const move: PlayedMove = { by: before.toMove, pit, before, result };
  const record = { ...state.record, moves: [...state.record.moves, pit] };
  const base = { ...state, record, board: result.board };
  return state.animating
    ? { ...base, queue: [...state.queue, move] }
    : { ...base, lastMove: move, animating: true, caption: null };
}

/** Takes on a whole record (after meeting). Shown at once, without animation. */
function adopt(state: OnlineState, record: RoomRecord): OnlineState {
  const board = boardOf(record);
  if (board === null) return state;
  const same = record.game === state.record.game && record.moves.length === state.record.moves.length;
  return same
    ? { ...state, record } // nothing to redraw; keep any animation going
    : { ...state, record, board, lastMove: null, queue: [], animating: false, caption: null };
}

/** Whether `seatId` is the other player in this room. */
const isOpponent = (state: OnlineState, seatId: string) =>
  seatId !== state.me.id && seatOf(state.record, seatId) !== null;

export function onlineReducer(state: OnlineState, event: OnlineEvent): OnlineState {
  // Once the room has ended for this browser, nothing more changes it.
  if (onlinePhase(state) === 'ended' && event.type !== 'animationDone' && event.type !== 'entered') return state;

  switch (event.type) {
    case 'entered':
      return initialOnline(event.me, event.record);

    case 'helloReceived': {
      const meeting = meet(state.record, event.record, state.me, event.seat, event.connected);
      if (!meeting.meIn) return { ...state, peer: 'inUse' };
      if (!meeting.themIn) return state; // a third visitor: they're told; nothing changes here
      return { ...adopt(state, meeting.record), peer: 'connected' };
    }

    case 'peerLeft':
      return isOpponent(state, event.seatId) && state.peer === 'connected' ? { ...state, peer: 'away' } : state;

    case 'movePlayed':
      if (onlinePhase(state) !== 'yours' || !legalMoves(state.board).includes(event.pit)) return state;
      return applyMove(state, event.pit);

    case 'moveReceived': {
      // Spec: Moves are checked in both browsers.
      const theirSide = sideOf(state.record, event.seatId);
      const inOrder = event.game === state.record.game && event.index === state.record.moves.length;
      const theirTurn = theirSide !== null && theirSide !== mySide(state) && state.board.toMove === theirSide;
      if (!isOpponent(state, event.seatId) || !inOrder || !theirTurn) return state;
      if (state.board.status.kind !== 'playing' || !legalMoves(state.board).includes(event.pit)) return state;
      return applyMove(state, event.pit);
    }

    case 'animationDone': {
      if (!state.animating || state.lastMove === null) return state;
      const landed = state.lastMove;
      const caption = stepCaption(nameOn(state, landed.by), landed.pit, landed.result);
      const [next, ...rest] = state.queue;
      return next
        ? { ...state, lastMove: next, queue: rest, caption: null }
        : { ...state, animating: false, caption };
    }

    case 'rematchAsked': {
      const seat = seatOf(state.record, state.me.id);
      if (seat === null || onlinePhase(state) !== 'over' || state.record.rematch[seat]) return state;
      return adopt(state, askRematch(state.record, seat));
    }

    case 'rematchReceived': {
      const seat = seatOf(state.record, event.seatId);
      const over = state.board.status.kind !== 'playing';
      if (seat === null || !isOpponent(state, event.seatId) || event.game !== state.record.game || !over) return state;
      return adopt(state, askRematch(state.record, seat));
    }

    case 'leftReceived':
      return isOpponent(state, event.seatId) ? { ...state, peer: 'left' } : state;

    case 'inUseReceived':
      // Only a browser that hasn't been let in can be turned away.
      return state.peer === 'connected' ? state : { ...state, peer: 'inUse' };

    case 'roomClosed':
      return { ...state, closed: event.reason };

    default: {
      const unhandled: never = event;
      return unhandled;
    }
  }
}

// --- Words ---------------------------------------------------------------------------

/** "You won!", "Sam won!" or "It's a draw." */
function resultText(state: OnlineState): string {
  const status = state.board.status;
  if (status.kind === 'draw') return "It's a draw.";
  if (status.kind === 'won') return status.winner === mySide(state) ? 'You won!' : `${nameOn(state, status.winner)} won!`;
  return '';
}

/** What the status line says (design.md decision 8). */
export function onlineStatus(state: OnlineState): { message: string; detail: string | null } {
  const them = opponent(state)?.name ?? 'The other player';
  switch (onlinePhase(state)) {
    case 'ended':
      if (state.closed === 'nobodyCame') return { message: 'The room closed: nobody joined in 10 minutes.', detail: null };
      if (state.closed === 'didntComeBack')
        return { message: `The room closed: ${them} didn't come back within 10 minutes.`, detail: null };
      if (state.peer === 'inUse') return { message: 'This room is in use. Try another name.', detail: null };
      return { message: `${them} has left the room.`, detail: null };
    case 'waiting':
      return { message: 'Waiting for someone to join', detail: null };
    case 'connecting':
      return { message: `Connecting to ${them}…`, detail: null };
    case 'away':
      return { message: `${them} has lost connection. Waiting for them to come back.`, detail: null };
    case 'over': {
      const mine = seatOf(state.record, state.me.id);
      const theirs = mine === 'first' ? 'second' : 'first';
      const detail = mine && state.record.rematch[mine]
        ? `Waiting for ${them}…`
        : state.record.rematch[theirs]
          ? `${them} wants a rematch`
          : null;
      return { message: resultText(state), detail };
    }
    case 'yours':
      return { message: 'Your turn', detail: state.caption };
    case 'theirs':
      return { message: `${them}'s turn`, detail: state.caption };
    case 'animating': {
      const mover = state.lastMove?.by ?? state.board.toMove;
      return { message: mover === mySide(state) ? 'Your turn' : `${them}'s turn`, detail: null };
    }
  }
}

/** Whether this browser has asked for a rematch already. */
export function rematchAsked(state: OnlineState): boolean {
  const seat = seatOf(state.record, state.me.id);
  return seat !== null && state.record.rematch[seat];
}

