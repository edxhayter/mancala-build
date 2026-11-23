// The sowing speed (design.md decision 6), remembered in this browser.

import { useState } from 'react';

export type Speed = 'slow' | 'normal' | 'instant';

/** How long each step of a move is shown, in milliseconds. */
export const STEP_MS: Record<Speed, number> = { slow: 400, normal: 180, instant: 0 };

const KEY = 'mancala.speed';

// localStorage can throw (private browsing, storage turned off), so every use
// is wrapped: without it the page still works, it just forgets the speed.
function load(): Speed {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'slow' || saved === 'normal' || saved === 'instant') return saved;
  } catch {
    // fall through to the default
  }
  return 'normal';
}

function save(speed: Speed) {
  try {
    localStorage.setItem(KEY, speed);
  } catch {
    // not remembered, but still used for this visit
  }
}

/** Like useState, but starts from the saved speed and saves every change. */
export function useSpeed(): [Speed, (speed: Speed) => void] {
  const [speed, setSpeed] = useState(load);
  return [
    speed,
    (next) => {
      save(next);
      setSpeed(next);
    },
  ];
}
