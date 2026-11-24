import { describe, expect, it } from 'vitest';
import { newBoard, type PuzzleSnapshot } from '../engine';
import {
  initialPuzzleState,
  playablePits,
  puzzleBoard,
  puzzleReducer,
  puzzleStatus,
  type PuzzleEvent,
  type PuzzleState,
} from './puzzle';

// A made-up puzzle: the reducer only cares which pit is "the answer". From the
// start, pit 2 (shown as 3) ends in South's store, so its caption is an extra turn.
const PUZZLE: PuzzleSnapshot = { seed: 1, board: newBoard(), answer: 2 };

const run = (events: PuzzleEvent[], from: PuzzleState = initialPuzzleState) => events.reduce(puzzleReducer, from);

/** A puzzle that has been asked for and has arrived. */
const solving = (from: PuzzleState = initialPuzzleState) =>
  run([{ type: 'requested', requestId: from.requestId + 1 }, { type: 'arrived', requestId: from.requestId + 1, puzzle: PUZZLE }], from);

describe('puzzle reducer', () => {
  // Scenario: Preparing a puzzle
  it('nothing can be played while a puzzle is being prepared', () => {
    const state = run([{ type: 'requested', requestId: 1 }]);
    expect(state.phase).toBe('loading');
    expect(playablePits(state)).toEqual([]);
    expect(puzzleStatus(state).message).toBe('Preparing a puzzle…');
    expect(run([{ type: 'pitChosen', pit: 2 }], state)).toBe(state);
  });

  // Scenario: Choosing puzzles
  it('a puzzle arrives with 3 tries', () => {
    const state = solving();
    expect(state.phase).toBe('solving');
    expect(puzzleStatus(state)).toEqual({ message: 'Find the best move', detail: '3 tries' });
    expect(playablePits(state)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('a puzzle for an old request is ignored', () => {
    const state = run([{ type: 'requested', requestId: 1 }, { type: 'requested', requestId: 2 }]);
    expect(run([{ type: 'arrived', requestId: 1, puzzle: PUZZLE }], state)).toBe(state);
  });

  // Scenario: The right move
  it('the right move is sown, then the puzzle is solved', () => {
    const chosen = run([{ type: 'pitChosen', pit: 2 }], solving());
    expect(chosen.phase).toBe('animating');
    expect(chosen.outcome).toBe('solved');
    expect(chosen.lastMove?.pit).toBe(2);
    expect(playablePits(chosen)).toEqual([]);

    const landed = run([{ type: 'animationDone' }], chosen);
    expect(landed.phase).toBe('done');
    expect(puzzleStatus(landed)).toEqual({ message: 'Solved!', detail: 'You get another turn.' });
    expect(puzzleBoard(landed)?.stores.south).toBe(1);
    expect(landed.tally).toEqual({ solved: 1, played: 1 });
  });

  // Scenario: A wrong move
  it('a wrong move is marked, and nothing moves', () => {
    const state = run([{ type: 'pitChosen', pit: 4 }], solving());
    expect(state.phase).toBe('solving');
    expect(state.wrong).toEqual([4]);
    expect(state.lastMove).toBeNull();
    expect(puzzleBoard(state)).toEqual(PUZZLE.board);
    expect(playablePits(state)).toEqual([0, 1, 2, 3, 5]);
    expect(puzzleStatus(state)).toEqual({ message: 'Not that one. Try again.', detail: '2 tries left' });
  });

  it('a pit already marked wrong cannot be chosen again', () => {
    const state = run([{ type: 'pitChosen', pit: 4 }], solving());
    expect(run([{ type: 'pitChosen', pit: 4 }], state)).toBe(state);
  });

  // Scenario: Last try
  it('after two wrong pits there is 1 try left', () => {
    const state = run([{ type: 'pitChosen', pit: 4 }, { type: 'pitChosen', pit: 0 }], solving());
    expect(puzzleStatus(state).detail).toBe('1 try left');
  });

  // Scenario: Out of tries
  it('a third wrong pit reveals the answer, not solved', () => {
    const state = run(
      [{ type: 'pitChosen', pit: 4 }, { type: 'pitChosen', pit: 0 }, { type: 'pitChosen', pit: 5 }],
      solving(),
    );
    expect(state.outcome).toBe('revealed');
    expect(state.phase).toBe('animating');
    expect(state.lastMove?.pit).toBe(2);
    expect(state.wrong).toEqual([4, 0, 5]);
    expect(state.tally).toEqual({ solved: 0, played: 1 });
  });

  // Scenario: Asking for the answer
  it('Show the answer plays the answer and counts as not solved', () => {
    const state = run([{ type: 'pitChosen', pit: 4 }, { type: 'showAnswer' }], solving());
    expect(state.outcome).toBe('revealed');
    expect(state.wrong).toEqual([4]);
    expect(puzzleStatus(state).message).toBe('The best move was pit 3.');

    const landed = run([{ type: 'animationDone' }], state);
    expect(puzzleStatus(landed)).toEqual({ message: 'The best move was pit 3.', detail: 'You get another turn.' });
    expect(playablePits(landed)).toEqual([]);
    expect(landed.tally).toEqual({ solved: 0, played: 1 });
  });

  it('nothing can be chosen while the answer is animating', () => {
    const state = run([{ type: 'showAnswer' }], solving());
    expect(run([{ type: 'pitChosen', pit: 1 }], state)).toBe(state);
    expect(run([{ type: 'showAnswer' }], state)).toBe(state);
  });

  // Scenario: Skipping a puzzle
  it('skipping an unsolved puzzle counts it as played', () => {
    const skipped = run([{ type: 'pitChosen', pit: 4 }], solving());
    const next = solving(skipped);
    expect(next.wrong).toEqual([]);
    expect(next.outcome).toBeNull();
    expect(puzzleStatus(next).detail).toBe('3 tries');
    expect(next.tally).toEqual({ solved: 0, played: 1 });
  });

  it('moving on from a finished puzzle does not count it twice', () => {
    const finished = run([{ type: 'pitChosen', pit: 2 }, { type: 'animationDone' }], solving());
    expect(solving(finished).tally).toEqual({ solved: 1, played: 1 });
  });

  it('a puzzle that never arrived is not counted', () => {
    const state = run([{ type: 'requested', requestId: 1 }, { type: 'requested', requestId: 2 }]);
    expect(state.tally).toEqual({ solved: 0, played: 0 });
  });

  it('leaving for a game counts an unfinished puzzle, and ignores one still on its way', () => {
    const left = run([{ type: 'pitChosen', pit: 4 }, { type: 'left' }], solving());
    expect(left.tally).toEqual({ solved: 0, played: 1 });
    expect(left.puzzle).toBeNull();

    const pending = run([{ type: 'requested', requestId: 1 }, { type: 'left' }]);
    expect(run([{ type: 'arrived', requestId: 1, puzzle: PUZZLE }], pending)).toBe(pending);
    expect(pending.tally).toEqual({ solved: 0, played: 0 });
  });

  // Scenario: Counting
  it('one solved and one revealed is "1 of 2"', () => {
    const one = run([{ type: 'pitChosen', pit: 2 }, { type: 'animationDone' }], solving());
    const two = run([{ type: 'showAnswer' }, { type: 'animationDone' }], solving(one));
    expect(two.tally).toEqual({ solved: 1, played: 2 });
  });
});
