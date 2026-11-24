// Puzzles as one reducer (add-puzzles design.md decision 7). Like the game
// reducer, every change is a pure function `(state, event) => new state`.

import { legalMoves, play, type BoardSnapshot, type PuzzleSnapshot } from '../engine';
import { moveCaption } from './presentation';
import type { PlayedMove } from './reducer';

/** Tries per puzzle (spec: Wrong moves and tries). */
export const TRIES = 3;

/**
 * - loading: a puzzle has been asked for and hasn't arrived
 * - solving: waiting for the player to choose a pit
 * - animating: the answer is being sown (found, or revealed)
 * - done: solved or revealed; only Next puzzle is left
 */
export type PuzzlePhase = 'loading' | 'solving' | 'animating' | 'done';

export interface Tally {
  solved: number;
  played: number;
}

export interface PuzzleState {
  /** Goes up by one for every puzzle asked for, so stale arrivals can be spotted. */
  requestId: number;
  puzzle: PuzzleSnapshot | null;
  phase: PuzzlePhase;
  /** Pits chosen that weren't the answer, in order. */
  wrong: number[];
  outcome: 'solved' | 'revealed' | null;
  /** The answer's move, once it is being shown. */
  lastMove: PlayedMove | null;
  /** "You captured 5 seeds." etc., once the answer's move has landed. */
  caption: string | null;
  /** Solved out of played, this visit. */
  tally: Tally;
  /** Whether this puzzle has been added to `tally.played` yet. */
  counted: boolean;
}

export type PuzzleEvent =
  | { type: 'requested'; requestId: number }
  | { type: 'arrived'; requestId: number; puzzle: PuzzleSnapshot }
  | { type: 'pitChosen'; pit: number }
  | { type: 'showAnswer' }
  | { type: 'animationDone' };

/** Before any puzzle has been asked for this visit. */
export const initialPuzzleState: PuzzleState = {
  requestId: 0,
  puzzle: null,
  phase: 'loading',
  wrong: [],
  outcome: null,
  lastMove: null,
  caption: null,
  tally: { solved: 0, played: 0 },
  counted: true, // nothing to count yet
};

/** Plays the answer and records how the puzzle ended. Only called while solving. */
function finish(state: PuzzleState, puzzle: PuzzleSnapshot, outcome: 'solved' | 'revealed'): PuzzleState {
  const { board, answer } = puzzle;
  return {
    ...state,
    phase: 'animating',
    outcome,
    lastMove: { by: board.toMove, pit: answer, before: board, result: play(board, answer) },
    tally: {
      solved: state.tally.solved + (outcome === 'solved' ? 1 : 0),
      played: state.tally.played + 1,
    },
    counted: true,
  };
}

export function puzzleReducer(state: PuzzleState, event: PuzzleEvent): PuzzleState {
  switch (event.type) {
    case 'requested': {
      // Leaving a puzzle that was shown but not finished counts it as played.
      const skipped = state.puzzle !== null && !state.counted;
      return {
        ...initialPuzzleState,
        requestId: event.requestId,
        tally: skipped ? { ...state.tally, played: state.tally.played + 1 } : state.tally,
        counted: false,
      };
    }

    case 'arrived':
      if (event.requestId !== state.requestId || state.phase !== 'loading') return state;
      return { ...state, puzzle: event.puzzle, phase: 'solving' };

    case 'pitChosen': {
      const { puzzle } = state;
      if (state.phase !== 'solving' || puzzle === null) return state;
      if (!playablePits(state).includes(event.pit)) return state;
      if (event.pit === puzzle.answer) return finish(state, puzzle, 'solved');
      const wrong = [...state.wrong, event.pit];
      // Out of tries: show the answer.
      return wrong.length >= TRIES ? finish({ ...state, wrong }, puzzle, 'revealed') : { ...state, wrong };
    }

    case 'showAnswer':
      if (state.phase !== 'solving' || state.puzzle === null) return state;
      return finish(state, state.puzzle, 'revealed');

    case 'animationDone':
      if (state.phase !== 'animating' || state.lastMove === null) return state;
      return { ...state, phase: 'done', caption: moveCaption('You', state.lastMove.result) };

    default: {
      const unhandled: never = event;
      return unhandled;
    }
  }
}

// --- Worked out from the state (nothing below is stored) ----------------------

/** The pits that can be chosen now: the mover's legal pits, minus ones already tried. */
export function playablePits(state: PuzzleState): number[] {
  if (state.phase !== 'solving' || state.puzzle === null) return [];
  return legalMoves(state.puzzle.board).filter((pit) => !state.wrong.includes(pit));
}

/** The position to draw once nothing is animating. */
export function puzzleBoard(state: PuzzleState): BoardSnapshot | null {
  return state.lastMove?.result.board ?? state.puzzle?.board ?? null;
}

export const triesLeft = (state: PuzzleState): number => TRIES - state.wrong.length;

/** The words on the status line: a message, and a smaller detail line (or null). */
export function puzzleStatus(state: PuzzleState): { message: string; detail: string | null } {
  const { puzzle } = state;
  if (state.phase === 'loading' || puzzle === null) return { message: 'Preparing a puzzle…', detail: null };

  const answerText = `The best move was pit ${puzzle.answer + 1}.`; // pits are shown 1-6
  switch (state.phase) {
    case 'solving': {
      const left = triesLeft(state);
      const tries = `${left} ${left === 1 ? 'try' : 'tries'}`;
      return state.wrong.length === 0
        ? { message: 'Find the best move', detail: tries }
        : { message: 'Not that one. Try again.', detail: `${tries} left` };
    }
    case 'animating':
      return state.outcome === 'revealed'
        ? { message: answerText, detail: null }
        : { message: 'Find the best move', detail: null };
    case 'done':
      return {
        message: state.outcome === 'solved' ? 'Solved!' : answerText,
        detail: state.caption,
      };
  }
}
