import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from './App';
import { explainMoves } from './engine';
import { initialState } from './game/reducer';
import { manualAi, silentAi } from './test/ai';
import { manualAnalysis } from './test/analysis';

const status = () => screen.getByRole('status');
const analyzeButton = () => screen.queryByRole('button', { name: 'Analyze' });
const southPits = () =>
  [1, 2, 3, 4, 5, 6].map((n) => screen.getByRole('button', { name: new RegExp(`^South pit ${n},`) }).getAttribute('aria-label'));

describe('analyzing a game against the computer', () => {
  // Scenario: Analyze on your turn
  it('Analyze shows "Analyzing…", then every pit; closing leaves the game exactly as it was', async () => {
    const analysis = manualAnalysis();
    render(<App ai={silentAi} analysis={analysis.client} start={initialState(5)} />);
    const before = southPits();

    await userEvent.click(analyzeButton()!);
    expect(status()).toHaveTextContent('Analyzing…');
    expect(analysis.explains).toHaveLength(1);
    const { board, answer } = analysis.explains[0];
    answer(explainMoves(board));

    const dialog = await screen.findByRole('dialog', { name: 'Analysis' });
    const items = within(dialog).getAllByRole('listitem');
    expect(items).toHaveLength(6);
    expect(within(items[0]).getByLabelText('best move')).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Back to the game' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(status()).toHaveTextContent('Your move');
    expect(southPits()).toEqual(before);
    expect(analyzeButton()).toHaveFocus();
  });

  it('Show why in a game names the computer "AI"', async () => {
    const analysis = manualAnalysis();
    render(<App ai={silentAi} analysis={analysis.client} start={initialState(5)} />);
    await userEvent.click(analyzeButton()!);
    analysis.explains[0].answer(explainMoves(analysis.explains[0].board));
    const dialog = await screen.findByRole('dialog', { name: 'Analysis' });
    // Pit 1 from the start doesn't end in the store, so its line goes on to the AI's reply.
    await userEvent.click(within(dialog).getByRole('button', { name: 'Show why: pit 1' }));
    await userEvent.click(screen.getByRole('button', { name: 'Next move' }));
    expect(status()).toHaveTextContent(/AI plays pit \d/);
  });

  // Scenario: Not on the computer's turn
  it('Analyze is not offered while the computer is thinking', async () => {
    const { client } = manualAi();
    render(<App ai={client} analysis={manualAnalysis().client} start={initialState(5)} />);
    await userEvent.click(screen.getByRole('button', { name: /^South pit 1,/ }));
    expect(status()).toHaveTextContent('AI is thinking…');
    expect(analyzeButton()).toBeNull();
  });

  // Scenario: Not in two-player games
  it('Analyze is not offered in a two-player game', async () => {
    render(<App ai={silentAi} analysis={manualAnalysis().client} />);
    await userEvent.click(screen.getByRole('button', { name: 'New game' }));
    await userEvent.click(screen.getByRole('button', { name: /Two players/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Start game' }));
    expect(status()).toHaveTextContent('South to move');
    expect(analyzeButton()).toBeNull();
  });

  // Scenario: A late analysis is ignored
  it('a new game while analyzing starts at once, and the analysis is never shown', async () => {
    const analysis = manualAnalysis();
    render(<App ai={silentAi} analysis={analysis.client} start={initialState(5)} />);
    await userEvent.click(analyzeButton()!);
    await userEvent.click(screen.getByRole('button', { name: 'New game' }));
    await userEvent.click(screen.getByRole('button', { name: /Two players/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Start game' }));
    expect(status()).toHaveTextContent('South to move');

    analysis.explains[0].answer(explainMoves(analysis.explains[0].board));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(status()).not.toHaveTextContent('Analyzing…');
  });

  it('playing a move while analyzing drops the analysis', async () => {
    const analysis = manualAnalysis();
    render(<App ai={silentAi} analysis={analysis.client} start={initialState(5)} />);
    await userEvent.click(analyzeButton()!);
    await userEvent.click(screen.getByRole('button', { name: /^South pit 1,/ }));
    await waitFor(() => expect(status()).toHaveTextContent('AI is thinking…'));

    analysis.explains[0].answer(explainMoves(analysis.explains[0].board));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
