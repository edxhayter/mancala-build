import type { ReactNode, Ref } from 'react';
import type { Settings } from '../game/settings';

const LEVEL_NAMES = { easy: 'Easy', medium: 'Medium', hard: 'Hard' } as const;

interface HeaderProps {
  settings: Settings;
  /** Shown in place of the opponent (puzzles). */
  matchup?: ReactNode;
  onNewGame: () => void;
  /** So focus can come back to the New game button when the sheet closes. */
  newGameRef?: Ref<HTMLButtonElement>;
  /** Phone held sideways: one slim row, with `status` in the middle. */
  compact?: boolean;
  status?: ReactNode;
  /** The settings icon and its pop-over. */
  settingsOpen?: boolean;
  onSettings?: () => void;
  settingsRef?: Ref<HTMLButtonElement>;
  settings_panel?: ReactNode;
  /** Online: the Chat button, with the unread count. */
  chat?: { unread: number; open: boolean; onToggle: () => void; buttonRef?: Ref<HTMLButtonElement> };
}

export function Header({
  settings,
  matchup,
  onNewGame,
  newGameRef,
  compact = false,
  status,
  settingsOpen = false,
  onSettings,
  settingsRef,
  settings_panel,
  chat,
}: HeaderProps) {
  const opponent =
    settings.opponent === 'ai' ? <strong>AI · {LEVEL_NAMES[settings.level]}</strong> : <strong>Two players</strong>;
  return (
    <header className={compact ? 'header compact' : 'header'}>
      <h1 className="title">Mancala</h1>
      {compact && <div className="header-status">{status}</div>}
      <div className="header-controls">
        {matchup ?? (
          <span className="matchup">
            {settings.opponent === 'ai' ? (
              <>
                {compact ? 'vs' : 'You vs'} {opponent}
              </>
            ) : (
              opponent
            )}
          </span>
        )}
        {chat && (
          <button
            ref={chat.buttonRef}
            type="button"
            className="text-button chat-button"
            aria-expanded={chat.open}
            aria-label={chat.unread > 0 ? `Chat, ${chat.unread} unread` : 'Chat'}
            onClick={chat.onToggle}
          >
            Chat
            {chat.unread > 0 && (
              <span className="badge" aria-hidden="true">
                {chat.unread}
              </span>
            )}
          </button>
        )}
        <button ref={newGameRef} type="button" className="tab-button" onClick={onNewGame}>
          New game
        </button>
        {onSettings && (
          <div className="settings-anchor">
            <button
              ref={settingsRef}
              type="button"
              className="settings-button"
              aria-label="Settings"
              aria-expanded={settingsOpen}
              aria-haspopup="dialog"
              onClick={onSettings}
            >
              {/* The sliders icon from the concept: inline stroke SVG, never emoji. */}
              <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24">
                <line x1="4" y1="7" x2="20" y2="7" />
                <circle cx="9" cy="7" r="2.2" />
                <line x1="4" y1="17" x2="20" y2="17" />
                <circle cx="15" cy="17" r="2.2" />
              </svg>
            </button>
            {settingsOpen && settings_panel}
          </div>
        )}
      </div>
    </header>
  );
}
