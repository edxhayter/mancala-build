import { useEffect, useId, useRef } from 'react';
import type { MoveDescription } from '../game/explain';

interface ExplainerSheetProps {
  /** "Why?" after a puzzle, "Analysis" in a game. */
  title: string;
  items: MoveDescription[];
  onShowWhy: (pit: number) => void;
  /** "Back to the puzzle" / "Back to the game". */
  closeLabel: string;
  onClose: () => void;
}

/**
 * Every legal move, best first, with what it does now and how it ends after
 * best play (add-move-explainer design.md decision 7). A dialog like the New
 * game sheet: Escape or a click outside closes it.
 */
export function ExplainerSheet({ title, items, onShowWhy, closeLabel, onClose }: ExplainerSheetProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  // Move keyboard focus into the sheet: to the first Show why.
  useEffect(() => {
    dialogRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
  }, []);

  return (
    <div className="scrim" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="sheet explainer"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.key === 'Escape' && onClose()}
      >
        <h2 id={titleId} className="sheet-title">
          {title}
        </h2>
        <p className="explainer-note">Every move, looking 12 moves ahead with both sides playing their best.</p>
        <ul className="explainer-list">
          {items.map((item) => (
            <li key={item.pit} className={item.best ? 'explainer-item best' : 'explainer-item'}>
              <span className="explainer-pit">
                Pit {item.pit + 1}
                {item.best && (
                  <span className="explainer-star" aria-label="best move">
                    {' '}
                    ★
                  </span>
                )}
              </span>
              <span className="explainer-words">
                {item.now && <span className="explainer-now">{item.now} · </span>}
                after best play {item.result}
              </span>
              <button
                type="button"
                className="text-button"
                aria-label={`Show why: pit ${item.pit + 1}`}
                onClick={() => onShowWhy(item.pit)}
              >
                Show why
              </button>
            </li>
          ))}
        </ul>
        <div className="sheet-actions">
          <button type="button" className="tab-button" onClick={onClose}>
            {closeLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
