import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from './App';
import { newBoard, play, type PuzzleSnapshot } from './engine';
import { REDUCED_MOTION } from './hooks/useMediaQuery';
import { silentAi } from './test/ai';
import { mockMedia } from './test/media';
import { fakePuzzle, manualAnalysis } from './test/analysis';

// A made-up puzzle from the start: South to move, the answer is pit 3 on screen
// (index 2), which ends in South's store for an extra turn.
const PUZZLE: PuzzleSnapshot = fakePuzzle(1, newBoard(), 2);
// A second one, North to move after South's pit 1.
const NORTH_PUZZLE: PuzzleSnapshot = fakePuzzle(2, play(newBoard(), 0).board, 5);

const status = () => screen.getByRole('status');
const pit = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name},`) });
const header = () => screen.getByRole('banner');

/** Opens the New game sheet, chooses Puzzles, and starts. */
async function choosePuzzles() {
  await userEvent.click(screen.getByRole('button', { name: 'New game' }));
  await userEvent.click(screen.getByRole('button', { name: /Puzzles/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Start game' }));
}

/** The page with puzzles that arrive when the test says, already showing `first`. */
async function showingPuzzle(first: PuzzleSnapshot = PUZZLE) {
  const puzzles = manualAnalysis();
  render(<App ai={silentAi} analysis={puzzles.client} />);
  await choosePuzzles();
  puzzles.requests[0].answer(first);
  await waitFor(() => expect(status()).toHaveTextContent('Find the best move'));
  return puzzles;
}

describe('puzzles', () => {
  // Scenario: Puzzles can be chosen
  it('Puzzles can be chosen, and hides the computer choices', async () => {
    render(<App ai={silentAi} analysis={manualAnalysis().client} />);
    await userEvent.click(screen.getByRole('button', { name: 'New game' }));
    const card = screen.getByRole('button', { name: /Puzzles/ });
    expect(card).toBeEnabled();
    await userEvent.click(card);
    expect(card).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('group', { name: 'Computer level' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'You play' })).toBeNull();
  });

  // Scenario: Preparing a puzzle
  it('says it is preparing, and nothing can be played', async () => {
    render(<App ai={silentAi} analysis={manualAnalysis().client} />);
    await choosePuzzles();
    expect(status()).toHaveTextContent('Preparing a puzzle…');
    for (const n of [1, 2, 3, 4, 5, 6]) {
      expect(pit(`South pit ${n}`)).toHaveAttribute('aria-disabled', 'true');
    }
  });

  // Scenario: Choosing puzzles
  it('shows the puzzle from the mover’s side, with 3 tries', async () => {
    await showingPuzzle(NORTH_PUZZLE);
    expect(header().querySelector('.puzzle-title')).toHaveTextContent('Puzzle · Find the best move');
    expect(status()).toHaveTextContent('3 tries');
    // North is to move, so North's pits are the buttons along the bottom, labelled "You".
    expect(pit('North pit 6')).toHaveAttribute('aria-disabled', 'false');
    expect(screen.getByText('You')).toBeInTheDocument();
    expect(screen.getByText('Opponent')).toBeInTheDocument();
  });

  // Scenario: The right move
  it('the right move is sown and the puzzle is solved', async () => {
    await showingPuzzle();
    await userEvent.click(pit('South pit 3'));
    await waitFor(() => expect(status()).toHaveTextContent('Solved!'));
    expect(status()).toHaveTextContent('You get another turn.');
    expect(screen.getByRole('img', { name: /^South store/ })).toHaveAccessibleName(/1 seed/);
    expect(pit('South pit 1')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('button', { name: 'Next puzzle' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show the answer' })).toBeNull();
  });

  // Scenario: A wrong move
  it('a wrong move is marked and nothing moves', async () => {
    await showingPuzzle();
    await userEvent.click(pit('South pit 5'));
    expect(status()).toHaveTextContent('Not that one. Try again.');
    expect(status()).toHaveTextContent('2 tries left');
    expect(pit('South pit 5')).toHaveAccessibleName('South pit 5, 4 seeds');
    expect(pit('South pit 5')).toHaveAttribute('aria-disabled', 'true');
    expect(pit('South pit 5').querySelector('.mark-wrong')).not.toBeNull();
    expect(screen.getByRole('img', { name: /^South store/ })).toHaveAccessibleName(/0 seeds/);
  });

  // Scenario: Last try
  // Scenario: Out of tries
  it('after three wrong pits the answer is revealed', async () => {
    await showingPuzzle();
    await userEvent.click(pit('South pit 5'));
    await userEvent.click(pit('South pit 1'));
    expect(status()).toHaveTextContent('1 try left');
    await userEvent.click(pit('South pit 6'));
    await waitFor(() => expect(status()).toHaveTextContent('The best move was pit 3.'));
    expect(within(header()).getByText(/Solved 0 of 1/)).toBeInTheDocument();
  });

  // Scenario: Asking for the answer
  it('Show the answer glows the answer pit and sows it', async () => {
    await showingPuzzle();
    await userEvent.click(screen.getByRole('button', { name: 'Show the answer' }));
    await waitFor(() => expect(status()).toHaveTextContent('The best move was pit 3.'));
    expect(status()).toHaveTextContent('You get another turn.');
    expect(pit('South pit 3').querySelector('.mark-reveal')).not.toBeNull();
    expect(pit('South pit 1')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('button', { name: 'Next puzzle' })).toBeInTheDocument();
  });

  // Scenario: Reveal follows the animation setting
  it('with reduced motion, the answer lands at once and keeps its mark', async () => {
    localStorage.setItem('mancala.speed', 'normal');
    mockMedia((query) => query === REDUCED_MOTION);
    await showingPuzzle();
    await userEvent.click(screen.getByRole('button', { name: 'Show the answer' }));
    // No timers have run, yet the position after the answer is already shown.
    expect(screen.getByRole('img', { name: /^South store/ })).toHaveAccessibleName(/1 seed/);
    expect(pit('South pit 3').querySelector('.mark-reveal')).not.toBeNull();
    // @ts-expect-error: remove the mock so later tests start without one
    delete window.matchMedia;
  });

  // Scenario: Skipping a puzzle
  it('Next puzzle shows a fresh puzzle and counts the skipped one', async () => {
    const puzzles = await showingPuzzle();
    await userEvent.click(pit('South pit 5'));
    await userEvent.click(screen.getByRole('button', { name: 'Next puzzle' }));
    puzzles.requests[1].answer(NORTH_PUZZLE);
    await waitFor(() => expect(status()).toHaveTextContent('3 tries'));
    expect(screen.getByRole('button', { name: /^North pit 1,/ })).toBeInTheDocument();
    expect(document.querySelector('.mark-wrong')).toBeNull();
    expect(within(header()).getByText(/Solved 0 of 1/)).toBeInTheDocument();
  });

  // Scenario: Counting
  it('one solved and one revealed is "Solved 1 of 2"', async () => {
    const puzzles = await showingPuzzle();
    await userEvent.click(pit('South pit 3'));
    await waitFor(() => expect(status()).toHaveTextContent('Solved!'));
    await userEvent.click(screen.getByRole('button', { name: 'Next puzzle' }));
    puzzles.requests[1].answer(PUZZLE);
    await waitFor(() => expect(status()).toHaveTextContent('3 tries'));
    await userEvent.click(screen.getByRole('button', { name: 'Show the answer' }));
    await waitFor(() => expect(within(header()).getByText(/Solved 1 of 2/)).toBeInTheDocument());
  });

  // Scenario: A new visit starts from zero
  it('a fresh page starts the count at 0 of 0', async () => {
    render(<App ai={silentAi} analysis={manualAnalysis().client} />);
    await choosePuzzles();
    expect(within(header()).getByText(/Solved 0 of 0/)).toBeInTheDocument();
  });

  // Scenario: Leaving puzzles during preparation
  it('starting a game while a puzzle is prepared: the game starts, the puzzle is never shown', async () => {
    const puzzles = manualAnalysis();
    render(<App ai={silentAi} analysis={puzzles.client} />);
    await choosePuzzles();
    await userEvent.click(screen.getByRole('button', { name: 'New game' }));
    await userEvent.click(screen.getByRole('button', { name: /Computer/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Start game' }));
    expect(status()).toHaveTextContent('Your move');

    puzzles.requests[0].answer(PUZZLE);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(status()).toHaveTextContent('Your move');
    expect(screen.getByText(/You vs/)).toHaveTextContent('You vs AI · Medium');
    expect(screen.queryByText(/Puzzle ·/)).toBeNull();
  });

  // Scenario: Usable while preparing
  it('New game and Settings still respond while a puzzle is prepared', async () => {
    render(<App ai={silentAi} analysis={manualAnalysis().client} />);
    await choosePuzzles();
    await userEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.getByRole('button', { name: 'Settings' })).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Settings' }));
    await userEvent.click(screen.getByRole('button', { name: 'New game' }));
    expect(screen.getByRole('dialog', { name: 'New game' })).toBeInTheDocument();
  });

  // Scenario: The next puzzle is ready
  it('the next puzzle is prepared while one is shown, so Next puzzle is instant', async () => {
    const puzzles = await showingPuzzle();
    expect(puzzles.requests).toHaveLength(2); // the second was asked for straight away
    puzzles.requests[1].answer(NORTH_PUZZLE);
    await userEvent.click(screen.getByRole('button', { name: 'Next puzzle' }));
    await waitFor(() => expect(status()).toHaveTextContent('3 tries'));
    expect(screen.queryByText('Preparing a puzzle…')).toBeNull();
  });
});
