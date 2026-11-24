import { useState } from 'react';

interface OnlineStatusProps {
  message: string;
  /** The latest caption, who wants a rematch, and so on; or null. */
  detail: string | null;
  /** While waiting: the room's link, offered as Copy link. */
  link?: string;
  /** After 30 seconds with nobody: the note about blocked connections. */
  slowJoin?: boolean;
  /** When the game is over and you haven't asked yet. */
  onRematch?: () => void;
  /** When the room has ended (left, in use, closed). */
  onNewGame?: () => void;
  /** When a game has just ended: "Match: Ed 1 – 1 Sam · Ed leads by 7 seeds". */
  match?: string | null;
}

type Copied = 'no' | 'yes' | 'failed';

/**
 * The online game's status line (add-online-play design.md decision 8). Like
 * the puzzle's, only the words are a live region; the buttons sit beside it.
 */
export function OnlineStatus({ message, detail, link, slowJoin = false, onRematch, onNewGame, match = null }: OnlineStatusProps) {
  const [copied, setCopied] = useState<Copied>('no');

  const copy = () => {
    if (link === undefined) return;
    // The clipboard can be missing (old browsers, insecure pages) or refused.
    const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
    if (!clipboard) return setCopied('failed');
    clipboard.writeText(link).then(
      () => setCopied('yes'),
      () => setCopied('failed'),
    );
  };

  return (
    <div className="puzzle-status online-status">
      <div role="status" className="status">
        <p className="status-text">{message}</p>
        {match && <p className="caption match-line">{match}</p>}
        {detail && <p className="caption">{detail}</p>}
        {copied === 'yes' && <p className="caption">Link copied.</p>}
        {slowJoin && (
          <p className="caption slow-note">
            Some networks block direct connections. If your friend has already entered this room name, try another
            network, such as mobile data.
          </p>
        )}
      </div>
      <div className="puzzle-actions">
        {link !== undefined &&
          (copied === 'failed' ? (
            // No clipboard: show the link to select and copy by hand.
            <input className="text-field link-field" readOnly value={link} aria-label="Room link" onFocus={(e) => e.target.select()} />
          ) : (
            <button type="button" className="text-button" onClick={copy}>
              Copy link
            </button>
          ))}
        {onRematch && (
          <button type="button" className="tab-button" onClick={onRematch}>
            Rematch
          </button>
        )}
        {onNewGame && (
          <button type="button" className="tab-button" onClick={onNewGame}>
            New game
          </button>
        )}
      </div>
    </div>
  );
}
