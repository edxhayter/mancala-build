import type { ReactNode, Ref } from 'react';
import type { Settings } from '../game/settings';

const LEVEL_NAMES = { easy: 'Easy', medium: 'Medium', hard: 'Hard' } as const;

interface HeaderProps {
  settings: Settings;
  onNewGame: () => void;
  /** So focus can come back to the New game button when the sheet closes. */
  newGameRef?: Ref<HTMLButtonElement>;
  /** Phone held sideways: one slim row, with `status` in the middle. */
  compact?: boolean;
  status?: ReactNode;
}

export function Header({ settings, onNewGame, newGameRef, compact = false, status }: HeaderProps) {
  const opponent =
    settings.opponent === 'ai' ? <strong>AI · {LEVEL_NAMES[settings.level]}</strong> : <strong>Two players</strong>;
  return (
    <header className={compact ? 'header compact' : 'header'}>
      <h1 className="title">Mancala</h1>
      {compact && <div className="header-status">{status}</div>}
      <div className="header-controls">
        <span className="matchup">
          {settings.opponent === 'ai' ? (
            <>
              {compact ? 'vs' : 'You vs'} {opponent}
            </>
          ) : (
            opponent
          )}
        </span>
        <button ref={newGameRef} type="button" className="tab-button" onClick={onNewGame}>
          New game
        </button>
      </div>
    </header>
  );
}
