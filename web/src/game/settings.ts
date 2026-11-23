import type { Player } from '../engine';

export type Level = 'easy' | 'medium' | 'hard';

/** What the New game sheet chooses (design.md decision 4). */
export interface Settings {
  /** 'ai': the player against the computer. 'local': two players, one device. */
  opponent: 'ai' | 'local';
  /** The computer's level (ignored for 'local'). */
  level: Level;
  /** Against the computer: whether the player moves first (plays South). */
  playerFirst: boolean;
}

/** Spec: Ready on first visit. */
export const DEFAULT_SETTINGS: Settings = { opponent: 'ai', level: 'medium', playerFirst: true };

/** The side the person plays against the computer. */
export function playerSide(settings: Settings): Player {
  return settings.playerFirst ? 'south' : 'north';
}

/** Whether `player` is played by the computer in this game. */
export function isComputer(settings: Settings, player: Player): boolean {
  return settings.opponent === 'ai' && player !== playerSide(settings);
}
