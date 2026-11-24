// The match score through the page (add-online-play task 7.2; spec: Match score).

import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { legalMoves, newBoard, play } from './engine';
import { createNetwork } from './test/network';
import { memoryStorage } from './test/storage';
import { clearAddress, enterRoom, openTab, pitIn, settle, statusOf, type Tab } from './test/tabs';

beforeEach(() => {
  localStorage.removeItem('mancala.name');
  clearAddress();
});
afterEach(() => clearAddress());

/** Plays a whole game through the two tabs, always the first legal pit. Returns South's lead. */
async function playOut(south: Tab, north: Tab): Promise<number> {
  let board = newBoard();
  while (board.status.kind === 'playing') {
    const pit = legalMoves(board)[0];
    const tab = board.toMove === 'south' ? south : north;
    await userEvent.click(pitIn(tab, `${board.toMove === 'south' ? 'South' : 'North'} pit ${pit + 1}`));
    await settle();
    board = play(board, pit).board;
  }
  return board.stores.south - board.stores.north;
}

const header = (tab: Tab) => tab.view.container.querySelector('header')!;

describe('the match score', () => {
  // Scenario: The score after a game
  // Scenario: The score lasts as long as the room
  it('shows after each game, and lasts through rematches and a refresh, but not into a new room', async () => {
    const net = createNetwork();
    const ed = openTab(net);
    await enterRoom(ed, 'Ed', 'friday rematch');
    const samStorage = memoryStorage();
    const sam = openTab(net, { storage: samStorage });
    await enterRoom(sam, 'Sam', 'friday rematch');
    expect(header(ed)).toHaveTextContent('Ed vs Sam');

    // Game 1: Ed is South.
    const lead1 = await playOut(ed, sam);
    const first = lead1 > 0 ? 'Ed 1 – 0 Sam' : lead1 < 0 ? 'Ed 0 – 1 Sam' : 'Ed 0 – 0 Sam';
    expect(header(ed)).toHaveTextContent(first);
    expect(header(sam)).toHaveTextContent(first);
    expect(statusOf(ed)).toHaveTextContent(`Match: ${first}`);

    // Rematch: Sam is South now. The same opening from the other side.
    await userEvent.click(ed.ui.getByRole('button', { name: 'Rematch' }));
    await settle();
    await userEvent.click(sam.ui.getByRole('button', { name: 'Rematch' }));
    await settle();
    expect(header(ed)).toHaveTextContent(first); // still shown while game 2 is played
    const lead2 = await playOut(sam, ed);

    // Ed's results: +lead1 as South, then -lead2 (Sam was South).
    const results = [lead1, -lead2];
    const winsEd = results.filter((r) => r > 0).length;
    const winsSam = results.filter((r) => r < 0).length;
    const score = `Ed ${winsEd} – ${winsSam} Sam`;
    expect(header(ed)).toHaveTextContent(score);
    expect(header(sam)).toHaveTextContent(score);
    if (winsEd === winsSam) {
      const seeds = results[0] + results[1];
      const words = seeds === 0 ? 'The match is level' : `${seeds > 0 ? 'Ed' : 'Sam'} leads by ${Math.abs(seeds)}`;
      expect(statusOf(ed)).toHaveTextContent(words);
    }

    // A refresh keeps the score.
    sam.close();
    await settle();
    const back = openTab(net, { storage: samStorage, keepAddress: true });
    await settle();
    expect(header(back)).toHaveTextContent(score);

    // A new room starts at 0 – 0 (no score shown until a game finishes).
    await enterRoom(ed, 'Ed', 'saturday game');
    expect(header(ed)).toHaveTextContent('Ed vs …');
    expect(header(ed)).not.toHaveTextContent('–');
  });
});
