// A move as a list of boards to show one after another (design.md decision 6).
// Pure: no timers, no React. Playing them at a chosen speed is the hook's job.

import type { BoardSnapshot, MoveResult, Player, Slot } from '../engine';

export interface Step {
  /**
   * - lift: the chosen pit empties (its seeds are "in hand")
   * - sow: one seed lands
   * - gather: a capture or the end-of-game sweep moves seeds into the stores
   */
  kind: 'lift' | 'sow' | 'gather';
  /** The board to show at this step. */
  board: BoardSnapshot;
  /** Where the seeds come from (the pit lifted, or the cup the last seed landed in). */
  from: Slot[];
  /** Where they arrive (empty for a lift). */
  to: Slot[];
}

const PLAYERS: Player[] = ['south', 'north'];
const ALL_SLOTS: Slot[] = PLAYERS.flatMap((player) => [
  ...[0, 1, 2, 3, 4, 5].map((place) => ({ player, place })),
  { player, place: 'store' as const },
]);

/** How many seeds are in one pit or store. */
export function slotCount(board: BoardSnapshot, slot: Slot): number {
  return slot.place === 'store' ? board.stores[slot.player] : board.pits[slot.player][slot.place];
}

/** A copy of `board` with one slot set to `count`. The original is not changed. */
function withCount(board: BoardSnapshot, slot: Slot, count: number): BoardSnapshot {
  if (slot.place === 'store') {
    return { ...board, stores: { ...board.stores, [slot.player]: count } };
  }
  const pits = [...board.pits[slot.player]];
  pits[slot.place] = count;
  return { ...board, pits: { ...board.pits, [slot.player]: pits } };
}

/**
 * Every step of playing `pit` from `before`, ending exactly at `result.board`.
 * The sowing comes from `result.path`. Anything else that changed (a capture,
 * the final sweep) becomes one last "gather" step.
 */
export function buildSteps(before: BoardSnapshot, result: MoveResult, pit: number): Step[] {
  const source: Slot = { player: before.toMove, place: pit };

  let board = withCount(before, source, 0);
  const steps: Step[] = [{ kind: 'lift', board, from: [source], to: [] }];

  let previous = source;
  for (const slot of result.path) {
    board = withCount(board, slot, slotCount(board, slot) + 1);
    steps.push({ kind: 'sow', board, from: [previous], to: [slot] });
    previous = slot;
  }

  // Compare the board after sowing with the engine's final board.
  const from = ALL_SLOTS.filter((slot) => slotCount(result.board, slot) < slotCount(board, slot));
  const to = ALL_SLOTS.filter((slot) => slotCount(result.board, slot) > slotCount(board, slot));
  if (from.length > 0 || to.length > 0) {
    steps.push({ kind: 'gather', board: result.board, from, to });
  } else {
    // Nothing more happened: the last sowing step *is* the result (with the
    // turn passed on), so use the engine's board for it.
    steps[steps.length - 1] = { ...steps[steps.length - 1], board: result.board };
  }
  return steps;
}

/** Seeds arriving in one cup during a step, and the cup each one comes from. */
export interface Arrival {
  to: Slot;
  /** One entry per arriving seed, in the order they join the cup's spiral. */
  from: Slot[];
}

/**
 * Which seeds arrive where during `step` (`previous` is the board before it).
 * A sow step brings one seed. A gather brings every captured or swept seed;
 * each store takes seeds from its own side first.
 */
export function arrivals(step: Step, previous: BoardSnapshot): Arrival[] {
  if (step.kind === 'lift') return [];
  if (step.kind === 'sow') return [{ to: step.to[0], from: [step.from[0]] }];

  // A pool of every seed that left a cup: one entry per seed.
  const pool = step.from.flatMap((slot) =>
    Array<Slot>(slotCount(previous, slot) - slotCount(step.board, slot)).fill(slot),
  );
  return step.to.map((store) => {
    const gained = slotCount(step.board, store) - slotCount(previous, store);
    const own = pool.filter((slot) => slot.player === store.player);
    const other = pool.filter((slot) => slot.player !== store.player);
    const from = [...own, ...other].slice(0, gained);
    for (const slot of from) pool.splice(pool.indexOf(slot), 1); // each seed is used once
    return { to: store, from };
  });
}
