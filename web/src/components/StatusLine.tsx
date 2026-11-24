import type { Ref } from 'react';

interface StatusLineProps {
  text: string;
  /** "South gets another turn." etc., or null. */
  caption: string | null;
  /** On your turn against the computer: opens the explainer for this position. */
  onAnalyze?: () => void;
  /** True while an analysis is being worked out. */
  analyzing?: boolean;
  /** So focus can come back to Analyze when the explainer closes. */
  analyzeRef?: Ref<HTMLButtonElement>;
}

/**
 * Whose turn it is, with the latest caption beside it. `role="status"` makes it
 * a polite live region: screen readers read out changes without interrupting.
 * The Analyze button sits outside it, so it isn't read out with every change.
 */
export function StatusLine({ text, caption, onAnalyze, analyzing = false, analyzeRef }: StatusLineProps) {
  const status = (
    <div role="status" className="status">
      <p className="status-text">{text}</p>
      {caption && <p className="caption">{caption}</p>}
      {analyzing && <p className="caption">Analyzing…</p>}
    </div>
  );
  if (!onAnalyze && !analyzing) return status;
  return (
    <div className="puzzle-status">
      {status}
      <div className="puzzle-actions">
        <button ref={analyzeRef} type="button" className="text-button" onClick={onAnalyze} disabled={analyzing}>
          Analyze
        </button>
      </div>
    </div>
  );
}
