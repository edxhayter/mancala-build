import { Board } from '../board/Board';
import { newBoard } from '../engine';

const noNames = { south: '', north: '' };
const nothing = () => {};

/** Shown instead of the game on a phone held upright (design.md decision 10). */
export function RotatePrompt() {
  return (
    <main className="rotate-prompt">
      <h1 className="rotate-title">Mancala</h1>
      {/* A small picture of the board. aria-hidden: it's decoration, not a game. */}
      <div aria-hidden="true" className="rotate-board">
        <Board board={newBoard()} viewer="south" names={noNames} playable={[]} onPlay={nothing} cup={36} labels={false} />
      </div>
      <svg aria-hidden="true" width="72" height="56" viewBox="0 0 72 56" className="rotate-icon">
        <rect x="6" y="6" width="22" height="40" rx="4" />
        <rect x="30" y="30" width="38" height="22" rx="4" strokeDasharray="3 3" />
        <path d="M36 8 C 50 8, 58 14, 60 24" />
        <path d="M55 20 L60 25 L64 19" />
      </svg>
      <p className="rotate-text">Turn your phone sideways to play</p>
    </main>
  );
}
