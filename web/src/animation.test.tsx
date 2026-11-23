import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { initialState } from './game/reducer';
import { silentAi } from './test/ai';
import { mockMedia } from './test/media';

const hotseat = { ...initialState(1), settings: { opponent: 'local', level: 'medium', playerFirst: true } } as const;

const NORMAL = 180;
const SLOW = 400;

const label = (pattern: RegExp) =>
  Array.from(document.querySelectorAll('[aria-label]'), (el) => el.getAttribute('aria-label') ?? '').find((name) =>
    pattern.test(name),
  );
const southPits = () => [1, 2, 3, 4, 5, 6].map((n) => Number(label(new RegExp(`^South pit ${n},`))?.match(/(\d+) seeds?$/)?.[1]));
const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms));

// fireEvent rather than userEvent here: userEvent (through Testing Library)
// waits on a real setTimeout after each action, which never fires while the
// clock is fake. fireEvent dispatches the event at once, with no waiting.
const user = {
  click: async (element: Element) => {
    fireEvent.pointerDown(element);
    fireEvent.click(element);
  },
  escape: async () => fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' }),
};

beforeEach(() => {
  // Fake only the timers the animation uses. Faking everything (the default)
  // also fakes queueMicrotask, which userEvent relies on, and clicks never finish.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
});
afterEach(() => {
  vi.useRealTimers();
  // @ts-expect-error: remove any matchMedia mock
  delete window.matchMedia;
});

describe('the sowing animation', () => {
  // Scenario: Seeds travel pit to pit
  it('pit 1 empties, then pits 2-5 gain a seed one after another; then the turn passes', async () => {
    localStorage.setItem('mancala.speed', 'normal');
    render(<App ai={silentAi} start={hotseat} />);
    await user.click(screen.getByRole('button', { name: /^South pit 1,/ }));

    expect(southPits()).toEqual([0, 4, 4, 4, 4, 4]); // lifted
    // While seeds are moving, nothing can be played.
    for (const pit of screen.getAllByRole('button', { name: /pit/ })) {
      expect(pit).toHaveAttribute('aria-disabled', 'true');
    }
    await wait(NORMAL);
    expect(southPits()).toEqual([0, 5, 4, 4, 4, 4]);
    await wait(NORMAL);
    expect(southPits()).toEqual([0, 5, 5, 4, 4, 4]);
    await wait(NORMAL);
    expect(southPits()).toEqual([0, 5, 5, 5, 4, 4]);
    await wait(NORMAL);
    expect(southPits()).toEqual([0, 5, 5, 5, 5, 4]);
    // Still South's view until the last step has been seen.
    expect(screen.getByRole('status')).toHaveTextContent('South to move');

    await wait(NORMAL);
    expect(screen.getByRole('status')).toHaveTextContent('North to move');
    expect(screen.getByRole('button', { name: /^North pit 1,/ })).toHaveAttribute('aria-disabled', 'false');
  });

  it('the cup receiving a seed glows, and the seed is drawn travelling to it', async () => {
    localStorage.setItem('mancala.speed', 'normal');
    const { container } = render(<App ai={silentAi} start={hotseat} />);
    await user.click(screen.getByRole('button', { name: /^South pit 1,/ }));
    await wait(NORMAL);
    const pit2 = screen.getByRole('button', { name: /^South pit 2,/ });
    expect(pit2.querySelector('.receiving')).not.toBeNull();
    expect(container.querySelectorAll('.arriving [data-seed]')).toHaveLength(1);
    // The travelling seed isn't also drawn in the cup: 4 there + 1 arriving.
    expect(pit2.querySelectorAll('[data-seed]')).toHaveLength(4);
  });

  // Scenario: Choosing the speed
  it('instant shows the result at once; slow takes longer per seed than normal', async () => {
    localStorage.setItem('mancala.speed', 'normal');
    render(<App ai={silentAi} start={hotseat} />);

    await user.click(screen.getByRole('button', { name: 'Settings' }));
    const settings = screen.getByRole('dialog', { name: 'Settings' });
    expect(screen.getByRole('button', { name: 'Normal' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Instant' }));
    expect(screen.getByRole('button', { name: 'Instant' })).toHaveAttribute('aria-pressed', 'true');
    expect(settings).toHaveTextContent('Instant skips the seed-by-seed animation.');
    await user.escape();
    expect(screen.queryByRole('dialog')).toBeNull();

    await user.click(screen.getByRole('button', { name: /^South pit 3,/ })); // extra turn
    expect(southPits()).toEqual([4, 4, 0, 5, 5, 5]);

    await user.click(screen.getByRole('button', { name: 'Settings' }));
    await user.click(screen.getByRole('button', { name: 'Slow' }));
    await user.click(screen.getByRole('button', { name: 'Settings' })); // close it
    await user.click(screen.getByRole('button', { name: /^South pit 1,/ }));
    expect(southPits()).toEqual([0, 4, 0, 5, 5, 5]);
    await wait(NORMAL);
    expect(southPits()).toEqual([0, 4, 0, 5, 5, 5]); // at slow speed, not there yet
    await wait(SLOW - NORMAL);
    expect(southPits()).toEqual([0, 5, 0, 5, 5, 5]);
  });

  // Scenario: Speed is remembered
  it('the chosen speed is still chosen next time the page opens', async () => {
    const { unmount } = render(<App ai={silentAi} start={hotseat} />);
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    await user.click(screen.getByRole('button', { name: 'Slow' }));
    unmount();
    expect(localStorage.getItem('mancala.speed')).toBe('slow');

    render(<App ai={silentAi} start={hotseat} />);
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.getByRole('button', { name: 'Slow' })).toHaveAttribute('aria-pressed', 'true');
  });

  // Scenario: Reduced motion
  it('with reduced motion, the board changes straight to the new position', async () => {
    localStorage.setItem('mancala.speed', 'slow');
    mockMedia((query) => query.includes('reduce'));
    render(<App ai={silentAi} start={hotseat} />);
    await user.click(screen.getByRole('button', { name: /^South pit 1,/ }));
    expect(screen.getByRole('status')).toHaveTextContent('North to move');
  });

  it('the settings pop-over closes on a click elsewhere, and focus returns to its button', async () => {
    render(<App ai={silentAi} start={hotseat} />);
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.getByRole('button', { name: 'Settings' })).toHaveAttribute('aria-expanded', 'true');
    await user.click(screen.getByRole('heading', { name: 'Mancala' }));
    expect(screen.queryByRole('dialog', { name: 'Settings' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Settings' })).toHaveFocus();
  });
});
