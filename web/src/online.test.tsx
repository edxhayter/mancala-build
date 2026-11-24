// Online play through the page (add-online-play tasks 5.1 and 5.2).

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { newBoard, play, type BoardSnapshot } from './engine';
import { roomLink } from './online/rooms';
import { silentAi } from './test/ai';
import { createNetwork } from './test/network';
import { clearAddress, enterRoom, openTab, pitIn, settle, statusOf, type Tab } from './test/tabs';

beforeEach(() => {
  localStorage.removeItem('mancala.name');
  clearAddress();
});
afterEach(() => clearAddress());

async function openOnline() {
  render(<App ai={silentAi} online={{ connect: createNetwork().connect, storage: null, now: Date.now }} />);
  await userEvent.click(screen.getByRole('button', { name: 'New game' }));
  await userEvent.click(screen.getByRole('button', { name: /Online/ }));
  return screen.getByRole('dialog', { name: 'New game' });
}

describe('the New game sheet: Online', () => {
  // Scenario: Online can be chosen
  it('Online asks for your name and a room name, and hides the computer choices', async () => {
    const sheet = await openOnline();
    expect(within(sheet).getByRole('button', { name: /Online/ })).toHaveAttribute('aria-pressed', 'true');
    expect(within(sheet).getByLabelText('Your name')).toBeInTheDocument();
    expect(within(sheet).getByLabelText('Room name')).toBeInTheDocument();
    expect(within(sheet).queryByRole('button', { name: 'Medium' })).toBeNull();
    expect(within(sheet).queryByRole('button', { name: 'First' })).toBeNull();
    expect(sheet).toHaveTextContent('Anyone who types the same room name can join');
    expect(sheet).not.toHaveTextContent('network address');
  });

  // Scenario: A name is required
  it('a name is required', async () => {
    const sheet = await openOnline();
    await userEvent.type(within(sheet).getByLabelText('Room name'), 'friday rematch');
    const enter = within(sheet).getByRole('button', { name: 'Enter room' });
    expect(enter).toBeDisabled();
    await userEvent.type(within(sheet).getByLabelText('Your name'), '   ');
    expect(enter).toBeDisabled();
    await userEvent.type(within(sheet).getByLabelText('Your name'), 'Ed');
    expect(enter).toBeEnabled();
  });

  // Scenario: Names that aren't allowed
  it("a room name that isn't allowed shows the hint and can't be entered", async () => {
    const sheet = await openOnline();
    await userEvent.type(within(sheet).getByLabelText('Your name'), 'Ed');
    const room = within(sheet).getByLabelText('Room name');
    expect(room).toHaveAccessibleDescription(/3–30 letters, numbers, spaces or hyphens/);
    for (const bad of ['ab', 'ed/sam', '<b>hi']) {
      await userEvent.clear(room);
      await userEvent.type(room, bad);
      expect(room).toHaveAttribute('aria-invalid', 'true');
      expect(within(sheet).getByRole('button', { name: 'Enter room' })).toBeDisabled();
    }
    expect(room).toHaveAttribute('maxLength', '30');
  });

  it('remembers your name, but not the room name', async () => {
    const net = createNetwork();
    const ed = openTab(net);
    await enterRoom(ed, 'Ed', 'friday rematch');
    await userEvent.click(ed.ui.getByRole('button', { name: 'New game' }));
    await userEvent.click(ed.ui.getByRole('button', { name: /Online/ }));
    expect(ed.ui.getByLabelText('Your name')).toHaveValue('Ed');
    expect(ed.ui.getByLabelText('Room name')).toHaveValue('');
  });
});

