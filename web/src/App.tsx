import { useState } from 'react';
import { Board } from './board/Board';
import { legalMoves, newBoard, play } from './engine';

// A placeholder page for reviewing the board (task 6.1): click pits to play
// both sides. Task 6.2 replaces it with the real page and the reducer.
export function App() {
  const [board, setBoard] = useState(newBoard);
  return (
    <main style={{ padding: '40px 56px', display: 'grid', gap: 22 }}>
      <h1 style={{ fontSize: 48, lineHeight: 1 }}>Mancala</h1>
      <div className="woven-band" aria-hidden="true" />
      <div style={{ display: 'grid', justifyItems: 'center', gap: 30, paddingTop: 40 }}>
        <Board
          board={board}
          viewer={board.toMove}
          names={{ south: 'South', north: 'North' }}
          playable={legalMoves(board)}
          onPlay={(pit) => setBoard(play(board, pit).board)}
        />
        <p style={{ fontFamily: 'var(--font-display)', fontSize: 30, margin: 0 }}>
          {board.toMove === 'south' ? 'South' : 'North'} to move
        </p>
      </div>
    </main>
  );
}
