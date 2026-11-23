// AI clients for tests.

import type { AiClient, AiRequest } from '../ai/client';

/** An AI that only answers when the test says so. */
export function manualAi() {
  const requests: { request: AiRequest; answer: (pit: number) => void }[] = [];
  const client: AiClient = {
    choose: (request) => new Promise((resolve) => requests.push({ request, answer: resolve })),
  };
  return { client, requests };
}

/** An AI that never answers (for tests that don't involve it). */
export const silentAi: AiClient = { choose: () => new Promise(() => {}) };