describe('playing online', () => {
  // Scenario: Opening a new room
  it('entering an empty room waits for someone, with the room name and Copy link', async () => {
    const net = createNetwork();
    const ed = openTab(net);
    await enterRoom(ed, 'Ed', 'Friday Rematch');
    expect(statusOf(ed)).toHaveTextContent('Waiting for someone to join');
    expect(ed.ui.getByRole('button', { name: 'Copy link' })).toBeInTheDocument();
    expect(ed.ui.getByText('Friday Rematch')).toBeInTheDocument();
    expect(pitIn(ed, 'South pit 1')).toHaveAttribute('aria-disabled', 'true');
    expect(window.location.hash).toBe('#room=Friday%20Rematch');
  });

  it('Copy link copies the room link', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const net = createNetwork();
    const ed = openTab(net);
    await enterRoom(ed, 'Ed', 'friday rematch');
    await userEvent.click(ed.ui.getByRole('button', { name: 'Copy link' }));
    expect(writeText).toHaveBeenCalledWith(roomLink('friday rematch', window.location));
    expect(statusOf(ed)).toHaveTextContent('Link copied.');
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
  });

  // Scenario: Joining by typing the name
  // Scenario: A friend joins
  // Scenario: Your side and your turn
  it('a friend who types the same name (in any case) joins, and a game starts', async () => {
    const net = createNetwork();
    const ed = openTab(net);
    await enterRoom(ed, 'Ed', 'friday rematch');
    const sam = openTab(net);
    await enterRoom(sam, 'Sam', 'Friday REMATCH');

    expect(statusOf(ed)).toHaveTextContent('Your turn');
    expect(statusOf(sam)).toHaveTextContent("Ed's turn");
    expect(ed.ui.getByText('Ed vs Sam')).toBeInTheDocument();
    expect(sam.ui.getByText('Ed vs Sam')).toBeInTheDocument();
    // Each board from its own side: Ed (South) has South along the bottom and
    // can play; Sam (North) has North along the bottom and can't yet.
    expect(pitIn(ed, 'South pit 1')).toHaveAttribute('aria-disabled', 'false');
    expect(pitIn(sam, 'North pit 1')).toHaveAttribute('aria-disabled', 'true');
    expect(within(ed.ui.getByRole('group', { name: 'Board' })).getAllByRole('button')[0]).toHaveAccessibleName(/South pit 1/);
  });

  // Scenario: Waiting for the other player
  it("the other player's move arrives and is sown, then it's your turn", async () => {
    const net = createNetwork();
    const ed = openTab(net);
    await enterRoom(ed, 'Ed', 'friday rematch');
    const sam = openTab(net);
    await enterRoom(sam, 'Sam', 'friday rematch');

    await userEvent.click(pitIn(ed, 'South pit 1'));
    await settle();
    expect(statusOf(ed)).toHaveTextContent("Sam's turn");
    expect(pitIn(ed, 'South pit 2')).toHaveAttribute('aria-disabled', 'true');
    expect(statusOf(sam)).toHaveTextContent('Your turn');
    // Ed's pits are along the top of Sam's board, and aren't buttons there.
    expect(sam.ui.getByLabelText(/^South pit 1,/)).toHaveAccessibleName('South pit 1, 0 seeds');

    await userEvent.click(pitIn(sam, 'North pit 6'));
    await settle();
    expect(statusOf(ed)).toHaveTextContent('Your turn');
    expect(statusOf(ed)).toHaveTextContent('Sam plays pit 6.');
    expect(statusOf(sam)).toHaveTextContent('You play pit 6.');
  });

  // Scenario: Names in the game
  it('captions a capture with the player\'s name', async () => {
    // Find a short opening in which North (Sam) captures: depth-first over moves.
    function findCapture(board: BoardSnapshot, moves: number[]): number[] | null {
      if (moves.length > 6) return null;
      for (let pit = 0; pit < 6; pit++) {
        if (board.pits[board.toMove][pit] === 0) continue;
        const result = play(board, pit);
        if (board.toMove === 'north' && result.captured > 0) return [...moves, pit];
        const found = findCapture(result.board, [...moves, pit]);
        if (found) return found;
      }
      return null;
    }
    const line = findCapture(newBoard(), [])!;
    expect(line).not.toBeNull();

    const net = createNetwork();
    const ed = openTab(net);
    await enterRoom(ed, 'Ed', 'friday rematch');
    const sam = openTab(net);
    await enterRoom(sam, 'Sam', 'friday rematch');
    let board = newBoard();
    for (const pit of line) {
      const mover = board.toMove === 'south' ? ed : sam;
      await userEvent.click(pitIn(mover, `${board.toMove === 'south' ? 'South' : 'North'} pit ${pit + 1}`));
      await settle();
      board = play(board, pit).board;
    }
    const captured = play(
      line.slice(0, -1).reduce((b, p) => play(b, p).board, newBoard()),
      line.at(-1)!,
    ).captured;
    expect(statusOf(ed)).toHaveTextContent(`Sam plays pit ${line.at(-1)! + 1} and captures ${captured} seeds.`);
  });

  // Scenario: Opening a shared link
  it('a shared link opens Online with the room filled in, and joins after your name', async () => {
    const net = createNetwork();
    const ed = openTab(net);
    await enterRoom(ed, 'Ed', 'Friday Rematch');
    const link = roomLink('Friday Rematch', window.location);

    window.history.replaceState(null, '', link);
    localStorage.removeItem('mancala.name'); // Sam's own device: no name saved yet
    const sam = openTab(net, { keepAddress: true });
    const sheet = sam.ui.getByRole('dialog', { name: 'New game' });
    expect(within(sheet).getByRole('button', { name: /Online/ })).toHaveAttribute('aria-pressed', 'true');
    expect(within(sheet).getByLabelText('Room name')).toHaveValue('Friday Rematch');
    expect(within(sheet).getByLabelText('Your name')).toHaveFocus();
    await userEvent.type(within(sheet).getByLabelText('Your name'), 'Sam');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Enter room' }));
    await settle();
    expect(statusOf(sam)).toHaveTextContent("Ed's turn");
    expect(statusOf(ed)).toHaveTextContent('Your turn');
  });

  // Scenario: Entering at the same moment
  it('two players entering at the same moment agree on who plays South', async () => {
    const net = createNetwork();
    const ed = openTab(net);
    const sam = openTab(net);
    net.hold(); // neither hears from the other until both are in
    await enterRoom(ed, 'Ed', 'friday rematch');
    await enterRoom(sam, 'Sam', 'friday rematch');
    net.release();
    await settle();
    const edTurn = statusOf(ed).textContent ?? '';
    const samTurn = statusOf(sam).textContent ?? '';
    // Exactly one of them is to move, and the other is told it's their turn.
    expect([edTurn.includes('Your turn'), samTurn.includes('Your turn')].filter(Boolean)).toHaveLength(1);
    expect(ed.ui.getByText(/ vs /).textContent).toBe(sam.ui.getByText(/ vs /).textContent);
  });

  it('Analyze is never offered online', async () => {
    const net = createNetwork();
    const ed = openTab(net);
    await enterRoom(ed, 'Ed', 'friday rematch');
    const sam = openTab(net);
    await enterRoom(sam, 'Sam', 'friday rematch');
    expect(ed.ui.queryByRole('button', { name: 'Analyze' })).toBeNull();
  });
});

export type { Tab };
