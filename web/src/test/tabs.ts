// Two (or more) browser tabs side by side in one test: each is an <App> in its
// own container, with its own session storage, on one in-memory network.

import { act, fireEvent, render, within, type RenderResult } from '@testing-library/react';
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

/** Something that clicks and types: `userEvent`, or a `userEvent.setup(...)` for fake timers. */
type User = Pick<typeof userEvent, 'click' | 'type' | 'clear'>;

/**
 * Clicking and typing with plain DOM events, for tests that fake the clock
 * (userEvent waits on timers, which then never fire).
 */
export const fireUser: User = {
  click: async (element: Element) => {
    act(() => void fireEvent.click(element));
  },
  type: async (element: Element, text: string) => {
    const input = element as HTMLInputElement;
    act(() => void fireEvent.change(input, { target: { value: input.value + text } }));
  },
  clear: async (element: Element) => {
    act(() => void fireEvent.change(element, { target: { value: '' } }));
  },
} as unknown as User;

/** New game → Online → names → Enter room. */
export async function enterRoom(tab: Tab, playerName: string, roomName: string, user: User = userEvent) {
  const { ui } = tab;
  await user.click(ui.getByRole('button', { name: 'New game' }));
  await user.click(ui.getByRole('button', { name: /Online/ }));
  const name = ui.getByLabelText('Your name');
  await user.clear(name);
  await user.type(name, playerName);
  const room = ui.getByLabelText('Room name');
  await user.clear(room);
  await user.type(room, roomName);
  await user.click(ui.getByRole('button', { name: 'Enter room' }));
  await settle();
}

/** A pit button by its name, e.g. "South pit 1". */
export const pitIn = (tab: Tab, name: string) => tab.ui.getByRole('button', { name: new RegExp(`^${name},`) });

/** The tab's status line. */
export const statusOf = (tab: Tab) => tab.ui.getByRole('status');
