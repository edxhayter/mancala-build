// How the page asks the computer for a move (design.md decision 5).

import { createAiSession, type AiRequest } from './session';

export type { AiRequest };

/** Something that can choose the AI's move. The answer arrives later (a Promise). */
export interface AiClient {
  choose(request: AiRequest): Promise<number>;
}

/** Works it out right here, on the page's own thread. For tests. */
export function createDirectAiClient(): AiClient {
  const choose = createAiSession();
  return { choose: async (request) => choose(request) };
}

/** What goes to the worker and what comes back. `id` matches answers to questions. */
export type WorkerRequest = AiRequest & { id: number };
export type WorkerReply = { id: number; pit: number } | { id: number; error: string };

/**
 * Works it out in a Web Worker: a background thread, so even the hard level
 * (12 moves deep) never freezes the page.
 */
export function createWorkerAiClient(): AiClient {
  // Vite spots this pattern and bundles ai.worker.ts as a separate file.
  const worker = new Worker(new URL('./ai.worker.ts', import.meta.url), { type: 'module' });
  const waiting = new Map<number, { resolve: (pit: number) => void; reject: (error: Error) => void }>();
  let nextId = 0;

  worker.onmessage = (event: MessageEvent<WorkerReply>) => {
    const reply = event.data;
    const promise = waiting.get(reply.id);
    waiting.delete(reply.id);
    if ('error' in reply) promise?.reject(new Error(reply.error));
    else promise?.resolve(reply.pit);
  };

  return {
    choose: (request) =>
      new Promise((resolve, reject) => {
        const id = nextId++;
        waiting.set(id, { resolve, reject });
        worker.postMessage({ ...request, id } satisfies WorkerRequest);
      }),
  };
}
