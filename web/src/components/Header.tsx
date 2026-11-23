import type { Ref } from 'react';
import type { Settings } from '../game/settings';

const LEVEL_NAMES = { easy: 'Easy', medium: 'Medium', hard: 'Hard' } as const;

interface HeaderProps {
  settings: Settings;
  onNewGame: () => void;
  /** So focus can come back to the New game button when the sheet closes. */
  newGameRef?: Ref<HTMLButtonElement>;
}

export function Header({ settings, onNewGame, newGameRef }: HeaderProps) {
  return (
    <header className="header">
      <h1 className="title">Mancala</h1>
      <div className="header-controls">
        <span className="matchup">
          {settings.opponent === 'ai' ? (
            <>
              You vs <strong>AI · {LEVEL_NAMES[settings.level]}</strong>
            </>
          ) : (
            <strong>Two players</strong>
          )}
        </span>
        <button ref={newGameRef} type="button" className="tab-button" onClick={onNewGame}>
          New game
        </button>
      </div>
    </header>
  );
}
