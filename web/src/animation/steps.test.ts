import { describe, expect, it } from 'vitest';
import { legalMoves, newBoard, play, type BoardSnapshot, type Slot } from '../engine';
import { arrivals, buildSteps, slotCount } from './steps';

const total = (board: BoardSnapshot) =>
  [...board.pits.south, ...board.pits.north].reduce((a, b) => a + b, 0) + board.stores.south + board.stores.north;

const stepsFor = (board: BoardSnapshot, pit: number) => buildSteps(board, play(board, pit), pit);

describe('buildSteps', () => {
  // Scenario: Seeds travel pit to pit
  it('South pit 1 from the start: the pit empties, then pits 2-5 gain a seed each, in order', () => {
    const steps = stepsFor(newBoard(), 0);
    expect(steps.map((step) => step.kind)).toEqual(['lift', 'sow', 'sow', 'sow', 'sow']);

    expect(steps[0].board.pits.south).toEqual([0, 4, 4, 4, 4, 4]);
    expect(steps[0].from).toEqual([{ player: 'south', place: 0 }]);

    expect(steps[1].board.pits.south).toEqual([0, 5, 4, 4, 4, 4]);
    expect(steps[1].to).toEqual([{ player: 'south', place: 1 }]);
    expect(steps[2].board.pits.south).toEqual([0, 5, 5, 4, 4, 4]);
    expect(steps[3].board.pits.south).toEqual([0, 5, 5, 5, 4, 4]);
    expect(steps[4].board.pits.south).toEqual([0, 5, 5, 5, 5, 4]);

    // Each seed travels on from where the last one landed.
    expect(steps[2].from).toEqual(steps[1].to);
    // The last step is exactly the engine's result, North to move.
    expect(steps.at(-1)!.board).toEqual(play(newBoard(), 0).board);
  });

  // Scenario: The opponent's store is skipped (the kalah-rules position)
  it("no seed ever enters the opponent's store", () => {
    const board: BoardSnapshot = {
      pits: { south: [0, 0, 1, 0, 0, 10], north: [0, 0, 0, 0, 0, 0] },
      stores: { south: 0, north: 0 },
      toMove: 'south',
      status: { kind: 'playing' },
    };
    const steps = stepsFor(board, 5);
    const northStore: Slot = { player: 'north', place: 'store' };
    for (const step of steps) {
      expect(step.to).not.toContainEqual(northStore);
      expect(step.board.stores.north).toBe(0);
    }
    // 10 seeds: South's store, North's six pits, then round to South's pits 1-3.
    expect(steps.filter((step) => step.kind === 'sow').map((step) => step.to[0])).toEqual([
      { player: 'south', place: 'store' },
      ...[0, 1, 2, 3, 4, 5].map((place) => ({ player: 'north', place })),
      { player: 'south', place: 0 },
      { player: 'south', place: 1 },
      { player: 'south', place: 2 },
    ]);
  });

  // Scenario: A capture is shown (kalah-rules "South captures")
  it('after the sowing, the capturing seed and the opposite pit move into the store', () => {
    const board: BoardSnapshot = {
      pits: { south: [1, 0, 0, 2, 0, 0], north: [1, 1, 1, 1, 5, 1] },
      stores: { south: 0, north: 0 },
      toMove: 'south',
      status: { kind: 'playing' },
    };
    const steps = stepsFor(board, 0);
    expect(steps.map((step) => step.kind)).toEqual(['lift', 'sow', 'gather']);
    const gather = steps[2];
    expect(gather.from).toEqual(
      expect.arrayContaining([
        { player: 'south', place: 1 }, // the capturing seed
        { player: 'north', place: 4 }, // the 5 seeds opposite
      ]),
    );
    expect(gather.from).toHaveLength(2);
    expect(gather.to).toEqual([{ player: 'south', place: 'store' }]);
    expect(gather.board.stores.south).toBe(6);
  });

  it('the sweep at the end of a game gathers the remaining seeds', () => {
    // South's last seed goes into its store; North's 4 seeds are swept to North's store.
    const board: BoardSnapshot = {
      pits: { south: [0, 0, 0, 0, 0, 1], north: [0, 0, 0, 0, 0, 4] },
      stores: { south: 25, north: 18 },
      toMove: 'south',
      status: { kind: 'playing' },
    };
    const steps = stepsFor(board, 5);
    expect(steps.map((step) => step.kind)).toEqual(['lift', 'sow', 'gather']);
    expect(steps[2].from).toEqual([{ player: 'north', place: 5 }]);
    expect(steps[2].to).toEqual([{ player: 'north', place: 'store' }]);
    expect(steps[2].board.status).toEqual({ kind: 'won', winner: 'south' });
  });

  it('over many random moves: one seed per sow step, and the last step is always the engine result', () => {
    let seed = 2026;
    const random = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed % n;
    };
    let checked = 0;
    for (let game = 0; game < 60; game++) {
      let board = newBoard();
      while (board.status.kind === 'playing') {
        const moves = legalMoves(board);
        const pit = moves[random(moves.length)];
        const result = play(board, pit);
        const steps = buildSteps(board, result, pit);

        expect(steps.at(-1)!.board).toEqual(result.board);
        const inHand = board.pits[board.toMove][pit];
        expect(total(steps[0].board)).toBe(48 - inHand);
        for (let k = 1; k <= result.path.length; k++) {
          const [slot] = steps[k].to;
          expect(slotCount(steps[k].board, slot)).toBe(slotCount(steps[k - 1].board, slot) + 1);
          expect(total(steps[k].board)).toBe(48 - inHand + k);
        }
        board = result.board;
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });
});

describe('arrivals', () => {
  it('a sow step: one seed from where the last one landed', () => {
    const before = newBoard();
    const steps = stepsFor(before, 0);
    expect(arrivals(steps[2], steps[1].board)).toEqual([
      { to: { player: 'south', place: 2 }, from: [{ player: 'south', place: 1 }] },
    ]);
    expect(arrivals(steps[0], before)).toEqual([]);
  });

  it('a capture: every captured seed flies to the store', () => {
    const board: BoardSnapshot = {
      pits: { south: [1, 0, 0, 2, 0, 0], north: [1, 1, 1, 1, 5, 1] },
      stores: { south: 0, north: 0 },
      toMove: 'south',
      status: { kind: 'playing' },
    };
    const steps = stepsFor(board, 0);
    const [arrival] = arrivals(steps[2], steps[1].board);
    expect(arrival.to).toEqual({ player: 'south', place: 'store' });
    expect(arrival.from).toHaveLength(6);
  });

  it('over many random moves, each arrival brings exactly the seeds its slot gained', () => {
    let board = newBoard();
    let n = 0;
    while (board.status.kind === 'playing') {
      const moves = legalMoves(board);
      const pit = moves[n++ % moves.length];
      const steps = stepsFor(board, pit);
      steps.forEach((step, k) => {
        const previous = k === 0 ? board : steps[k - 1].board;
        for (const arrival of arrivals(step, previous)) {
          expect(arrival.from).toHaveLength(slotCount(step.board, arrival.to) - slotCount(previous, arrival.to));
        }
      });
      board = play(board, pit).board;
    }
  });
});
