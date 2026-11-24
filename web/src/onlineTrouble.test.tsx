// Online play when things go wrong, and at the end of a game (add-online-play task 5.3).

import userEvent from '@testing-library/user-event';
import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { legalMoves, newBoard, play } from './engine';
import { ROOM_IDLE_MS } from './online/rooms';
import { createNetwork, type Network } from './test/network';
import { memoryStorage } from './test/storage';
import { clearAddress, enterRoom, fireUser, openTab, pitIn, settle, statusOf, type Tab } from './test/tabs';

beforeEach(() => {
  localStorage.removeItem('mancala.name');
  clearAddress();
});
afterEach(() => {
  vi.useRealTimers();
  clearAddress();
});

/** Ed and Sam in "friday rematch", Ed to move. Sam's tab storage is given back for refreshes. */
async function edAndSam(net: Network, user: typeof fireUser = userEvent) {
  const ed = openTab(net);
  await enterRoom(ed, 'Ed', 'friday rematch', user);
  const samStorage = memoryStorage();
  const sam = openTab(net, { storage: samStorage });
  await enterRoom(sam, 'Sam', 'friday rematch', user);
  return { ed, sam, samStorage };
}

/** Clicks `pit` (0-5) for whoever is to move, in the right tab. */
async function move(ed: Tab, sam: Tab, side: 'south' | 'north', pit: number, user = userEvent) {
  const tab = side === 'south' ? ed : sam;
  await user.click(pitIn(tab, `${side === 'south' ? 'South' : 'North'} pit ${pit + 1}`));
  await settle();
}

describe('connection trouble', () => {
  // Scenario: The other player drops and returns
  it('waits while the other player is away, then carries on', async () => {
    const net = createNetwork();
    const { ed, sam } = await edAndSam(net);
    const samPeer = net.peers('friday rematch')[1];
    net.cut(samPeer);
    await settle();
    expect(statusOf(ed)).toHaveTextContent('Sam has lost connection. Waiting for them to come back.');
    expect(pitIn(ed, 'South pit 1')).toHaveAttribute('aria-disabled', 'true');

    net.restore(samPeer);
    await settle();
    expect(statusOf(ed)).toHaveTextContent('Your turn');
    expect(statusOf(sam)).toHaveTextContent("Ed's turn");
    expect(pitIn(ed, 'South pit 1')).toHaveAttribute('aria-disabled', 'false');
  });

  // Scenario: Refreshing mid-game
  it('a refreshed tab rejoins as the same player, with the game and chat', async () => {
    const net = createNetwork();
    const { ed, sam, samStorage } = await edAndSam(net);
    await move(ed, sam, 'south', 0); // Sam to move
    await userEvent.click(sam.ui.getByRole('button', { name: /^Chat/ }));
    await userEvent.type(sam.ui.getByLabelText('Message'), 'thinking…{Enter}');
    await settle();

    sam.close(); // the refresh: the tab goes, the same tab comes back with its storage
    await settle();
    expect(statusOf(ed)).toHaveTextContent('Sam has lost connection');
    const back = openTab(net, { storage: samStorage, keepAddress: true });
    await settle();
    expect(back.ui.queryByRole('dialog')).toBeNull(); // no name asked again
    expect(statusOf(back)).toHaveTextContent('Your turn');
    expect(pitIn(back, 'North pit 1')).toHaveAttribute('aria-disabled', 'false');
    expect(back.ui.getByLabelText(/^South pit 1,/)).toHaveAccessibleName('South pit 1, 0 seeds');
    await userEvent.click(back.ui.getByRole('button', { name: /^Chat/ }));
    expect(back.ui.getByText('thinking…')).toBeInTheDocument();
    expect(statusOf(ed)).toHaveTextContent("Sam's turn");
  });

  // Scenario: Taking over a seat that was left behind
  it('a player whose tab closed can take their seat back under the same name', async () => {
    const net = createNetwork();
    const { ed, sam } = await edAndSam(net);
    await move(ed, sam, 'south', 0);
    sam.close();
    await settle();

    const newSam = openTab(net); // a new tab: its storage is empty
    await enterRoom(newSam, 'sam', 'Friday Rematch');
    expect(statusOf(newSam)).toHaveTextContent('Your turn');
    expect(newSam.ui.getByLabelText(/^South pit 1,/)).toHaveAccessibleName('South pit 1, 0 seeds');
    expect(statusOf(ed)).toHaveTextContent("sam's turn");
  });

  // Scenario: A stranger can't take a seat
  it("a stranger can't take the seat of a player who is away", async () => {
    const net = createNetwork();
    const { ed, sam } = await edAndSam(net);
    sam.close();
    await settle();
    const alex = openTab(net);
    await enterRoom(alex, 'Alex', 'friday rematch');
    expect(statusOf(alex)).toHaveTextContent('This room is in use. Try another name.');
    expect(statusOf(ed)).toHaveTextContent('Sam has lost connection');
  });

  // Scenario: A third person enters the room
  it('a third person is told the room is in use, and the game is unchanged', async () => {
    const net = createNetwork();
    const { ed, sam } = await edAndSam(net);
    await move(ed, sam, 'south', 0);
    const alex = openTab(net);
    await enterRoom(alex, 'Alex', 'FRIDAY REMATCH');
    expect(statusOf(alex)).toHaveTextContent('This room is in use. Try another name.');
    expect(alex.ui.getAllByRole('button', { name: 'New game' })).toHaveLength(2); // header and status
    expect(statusOf(ed)).toHaveTextContent("Sam's turn");
    expect(statusOf(sam)).toHaveTextContent('Your turn');
  });
});

