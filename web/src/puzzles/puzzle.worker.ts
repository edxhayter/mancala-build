// The puzzles' background thread. It has its own copy of the WASM engine.

import { initEngine, newPuzzle } from '../engine';
import type { PuzzleWorkerReply, PuzzleWorkerRequest } from './client';

const ready = initEngine(); // start loading the WASM straight away

self.onmessage = async (event: MessageEvent<PuzzleWorkerRequest>) => {
  const { id, seed } = event.data;
  let reply: PuzzleWorkerReply;
  try {
    await ready;
    reply = { id, puzzle: newPuzzle(seed) };
  } catch (error) {
    reply = { id, error: String(error) };
  }
  self.postMessage(reply);
};
