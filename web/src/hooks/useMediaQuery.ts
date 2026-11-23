import { useSyncExternalStore } from 'react';

/** A phone held upright (design.md decision 10). */
export const UPRIGHT_PHONE = '(orientation: portrait) and (max-width: 599px)';
/** The system asks for less motion (an accessibility setting). */
export const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
/** A phone held sideways: wide, but short. */
export const SIDEWAYS_PHONE = '(orientation: landscape) and (max-height: 500px)';

/**
 * Whether a CSS media query matches right now, re-rendering when that changes
 * (for example when a phone is turned). Without `matchMedia` it's always false.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    // How React subscribes to changes, and how it unsubscribes.
    (onChange) => {
      if (typeof window.matchMedia !== 'function') return () => {};
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    // How React reads the current value.
    () => (typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false),
  );
}
