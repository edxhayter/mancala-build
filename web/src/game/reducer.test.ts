import { describe, expect, it } from 'vitest';
import { newBoard, type BoardSnapshot } from '../engine';
import { freshSeed, gameReducer, initialState, shownViewer, type GameState } from './reducer';
import type { Settings } from './settings';

const hotseat: Settings = { opponent: 'local', level: 'medium', playerFirst: true };
const vsAi: Settings = { opponent: 'ai', level: 'medium', playerFirst: true };

/** A fresh game with the given settings (game 2, after the initial one). */
const start = (settings: Settings, seed = 7) =>
  gameReducer(initialState(1), { type: 'newGame', settings, seed });

/** A state at an arbitrary position, for setting up scenarios. */
const at = (settings: Settings, board: BoardSnapshot): GameState => ({ ...start(settings), board });

describe('starting a game', () => {
  // Scenario: Ready on first visit
  it('the first game: you as South, first, against the AI at medium', () => {
    const state = initialState(42);
    expect(state.settings).toEqual({ opponent: 'ai', level: 'medium', playerFirst: true });
    expect(state.board).toEqual(newBoard());
    expect(state.phase).toBe('human');
    expect(state.caption).toBeNull();
    expect(state.seed).toBe(42);
  });

  it('every new game gets a new id and the seed it was given', () => {
    const first = initialState(1);
    const second = gameReducer(first, { type: 'newGame', settings: hotseat, seed: 99 });
    expect(second.gameId).toBe(first.gameId + 1);
    expect(second.seed).toBe(99);
    expect(second.settings).toEqual(hotseat);
  });

  // Scenario: Computer moves first when the player moves second
  it('moving second against the computer starts with the computer thinking', () => {
    expect(start({ ...vsAi, playerFirst: false }).phase).toBe('thinking');
  });

  it('fresh seeds are whole numbers that fit in a u32', () => {
    for (let i = 0; i < 20; i++) {
      const seed = freshSeed();
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThan(2 ** 32);
    }
  });
});

describe('hotseat', () => {
  // Scenario: Hotseat turns to the player to move
  it('the turn passes, and the view turns only once the animation is done', () => {
    const moved = gameReducer(start(hotseat), { type: 'movePlayed', pit: 0 });
    expect(moved.phase).toBe('animating');
    expect(moved.board.pits.south).toEqual([0, 5, 5, 5, 5, 4]);
    expect(moved.lastMove?.before).toEqual(newBoard());
    expect(shownViewer(moved)).toBe('south'); // still South's view while sowing

    const done = gameReducer(moved, { type: 'animationDone' });
    expect(done.phase).toBe('human');
    expect(done.board.toMove).toBe('north');
    expect(shownViewer(done)).toBe('north');
    expect(done.caption).toBeNull();
  });

  // Scenario: Extra turn is reported
  it('an extra turn: the caption appears when the seeds have landed', () => {
    const moved = gameReducer(start(hotseat), { type: 'movePlayed', pit: 2 });
    expect(moved.caption).toBeNull();
    const done = gameReducer(moved, { type: 'animationDone' });
    expect(done.caption).toBe('South gets another turn.');
    expect(done.board.toMove).toBe('south');
    expect(done.phase).toBe('human');

    // The next move clears it.
    const next = gameReducer(done, { type: 'movePlayed', pit: 0 });
    expect(next.caption).toBeNull();
  });

  // Scenario: A capture is reported (the kalah-rules "South captures" position)
  it('a capture caption', () => {
    const board: BoardSnapshot = {
      pits: { south: [1, 0, 0, 2, 0, 0], north: [1, 1, 1, 1, 5, 1] },
      stores: { south: 0, north: 0 },
      toMove: 'south',
      status: { kind: 'playing' },
    };
    const moved = gameReducer(at(hotseat, board), { type: 'movePlayed', pit: 0 });
    const done = gameReducer(moved, { type: 'animationDone' });
    expect(done.board.stores.south).toBe(6);
    expect(done.caption).toBe('South captured 6 seeds.');
  });

  it('empty pits and out-of-turn events change nothing', () => {
    const afterMove = gameReducer(
      gameReducer(start(hotseat), { type: 'movePlayed', pit: 0 }),
      { type: 'animationDone' },
    );
    const southToMove: GameState = { ...afterMove, board: { ...afterMove.board, toMove: 'south' } };
    expect(gameReducer(southToMove, { type: 'movePlayed', pit: 0 })).toBe(southToMove); // empty
    const animating = gameReducer(start(hotseat), { type: 'movePlayed', pit: 0 });
    expect(gameReducer(animating, { type: 'movePlayed', pit: 1 })).toBe(animating);
    expect(gameReducer(start(hotseat), { type: 'animationDone' }).phase).toBe('human');
  });
});

