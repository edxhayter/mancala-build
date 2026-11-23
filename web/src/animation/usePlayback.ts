// Plays a move's steps one after another (design.md decision 6).

import { useEffect, useMemo, useRef, useState } from 'react';
import type { BoardSnapshot } from '../engine';
import type { PlayedMove } from '../game/reducer';
import { buildSteps, type Step } from './steps';

export interface Playback {
  step: Step;
  /** The board just before this step (to work out what arrives). */
  previous: BoardSnapshot;
  /** Which step this is; changes every step, so animations can restart. */
  index: number;
}

/**
 * While `active`, shows each step of `move` for `stepMs`, then calls `onDone`.
 * Returns the step to draw, or null when there's nothing to animate.
 * With `stepMs` 0 (instant, or reduced motion) it calls `onDone` straight away.
 */
export function usePlayback(
  move: PlayedMove | null,
  active: boolean,
  stepMs: number,
  onDone: () => void,
): Playback | null {
  const steps = useMemo(() => (move ? buildSteps(move.before, move.result, move.pit) : []), [move]);

  // Which step we're on, remembered together with the steps it belongs to.
  const [progress, setProgress] = useState<{ steps: Step[]; index: number } | null>(null);

  // Always call the latest onDone, without restarting the timer when it changes.
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });

  useEffect(() => {
    if (!active) return;
    if (stepMs === 0 || steps.length === 0) {
      done.current();
      return;
    }
    let index = 0;
    setProgress({ steps, index });
    const timer = setInterval(() => {
      index += 1;
      if (index < steps.length) {
        setProgress({ steps, index });
      } else {
        clearInterval(timer);
        done.current();
      }
    }, stepMs);
    return () => clearInterval(timer); // a new game or a speed change stops this one
  }, [active, steps, stepMs]);

  if (!active || !move || stepMs === 0 || steps.length === 0) return null;
  // Before the effect has run for this move, show its first step.
  const index = progress?.steps === steps ? progress.index : 0;
  return { step: steps[index], previous: index === 0 ? move.before : steps[index - 1].board, index };
}
