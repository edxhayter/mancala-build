// Two (or more) browser tabs side by side in one test: each is an <App> in its
// own container, with its own session storage, on one in-memory network.

import { act, render, within, type RenderResult } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { App } from '../App';
import type { RoomStorage } from '../online/saved';
import type { OnlineEnvironment } from '../online/useOnlineRoom';
import { silentAi } from './ai';
import type { Network } from './network';
import { memoryStorage } from './storage';

/** Lets network deliveries, and the renders they cause, finish. */
export async function settle() {
  await act(async () => {
    for (let i = 0; i < 30; i++) await Promise.resolve();
  });
}

/** Clears the address bar's `#room=` link (all tabs share one `window.location` in tests). */
export function clearAddress() {
  window.history.replaceState(null, '', '/');
}

let opened = 0;

export interface Tab {
  ui: ReturnType<typeof within>;
  view: RenderResult;
  storage: RoomStorage;
  /** Closes the tab (as far as the room can tell, the same as losing connection). */
  close: () => void;
}

/**
 * Opens a tab. Each tab's clock is a millisecond behind the one opened before
 * it, so the tab that enters a room first really did open it first.
 */
export function openTab(net: Network, options: { storage?: RoomStorage; keepAddress?: boolean } = {}): Tab {
  if (!options.keepAddress) clearAddress();
  const storage = options.storage ?? memoryStorage();
  const offset = opened++;
  const env: OnlineEnvironment = { connect: net.connect, storage, now: () => Date.now() + offset };
  const container = document.body.appendChild(document.createElement('div'));
  const view = render(createElement(App, { ai: silentAi, online: env }), { container });
  return { ui: within(container), view, storage, close: () => view.unmount() };
}

/** New game → Online → names → Enter room. */
export async function enterRoom(tab: Tab, playerName: string, roomName: string) {
  const { ui } = tab;
  await userEvent.click(ui.getByRole('button', { name: 'New game' }));
  await userEvent.click(ui.getByRole('button', { name: /Online/ }));
  const name = ui.getByLabelText('Your name');
  await userEvent.clear(name);
  await userEvent.type(name, playerName);
  const room = ui.getByLabelText('Room name');
  await userEvent.clear(room);
  await userEvent.type(room, roomName);
  await userEvent.click(ui.getByRole('button', { name: 'Enter room' }));
  await settle();
}

/** A pit button by its name, e.g. "South pit 1". */
export const pitIn = (tab: Tab, name: string) => tab.ui.getByRole('button', { name: new RegExp(`^${name},`) });

/** The tab's status line. */
export const statusOf = (tab: Tab) => tab.ui.getByRole('status');
