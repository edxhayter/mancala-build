import { describe, expect, it } from 'vitest';
import { KEPT_MESSAGES, chatReducer, emptyChat, type ChatEvent, type ChatState } from './chat';

const run = (events: ChatEvent[], from: ChatState = emptyChat) => events.reduce(chatReducer, from);
const said = (n: number, mine = false): ChatEvent => ({
  type: mine ? 'sent' : 'received',
  id: `msg${String(n).padStart(9, '0')}`,
  name: mine ? 'Ed' : 'Sam',
  text: `message ${n}`,
});

describe('the chat', () => {
  // Scenario: Chatting
  it('keeps messages in the order they were sent, with names', () => {
    const state = run([
      { type: 'sent', id: 'msg000000001', name: 'Ed', text: 'good luck' },
      { type: 'received', id: 'msg000000002', name: 'Sam', text: 'you too' },
    ]);
    expect(state.messages.map((m) => `${m.name}: ${m.text}`)).toEqual(['Ed: good luck', 'Sam: you too']);
    expect(state.messages.map((m) => m.mine)).toEqual([true, false]);
  });

  it('shows a message that arrives twice only once', () => {
    const state = run([said(1), said(1)]);
    expect(state.messages).toHaveLength(1);
    expect(state.unread).toBe(1);
  });

  it(`keeps only the latest ${KEPT_MESSAGES} messages`, () => {
    const events = Array.from({ length: KEPT_MESSAGES + 5 }, (_, i) => said(i, i % 2 === 0));
    const state = run(events);
    expect(state.messages).toHaveLength(KEPT_MESSAGES);
    expect(state.messages[0].text).toBe('message 5');
  });

  // Scenario: Messages while the chat is closed
  it("counts the other player's messages while closed, and opening clears the count", () => {
    const closed = run([said(1), said(2), said(3, true)]);
    expect(closed.unread).toBe(2); // your own message isn't counted
    const opened = chatReducer(closed, { type: 'opened' });
    expect(opened.unread).toBe(0);
    expect(opened.messages).toHaveLength(3);
  });

  // Scenario: Messages while the chat is open
  it('counts nothing while open', () => {
    const state = run([{ type: 'opened' }, said(1), said(2)]);
    expect(state.unread).toBe(0);
    expect(chatReducer(state, { type: 'closed' }).unread).toBe(0);
  });

  it('restores messages after a refresh, without counting them as unread', () => {
    const before = run([said(1), said(2, true)]);
    const after = chatReducer(emptyChat, { type: 'restored', messages: before.messages });
    expect(after.messages).toEqual(before.messages);
    expect(after.unread).toBe(0);
  });
});
