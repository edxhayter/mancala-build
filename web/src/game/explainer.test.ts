import { describe, expect, it } from 'vitest';
import { explainMoves, type BoardSnapshot } from '../engine';
import { describeMoves } from './explain';
import {
  closedExplainer,
  explainerBoard,
  explainerReducer,
  replayMove,
  replayStatus,
  type ExplainerEvent,
  type ExplainerState,
} from './explainer';

// The `Plays the winning move` position: pit 5 (index 4) wins at once, pit 1
// (index 0) loses after a longer line.
const BOARD: BoardSnapshot = {
  pits: { south: [1, 0, 0, 0, 1, 0], north: [5, 0, 0, 0, 0, 0] },
  stores: { south: 18, north: 23 },
  toMove: 'south',
  status: { kind: 'playing' },
};
const ITEMS = describeMoves(BOARD, explainMoves(BOARD), { south: 'You', north: 'Opponent' });
const LONG = ITEMS.find((item) => item.pit === 0)!;

const run = (events: ExplainerEvent[], from: ExplainerState = closedExplainer) => events.reduce(explainerReducer, from);
const opened = run([{ type: 'opened', source: { kind: 'puzzle' }, position: BOARD, items: ITEMS }]);

describe('explainer reducer', () => {
  it('opens on the list, showing the explained position', () => {
    expect(opened).toMatchObject({ status: 'open', view: { kind: 'list' } });
    expect(explainerBoard(opened)).toBe(BOARD);
    expect(replayMove(opened)).toBeNull();
  });

  // Scenario: Stepping through a line
  it('steps through a line one move at a time, with no Next move after the last', () => {
    expect(LONG.steps.length).toBeGreaterThanOrEqual(3);
    let state = run([{ type: 'showWhy', pit: 0 }], opened);
    expect(replayMove(state)).toBe(LONG.steps[0].move);
    expect(replayStatus(state)).toEqual({ caption: 'You play pit 1.', result: null, canNext: false });
    expect(run([{ type: 'nextMove' }], state)).toBe(state); // not until the seeds have landed

    state = run([{ type: 'stepLanded' }], state);
    expect(replayMove(state)).toBeNull();
    expect(explainerBoard(state)).toEqual(LONG.steps[0].move.result.board);
    expect(replayStatus(state)?.canNext).toBe(true);

    state = run([{ type: 'nextMove' }], state);
    expect(replayMove(state)).toBe(LONG.steps[1].move);
    expect(replayStatus(state)?.caption).toMatch(/^Opponent plays pit \d/);

    for (let i = 1; i < LONG.steps.length; i++) {
      state = run([{ type: 'stepLanded' }, { type: 'nextMove' }], state);
    }
    expect(replayStatus(state)).toMatchObject({ canNext: false, result: expect.stringMatching(/^After best play you lose the game by \d+ seeds?\.$/) });
    expect(run([{ type: 'nextMove' }], state)).toBe(state);
  });

  // Scenario: Back from a replay
  it('Back returns to the list and the explained position', () => {
    const state = run([{ type: 'showWhy', pit: 0 }, { type: 'stepLanded' }, { type: 'nextMove' }, { type: 'back' }], opened);
    expect(state).toMatchObject({ status: 'open', view: { kind: 'list' } });
    expect(explainerBoard(state)).toBe(BOARD);
  });

  it('closing from anywhere closes', () => {
    expect(run([{ type: 'showWhy', pit: 4 }, { type: 'closed' }], opened)).toEqual(closedExplainer);
  });

  it('an analysis opens on the list when it answers the question asked', () => {
    const state = run([
      { type: 'analysisAsked', gameId: 3, board: BOARD },
      { type: 'analysisArrived', gameId: 3, board: BOARD, items: ITEMS },
    ]);
    expect(state).toMatchObject({ status: 'open', source: { kind: 'game', gameId: 3 }, view: { kind: 'list' } });
  });

  // Scenario: A late analysis is ignored
  it('a late analysis is ignored: another game, another position, or already closed', () => {
    const asked = run([{ type: 'analysisAsked', gameId: 3, board: BOARD }]);
    expect(run([{ type: 'analysisArrived', gameId: 4, board: BOARD, items: ITEMS }], asked)).toBe(asked);
    expect(run([{ type: 'analysisArrived', gameId: 3, board: { ...BOARD }, items: ITEMS }], asked)).toBe(asked);
    const closed = run([{ type: 'closed' }], asked);
    expect(run([{ type: 'analysisArrived', gameId: 3, board: BOARD, items: ITEMS }], closed)).toBe(closed);
  });
});
