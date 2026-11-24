// Analysis clients for tests.

import type { AnalysisClient } from '../analysis/client';
import { explainMoves, type BoardSnapshot, type MoveExplanation, type PuzzleSnapshot } from '../engine';

/** Puzzles and explanations that only arrive when the test says so. */
export function manualAnalysis() {
  const requests: { seed: number; answer: (puzzle: PuzzleSnapshot) => void }[] = [];
  const explains: { board: BoardSnapshot; answer: (explanation: MoveExplanation[]) => void }[] = [];
  const client: AnalysisClient = {
    make: (seed) => new Promise((resolve) => requests.push({ seed, answer: resolve })),
    explain: (board) => new Promise((resolve) => explains.push({ board, answer: resolve })),
  };
  return { client, requests, explains };
}

/** A made-up puzzle: any position, any "answer", with the real explanation of the position. */
export function fakePuzzle(seed: number, board: BoardSnapshot, answer: number): PuzzleSnapshot {
  return { seed, board, answer, explanation: explainMoves(board) };
}
