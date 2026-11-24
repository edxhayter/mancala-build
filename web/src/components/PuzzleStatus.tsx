interface PuzzleStatusProps {
  message: string;
  /** "2 tries left", or the answer's caption, or null. */
  detail: string | null;
  /** Shown only while the puzzle is unsolved. */
  onShowAnswer?: () => void;
  onNext: () => void;
}

/**
 * The puzzle's status line (the concept's puzzle artboard): what's happening,
 * how many tries are left, and the two actions. Only the words are a live
 * region, so screen readers announce them without reading out the buttons.
 */
export function PuzzleStatus({ message, detail, onShowAnswer, onNext }: PuzzleStatusProps) {
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
        <button type="button" className="tab-button" onClick={onNext}>
          Next puzzle
        </button>
      </div>
    </div>
  );
}
