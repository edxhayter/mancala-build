// The words on the status line, worked out from the game state.

import type { Player } from '../engine';
import { describeResult, playerName } from './presentation';
import type { GameState } from './reducer';
import { isComputer, type Settings } from './settings';

function turnText(settings: Settings, player: Player): string {
  if (settings.opponent === 'local') return `${playerName(settings, player)} to move`;
  return isComputer(settings, player) ? 'AI is moving' : 'Your move';
}

export function statusText(state: GameState): string {
  switch (state.phase) {
    case 'human':
      return turnText(state.settings, state.board.toMove);
    case 'thinking':
      return 'AI is thinking…';
    case 'animating':
      // Still the turn of whoever made the move being shown.
      return turnText(state.settings, state.lastMove?.by ?? state.board.toMove);
    case 'over':
      return describeResult(state.settings, state.board);
  }
}
