// A stand-in for window.matchMedia (jsdom doesn't have one). The test decides
// which queries match, and can change its mind to simulate turning a phone.

import { act } from '@testing-library/react';

type Listener = () => void;

export function mockMedia(matches: (query: string) => boolean) {
  let current = matches;
  const listeners = new Set<Listener>();

  window.matchMedia = (query: string) =>
    ({
      media: query,
      get matches() {
        return current(query);
      },
      addEventListener: (_type: string, listener: Listener) => listeners.add(listener),
      removeEventListener: (_type: string, listener: Listener) => listeners.delete(listener),
    }) as unknown as MediaQueryList;

  return {
    /** Change which queries match, and tell everyone listening. */
    set(next: (query: string) => boolean) {
      current = next;
      act(() => listeners.forEach((listener) => listener()));
    },
  };
}

/** Pretend to be a phone held upright, or sideways. */
export const upright = (query: string) => query.includes('portrait');
export const sideways = (query: string) => query.includes('landscape');
export const desktop = () => false;
