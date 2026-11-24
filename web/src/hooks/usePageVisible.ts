import { useSyncExternalStore } from 'react';

/**
 * Whether the page is on screen (not a background tab or a minimised window).
 * Browsers slow timers right down in hidden pages, so a move animated there
 * could still be crawling when the player comes back; App skips the
 * animation instead (found in the add-online-play browser check).
 */
export function usePageVisible(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      document.addEventListener('visibilitychange', onChange);
      return () => document.removeEventListener('visibilitychange', onChange);
    },
    () => document.visibilityState !== 'hidden',
  );
}
