interface ReplayBarProps {
  /** Which move is being replayed, e.g. "Pit 5". */
  title: string;
  caption: string;
  /** How the line ends, once its last move has landed. */
  result: string | null;
  canNext: boolean;
  onNext: () => void;
  onBack: () => void;
}

/** Replaying a move's line: what just happened, Next move, and Back to the list. */
export function ReplayBar({ title, caption, result, canNext, onNext, onBack }: ReplayBarProps) {
  return (
    <div className="puzzle-status replay-bar">
      <div role="status" className="status">
        <p className="status-text">{title}</p>
        <p className="caption">
          {caption}
          {result && <> {result}</>}
        </p>
      </div>
      <div className="puzzle-actions">
        <button type="button" className="text-button" onClick={onBack}>
          Back
        </button>
        {canNext && (
          <button type="button" className="tab-button" onClick={onNext}>
            Next move
          </button>
        )}
      </div>
    </div>
  );
}
