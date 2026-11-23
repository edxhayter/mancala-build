interface StatusLineProps {
  text: string;
  /** "South gets another turn." etc., or null. */
  caption: string | null;
}

/**
 * Whose turn it is, with the latest caption beside it. `role="status"` makes it
 * a polite live region: screen readers read out changes without interrupting.
 */
export function StatusLine({ text, caption }: StatusLineProps) {
  return (
    <div role="status" className="status">
      <p className="status-text">{text}</p>
      {caption && <p className="caption">{caption}</p>}
    </div>
  );
}