describe('the end of a game, and leaving', () => {
  // Scenario: Playing again with sides swapped
  it('a rematch needs both players, then swaps sides; the chat carries on', async () => {
    const net = createNetwork();
    const { ed, sam } = await edAndSam(net);
    await userEvent.click(ed.ui.getByRole('button', { name: /^Chat/ }));
    await userEvent.type(ed.ui.getByLabelText('Message'), 'gl{Enter}');
    await settle();

    // Play the game out, always the first legal pit.
    let board = newBoard();
    while (board.status.kind === 'playing') {
      const pit = legalMoves(board)[0];
      await move(ed, sam, board.toMove, pit);
      board = play(board, pit).board;
    }
    expect(statusOf(ed)).toHaveTextContent(/won!|draw/);

    await userEvent.click(ed.ui.getByRole('button', { name: 'Rematch' }));
    await settle();
    expect(statusOf(ed)).toHaveTextContent('Waiting for Sam…');
    expect(statusOf(sam)).toHaveTextContent('Ed wants a rematch');
    expect(ed.ui.queryByRole('button', { name: 'Rematch' })).toBeNull();

    await userEvent.click(sam.ui.getByRole('button', { name: 'Rematch' }));
    await settle();
    expect(statusOf(sam)).toHaveTextContent('Your turn');
    expect(statusOf(ed)).toHaveTextContent("Sam's turn");
    expect(pitIn(sam, 'South pit 1')).toHaveAttribute('aria-disabled', 'false'); // Sam is South now
    expect(ed.ui.getByText('gl')).toBeInTheDocument();
  });

  // Scenario: Ed leaves
  it('starting another game leaves the room, and the other player is told', async () => {
    const net = createNetwork();
    const { ed, sam } = await edAndSam(net);
    await userEvent.click(ed.ui.getByRole('button', { name: 'New game' }));
    await userEvent.click(ed.ui.getByRole('button', { name: /Computer/ }));
    await userEvent.click(ed.ui.getByRole('button', { name: 'Start game' }));
    await settle();
    expect(statusOf(ed)).toHaveTextContent('Your move');
    expect(window.location.hash).toBe('');
    expect(statusOf(sam)).toHaveTextContent('Ed has left the room.');
    expect(pitIn(sam, 'North pit 1')).toHaveAttribute('aria-disabled', 'true');
    expect(sam.ui.getAllByRole('button', { name: 'New game' })).toHaveLength(2); // header and status
  });
});

describe('rooms close when not full', () => {
  const fake = () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    return fireUser;
  };

  // Scenario: A slow join
  it('after 30 seconds with nobody, notes that networks can block connections', async () => {
    const user = fake();
    const ed = openTab(createNetwork());
    await enterRoom(ed, 'Ed', 'friday rematch', user);
    expect(statusOf(ed)).not.toHaveTextContent('Some networks block direct connections');
    act(() => vi.advanceTimersByTime(30_000));
    expect(statusOf(ed)).toHaveTextContent('Waiting for someone to join');
    expect(statusOf(ed)).toHaveTextContent('Some networks block direct connections');
    expect(ed.ui.getByText('Friday rematch'.toLowerCase())).toBeInTheDocument();
  });

  // Scenario: Nobody comes
  it('closes after 10 minutes with nobody, and the name then opens an empty room', async () => {
    const user = fake();
    const net = createNetwork();
    const ed = openTab(net);
    await enterRoom(ed, 'Ed', 'friday rematch', user);
    act(() => vi.advanceTimersByTime(ROOM_IDLE_MS));
    await settle();
    expect(statusOf(ed)).toHaveTextContent('The room closed: nobody joined in 10 minutes.');
    expect(ed.ui.getAllByRole('button', { name: 'New game' })).toHaveLength(2);

    const sam = openTab(net);
    await enterRoom(sam, 'Sam', 'friday rematch', user);
    expect(statusOf(sam)).toHaveTextContent('Waiting for someone to join');
  });

  // Scenario: The other player doesn't come back
  it("closes 10 minutes after the other player drops; when they return they find a new room", async () => {
    const user = fake();
    const net = createNetwork();
    const { ed, sam, samStorage } = await edAndSam(net, user);
    sam.close();
    await settle();
    act(() => vi.advanceTimersByTime(ROOM_IDLE_MS));
    await settle();
    expect(statusOf(ed)).toHaveTextContent("The room closed: Sam didn't come back within 10 minutes.");

    const back = openTab(net, { storage: samStorage, keepAddress: true });
    await settle();
    // The saved room has gone, so the link offers to enter the name afresh.
    await user.type(back.ui.getByLabelText('Your name'), 'Sam');
    await user.click(back.ui.getByRole('button', { name: 'Enter room' }));
    await settle();
    expect(statusOf(back)).toHaveTextContent('Waiting for someone to join');
  });
});
