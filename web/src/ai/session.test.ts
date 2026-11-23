import { describe, expect, it } from 'vitest';
import { legalMoves, newBoard, play, type Level } from '../engine';
import { createAiSession } from './session';

/** The AI plays both sides of a whole game; returns every move it made. */
function aiGame(seed: number, level: Level): number[] {
  const choose = createAiSession();
  const moves: number[] = [];
  let board = newBoard();
  while (board.status.kind === 'playing') {
    const pit = choose({ gameId: 1, seed, board, level });
    expect(legalMoves(board)).toContain(pit);
    moves.push(pit);
    board = play(board, pit).board;
  }
  return moves;
}

describe('AI session', () => {
  it('the same seed gives the same moves', () => {
    expect(aiGame(7, 'easy')).toEqual(aiGame(7, 'easy'));
  });

  it('different seeds can break ties differently', () => {
    const games = new Set([1, 2, 3, 4, 5, 6].map((seed) => aiGame(seed, 'easy').join(',')));
    expect(games.size).toBeGreaterThan(1);
  });

  it('a new game id starts a fresh AI from the new seed', () => {
    const choose = createAiSession();
    const board = newBoard();
    const first = [1, 2, 3].map(() => choose({ gameId: 1, seed: 9, board, level: 'easy' }));
    const again = [1, 2, 3].map(() => choose({ gameId: 2, seed: 9, board, level: 'easy' }));
    expect(again).toEqual(first);
  });
});
