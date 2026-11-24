// Keeps one puzzle prepared ahead (add-puzzles design.md decision 6), so
// Next puzzle is usually instant (spec: The next puzzle is ready).

import { useMemo } from 'react';
import type { PuzzleSnapshot } from '../engine';
import { freshSeed } from '../game/reducer';
import type { PuzzleClient } from './client';

export interface PuzzleSupply {
  /** The next puzzle. Also starts preparing the one after it. */
  take(): Promise<PuzzleSnapshot>;
}

/**
 * Nothing is prepared until the first `take()`, so someone who only plays
 * games never pays for a puzzle search.
 */
export function createPuzzleSupply(client: PuzzleClient, seed: () => number = freshSeed): PuzzleSupply {
  let ahead: Promise<PuzzleSnapshot> | null = null;
  return {
    take() {
      const current = ahead ?? client.make(seed());
      ahead = client.make(seed()); // a worker answers in order, so this is made after `current`
      return current;
    },
  };
}

/** One supply for as long as the page uses the same client. */
export function usePuzzleSupply(client: PuzzleClient): PuzzleSupply {
  return useMemo(() => createPuzzleSupply(client), [client]);
}
