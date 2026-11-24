import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { Level, Settings } from '../game/settings';
import { loadPlayerName, savePlayerName } from '../online/names';
import { cleanPlayerName, displayName } from '../online/rooms';

/** What Start game begins: a game with these settings, puzzles, or an online room. */
export type NewGameChoice =
  | { kind: 'game'; settings: Settings }
  | { kind: 'puzzles' }
  | { kind: 'online'; roomName: string; playerName: string };

/** Which mode card is chosen. */
type Mode = 'game' | 'puzzles' | 'online';

interface NewGameSheetProps {
  /** The current game's settings, which the sheet starts from. */
  initial: Settings;
  /** Whether puzzles are showing now, so the sheet opens with Puzzles chosen. */
  initialPuzzles?: boolean;
  /** Open with Online chosen and this room name filled in (from a shared link). */
  initialRoom?: string;
  onStart: (choice: NewGameChoice) => void;
  onCancel: () => void;
}

/** One of the four game modes, shown as a card. */
function ModeCard(props: {
  title: string;
  detail: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className="mode-card"
      aria-pressed={props.disabled ? undefined : props.pressed}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      <span className="mode-title">{props.title}</span>
      <span className="mode-detail">{props.detail}</span>
    </button>
  );
}

/** A quiet underlined text choice. */
function Choice(props: { pressed: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="choice" aria-pressed={props.pressed} onClick={props.onClick}>
      {props.children}
    </button>
  );
}

const LEVELS: { level: Level; name: string }[] = [
  { level: 'easy', name: 'Easy' },
  { level: 'medium', name: 'Medium' },
  { level: 'hard', name: 'Hard' },
];

export function NewGameSheet({ initial, initialPuzzles = false, initialRoom, onStart, onCancel }: NewGameSheetProps) {
  // The choices being made. Nothing changes in the game until Start game.
  const [draft, setDraft] = useState(initial);
  const [mode, setMode] = useState<Mode>(initialRoom !== undefined ? 'online' : initialPuzzles ? 'puzzles' : 'game');
  const puzzles = mode === 'puzzles';
  const online = mode === 'online';
  const change = (part: Partial<Settings>) => {
    setDraft({ ...draft, ...part });
    setMode('game');
  };

  // Online: your name (remembered) and the room's name (spec: Entering a room by name).
  const [playerName, setPlayerName] = useState(loadPlayerName);
  const [roomName, setRoomName] = useState(initialRoom ?? '');
  const cleanName = cleanPlayerName(playerName);
  const cleanRoom = displayName(roomName);
  const canEnter = cleanName !== null && cleanRoom !== null;
  const nameId = useId();
  const roomId = useId();
  const hintId = useId();
  const noteId = useId();

  const start = () => {
    if (online) {
      if (!canEnter) return;
      savePlayerName(cleanName);
      onStart({ kind: 'online', roomName: cleanRoom, playerName: cleanName });
    } else {
      onStart(puzzles ? { kind: 'puzzles' } : { kind: 'game', settings: draft });
    }
  };

  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  // When the sheet opens, move keyboard focus into it: to the first empty
  // field when it opens on Online (from a link), otherwise the chosen mode.
  useEffect(() => {
    const dialog = dialogRef.current;
    const emptyField = Array.from(dialog?.querySelectorAll('input') ?? []).find((input) => input.value === '');
    (emptyField ?? dialog?.querySelector<HTMLElement>('[aria-pressed="true"]'))?.focus();
  }, []);

  return (
    // Clicking the dimmed page behind the sheet cancels.
    <div className="scrim" onClick={onCancel}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="sheet"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.key === 'Escape' && onCancel()}
      >
        <h2 id={titleId} className="sheet-title">
          New game
        </h2>

        <div className="modes">
          <ModeCard
            title="Computer"
            detail="Play the AI"
            pressed={mode === 'game' && draft.opponent === 'ai'}
            onClick={() => change({ opponent: 'ai' })}
          />
          <ModeCard
            title="Two players"
            detail="Take turns on this device"
            pressed={mode === 'game' && draft.opponent === 'local'}
            onClick={() => change({ opponent: 'local' })}
          />
          <ModeCard title="Online" detail="Play a friend in a room" pressed={online} onClick={() => setMode('online')} />
          <ModeCard title="Puzzles" detail="Find the best move" pressed={puzzles} onClick={() => setMode('puzzles')} />
        </div>

        {online && (
          <div className="online-fields">
            <div className="field">
              <label htmlFor={nameId} className="small-label">
                Your name
              </label>
              <input
                id={nameId}
                className="text-field"
                value={playerName}
                maxLength={20}
                autoComplete="nickname"
                onChange={(event) => setPlayerName(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && start()}
              />
            </div>
            <div className="field">
              <label htmlFor={roomId} className="small-label">
                Room name
              </label>
              <input
                id={roomId}
                className="text-field"
                value={roomName}
                maxLength={30}
                autoComplete="off"
                aria-describedby={`${hintId} ${noteId}`}
                aria-invalid={roomName.trim() !== '' && cleanRoom === null}
                onChange={(event) => setRoomName(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && start()}
              />
              <p id={hintId} className={roomName.trim() !== '' && cleanRoom === null ? 'field-hint invalid' : 'field-hint'}>
                3–30 letters, numbers, spaces or hyphens
              </p>
            </div>
            <p id={noteId} className="online-note">
              Anyone who types the same room name can join. Playing online connects your browser directly to
              theirs, so each can see the other's network address.
            </p>
          </div>
        )}

        {mode === 'game' && draft.opponent === 'ai' && (
          <div className="choice-groups">
            <div role="group" aria-label="Computer level" className="choice-group">
              <span className="small-label">Computer level</span>
              <div className="choices">
                {LEVELS.map(({ level, name }) => (
                  <Choice key={level} pressed={draft.level === level} onClick={() => change({ level })}>
                    {name}
                  </Choice>
                ))}
              </div>
            </div>
            <div role="group" aria-label="You play" className="choice-group">
              <span className="small-label">You play</span>
              <div className="choices">
                <Choice pressed={draft.playerFirst} onClick={() => change({ playerFirst: true })}>
                  First
                </Choice>
                <Choice pressed={!draft.playerFirst} onClick={() => change({ playerFirst: false })}>
                  Second
                </Choice>
              </div>
            </div>
          </div>
        )}

        <div className="sheet-actions">
          <button type="button" className="text-button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="tab-button" onClick={start} disabled={online && !canEnter}>
            {online ? 'Enter room' : 'Start game'}
          </button>
        </div>
      </div>
    </div>
  );
}
