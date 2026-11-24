// Room names, keys and links (add-online-play design.md decision 2).
//
// A room is found by its name. Two typed names lead to the same room when
// their *key* matches: trimmed, lower-cased, with runs of spaces collapsed.
// Pure functions only: no React, no network.

/** A room closes once it has gone this long without both players connected. */
export const ROOM_IDLE_MS = 10 * 60 * 1000;

/**
 * 3–30 letters (any alphabet, with accents), digits, spaces or hyphens.
 * The `u` flag makes `\p{…}` (Unicode classes) work and counts characters,
 * not UTF-16 code units. `\p{M}` allows accent marks typed as separate characters.
 */
const ROOM_NAME = /^[\p{L}\p{M}\p{N} -]{3,30}$/u;

/** Trims, joins accents to their letters (NFC), and collapses runs of spaces. */
function tidy(typed: string): string {
  return typed.normalize('NFC').trim().replace(/\s+/g, ' ');
}

/** The name as shown: tidied, case kept. `null` if it isn't an allowed room name. */
export function displayName(typed: string): string | null {
  const name = tidy(typed);
  return ROOM_NAME.test(name) ? name : null;
}

/** What identifies the room: the tidied, lower-cased name, or `null` if not allowed. */
export function roomKey(typed: string): string | null {
  const name = displayName(typed);
  return name === null ? null : name.toLocaleLowerCase();
}

/** A player's name: 1–20 characters after trimming, or `null`. */
export function cleanPlayerName(typed: string): string | null {
  const name = tidy(typed);
  const length = [...name].length; // characters, not UTF-16 units
  return length >= 1 && length <= 20 ? name : null;
}

/** Whether two player names are the same person's, compared like room keys. */
export function samePlayerName(a: string, b: string): boolean {
  return tidy(a).toLocaleLowerCase() === tidy(b).toLocaleLowerCase();
}

/** A link that opens the Online choice with `name` filled in. */
export function roomLink(name: string, where: { origin: string; pathname: string }): string {
  return `${where.origin}${where.pathname}#room=${encodeURIComponent(name)}`;
}

/** The room name in a `#room=…` fragment, or `null` if there isn't a valid one. */
export function readRoomLink(hash: string): string | null {
  const fragment = hash.startsWith('#') ? hash.slice(1) : hash;
  const match = /(?:^|&)room=([^&]*)/.exec(fragment);
  if (!match) return null;
  try {
    return displayName(decodeURIComponent(match[1]));
  } catch {
    return null; // broken %-encoding
  }
}

/** Whether a room last full at `lastTogetherAt` has closed by `now` (both in ms). */
export function expired(lastTogetherAt: number, now: number): boolean {
  return now - lastTogetherAt >= ROOM_IDLE_MS;
}
