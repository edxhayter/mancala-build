import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { silentAi } from './test/ai';
import { geometry } from './board/geometry';
import { initialState } from './game/reducer';
import { desktop, mockMedia, sideways, upright } from './test/media';
import { explainMoves, newBoard } from './engine';
import { fakePuzzle, manualAnalysis } from './test/analysis';
import { createNetwork } from './test/network';
import { clearAddress, enterRoom, openTab, pitIn } from './test/tabs';

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
    const puzzles = manualAnalysis();
    render(<App ai={silentAi} analysis={puzzles.client} />);
    await userEvent.click(screen.getByRole('button', { name: 'New game' }));
    await userEvent.click(screen.getByRole('button', { name: /Puzzles/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Start game' }));
    puzzles.requests[0].answer(fakePuzzle(1, newBoard(), 2));

    const header = await screen.findByRole('banner');
    await screen.findByText('Find the best move');
    expect(header).toContainElement(screen.getByRole('status'));
    expect(header).toContainElement(screen.getByRole('button', { name: 'Show the answer' }));
    expect(header).toContainElement(screen.getByRole('button', { name: 'Next puzzle' }));
    expect(header.querySelector('.puzzle-title')).toHaveTextContent('Puzzle · Find the best move');
    expect(header).toHaveTextContent('Solved 0 of 0');
  });

  // add-move-explainer design.md decision 7: the replay bar on a sideways phone
  it('sideways: a replay of a line puts its bar in the slim header', async () => {
    mockMedia(sideways);
    const analysis = manualAnalysis();
    render(<App ai={silentAi} analysis={analysis.client} start={initialState(5)} />);
    await userEvent.click(screen.getByRole('button', { name: 'Analyze' }));
    analysis.explains[0].answer(explainMoves(analysis.explains[0].board));
    await userEvent.click(await screen.findByRole('button', { name: 'Show why: pit 1' }));

    const header = screen.getByRole('banner');
    expect(header).toContainElement(screen.getByRole('status'));
    expect(screen.getByRole('status')).toHaveTextContent('Why pit 1');
    expect(header).toContainElement(screen.getByRole('button', { name: 'Next move' }));
    expect(header).toContainElement(screen.getByRole('button', { name: 'Back' }));
  });
});

describe('online on a sideways phone', () => {
  it('the online status sits in the header, and the room name is the chat title', async () => {
    mockMedia(sideways);
    localStorage.removeItem('mancala.name');
    const net = createNetwork();
    const ed = openTab(net);
    await enterRoom(ed, 'Ed', 'Friday Rematch');
    const sam = openTab(net);
    await enterRoom(sam, 'Sam', 'friday rematch');

    const header = ed.view.container.querySelector('header')!;
    expect(within(header).getByRole('status')).toHaveTextContent('Your turn');
    // The room name stays in the header for screen readers (hidden on screen by CSS)...
    expect(within(header).getByText('Friday Rematch')).toHaveClass('room-title');
    // ...and titles the chat.
    await userEvent.click(ed.ui.getByRole('button', { name: /^Chat/ }));
    expect(ed.ui.getByRole('region', { name: /^Chat ·\s*Friday Rematch$/ })).toBeInTheDocument();
    clearAddress();
  });

  // Scenario: Opening the chat on a phone
  it('the chat opens over the board and closes with one tap, leaving the board as it was', async () => {
    mockMedia(sideways);
    localStorage.removeItem('mancala.name');
    const net = createNetwork();
    const ed = openTab(net);
    await enterRoom(ed, 'Ed', 'friday rematch');
    const sam = openTab(net);
    await enterRoom(sam, 'Sam', 'friday rematch');
    const before = ed.ui.getAllByRole('button', { name: /^South pit/ }).map((p: HTMLElement) => p.getAttribute('aria-label'));

    await userEvent.click(ed.ui.getByRole('button', { name: /^Chat/ }));
    const panel = ed.ui.getByRole('region', { name: /Chat/ });
    expect(panel).toHaveClass('chat-panel'); // .page.phone .chat-panel covers the board
    expect(ed.view.container.querySelector('.page.phone')).toContainElement(panel);
    await userEvent.click(within(panel).getByRole('button', { name: 'Close chat' }));

    expect(ed.ui.queryByRole('region', { name: /Chat/ })).toBeNull();
    const after = ed.ui.getAllByRole('button', { name: /^South pit/ }).map((p: HTMLElement) => p.getAttribute('aria-label'));
    expect(after).toEqual(before);
    expect(pitIn(ed, 'South pit 1')).toHaveAttribute('aria-disabled', 'false');
    clearAddress();
  });
});
