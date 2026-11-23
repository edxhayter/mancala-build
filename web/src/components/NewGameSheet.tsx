import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { Level, Settings } from '../game/settings';

interface NewGameSheetProps {
  /** The current game's settings, which the sheet starts from. */
  initial: Settings;
  onStart: (settings: Settings) => void;
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

export function NewGameSheet({ initial, onStart, onCancel }: NewGameSheetProps) {
  // The choices being made. Nothing changes in the game until Start game.
  const [draft, setDraft] = useState(initial);
  const change = (part: Partial<Settings>) => setDraft({ ...draft, ...part });

  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  // When the sheet opens, move keyboard focus into it.
  useEffect(() => {
    dialogRef.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus();
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
            pressed={draft.opponent === 'ai'}
            onClick={() => change({ opponent: 'ai' })}
          />
          <ModeCard
            title="Two players"
            detail="Take turns on this device"
            pressed={draft.opponent === 'local'}
            onClick={() => change({ opponent: 'local' })}
          />
          <ModeCard title="Online" detail="Play a friend · coming later" disabled />
          <ModeCard title="Puzzles" detail="Find the best move · coming later" disabled />
        </div>

        {draft.opponent === 'ai' && (
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
          <button type="button" className="tab-button" onClick={() => onStart(draft)}>
            Start game
          </button>
        </div>
      </div>
    </div>
  );
}
