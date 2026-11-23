// The AI's background thread. It has its own copy of the WASM engine.

import { initEngine } from '../engine';
import type { WorkerReply, WorkerRequest } from './client';
import { createAiSession } from './session';

const ready = initEngine(); // start loading the WASM straight away
const choose = createAiSession();

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { id, ...request } = event.data;
  let reply: WorkerReply;
  try {
    await ready;
    reply = { id, pit: choose(request) };
  } catch (error) {
    reply = { id, error: String(error) };
  }
  self.postMessage(reply);
};
