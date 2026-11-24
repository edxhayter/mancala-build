// The real connection: Trystero over public Nostr relays (add-online-play
// design.md decision 1). Pinned at 0.26.0; this file is the only one that
// knows about it, so changing library or strategy stays contained here.
//
// It can't run in jsdom (no WebRTC), so it is checked by playing between two
// real browsers (tasks 6.2 and 6.3). Everything above it is tested with the
// in-memory network in src/test/network.ts.

import type { JsonValue } from 'trystero';
import { toWire, type OnlineMessage } from './protocol';
import type { Connect, PeerId, RoomConnection } from './transport';

/** Keeps this app's rooms apart from every other Trystero app on the relays. */
const APP_ID = 'mancala-trainer';

export const connectWithTrystero: Connect = async (roomKey) => {
  // Loaded on first use only, so players who never go online don't download it.
  const { joinRoom } = await import('trystero');

  // The room key is also the password: Trystero encrypts the connection offers
  // it posts to the relays with it, so relays see only ciphertext.
  const room = joinRoom({ appId: APP_ID, password: roomKey }, roomKey);
  const channel = room.makeAction<JsonValue>('msg');

  const connection: RoomConnection = {
    send(message: OnlineMessage, to?: PeerId) {
      // Our messages are plain JSON (strings, numbers, booleans, arrays, objects).
      const data = toWire(message) as unknown as JsonValue;
      channel.send(data, to === undefined ? undefined : { target: to }).catch((error: unknown) => {
        console.warn('Could not send to the other player:', error);
      });
    },
    onMessage(handler) {
      channel.onMessage = (data, context) => handler(data, context.peerId);
    },
    onPeerJoin(handler) {
      room.onPeerJoin = handler;
    },
    onPeerLeave(handler) {
      room.onPeerLeave = handler;
    },
    leave() {
      room.leave().catch(() => {});
    },
  };
  return connection;
};