describe('against the AI', () => {
  // Scenario: The AI replies
  it('your move, then the AI thinks, plays, and it is your move again', () => {
    let state = start(vsAi);
    state = gameReducer(state, { type: 'movePlayed', pit: 0 });
    state = gameReducer(state, { type: 'animationDone' });
    expect(state.phase).toBe('thinking');

    // While the AI thinks, clicks do nothing.
    expect(gameReducer(state, { type: 'movePlayed', pit: 1 })).toBe(state);

    state = gameReducer(state, { type: 'aiChose', pit: 0, gameId: state.gameId });
    expect(state.phase).toBe('animating');
    expect(state.lastMove?.before.toMove).toBe('north');
    state = gameReducer(state, { type: 'animationDone' });
    expect(state.phase).toBe('human');
    expect(state.board.toMove).toBe('south');
  });

  it('after an extra turn the AI thinks again', () => {
    // North to move with 1 seed in its pit 5: it lands in North's store.
    const board: BoardSnapshot = { ...newBoard(), pits: { south: [4, 4, 4, 4, 4, 4], north: [4, 4, 4, 4, 4, 1] }, toMove: 'north' };
    let state: GameState = { ...at(vsAi, board), phase: 'thinking' };
    state = gameReducer(state, { type: 'aiChose', pit: 5, gameId: state.gameId });
    state = gameReducer(state, { type: 'animationDone' });
    expect(state.phase).toBe('thinking');
    expect(state.caption).toBe('AI gets another turn.');
  });

  // Scenario: The page stays responsive
  it("an answer for an old game is ignored", () => {
    let state = start({ ...vsAi, playerFirst: false }); // AI thinking for this game
    const oldGame = state.gameId;
    state = gameReducer(state, { type: 'newGame', settings: { ...vsAi, playerFirst: false }, seed: 8 });
    const stale = gameReducer(state, { type: 'aiChose', pit: 3, gameId: oldGame });
    expect(stale).toBe(state);
    expect(stale.board).toEqual(newBoard());
  });
});

describe('the end of the game', () => {
  // Scenario: A finished game
  it('the last move ends it, and then nothing more can be played', () => {
    // South's last seed goes into its store; North's 4 are swept to North.
    const board: BoardSnapshot = {
      pits: { south: [0, 0, 0, 0, 0, 1], north: [0, 0, 0, 0, 0, 4] },
      stores: { south: 25, north: 18 },
      toMove: 'south',
      status: { kind: 'playing' },
    };
    let state = gameReducer(at(hotseat, board), { type: 'movePlayed', pit: 5 });
    state = gameReducer(state, { type: 'animationDone' });
    expect(state.phase).toBe('over');
    expect(state.board.stores).toEqual({ south: 26, north: 22 });
    expect(state.board.status).toEqual({ kind: 'won', winner: 'south' });
    expect(gameReducer(state, { type: 'movePlayed', pit: 0 })).toBe(state);

    // A new game can be started.
    expect(gameReducer(state, { type: 'newGame', settings: hotseat, seed: 3 }).phase).toBe('human');
  });
});
