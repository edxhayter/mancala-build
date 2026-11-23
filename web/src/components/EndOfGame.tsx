import type { BoardSnapshot, Player } from '../engine';

interface EndOfGameProps {
  /** "South wins!" / "You win!" / "It's a draw." */
  result: string;
  board: BoardSnapshot;
  names: Record<Player, string>;
  onPlayAgain: () => void;
}

/** Replaces the status line when the game is over. */
export function EndOfGame({ result, board, names, onPlayAgain }: EndOfGameProps) {
  return (
    <div role="status" className="status end-of-game">
      <p className="status-text">{result}</p>
      <p className="scores">
        {names.south} <strong>{board.stores.south}</strong>
        <span aria-hidden="true"> · </span>
        <span className="visually-hidden">, </span>
        {names.north} <strong>{board.stores.north}</strong>
      </p>
      <button type="button" className="tab-button" onClick={onPlayAgain}>
        Play again
      </button>
    </div>
  );
}
