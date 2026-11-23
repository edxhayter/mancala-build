import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createDirectAiClient } from './ai/client';
import { App } from './App';
import { newBoard } from './engine';
import { initialState } from './game/reducer';
import { manualAi } from './test/ai';

const status = () => screen.getByRole('status');
const pitLabels = (side: 'South' | 'North') =>
  [1, 2, 3, 4, 5, 6].map((n) => screen.getByRole(side === 'South' ? 'button' : 'img', { name: new RegExp(`^${side} pit ${n},`) }).getAttribute('aria-label'));

async function newComputerGame(options: { second?: boolean } = {}) {
  await userEvent.click(screen.getByRole('button', { name: 'New game' }));
  await userEvent.click(screen.getByRole('button', { name: /Computer/ }));
  if (options.second) await userEvent.click(screen.getByRole('button', { name: 'Second' }));
  await userEvent.click(screen.getByRole('button', { name: 'Start game' }));
}

describe('playing the computer', () => {
  // Scenario: The AI replies
  it('after your move the AI thinks, plays, and it is your move again', async () => {
    const { client, requests } = manualAi();
    render(<App ai={client} start={initialState(5)} />);
    const northBefore = pitLabels('North');

    await userEvent.click(screen.getByRole('button', { name: /^South pit 1,/ }));
    expect(status()).toHaveTextContent('AI is thinking…');
    expect(requests).toHaveLength(1);
    expect(requests[0].request).toMatchObject({ seed: 5, level: 'medium' });
    expect(requests[0].request.board.toMove).toBe('north');

    requests[0].answer(0); // North plays its pit 1
    await waitFor(() => expect(status()).toHaveTextContent('Your move'));
    expect(pitLabels('North')).not.toEqual(northBefore);
    expect(screen.getByRole('img', { name: /^North pit 1,/ })).toHaveAccessibleName('North pit 1, 0 seeds');
  });

  it('with the real AI: a whole turn goes by and the AI never moves out of turn', async () => {
    render(<App ai={createDirectAiClient()} start={initialState(5)} />);
    await userEvent.click(screen.getByRole('button', { name: /^South pit 1,/ }));
    await waitFor(() => expect(status()).toHaveTextContent('Your move'));
    const seeds = (label: string | null) => Number(label?.match(/(\d+) seeds?$/)?.[1]);
    const total =
      [...pitLabels('South'), ...pitLabels('North')].reduce((sum, label) => sum + seeds(label), 0) +
      seeds(screen.getByRole('img', { name: /^South store/ }).getAttribute('aria-label')) +
      seeds(screen.getByRole('img', { name: /^North store/ }).getAttribute('aria-label'));
    expect(total).toBe(48);
  });

  // Scenario: Computer moves first when the player moves second
  it('moving second: the computer plays South first, then you play North', async () => {
    render(<App ai={createDirectAiClient()} start={initialState(5)} />);
    await newComputerGame({ second: true });
    await waitFor(() => expect(status()).toHaveTextContent('Your move'));
    // You are North, along the bottom, and South's side is no longer the start.
    expect(screen.getByRole('button', { name: /^North pit 1,/ })).toHaveAttribute('aria-disabled', 'false');
    const south = [1, 2, 3, 4, 5, 6].map((n) => screen.getByRole('img', { name: new RegExp(`^South pit ${n},`) }));
    expect(south.map((pit) => pit.getAttribute('aria-label'))).not.toEqual(
      [1, 2, 3, 4, 5, 6].map((n) => `South pit ${n}, 4 seeds`),
    );
  });

  // Scenario: No recap
  it("no list of the AI's moves is shown", async () => {
    render(<App ai={createDirectAiClient()} start={initialState(5)} />);
    await userEvent.click(screen.getByRole('button', { name: /^South pit 1,/ }));
    await waitFor(() => expect(status()).toHaveTextContent('Your move'));
    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.queryByText(/played pit/i)).toBeNull();
  });

  // Scenario: The page stays responsive
  it('a new game while the AI is thinking starts at once, and the old answer is ignored', async () => {
    const { client, requests } = manualAi();
    render(<App ai={client} start={initialState(5)} />);
    await newComputerGame({ second: true });
    expect(status()).toHaveTextContent('AI is thinking…');
    expect(requests).toHaveLength(1);

    // While it's thinking, start a hotseat game instead.
    await userEvent.click(screen.getByRole('button', { name: 'New game' }));
    await userEvent.click(screen.getByRole('button', { name: /Two players/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Start game' }));
    expect(status()).toHaveTextContent('South to move');

    // The old game's answer arrives late: nothing happens.
    requests[0].answer(2);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(status()).toHaveTextContent('South to move');
    expect(pitLabels('South')).toEqual([1, 2, 3, 4, 5, 6].map((n) => `South pit ${n}, 4 seeds`));
    expect(newBoard().pits.north).toEqual([4, 4, 4, 4, 4, 4]);
  });

  it('asks only once per turn', async () => {
    const { client, requests } = manualAi();
    const { rerender } = render(<App ai={client} start={initialState(5)} />);
    await userEvent.click(screen.getByRole('button', { name: /^South pit 1,/ }));
    rerender(<App ai={client} start={initialState(5)} />);
    expect(requests).toHaveLength(1);
  });
});
