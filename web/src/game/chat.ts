// The room chat as a pure reducer (add-online-play design.md decision 5;
// spec: room-chat). Sending over the network happens elsewhere.

/** Only the most recent messages are kept. */
export const KEPT_MESSAGES = 200;

export interface ChatMessage {
  /** Random, so the same message arriving twice is shown once. */
  id: string;
  mine: boolean;
  /** The sender's name when it was sent. */
  name: string;
  text: string;
}

export interface ChatState {
  messages: ChatMessage[];
  /** Whether the chat panel is showing. */
  open: boolean;
  /** The other player's messages that arrived while the panel was closed. */
  unread: number;
}

export type ChatEvent =
  | { type: 'sent'; id: string; name: string; text: string }
  | { type: 'received'; id: string; name: string; text: string }
  | { type: 'opened' }
  | { type: 'closed' }
  /** A refreshed tab gets its messages back from session storage. */
  | { type: 'restored'; messages: ChatMessage[] };

export const emptyChat: ChatState = { messages: [], open: false, unread: 0 };

function add(state: ChatState, message: ChatMessage): ChatState {
  if (state.messages.some((m) => m.id === message.id)) return state; // already shown
  const messages = [...state.messages, message].slice(-KEPT_MESSAGES);
  const unread = !message.mine && !state.open ? state.unread + 1 : state.unread;
  return { ...state, messages, unread };
}

export function chatReducer(state: ChatState, event: ChatEvent): ChatState {
  switch (event.type) {
    case 'sent':
      return add(state, { id: event.id, mine: true, name: event.name, text: event.text });
    case 'received':
      return add(state, { id: event.id, mine: false, name: event.name, text: event.text });
    case 'opened':
      return { ...state, open: true, unread: 0 };
    case 'closed':
      return { ...state, open: false };
    case 'restored':
      return { ...state, messages: event.messages.slice(-KEPT_MESSAGES) };
    default: {
      const unhandled: never = event;
      return unhandled;
    }
  }
}
