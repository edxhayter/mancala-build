import { describe, expect, it } from 'vitest';
import {
  ROOM_IDLE_MS,
  cleanPlayerName,
  displayName,
  expired,
  readRoomLink,
  roomKey,
  roomLink,
  samePlayerName,
} from './rooms';

describe('room names', () => {
  // Scenario: Names that lead to the same room
  it('names that differ only in case and spaces lead to the same room', () => {
    const keys = ['Friday Rematch', 'friday rematch', '  friday   REMATCH '].map(roomKey);
    expect(keys).toEqual(['friday rematch', 'friday rematch', 'friday rematch']);
  });

  // Scenario: Names that aren't allowed
  it.each([
    ['ab', 'too short'],
    ['a'.repeat(31), 'too long'],
    ['<b>hi</b>', 'markup'],
    ['ed/sam', 'a slash'],
    ['game 🎲', 'an emoji'],
    ['   ', 'only spaces'],
  ])('%s is not allowed (%s)', (typed) => {
    expect(roomKey(typed)).toBeNull();
    expect(displayName(typed)).toBeNull();
  });

  it('allows digits, hyphens, accents and other alphabets', () => {
    expect(roomKey('Café-2')).toBe('café-2');
    expect(roomKey('Ä Ö ü')).toBe('ä ö ü');
    expect(roomKey('пятница')).toBe('пятница');
    expect(roomKey('a'.repeat(30))).toBe('a'.repeat(30));
  });

  it('treats an accent typed as two characters the same as one', () => {
    // "e" followed by a combining acute accent, versus the single character "é".
    expect(roomKey('café')).toBe(roomKey('café'));
  });

  it('the display name keeps the case as typed, tidying the spaces', () => {
    expect(displayName('  Friday   Rematch ')).toBe('Friday Rematch');
  });
});

describe('room links', () => {
  const here = { origin: 'https://example.github.io', pathname: '/mancala-build/' };

  it('a link round-trips back to the room name', () => {
    for (const name of ['friday rematch', 'Café-2', 'пятница']) {
      const link = roomLink(name, here);
      expect(link.startsWith('https://example.github.io/mancala-build/#room=')).toBe(true);
      expect(readRoomLink(new URL(link).hash)).toBe(name);
    }
  });

  it('a fragment that is not a room link gives null', () => {
    expect(readRoomLink('')).toBeNull();
    expect(readRoomLink('#')).toBeNull();
    expect(readRoomLink('#other=1')).toBeNull();
    expect(readRoomLink('#room=ab')).toBeNull();
    expect(readRoomLink('#room=%3Cscript%3E')).toBeNull();
    expect(readRoomLink('#room=%E0%A4%A')).toBeNull(); // broken encoding
  });
});

describe('player names', () => {
  it('are 1 to 20 characters after trimming', () => {
    expect(cleanPlayerName('  Ed ')).toBe('Ed');
    expect(cleanPlayerName('a'.repeat(20))).toBe('a'.repeat(20));
    expect(cleanPlayerName('a'.repeat(21))).toBeNull();
    expect(cleanPlayerName('   ')).toBeNull();
  });

  it('are the same player when they match like room names do', () => {
    expect(samePlayerName('Sam', ' sam ')).toBe(true);
    expect(samePlayerName('Sam', 'Alex')).toBe(false);
  });
});

describe('rooms close when not full', () => {
  it('a room expires after 10 minutes without two players', () => {
    expect(ROOM_IDLE_MS).toBe(10 * 60 * 1000);
    const since = 1_000_000;
    expect(expired(since, since + ROOM_IDLE_MS - 1)).toBe(false); // 9:59.999
    expect(expired(since, since + ROOM_IDLE_MS)).toBe(true); // 10:00
  });
});
