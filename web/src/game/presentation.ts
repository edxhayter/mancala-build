// The CLI's presentation rules, ported from crates/mancala-cli/src/game.rs.
// Pure functions: plain data in, plain data out, no React.

import type { BoardSnapshot, Player } from '../engine';
import { playerSide, type Settings } from './settings';

/** Whose side the board is drawn from (the CLI's `viewer`). */
export function viewer(settings: Settings, board: BoardSnapshot): Player {
  if (settings.opponent === 'ai') {
    return playerSide(settings); // always the person's own side
  }
  // Hotseat: the player to move sees their side; South once it's over.
  return board.status.kind === 'playing' ? board.toMove : 'south';
}

/** "You" / "AI" against the computer, "South" / "North" in hotseat. */
export function playerName(settings: Settings, player: Player): string {
  if (settings.opponent === 'ai') {
    return player === playerSide(settings) ? 'You' : 'AI';
  }
  return player === 'south' ? 'South' : 'North';
}

/** Picks the verb form: "You get" but "South gets". */
const verb = (name: string, you: string, other: string) => (name === 'You' ? you : other);

/**
 * The caption after a move (the CLI's `describe_outcome`): a capture and/or
 * an extra turn, or null when there is nothing to report.
 */
export function caption(
  settings: Settings,
  player: Player,
  outcome: { extraTurn: boolean; captured: number },
): string | null {
  return moveCaption(playerName(settings, player), outcome);
}

/** The caption for a move by `name` ("You", "AI", "South", ...): shared by games and puzzles. */
export function moveCaption(name: string, outcome: { extraTurn: boolean; captured: number }): string | null {
  const parts: string[] = [];
  if (outcome.captured > 0) {
    parts.push(`${name} captured ${outcome.captured} seeds.`);
  }
  if (outcome.extraTurn) {
    parts.push(`${name} ${verb(name, 'get', 'gets')} another turn.`);
  }
  return parts.length > 0 ? parts.join(' ') : null;
}

/** In a puzzle the player to move is "You", and the other side is "Opponent". */
export function puzzleNames(board: BoardSnapshot): Record<Player, string> {
  return board.toMove === 'south' ? { south: 'You', north: 'Opponent' } : { south: 'Opponent', north: 'You' };
}

/** The result line for a finished game (the CLI's `describe_result`, minus the
 *  scores, which the end-of-game panel shows beside each name). */
export function describeResult(settings: Settings, board: BoardSnapshot): string {
  const status = board.status;
  switch (status.kind) {
    case 'playing':
      return 'The game is still in progress.';
    case 'draw':
      return "It's a draw.";
    case 'won': {
      const name = playerName(settings, status.winner);
      return `${name} ${verb(name, 'win', 'wins')}!`;
    }
  }
}
