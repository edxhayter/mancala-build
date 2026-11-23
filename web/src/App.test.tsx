import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from './App';
import type { BoardSnapshot } from './engine';
import { initialState, type GameState } from './game/reducer';
import type { Settings } from './game/settings';

const hotseat: Settings = { opponent: 'local', level: 'medium', playerFirst: true };

/** A hotseat game at `board`, South to move. */
const hotseatAt = (board: BoardSnapshot): GameState => ({ ...initialState(1), settings: hotseat, board });

const status = () => screen.getByRole('status');
const pit = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name},`) });

async function startHotseat() {
  await userEvent.click(screen.getByRole('button', { name: 'New game' }));
  await userEvent.click(screen.getByRole('button', { name: /Two players/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Start game' }));
}

describe('App', () => {
  // Scenario: Ready on first visit
  it('opens ready to play: you as South, first, against the AI at medium', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Mancala' })).toBeInTheDocument();
    expect(screen.getByText(/You vs/)).toHaveTextContent('You vs AI · Medium');
    expect(status()).toHaveTextContent('Your move');
    for (let n = 1; n <= 6; n++) {
      expect(pit(`South pit ${n}`)).toHaveAttribute('aria-disabled', 'false');
    }
    expect(screen.getByRole('img', { name: 'South store, 0 seeds' })).toBeInTheDocument();
  });

  // Scenario: Choosing a different game
  it('New game → Two players → Start: a hotseat game from the start', async () => {
    render(<App />);
    await userEvent.click(pit('South pit 1')); // the old game has a move in it
    await startHotseat();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('Two players')).toBeInTheDocument();
    expect(status()).toHaveTextContent('South to move');
    expect(pit('South pit 1')).toHaveAccessibleName('South pit 1, 4 seeds');
  });

  it('the sheet shows the computer options only for Computer, and Cancel changes nothing', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'New game' }));
    const sheet = screen.getByRole('dialog', { name: 'New game' });
    expect(within(sheet).getByRole('button', { name: /Computer/ })).toHaveAttribute('aria-pressed', 'true');
    expect(within(sheet).getByRole('button', { name: 'Medium' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(sheet).getByRole('button', { name: 'First' })).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(within(sheet).getByRole('button', { name: /Two players/ }));
    expect(within(sheet).queryByRole('button', { name: 'Medium' })).toBeNull();

    await userEvent.click(within(sheet).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText(/You vs/)).toHaveTextContent('You vs AI · Medium');
    expect(screen.getByRole('button', { name: 'New game' })).toHaveFocus();
  });

  it('Escape closes the sheet', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'New game' }));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('choosing Hard and Second starts a game where the computer moves first', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'New game' }));
    await userEvent.click(screen.getByRole('button', { name: 'Hard' }));
    await userEvent.click(screen.getByRole('button', { name: 'Second' }));
    await userEvent.click(screen.getByRole('button', { name: 'Start game' }));
    expect(screen.getByText(/You vs/)).toHaveTextContent('You vs AI · Hard');
    expect(status()).toHaveTextContent('AI is thinking…');
    // You play North, so North is along the bottom, and nothing is playable yet.
    expect(pit('North pit 1')).toHaveAttribute('aria-disabled', 'true');
  });

  // Scenario: Modes that are not available yet
  it('Online and Puzzles are listed as coming later and cannot be chosen', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'New game' }));
    for (const name of [/Online/, /Puzzles/]) {
      const mode = screen.getByRole('button', { name });
      expect(mode).toBeDisabled();
      expect(mode).toHaveTextContent('coming later');
    }
  });

  // Scenario: Playing a pit (hotseat, animation off)
  // Scenario: Extra turn is reported
  it('clicking South pit 3 plays it: the board follows the rules, and the extra turn is announced', async () => {
    render(<App />);
    await startHotseat();
    await userEvent.click(pit('South pit 3'));
    expect(pit('South pit 3')).toHaveAccessibleName('South pit 3, 0 seeds');
    expect(pit('South pit 4')).toHaveAccessibleName('South pit 4, 5 seeds');
    expect(pit('South pit 6')).toHaveAccessibleName('South pit 6, 5 seeds');
    expect(screen.getByRole('img', { name: 'South store, 1 seed' })).toBeInTheDocument();
    expect(within(status()).getByText('South gets another turn.')).toBeInTheDocument();
    expect(status()).toHaveTextContent('South to move');
  });

  // Scenario: Hotseat turns to the player to move
  it('in hotseat, the board turns to North after South passes the turn', async () => {
    render(<App />);
    await startHotseat();
    await userEvent.click(pit('South pit 1'));
    expect(status()).toHaveTextContent('North to move');
    expect(pit('North pit 1')).toHaveAttribute('aria-disabled', 'false');
    expect(screen.queryByRole('button', { name: /South/ })).toBeNull();
  });

  // Scenario: A capture is reported (kalah-rules "South captures")
  it('a capture is announced', async () => {
    render(
      <App
        start={hotseatAt({
          pits: { south: [1, 0, 0, 2, 0, 0], north: [1, 1, 1, 1, 5, 1] },
          stores: { south: 0, north: 0 },
          toMove: 'south',
          status: { kind: 'playing' },
        })}
      />,
    );
    await userEvent.click(pit('South pit 1'));
    expect(within(status()).getByText('South captured 6 seeds.')).toBeInTheDocument();
  });

  // Scenario: A finished game
  it('the last move ends the game: scores, the winner, no pits, and a new game on offer', async () => {
    render(
      <App
        start={hotseatAt({
          pits: { south: [0, 0, 0, 0, 0, 1], north: [0, 0, 0, 0, 0, 4] },
          stores: { south: 25, north: 18 },
          toMove: 'south',
          status: { kind: 'playing' },
        })}
      />,
    );
    await userEvent.click(pit('South pit 6'));
    expect(status()).toHaveTextContent('South wins!');
    expect(status()).toHaveTextContent('South 26');
    expect(status()).toHaveTextContent('North 22');
    for (const button of screen.getAllByRole('button', { name: /pit/ })) {
      expect(button).toHaveAttribute('aria-disabled', 'true');
    }

    await userEvent.click(screen.getByRole('button', { name: 'Play again' }));
    expect(status()).toHaveTextContent('South to move');
    expect(screen.getByRole('img', { name: 'South store, 0 seeds' })).toBeInTheDocument();
  });
});
