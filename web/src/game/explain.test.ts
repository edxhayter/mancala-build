import { describe, expect, it } from 'vitest';
import { explainMoves, newBoard, type BoardSnapshot } from '../engine';
import { describeMoves, resultWords, stepCaption } from './explain';

const names = { south: 'You', north: 'Opponent' } as const;

/** A position from its parts, still in progress. */
const position = (south: number[], southStore: number, north: number[], northStore: number, toMove: 'south' | 'north'): BoardSnapshot => ({
  pits: { south, north },
  stores: { south: southStore, north: northStore },
  toMove,
  status: { kind: 'playing' },
});

describe('explaining moves in words', () => {
  // Scenario: Best first, in words
  it('lists moves best first, stars the best, and says what each does', () => {
    const board = newBoard();
    // Made-up scores: pit 3 (index 2) is an extra turn worth +4; pit 6 (index 5) loses.
    const described = describeMoves(
      board,
      [
        { pit: 2, score: 4, line: [2] },
        { pit: 5, score: -1003, line: [5] },
      ],
      names,
    );
    expect(described.map((d) => d.pit)).toEqual([2, 5]);
    expect(described[0]).toMatchObject({ best: true, now: 'extra turn', result: "you're 4 seeds ahead" });
    expect(described[1].best).toBe(false);
  });

  // Scenario: Equal best moves
  it('stars every move that shares the best score', () => {
    const described = describeMoves(
      newBoard(),
      [
        { pit: 2, score: 1, line: [2] },
        { pit: 3, score: 1, line: [3] },
        { pit: 0, score: 0, line: [0] },
      ],
      names,
    );
    expect(described.map((d) => d.best)).toEqual([true, true, false]);
  });

  it('words every kind of result from the mover’s side', () => {
    const playing = newBoard();
    expect(resultWords(playing, 'south', 0)).toBe('level');
    expect(resultWords(playing, 'south', 1)).toBe("you're 1 seed ahead");
    expect(resultWords(playing, 'south', -3)).toBe("you're 3 seeds behind");
    expect(resultWords({ ...playing, status: { kind: 'won', winner: 'south' } }, 'south', 1004)).toBe('you win the game');
    expect(resultWords({ ...playing, status: { kind: 'won', winner: 'south' } }, 'north', -1004)).toBe('you lose the game');
    expect(resultWords({ ...playing, status: { kind: 'draw' } }, 'south', 0)).toBe('a draw');
  });

  it('captions each move of a line', () => {
    expect(stepCaption('You', 4, { extraTurn: false, captured: 0 })).toBe('You play pit 5.');
    expect(stepCaption('Opponent', 1, { extraTurn: false, captured: 6 })).toBe('Opponent plays pit 2 and captures 6 seeds.');
    expect(stepCaption('You', 2, { extraTurn: true, captured: 0 })).toBe('You play pit 3 and get another turn.');
    expect(stepCaption('AI', 0, { extraTurn: true, captured: 1 })).toBe('AI plays pit 1, captures 1 seed and gets another turn.');
  });

  it('a capture is named as it happens: the kalah-rules South captures position', () => {
    const board = position([1, 0, 0, 2, 0, 0], 0, [1, 1, 1, 1, 5, 1], 0, 'south');
    const [described] = describeMoves(board, [{ pit: 0, score: 6, line: [0] }], names);
    expect(described.now).toBe('captures 6 seeds');
    expect(described.steps[0].caption).toBe('You play pit 1 and capture 6 seeds.');
  });

  it('with real lines: the winning move and the losing one', () => {
    const board = position([1, 0, 0, 0, 1, 0], 18, [5, 0, 0, 0, 0, 0], 23, 'south');
    const described = describeMoves(board, explainMoves(board), names);
    expect(described[0]).toMatchObject({ pit: 4, best: true, result: 'you win the game' });
    const losing = described.find((d) => d.pit === 0)!;
    expect(losing.result).toBe('you lose the game');
    expect(losing.steps.length).toBeGreaterThan(1);
    expect(losing.steps[1].caption).toMatch(/^Opponent plays pit \d/);
    // Each step starts where the last one ended.
    for (let i = 1; i < losing.steps.length; i++) {
      expect(losing.steps[i].move.before).toEqual(losing.steps[i - 1].move.result.board);
    }
  });
});
