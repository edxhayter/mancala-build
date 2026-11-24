// The connection between the browsers in a room, as the app sees it
// (add-online-play design.md decision 1). The real one is Trystero
// (`online/trystero.ts`); tests use an in-memory network (`test/network.ts`).

import type { OnlineMessage } from './protocol';

/** Identifies another browser in the room, for this connection only. */
export type PeerId = string;

export interface RoomConnection {
  /** Sends to everyone else in the room, or to one peer. */
  send(message: OnlineMessage, to?: PeerId): void;
  /** Data from another browser. It is `unknown`: check it with `parseMessage`. */
  onMessage(handler: (data: unknown, from: PeerId) => void): void;
  onPeerJoin(handler: (peer: PeerId) => void): void;
  onPeerLeave(handler: (peer: PeerId) => void): void;
  /** Leaves the room; the others see this browser leave. */
  leave(): void;
}

/** Joins the room with this key (design.md decision 2). */
export type Connect = (roomKey: string) => Promise<RoomConnection>;
