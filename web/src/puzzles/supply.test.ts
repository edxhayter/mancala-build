import { describe, expect, it } from 'vitest';
import { newBoard, type PuzzleSnapshot } from '../engine';
import { createDirectAnalysisClient } from '../analysis/client';
import { fakePuzzle, manualAnalysis } from '../test/analysis';
import { createPuzzleSupply } from './supply';

const puzzle = (seed: number): PuzzleSnapshot => fakePuzzle(seed, newBoard(), 2);

describe('puzzle supply', () => {
  it('prepares nothing until a puzzle is wanted', () => {
    const { client, requests } = manualAnalysis();
    createPuzzleSupply(client);
    expect(requests).toHaveLength(0);
  });

  // Scenario: The next puzzle is ready
  it('asks for the next puzzle as soon as one is taken', async () => {
    const { client, requests } = manualAnalysis();
    let seed = 100;
    const supply = createPuzzleSupply(client, () => seed++);

    const first = supply.take();
    expect(requests.map((r) => r.seed)).toEqual([100, 101]); // the one after is already on its way
    requests[0].answer(puzzle(100));
    requests[1].answer(puzzle(101));
    expect((await first).seed).toBe(100);

    // The second was prepared while the first was shown: it's ready at once.
    const second = supply.take();
    expect(requests.map((r) => r.seed)).toEqual([100, 101, 102]);
    expect((await second).seed).toBe(101);
  });

  it('the direct client makes real puzzles from the seed', async () => {
    const supply = createPuzzleSupply(createDirectAnalysisClient(), () => 7);
    const made = await supply.take();
    expect(made.seed).toBe(7);
    expect(made.board.status).toEqual({ kind: 'playing' });
  });
});
