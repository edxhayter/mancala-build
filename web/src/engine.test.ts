import { describe, expect, it } from 'vitest';
import { legalMoves, newBoard, play, type BoardSnapshot } from './engine';

describe('engine', () => {
  it('a new board is four seeds everywhere, South to move', () => {
    expect(newBoard()).toEqual({
      pits: { south: [4, 4, 4, 4, 4, 4], north: [4, 4, 4, 4, 4, 4] },
      stores: { south: 0, north: 0 },
      toMove: 'south',
      status: { kind: 'playing' },
    });
    expect(legalMoves(newBoard())).toEqual([0, 1, 2, 3, 4, 5]);
  });

  // kalah-rules Scenario: Simple sow from the start
  it('playing pit 0 from the start', () => {
    const result = play(newBoard(), 0);
    expect(result.board.pits.south).toEqual([0, 5, 5, 5, 5, 4]);
    expect(result.board.pits.north).toEqual([4, 4, 4, 4, 4, 4]);
    expect(result.board.toMove).toBe('north');
    expect(result.extraTurn).toBe(false);
    expect(result.captured).toBe(0);
    expect(result.path).toEqual([
      { player: 'south', place: 1 },
      { player: 'south', place: 2 },
      { player: 'south', place: 3 },
      { player: 'south', place: 4 },
    ]);
  });

  it('a move into the store is an extra turn, and the path names the store', () => {
    const result = play(newBoard(), 2);
    expect(result.extraTurn).toBe(true);
    expect(result.board.toMove).toBe('south');
    expect(result.path.at(-1)).toEqual({ player: 'south', place: 'store' });
  });

  it('playing does not change the board it was given', () => {
    const before = newBoard();
    play(before, 0);
    expect(before).toEqual(newBoard());
  });

  it('works from any snapshot, including North to move', () => {
    const board: BoardSnapshot = {
      pits: { south: [1, 0, 0, 0, 0, 0], north: [0, 0, 0, 0, 0, 3] },
      stores: { south: 20, north: 24 },
      toMove: 'north',
      status: { kind: 'playing' },
    };
    expect(legalMoves(board)).toEqual([5]);
    const result = play(board, 5);
    expect(result.path).toEqual([
      { player: 'north', place: 'store' },
      { player: 'south', place: 0 },
      { player: 'south', place: 1 },
    ]);
  });

  it('reports the end of the game', () => {
    // North's last seed goes into its store: North's side is empty, the
    // sweep gives South its 4 seeds, and it ends South 24, North 24.
    const board: BoardSnapshot = {
      pits: { south: [4, 0, 0, 0, 0, 0], north: [0, 0, 0, 0, 0, 1] },
      stores: { south: 20, north: 23 },
      toMove: 'north',
      status: { kind: 'playing' },
    };
    const result = play(board, 5);
    expect(result.board.status).toEqual({ kind: 'draw' });
    expect(result.board.stores).toEqual({ south: 24, north: 24 });

    const won = play({ ...board, stores: { south: 19, north: 24 } }, 5);
    expect(won.board.status).toEqual({ kind: 'won', winner: 'north' });
  });

  it('an illegal move throws', () => {
    const afterPit0 = play(newBoard(), 0).board; // North to move
    const southToMoveWithEmptyPit: BoardSnapshot = { ...afterPit0, toMove: 'south' };
    expect(() => play(southToMoveWithEmptyPit, 0)).toThrow(/EmptyPit/);
    expect(() => play(newBoard(), 6)).toThrow();
  });
});
