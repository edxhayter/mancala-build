// The analysis background thread: puzzles and explanations. It has its own
// copy of the WASM engine.

import { explainMoves, initEngine, newPuzzle } from '../engine';
import type { AnalysisReply, AnalysisRequest } from './client';

const ready = initEngine(); // start loading the WASM straight away

self.onmessage = async (event: MessageEvent<AnalysisRequest>) => {
  const request = event.data;
  let reply: AnalysisReply;
  try {
    await ready;
    reply =
      request.kind === 'puzzle'
        ? { id: request.id, puzzle: newPuzzle(request.seed) }
        : { id: request.id, explanation: explainMoves(request.board) };
  } catch (error) {
    reply = { id: request.id, error: String(error) };
  }
  self.postMessage(reply);
};
