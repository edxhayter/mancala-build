import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from './App';
import { newPuzzle, type PuzzleSnapshot } from './engine';
import { silentAi } from './test/ai';
import { manualAnalysis } from './test/analysis';

// A real puzzle, with real lines. Seed 11's lines run on for several moves.
const PUZZLE: PuzzleSnapshot = newPuzzle(11);
const SIDE = PUZZLE.board.toMove === 'south' ? 'South' : 'North';
const shown = (pit: number) => pit + 1;
/** A pit other than the answer whose line is at least 3 moves long. */
const LONG = PUZZLE.explanation.find((e) => e.pit !== PUZZLE.answer && e.line.length >= 3)!;

const status = () => screen.getByRole('status');
const pit = (n: number) => screen.getByRole('button', { name: new RegExp(`^${SIDE} pit ${n},`) });

/** The page with PUZZLE showing. */
async function showingPuzzle() {
  const analysis = manualAnalysis();
  render(<App ai={silentAi} analysis={analysis.client} />);
  await userEvent.click(screen.getByRole('button', { name: 'New game' }));
  await userEvent.click(screen.getByRole('button', { name: /Puzzles/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Start game' }));
  analysis.requests[0].answer(PUZZLE);
  await waitFor(() => expect(status()).toHaveTextContent('Find the best move'));
  return analysis;
}

async function solveAndOpenWhy() {
  await showingPuzzle();
  await userEvent.click(pit(shown(PUZZLE.answer)));
  await waitFor(() => expect(status()).toHaveTextContent('Solved!'));
  await userEvent.click(screen.getByRole('button', { name: 'Why?' }));
  return screen.getByRole('dialog', { name: 'Why?' });
}

describe('explaining a finished puzzle', () => {
  // Scenario: No explanation while solving
  it('Why? is not offered while the puzzle is being solved, even after a wrong pit', async () => {
    await showingPuzzle();
    expect(screen.queryByRole('button', { name: 'Why?' })).toBeNull();
    const wrong = PUZZLE.explanation.find((e) => e.pit !== PUZZLE.answer)!.pit;
    await userEvent.click(pit(shown(wrong)));
    expect(status()).toHaveTextContent('Not that one');
    expect(screen.queryByRole('button', { name: 'Why?' })).toBeNull();
  });

  // Scenario: Why after solving
  // Scenario: Best first, in words
  it('after solving, Why? lists every pit best first, the answer starred, in words', async () => {
    const dialog = await solveAndOpenWhy();
    const items = within(dialog).getAllByRole('listitem');
    expect(items).toHaveLength(PUZZLE.explanation.length);
    expect(items[0]).toHaveTextContent(`Pit ${shown(PUZZLE.answer)}`);
    expect(within(items[0]).getByLabelText('best move')).toBeInTheDocument();
    expect(within(items[1]).queryByLabelText('best move')).toBeNull(); // the answer is clearly best
    for (const item of items) {
      expect(item).toHaveTextContent(/after best play (you (win|lose) the game by \d+ seeds?|a draw|level|you're \d+ seeds? (ahead|behind))/);
    }
  });

  // Scenario: Stepping through a line
  it('Show why replays a line one move at a time', async () => {
    const dialog = await solveAndOpenWhy();
    await userEvent.click(within(dialog).getByRole('button', { name: `Show why: pit ${shown(LONG.pit)}` }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(status()).toHaveTextContent(`Why pit ${shown(LONG.pit)}`);
    expect(status()).toHaveTextContent(new RegExp(`^Why pit \\d+You play pit ${shown(LONG.pit)}`));

    await userEvent.click(screen.getByRole('button', { name: 'Next move' }));
    expect(status()).toHaveTextContent(/(Opponent plays|You play) pit \d/);

    for (let step = 2; step < LONG.line.length; step++) {
      await userEvent.click(screen.getByRole('button', { name: 'Next move' }));
    }
    expect(screen.queryByRole('button', { name: 'Next move' })).toBeNull();
    expect(status()).toHaveTextContent('After best play');
  });

  // Scenario: Back from a replay
  it('Back shows the list again, with the puzzle position on the board', async () => {
    const dialog = await solveAndOpenWhy();
    await userEvent.click(within(dialog).getByRole('button', { name: `Show why: pit ${shown(LONG.pit)}` }));
    await userEvent.click(screen.getByRole('button', { name: 'Next move' }));
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('dialog', { name: 'Why?' })).toBeInTheDocument();
    const seeds = PUZZLE.board.pits[PUZZLE.board.toMove];
    seeds.forEach((count, i) => {
      expect(pit(i + 1)).toHaveAccessibleName(`${SIDE} pit ${i + 1}, ${count} ${count === 1 ? 'seed' : 'seeds'}`);
    });
  });

  it('closing returns to the finished puzzle, with focus on Why?, and Next puzzle still works', async () => {
    const dialog = await solveAndOpenWhy();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Back to the puzzle' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(status()).toHaveTextContent('Solved!');
    expect(screen.getByRole('button', { name: 'Why?' })).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: 'Next puzzle' }));
    expect(screen.queryByRole('button', { name: 'Why?' })).toBeNull();
  });

  it('Escape closes the explainer', async () => {
    await solveAndOpenWhy();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
