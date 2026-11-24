// What the board shows in each mode (add-online-play task 5.4, moved out of
// App.tsx): the position, whose side it's drawn from, the names, the pits
// that can be played, and any puzzle marks. Pure: no React.

import { newBoard, type BoardSnapshot, type Player } from '../engine';
import { explainerBoard, type ExplainerState } from './explainer';
import { mySide, nameOn, playableOnline, type OnlineState } from './online';
import { puzzleNames } from './presentation';
import { playablePits, puzzleBoard, type PuzzleState } from './puzzle';
import { shownViewer, type GameState } from './reducer';

export interface BoardView {
  board: BoardSnapshot;
  viewer: Player;
  names: Record<Player, string>;
  playable: number[];
  marks?: { wrong: number[]; reveal: number | null | undefined };
}

export interface BoardViewInput {
  /** The board of the step being animated, if any: it wins over every mode's own board. */
  animating: BoardSnapshot | null;
  explainer: ExplainerState;
  online: OnlineState | null;
  puzzle: PuzzleState | null;
  game: GameState;
  /** The game's names ("You" / "AI", or "South" / "North") and playable pits. */
  gameNames: Record<Player, string>;
  gamePlayable: number[];
}

export function boardView(input: BoardViewInput): BoardView {
  const { animating, explainer, online, puzzle, game } = input;
  if (explainer.status === 'open') {
    // Explaining: the explained position (or a step of its line), from the explained side.
    return {
      board: animating ?? explainerBoard(explainer) ?? game.board,
      viewer: explainer.position.toMove,
      names: explainer.source.kind === 'puzzle' ? puzzleNames(explainer.position) : input.gameNames,
      playable: [],
    };
  }
  if (online) {
    // Online: your own side along the bottom (spec: Your side and your turn).
    return {
      board: animating ?? online.board,
      viewer: mySide(online),
      names: { south: nameOn(online, 'south'), north: nameOn(online, 'north') },
      playable: playableOnline(online),
    };
  }
  if (puzzle) {
    return {
      board: animating ?? puzzleBoard(puzzle) ?? newBoard(),
      viewer: puzzle.puzzle?.board.toMove ?? 'south',
      names: puzzleNames(puzzle.puzzle?.board ?? newBoard()),
      playable: playablePits(puzzle),
      marks: { wrong: puzzle.wrong, reveal: puzzle.outcome === 'revealed' ? puzzle.puzzle?.answer : null },
    };
  }
  return {
    board: animating ?? game.board,
    viewer: shownViewer(game),
    names: input.gameNames,
    playable: input.gamePlayable,
  };
}
