// How the page gets puzzles and explanations (add-puzzles design.md decision 6,
// add-move-explainer decision 6). Both need deep searches, so in the browser
// they're worked out on a background thread of their own.

import { explainMoves, newPuzzle, type BoardSnapshot, type MoveExplanation, type PuzzleSnapshot } from '../engine';

/** Something that can make puzzles and explain positions. Answers arrive later (Promises). */
export interface AnalysisClient {
  /** The puzzle for `seed`, with its explanation. */
  make(seed: number): Promise<PuzzleSnapshot>;
  /** Every legal move in `board`, best first, with its line of best play. */
  explain(board: BoardSnapshot): Promise<MoveExplanation[]>;
}

/** Works it out right here, on the page's own thread. For tests. */
export function createDirectAnalysisClient(): AnalysisClient {
  return {
    make: async (seed) => newPuzzle(seed),
    explain: async (board) => explainMoves(board),
  };
}

export type AnalysisRequest = { id: number; kind: 'puzzle'; seed: number } | { id: number; kind: 'explain'; board: BoardSnapshot };
export type AnalysisReply =
  | { id: number; puzzle: PuzzleSnapshot }
  | { id: number; explanation: MoveExplanation[] }
  | { id: number; error: string };

/**
 * Works it out in its own Web Worker, separate from the AI's, so preparing a
 * puzzle or an analysis never delays the computer's move in a game.
 */
export function createWorkerAnalysisClient(): AnalysisClient {
  const worker = new Worker(new URL('./analysis.worker.ts', import.meta.url), { type: 'module' });
  const waiting = new Map<number, { resolve: (reply: AnalysisReply) => void; reject: (e: Error) => void }>();
  let nextId = 0;

  worker.onmessage = (event: MessageEvent<AnalysisReply>) => {
    const reply = event.data;
    const promise = waiting.get(reply.id);
    waiting.delete(reply.id);
    if ('error' in reply) promise?.reject(new Error(reply.error));
    else promise?.resolve(reply);
  };

  /** Sends a request and waits for its reply. (`Omit` on each kind of request
   *  separately: on the whole union it would keep only the fields they share.) */
  type WithoutId<T> = T extends unknown ? Omit<T, 'id'> : never;
  const ask = (request: WithoutId<AnalysisRequest>) =>
    new Promise<AnalysisReply>((resolve, reject) => {
      const id = nextId++;
      waiting.set(id, { resolve, reject });
      worker.postMessage({ ...request, id } as AnalysisRequest);
    });

  return {
    make: async (seed) => {
      const reply = await ask({ kind: 'puzzle', seed });
      if (!('puzzle' in reply)) throw new Error('expected a puzzle');
      return reply.puzzle;
    },
    explain: async (board) => {
      const reply = await ask({ kind: 'explain', board });
      if (!('explanation' in reply)) throw new Error('expected an explanation');
      return reply.explanation;
    },
  };
}
