// Puzzle clients for tests.

import type { PuzzleSnapshot } from '../engine';
import type { PuzzleClient } from '../puzzles/client';

/** Puzzles that only arrive when the test says so. */
export function manualPuzzles() {
  const requests: { seed: number; answer: (puzzle: PuzzleSnapshot) => void }[] = [];
  const client: PuzzleClient = {
    make: (seed) => new Promise((resolve) => requests.push({ seed, answer: resolve })),
  };
  return { client, requests };
}

/** Puzzles that never arrive (for tests that don't involve them). */
export const silentPuzzles: PuzzleClient = { make: () => new Promise(() => {}) };
