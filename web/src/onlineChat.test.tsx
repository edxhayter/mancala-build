// The room chat through the page (add-online-play task 5.4; spec: room-chat).

import { within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createNetwork, type Network } from './test/network';
import { clearAddress, enterRoom, openTab, settle, type Tab } from './test/tabs';

beforeEach(() => {
  localStorage.removeItem('mancala.name');
  clearAddress();
});
afterEach(() => clearAddress());

async function edAndSam(net: Network) {
  const ed = openTab(net);
  await enterRoom(ed, 'Ed', 'friday rematch');
  const sam = openTab(net);
  await enterRoom(sam, 'Sam', 'friday rematch');
  return { ed, sam };
}

const chatButton = (tab: Tab) => tab.ui.getByRole('button', { name: /^Chat/ });
const openChat = async (tab: Tab) => {
  if (chatButton(tab).getAttribute('aria-expanded') !== 'true') await userEvent.click(chatButton(tab));
  return tab.ui.getByRole('region', { name: /Chat/ });
};
async function say(tab: Tab, text: string) {
  const panel = await openChat(tab);
  await userEvent.type(within(panel).getByLabelText('Message'), `${text}{Enter}`);
  await settle();
}
const lines = (panel: HTMLElement) =>
  within(panel)
    .queryAllByRole('listitem')
    .filter((li) => !li.classList.contains('chat-empty'))
    .map((li) => li.textContent);

describe('the room chat', () => {
  // Scenario: Chatting
  it('messages appear in both chats, in order, with names', async () => {
    const { ed, sam } = await edAndSam(createNetwork());
    await say(ed, 'good luck');
    await say(sam, 'you too');
    expect(lines(await openChat(ed))).toEqual(['Ed: good luck', 'Sam: you too']);
    expect(lines(await openChat(sam))).toEqual(['Ed: good luck', 'Sam: you too']);
  });

  it('Send works by button as well as Enter', async () => {
    const { ed, sam } = await edAndSam(createNetwork());
    const panel = await openChat(ed);
    await userEvent.type(within(panel).getByLabelText('Message'), 'hello');
    await userEvent.click(within(panel).getByRole('button', { name: 'Send' }));
    await settle();
    expect(within(panel).getByLabelText('Message')).toHaveValue('');
    expect(lines(await openChat(sam))).toEqual(['Ed: hello']);
  });

  // Scenario: Empty messages and long messages
  it('sends nothing for only spaces, and takes at most 300 characters', async () => {
    const { ed, sam } = await edAndSam(createNetwork());
    const panel = await openChat(ed);
    const box = within(panel).getByLabelText('Message');
    await userEvent.type(box, '   ');
    expect(within(panel).getByRole('button', { name: 'Send' })).toBeDisabled();
    await userEvent.type(box, '{Enter}');
    await settle();
    expect(lines(await openChat(sam))).toEqual([]);
    expect(box).toHaveAttribute('maxLength', '300');
  });

  // Scenario: Nobody to talk to
  it("Send is unavailable while nobody has joined, or the other player isn't connected", async () => {
    const net = createNetwork();
    const ed = openTab(net);
    await enterRoom(ed, 'Ed', 'friday rematch');
    let panel = await openChat(ed);
    expect(within(panel).getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(panel).toHaveTextContent('Nobody has joined yet.');

    const sam = openTab(net);
    await enterRoom(sam, 'Sam', 'friday rematch');
    sam.close();
    await settle();
    panel = await openChat(ed);
    await userEvent.type(within(panel).getByLabelText('Message'), 'hello?');
    expect(within(panel).getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(panel).toHaveTextContent("Sam isn't connected.");
  });

  // Scenario: Markup is shown as typed
  it('shows markup and links exactly as typed', async () => {
    const { ed, sam } = await edAndSam(createNetwork());
    await say(sam, '<b>hi</b> https://example.com');
    const panel = await openChat(ed);
    expect(lines(panel)).toEqual(['Sam: <b>hi</b> https://example.com']);
    expect(panel.querySelector('b')).toBeNull();
    expect(within(panel).queryByRole('link')).toBeNull();
  });

  // Scenario: Messages while the chat is closed
  it('counts messages while closed, on the Chat button, and opening clears the count', async () => {
    const { ed, sam } = await edAndSam(createNetwork());
    await say(sam, 'one');
    await say(sam, 'two');
    expect(chatButton(ed)).toHaveAccessibleName('Chat, 2 unread');
    expect(chatButton(ed).querySelector('.badge')).toHaveTextContent('2');
    expect(ed.view.container).toHaveTextContent('New message from Sam');
    const panel = await openChat(ed);
    expect(lines(panel)).toEqual(['Sam: one', 'Sam: two']);
    expect(chatButton(ed)).toHaveAccessibleName('Chat');
    // Your own messages are never counted.
    expect(chatButton(sam)).toHaveAccessibleName('Chat');
  });

  // Scenario: Messages while the chat is open
  it('counts nothing while the chat is open', async () => {
    const { ed, sam } = await edAndSam(createNetwork());
    await openChat(ed);
    await say(sam, 'hi');
    expect(chatButton(ed)).toHaveAccessibleName('Chat');
    expect(lines(ed.ui.getByRole('region', { name: /Chat/ }))).toEqual(['Sam: hi']);
  });

  it('closing the chat puts focus back on the Chat button, and Escape closes it', async () => {
    const { ed } = await edAndSam(createNetwork());
    const panel = await openChat(ed);
    expect(within(panel).getByLabelText('Message')).toHaveFocus();
    await userEvent.click(within(panel).getByRole('button', { name: 'Close chat' }));
    expect(ed.ui.queryByRole('region', { name: /Chat/ })).toBeNull();
    expect(chatButton(ed)).toHaveFocus();
    await openChat(ed);
    await userEvent.keyboard('{Escape}');
    expect(ed.ui.queryByRole('region', { name: /Chat/ })).toBeNull();
  });

  // Scenario: Chat after leaving
  it('a new room starts with an empty chat', async () => {
    const net = createNetwork();
    const { ed, sam } = await edAndSam(net);
    await say(ed, 'bye');
    await userEvent.click(ed.ui.getByRole('button', { name: 'New game' }));
    await userEvent.click(ed.ui.getByRole('button', { name: /Two players/ }));
    await userEvent.click(ed.ui.getByRole('button', { name: 'Start game' }));
    await settle();
    expect(ed.ui.queryByRole('button', { name: /^Chat/ })).toBeNull();
    expect(sam.view.container).toHaveTextContent('Ed has left the room.');

    await enterRoom(ed, 'Ed', 'friday rematch');
    expect(lines(await openChat(ed))).toEqual([]);
  });
});
