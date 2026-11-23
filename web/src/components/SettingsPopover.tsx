import { useEffect, useRef } from 'react';
import type { Speed } from '../animation/speed';

interface SettingsPopoverProps {
  speed: Speed;
  onSpeed: (speed: Speed) => void;
  onClose: () => void;
}

const SPEEDS: { speed: Speed; name: string }[] = [
  { speed: 'slow', name: 'Slow' },
  { speed: 'normal', name: 'Normal' },
  { speed: 'instant', name: 'Instant' },
];

/** A small panel under the settings icon (design.md decision 7). Just the sowing speed. */
export function SettingsPopover({ speed, onSpeed, onClose }: SettingsPopoverProps) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Focus the current choice when it opens.
    panel.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus();

    // Close on a click anywhere outside it (the settings button handles its own clicks).
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panel.current?.contains(target) && !(target instanceof Element && target.closest('.settings-button'))) {
        onClose();
      }
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [onClose]);

  return (
    <div
      ref={panel}
      role="dialog"
      aria-label="Settings"
      className="popover"
      onKeyDown={(event) => event.key === 'Escape' && onClose()}
    >
      <span className="small-label" id="speed-label">
        Sowing speed
      </span>
      <div role="group" aria-labelledby="speed-label" className="choices">
        {SPEEDS.map((option) => (
          <button
            key={option.speed}
            type="button"
            className="choice"
            aria-pressed={speed === option.speed}
            onClick={() => onSpeed(option.speed)}
          >
            {option.name}
          </button>
        ))}
      </div>
      <span className="popover-note">Instant skips the seed-by-seed animation.</span>
    </div>
  );
}
