// One AI per game (design.md decision 5), shared by the worker and the
// direct client so both behave exactly the same.

import { AiPlayer, type BoardSnapshot, type Level } from '../engine';

/** Everything the AI needs to choose a move. Plain data, so it can be posted to a worker. */
export interface AiRequest {
  gameId: number;
  seed: number;
  board: BoardSnapshot;
  level: Level;
}

/**
 * Returns a `choose` function that keeps one AiPlayer for the current game.
 * A request with a new gameId frees the old AI and starts one from the new
 * seed, so a game's tie-breaks follow one repeatable sequence.
 */
export function createAiSession(): (request: AiRequest) => number {
  let current: { gameId: number; ai: AiPlayer } | null = null;
  return ({ gameId, seed, board, level }) => {
    if (current === null || current.gameId !== gameId) {
      current?.ai.free();
      current = { gameId, ai: new AiPlayer(seed) };
    }
    return current.ai.choose(board, level);
  };
}
