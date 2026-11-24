import { useEffect, useId, useRef, useState } from 'react';
import type { ChatMessage } from '../game/chat';
import { MAX_CHAT } from '../online/protocol';

interface ChatPanelProps {
  /** Shown as the panel's title (the room name). */
  title: string;
  messages: ChatMessage[];
  /** Why Send is unavailable ("Sam isn't connected."), or null when it can be used. */
  blocked: string | null;
  /** Sends a message; returns whether it was sent. */
  onSend: (text: string) => boolean;
  onClose: () => void;
}

/**
 * The room chat (spec: room-chat). A non-modal panel: on a desktop the board
 * beside it stays playable; on a sideways phone it covers the board until
 * closed. Every message is plain text, so markup shows exactly as typed.
 */
export function ChatPanel({ title, messages, blocked, onSend, onClose }: ChatPanelProps) {
  const [draft, setDraft] = useState('');
  const titleId = useId();
  const inputId = useId();
  const blockedId = useId();
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLOListElement>(null);

  // Focus the message box when the chat opens.
  useEffect(() => input.current?.focus(), []);
  // Keep the latest message in view.
  useEffect(() => {
    list.current?.lastElementChild?.scrollIntoView?.({ block: 'end' });
  }, [messages.length]);

  const send = () => {
    if (blocked === null && onSend(draft)) setDraft('');
  };

  return (
    <section
      className="chat-panel"
      aria-labelledby={titleId}
      onKeyDown={(event) => event.key === 'Escape' && onClose()}
    >
      <div className="chat-head">
        <h2 id={titleId} className="chat-title">
          <span className="visually-hidden">Chat · </span>
          {title}
        </h2>
        <button type="button" className="text-button" onClick={onClose}>
          Close chat
        </button>
      </div>
      {/* A log: screen readers read out each new message, politely. */}
      <ol ref={list} className="chat-messages" role="log" aria-live="polite">
        {messages.length === 0 && <li className="chat-empty">No messages yet.</li>}
        {messages.map((m) => (
          <li key={m.id} className={m.mine ? 'chat-message mine' : 'chat-message'}>
            <span className="chat-name">{m.name}</span>: <span className="chat-text">{m.text}</span>
          </li>
        ))}
      </ol>
      <form
        className="chat-form"
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
      >
        <label htmlFor={inputId} className="visually-hidden">
          Message
        </label>
        <input
          ref={input}
          id={inputId}
          className="text-field"
          value={draft}
          maxLength={MAX_CHAT}
          autoComplete="off"
          aria-describedby={blocked ? blockedId : undefined}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="submit" className="tab-button" disabled={blocked !== null || draft.trim() === ''}>
          Send
        </button>
      </form>
      {blocked && (
        <p id={blockedId} className="chat-blocked">
          {blocked}
        </p>
      )}
    </section>
  );
}
