// How the page gets puzzles (add-puzzles design.md decision 6). Each puzzle
// needs a deep search, so in the browser it's made on a background thread.

import { newPuzzle, type PuzzleSnapshot } from '../engine';

/** Something that can make the puzzle for a seed. The puzzle arrives later (a Promise). */
export interface PuzzleClient {
  make(seed: number): Promise<PuzzleSnapshot>;
}

/** Makes it right here, on the page's own thread. For tests. */
export function createDirectPuzzleClient(): PuzzleClient {
  return { make: async (seed) => newPuzzle(seed) };
}

export type PuzzleWorkerRequest = { id: number; seed: number };
export type PuzzleWorkerReply = { id: number; puzzle: PuzzleSnapshot } | { id: number; error: string };

/**
 * Makes it in its own Web Worker, separate from the AI's, so a puzzle being
 * prepared never delays the computer's move in a game.
 */
export function createWorkerPuzzleClient(): PuzzleClient {
  const worker = new Worker(new URL('./puzzle.worker.ts', import.meta.url), { type: 'module' });
  const waiting = new Map<number, { resolve: (p: PuzzleSnapshot) => void; reject: (e: Error) => void }>();
  let nextId = 0;

  worker.onmessage = (event: MessageEvent<PuzzleWorkerReply>) => {
    const reply = event.data;
    const promise = waiting.get(reply.id);
    waiting.delete(reply.id);
    if ('error' in reply) promise?.reject(new Error(reply.error));
    else promise?.resolve(reply.puzzle);
  };

  return {
    make: (seed) =>
      new Promise((resolve, reject) => {
        const id = nextId++;
        waiting.set(id, { resolve, reject });
        worker.postMessage({ id, seed } satisfies PuzzleWorkerRequest);
      }),
  };
}
