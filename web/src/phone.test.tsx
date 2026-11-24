import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { silentAi } from './test/ai';
import { geometry } from './board/geometry';
import { initialState } from './game/reducer';
import { desktop, mockMedia, sideways, upright } from './test/media';
import { newBoard } from './engine';
import { manualPuzzles } from './test/puzzles';

const hotseat = { ...initialState(1), settings: { opponent: 'local', level: 'medium', playerFirst: true } } as const;

afterEach(() => {
  // @ts-expect-error: remove the mock so other test files start without one
  delete window.matchMedia;
});

const board = () => screen.queryByRole('group', { name: 'Board' });

describe('on a phone', () => {
  // Scenario: Phone held upright
  it('held upright: asks to turn sideways, and shows no playable board', () => {
    mockMedia(upright);
    render(<App ai={silentAi} />);
    expect(screen.getByText('Turn your phone sideways to play')).toBeInTheDocument();
    expect(board()).toBeNull(); // the small picture of a board is hidden from assistive tech
    expect(screen.queryAllByRole('button', { name: /pit/ })).toHaveLength(0);
  });

  // Scenario: Phone held sideways
  it('turned sideways: the board appears with the game exactly where it was', async () => {
    const media = mockMedia(sideways);
    render(<App ai={silentAi} start={hotseat} />);
    await userEvent.click(screen.getByRole('button', { name: /^South pit 3,/ }));
    expect(screen.getByRole('status')).toHaveTextContent('South gets another turn.');

    media.set(upright);
    expect(board()).toBeNull();
    expect(screen.getByText('Turn your phone sideways to play')).toBeInTheDocument();

    media.set(sideways);
    expect(screen.getByRole('button', { name: /^South pit 3,/ })).toHaveAccessibleName('South pit 3, 0 seeds');
    expect(screen.getByRole('img', { name: 'South store, 1 seed' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('South to move');
  });

  it('sideways: the board is drawn with 76 px cups, and the status sits in the header', () => {
    mockMedia(sideways);
    render(<App ai={silentAi} />);
    const { width, height } = geometry(76);
    expect(board()).toHaveAttribute('viewBox', `0 0 ${width.toFixed(1)} ${height.toFixed(1)}`);
    expect(screen.getByRole('banner')).toContainElement(screen.getByRole('status'));
  });

  it('on a larger screen: 100 px cups, and the status under the board', () => {
    mockMedia(desktop);
    render(<App ai={silentAi} />);
    const { width } = geometry(100);
    expect(board()?.getAttribute('viewBox')).toContain(width.toFixed(1));
    expect(screen.getByRole('banner')).not.toContainElement(screen.getByRole('status'));
  });

  it('works without matchMedia at all (treated as a larger screen)', () => {
    render(<App ai={silentAi} />);
    expect(board()).not.toBeNull();
  });

  // add-puzzles design.md decision 7: puzzles on a sideways phone
  it('sideways with puzzles: the puzzle status and both actions sit in the slim header', async () => {
    mockMedia(sideways);
    const puzzles = manualPuzzles();
    render(<App ai={silentAi} puzzles={puzzles.client} />);
    await userEvent.click(screen.getByRole('button', { name: 'New game' }));
    await userEvent.click(screen.getByRole('button', { name: /Puzzles/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Start game' }));
    puzzles.requests[0].answer({ seed: 1, board: newBoard(), answer: 2 });

    const header = await screen.findByRole('banner');
    await screen.findByText('Find the best move');
    expect(header).toContainElement(screen.getByRole('status'));
    expect(header).toContainElement(screen.getByRole('button', { name: 'Show the answer' }));
    expect(header).toContainElement(screen.getByRole('button', { name: 'Next puzzle' }));
    expect(header.querySelector('.puzzle-title')).toHaveTextContent('Puzzle · Find the best move');
    expect(header).toHaveTextContent('Solved 0 of 0');
  });
});
