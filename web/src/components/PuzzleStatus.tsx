import type { Ref } from 'react';

interface PuzzleStatusProps {
  message: string;
  /** "2 tries left", or the answer's caption, or null. */
  detail: string | null;
  /** Shown only while the puzzle is unsolved. */
  onShowAnswer?: () => void;
  /** Shown once the puzzle has ended: opens the explainer. */
  onWhy?: () => void;
  /** So focus can come back to Why? when the explainer closes. */
  whyRef?: Ref<HTMLButtonElement>;
  onNext: () => void;
}

/**
 * The puzzle's status line (the concept's puzzle artboard): what's happening,
 * how many tries are left, and the two actions. Only the words are a live
 * region, so screen readers announce them without reading out the buttons.
 */
export function PuzzleStatus({ message, detail, onShowAnswer, onWhy, whyRef, onNext }: PuzzleStatusProps) {
  return (
    <div className="puzzle-status">
      <div role="status" className="status">
        <p className="status-text">{message}</p>
        {detail && <p className="caption">{detail}</p>}
      </div>
      <div className="puzzle-actions">
        {onShowAnswer && (
          <button type="button" className="text-button" onClick={onShowAnswer}>
            Show the answer
          </button>
        )}
        {onWhy && (
          <button ref={whyRef} type="button" className="text-button" onClick={onWhy}>
            Why?
          </button>
        )}
        <button type="button" className="tab-button" onClick={onNext}>
          Next puzzle
        </button>
      </div>
    </div>
  );
}
