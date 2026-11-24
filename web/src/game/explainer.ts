// The explainer's flow as a reducer (add-move-explainer design.md decision 7):
// the list of moves, replaying one move's line step by step, and waiting for
// a game analysis that may arrive too late to matter.

import type { BoardSnapshot } from '../engine';
import type { MoveDescription } from './explain';
import type { PlayedMove } from './reducer';

/** What is being explained: a finished puzzle, or a position in a game. */
export type ExplainerSource = { kind: 'puzzle' } | { kind: 'game'; gameId: number; board: BoardSnapshot };

export type ExplainerView =
  | { kind: 'list' }
  /** Replaying `pit`'s line: `step` is the move being shown, `landed` once its seeds are down. */
  | { kind: 'replay'; pit: number; step: number; landed: boolean };

export type ExplainerState =
  | { status: 'closed' }
  | { status: 'analyzing'; source: ExplainerSource & { kind: 'game' } }
  | { status: 'open'; source: ExplainerSource; position: BoardSnapshot; items: MoveDescription[]; view: ExplainerView };

export type ExplainerEvent =
  | { type: 'opened'; source: ExplainerSource; position: BoardSnapshot; items: MoveDescription[] }
  | { type: 'analysisAsked'; gameId: number; board: BoardSnapshot }
  | { type: 'analysisArrived'; gameId: number; board: BoardSnapshot; items: MoveDescription[] }
  | { type: 'showWhy'; pit: number }
  | { type: 'stepLanded' }
  | { type: 'nextMove' }
  | { type: 'back' }
  | { type: 'closed' };

export const closedExplainer: ExplainerState = { status: 'closed' };

export function explainerReducer(state: ExplainerState, event: ExplainerEvent): ExplainerState {
  switch (event.type) {
    case 'opened':
      return { status: 'open', source: event.source, position: event.position, items: event.items, view: { kind: 'list' } };

    case 'analysisAsked':
      return { status: 'analyzing', source: { kind: 'game', gameId: event.gameId, board: event.board } };

    case 'analysisArrived': {
      // Only the answer to the question still being asked: same game, same position.
      if (state.status !== 'analyzing') return state;
      const { source } = state;
      if (source.gameId !== event.gameId || source.board !== event.board) return state;
      return { status: 'open', source, position: event.board, items: event.items, view: { kind: 'list' } };
    }

    case 'showWhy':
      if (state.status !== 'open' || !state.items.some((item) => item.pit === event.pit)) return state;
      return { ...state, view: { kind: 'replay', pit: event.pit, step: 0, landed: false } };

    case 'stepLanded':
      if (state.status !== 'open' || state.view.kind !== 'replay' || state.view.landed) return state;
      return { ...state, view: { ...state.view, landed: true } };

    case 'nextMove': {
      if (state.status !== 'open' || state.view.kind !== 'replay' || !state.view.landed) return state;
      if (state.view.step + 1 >= replaySteps(state).length) return state;
      return { ...state, view: { ...state.view, step: state.view.step + 1, landed: false } };
    }

    case 'back':
      if (state.status !== 'open' || state.view.kind !== 'replay') return state;
      return { ...state, view: { kind: 'list' } };

    case 'closed':
      return closedExplainer;

    default: {
      const unhandled: never = event;
      return unhandled;
    }
  }
}

// --- Worked out from the state ------------------------------------------------

function replaySteps(state: ExplainerState & { status: 'open' }) {
  const { view } = state;
  if (view.kind !== 'replay') return [];
  return state.items.find((item) => item.pit === view.pit)?.steps ?? [];
}

/** The pit being replayed, or null. */
export function replayItem(state: ExplainerState): MoveDescription | null {
  if (state.status !== 'open' || state.view.kind !== 'replay') return null;
  const { pit } = state.view;
  return state.items.find((item) => item.pit === pit) ?? null;
}

/** The move to animate right now: the current step of a replay that hasn't landed. */
export function replayMove(state: ExplainerState): PlayedMove | null {
  if (state.status !== 'open' || state.view.kind !== 'replay' || state.view.landed) return null;
  return replaySteps(state)[state.view.step]?.move ?? null;
}

/** The board to draw while the explainer is open (null when it isn't). */
export function explainerBoard(state: ExplainerState): BoardSnapshot | null {
  if (state.status !== 'open') return null;
  const { view } = state;
  if (view.kind === 'list') return state.position;
  const step = replaySteps(state)[view.step];
  return view.landed ? step.move.result.board : step.move.before;
}

/** The replay bar's words and whether Next move is offered. */
export function replayStatus(state: ExplainerState): { caption: string; result: string | null; canNext: boolean } | null {
  const item = replayItem(state);
  if (item === null || state.status !== 'open' || state.view.kind !== 'replay') return null;
  const { step, landed } = state.view;
  const last = step === item.steps.length - 1;
  return {
    caption: item.steps[step].caption,
    // After the last move has landed, say again how it ends.
    result: last && landed ? `After best play ${item.result}.` : null,
    canNext: landed && !last,
  };
}
