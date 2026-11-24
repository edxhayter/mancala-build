import { describe, expect, it } from 'vitest';
import { newBoard, type BoardSnapshot } from '../engine';
import { caption, describeResult, moveCaption, playerName, puzzleNames, viewer } from './presentation';
import type { Settings } from './settings';

const vsAi: Settings = { opponent: 'ai', level: 'medium', playerFirst: true };
const vsAiSecond: Settings = { ...vsAi, playerFirst: false };
const hotseat: Settings = { opponent: 'local', level: 'medium', playerFirst: true };

const finished = (south: number, north: number): BoardSnapshot => ({
  pits: { south: [0, 0, 0, 0, 0, 0], north: [0, 0, 0, 0, 0, 0] },
  stores: { south, north },
  toMove: 'south',
  status:
    south === north
      ? { kind: 'draw' }
      : { kind: 'won', winner: south > north ? 'south' : 'north' },
});

describe('viewer', () => {
  // Scenario: Starting position / Playing North
  it('against the computer, the player always sees their own side', () => {
    const northToMove: BoardSnapshot = { ...newBoard(), toMove: 'north' };
    expect(viewer(vsAi, newBoard())).toBe('south');
    expect(viewer(vsAi, northToMove)).toBe('south');
    expect(viewer(vsAiSecond, newBoard())).toBe('north');
  });

  // Scenario: Hotseat turns to the player to move
  it('in hotseat, the player to move; South once the game is over', () => {
    expect(viewer(hotseat, newBoard())).toBe('south');
    expect(viewer(hotseat, { ...newBoard(), toMove: 'north' })).toBe('north');
    expect(viewer(hotseat, { ...finished(26, 22), toMove: 'north' })).toBe('south');
  });
});

describe('playerName', () => {
  it('"You" and "AI" against the computer, compass names in hotseat', () => {
    expect(playerName(vsAi, 'south')).toBe('You');
    expect(playerName(vsAi, 'north')).toBe('AI');
    expect(playerName(vsAiSecond, 'south')).toBe('AI');
    expect(playerName(hotseat, 'north')).toBe('North');
  });
});

describe('caption (the CLI describe_outcome cases)', () => {
  it('a quiet move has nothing to report', () => {
    expect(caption(hotseat, 'south', { extraTurn: false, captured: 0 })).toBeNull();
  });

  // Scenario: Extra turn is reported
  it('an extra turn', () => {
    expect(caption(hotseat, 'north', { extraTurn: true, captured: 0 })).toBe(
      'North gets another turn.',
    );
    expect(caption(vsAi, 'south', { extraTurn: true, captured: 0 })).toBe(
      'You get another turn.',
    );
  });

  // Scenario: A capture is reported
  it('a capture', () => {
    expect(caption(hotseat, 'south', { extraTurn: false, captured: 6 })).toBe(
      'South captured 6 seeds.',
    );
    expect(caption(vsAi, 'north', { extraTurn: false, captured: 6 })).toBe(
      'AI captured 6 seeds.',
    );
  });
});

describe('describeResult (the CLI describe_result cases)', () => {
  it('a win for either side, and a draw', () => {
    expect(describeResult(hotseat, finished(26, 22))).toBe('South wins!');
    expect(describeResult(hotseat, finished(11, 37))).toBe('North wins!');
    expect(describeResult(hotseat, finished(24, 24))).toBe("It's a draw.");
  });

  it('uses the names from the game', () => {
    expect(describeResult(vsAi, finished(26, 22))).toBe('You win!');
    expect(describeResult(vsAi, finished(11, 37))).toBe('AI wins!');
  });
});

describe('puzzle words', () => {
  it('moveCaption speaks to "You"', () => {
    expect(moveCaption('You', { extraTurn: false, captured: 5 })).toBe('You captured 5 seeds.');
    expect(moveCaption('You', { extraTurn: true, captured: 0 })).toBe('You get another turn.');
    expect(moveCaption('You', { extraTurn: false, captured: 0 })).toBeNull();
  });

  it('the mover is "You", whichever side they play', () => {
    const board = newBoard();
    expect(puzzleNames(board)).toEqual({ south: 'You', north: 'Opponent' });
    expect(puzzleNames({ ...board, toMove: 'north' })).toEqual({ south: 'Opponent', north: 'You' });
  });
});
