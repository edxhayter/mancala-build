// The whole game as one reducer (design.md decision 4): every change is a pure
// function `(state, event) => new state`, testable without React or a browser.

import { legalMoves, newBoard, play, type BoardSnapshot, type MoveResult, type Player } from '../engine';
import { caption, viewer } from './presentation';
import { DEFAULT_SETTINGS, isComputer, type Settings } from './settings';

/**
 * - human: waiting for a person to click a pit
 * - thinking: waiting for the computer's choice
 * - animating: a move is being sown; nothing can be played
 * - over: the game has finished
 */
export type Phase = 'human' | 'thinking' | 'animating' | 'over';

export interface GameState {
  settings: Settings;
  /** Seeds the AI's tie-breaks for this game. Never shown (decision 2). */
  seed: number;
  /** Goes up by one for every new game, so stale AI answers can be spotted. */
  gameId: number;
  /** The position after the latest move. */
  board: BoardSnapshot;
  phase: Phase;
  /** "South gets another turn." etc., shown once the latest move has landed. */
  caption: string | null;
  /** The latest move and the board before it, for the animation. */
  lastMove: PlayedMove | null;
}

/** A move that has been played: who played which pit, from which board, with what result. */
export interface PlayedMove {
  by: Player;
  pit: number;
  before: BoardSnapshot;
  result: MoveResult;
}

export type GameEvent =
  | { type: 'newGame'; settings: Settings; seed: number }
  | { type: 'movePlayed'; pit: number } // a person clicked a pit
  | { type: 'aiChose'; pit: number; gameId: number } // the computer's answer
  | { type: 'animationDone' };

/** A random seed for a new game (a whole number that fits in a u32). */
export function freshSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

/** Who acts next, once nothing is animating. */
function phaseFor(settings: Settings, board: BoardSnapshot): Phase {
  if (board.status.kind !== 'playing') return 'over';
  return isComputer(settings, board.toMove) ? 'thinking' : 'human';
}

function startGame(settings: Settings, seed: number, gameId: number): GameState {
  const board = newBoard();
  return {
    settings,
    seed,
    gameId,
    board,
    phase: phaseFor(settings, board),
    caption: null,
    lastMove: null,
  };
}

/** The game shown when the page first opens (spec: Ready on first visit). */
export function initialState(seed: number): GameState {
  return startGame(DEFAULT_SETTINGS, seed, 1);
}

/** Plays `pit` for whoever is to move, if it's legal; otherwise no change. */
function applyMove(state: GameState, pit: number): GameState {
  if (!legalMoves(state.board).includes(pit)) return state;
  const result = play(state.board, pit);
  return {
    ...state,
    board: result.board,
    phase: 'animating',
    caption: null,
    lastMove: { by: state.board.toMove, pit, before: state.board, result },
  };
}

export function gameReducer(state: GameState, event: GameEvent): GameState {
  switch (event.type) {
    case 'newGame':
      return startGame(event.settings, event.seed, state.gameId + 1);

    case 'movePlayed':
      return state.phase === 'human' ? applyMove(state, event.pit) : state;

    case 'aiChose':
      // An answer for an old game, or one that arrives at the wrong time, is ignored.
      if (event.gameId !== state.gameId || state.phase !== 'thinking') return state;
      return applyMove(state, event.pit);

    case 'animationDone': {
      if (state.phase !== 'animating' || state.lastMove === null) return state;
      const { by, result } = state.lastMove;
      return {
        ...state,
        phase: phaseFor(state.settings, state.board),
        caption: caption(state.settings, by, result),
      };
    }

    default: {
      // If a new event type is added and not handled above, this line stops
      // compiling: `event` would no longer be `never`.
      const unhandled: never = event;
      return unhandled;
    }
  }
}

/**
 * Whose side the board is drawn from right now. While a move is animating
 * it's the view from before the move, so in hotseat the board turns round
 * only once the seeds have landed.
 */
export function shownViewer(state: GameState): Player {
  const board = state.phase === 'animating' && state.lastMove ? state.lastMove.before : state.board;
  return viewer(state.settings, board);
}
