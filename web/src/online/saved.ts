// Keeping an online room in this tab's session storage, so a refresh rejoins
// it (add-online-play design.md decision 7). Gone when the tab closes.

import type { ChatMessage } from '../game/chat';
import { cleanChatText, parseRecord, type RoomRecord, type Seat } from './protocol';
import { cleanPlayerName, expired } from './rooms';

/** The parts of `Storage` used here, so tests can pass a stand-in. */
export type RoomStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface SavedRoom {
  me: Seat;
  record: RoomRecord;
  chat: ChatMessage[];
  /** When the room stopped having both players connected; null while it has. */
  notFullSince: number | null;
  /** When this was saved (also on leaving the page), standing in for "just now" on a refresh. */
  savedAt: number;
}

const keyFor = (roomKey: string) => `mancala.room.${roomKey}`;

function parseChat(x: unknown): ChatMessage[] {
  if (!Array.isArray(x)) return [];
  return x.flatMap((m) => {
    if (typeof m !== 'object' || m === null) return [];
    const { id, mine, name, text } = m as Record<string, unknown>;
    const clean = cleanChatText(text);
    if (typeof id !== 'string' || typeof mine !== 'boolean' || typeof name !== 'string' || clean === null) return [];
    return [{ id, mine, name, text: clean }];
  });
}

/** The saved room for `roomKey`, unless there is none, it's unreadable, or it has closed. */
export function loadRoom(storage: RoomStorage, roomKey: string, now: number): SavedRoom | null {
  try {
    const raw = storage.getItem(keyFor(roomKey));
    if (raw === null) return null;
    const data = JSON.parse(raw) as Record<string, unknown>;
    const record = parseRecord(data.record);
    const me = data.me as Seat | undefined;
    const savedAt = typeof data.savedAt === 'number' ? data.savedAt : 0;
    const notFullSince = typeof data.notFullSince === 'number' ? data.notFullSince : null;
    if (record === null || record.key !== roomKey || !me || typeof me.id !== 'string') return null;
    if (cleanPlayerName(String(me.name)) !== me.name) return null;
    // Spec: Rooms close when not full. A room left alone too long is gone.
    if (expired(notFullSince ?? savedAt, now)) {
      forgetRoom(storage, roomKey);
      return null;
    }
    return { me: { id: me.id, name: me.name }, record, chat: parseChat(data.chat), notFullSince, savedAt };
  } catch {
    return null; // storage blocked, or not valid JSON
  }
}

export function saveRoom(storage: RoomStorage, saved: SavedRoom): void {
  try {
    storage.setItem(keyFor(saved.record.key), JSON.stringify(saved));
  } catch {
    // Not saved: a refresh will join as a new player, which still works.
  }
}

export function forgetRoom(storage: RoomStorage, roomKey: string): void {
  try {
    storage.removeItem(keyFor(roomKey));
  } catch {
    // nothing to do
  }
}
