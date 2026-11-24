import { describe, expect, it } from 'vitest';
import { newBoard, play } from '../engine';
import { createDirectAnalysisClient } from './client';

describe('analysis client', () => {
  it('a made puzzle carries its explanation, with the answer first and clearly best', async () => {
    const puzzle = await createDirectAnalysisClient().make(11);
    const [first, second] = puzzle.explanation;
    expect(first.pit).toBe(puzzle.answer);
    expect(first.score - second.score).toBeGreaterThanOrEqual(2);
  });

  it('explains a position from a game', async () => {
    const board = play(newBoard(), 0).board; // North to move
    const explanation = await createDirectAnalysisClient().explain(board);
    expect(explanation.map((e) => e.pit).sort()).toEqual([0, 1, 2, 3, 4, 5]);
    for (const e of explanation) expect(e.line[0]).toBe(e.pit);
  });
});
