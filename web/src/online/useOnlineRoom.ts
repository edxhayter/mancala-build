// The one piece of code that talks to the network (add-online-play design.md
// decisions 5 and 7). It turns what arrives into reducer events, sends what
// the player does, saves the room for a refresh, and runs the room's timers.

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { chatReducer, emptyChat, type ChatState } from '../game/chat';
import { initialOnline, onlinePhase, onlineReducer, opponent, type OnlineEvent, type OnlineState } from '../game/online';
import { meet, newRecord } from './record';
import { cleanChatText, parseMessage, randomId, type OnlineMessage, type Seat } from './protocol';
import { ROOM_IDLE_MS, roomKey } from './rooms';
import { forgetRoom, loadRoom, saveRoom, type RoomStorage } from './saved';
import type { Connect, PeerId, RoomConnection } from './transport';

/** Hello again this often while the other player is here, so a lost move is recovered (spec: Nothing lost on the way). */
export const HELLO_MS = 10_000;
/** Say "can't connect" once the online service has been unreachable this long (spec: Reaching the online service). */
export const OFFLINE_MS = 10_000;

/** What the hook needs from the outside world; tests pass stand-ins. */
export interface OnlineEnvironment {
  connect: Connect;
  /** Session storage, or null if there is none. */
  storage: RoomStorage | null;
  now: () => number;
}

/** What the player typed to enter a room. */
export interface RoomEntry {
  roomName: string;
  playerName: string;
  /** Goes up each time the player enters, so entering the same room again starts afresh. */
  attempt?: number;
}

export interface OnlineRoom {
  state: OnlineState;
  chat: ChatState;
  /** True while the online service has been out of reach for over 10 seconds. */
  offline: boolean;
  play: (pit: number) => void;
  /** The page has finished animating the latest move. */
  landed: () => void;
  /** Sends a chat message; returns false if it couldn't be sent. */
  say: (text: string) => boolean;
  askRematch: () => void;
  /** Leaves on purpose: the other player is told. */
  leave: () => void;
  openChat: () => void;
  closeChat: () => void;
}

/** This tab's hello: who it is, and the room as it sees it. */
function helloFrom(state: OnlineState): OnlineMessage {
  return { type: 'hello', seatId: state.me.id, name: state.me.name, record: state.record };
}

/** The reducer, plus "no room yet". */
function roomReducer(state: OnlineState | null, event: OnlineEvent): OnlineState | null {
  if (event.type === 'entered') return initialOnline(event.me, event.record);
  return state === null ? null : onlineReducer(state, event);
}

/** Whether the room has both players connected right now. */
function isFull(state: OnlineState): boolean {
  return state.peer === 'connected' && state.record.seats.second !== null;
}

export function useOnlineRoom(env: OnlineEnvironment, entry: RoomEntry | null): OnlineRoom | null {
  const [state, dispatch] = useReducer(roomReducer, null);
  const [chat, chatDispatch] = useReducer(chatReducer, emptyChat);
  const [reachable, setReachable] = useState(false);
  const [offline, setOffline] = useState(false);
  const [notFullSince, setNotFullSince] = useState<number | null>(null);

  // The latest values, for network callbacks that outlive a render.
  const stateRef = useRef(state);
  stateRef.current = state;
  const connection = useRef<RoomConnection | null>(null);
  /** Who each connected browser is, once they've said hello. */
  const peers = useRef(new Map<PeerId, string>());
  const envRef = useRef(env);
  envRef.current = env;

  const key = entry ? roomKey(entry.roomName) : null;
  const playerName = entry?.playerName ?? '';
  const attempt = entry?.attempt ?? 0;

  // --- Entering and connecting ---------------------------------------------------
  useEffect(() => {
    if (key === null || entry === null) return;
    const { connect, storage, now } = envRef.current;
    const at = now();
    const saved = storage ? loadRoom(storage, key, at) : null;
    const me: Seat = saved?.me ?? { id: randomId(), name: playerName };
    const record = saved?.record ?? newRecord(entry.roomName, me, at);
    dispatch({ type: 'entered', me, record });
    chatDispatch({ type: 'restored', messages: saved?.chat ?? [] });
    setNotFullSince(saved ? (saved.notFullSince ?? saved.savedAt) : at);
    setReachable(false);
    setOffline(false);
    peers.current.clear();

    let cancelled = false;
    let open: RoomConnection | null = null;
    connect(key).then(
      (conn) => {
        if (cancelled) return conn.leave();
        open = conn;
        connection.current = conn;
        conn.onPeerJoin((peer) => conn.send(helloFrom(stateRef.current!), peer));
        conn.onReachable(setReachable);
        conn.onPeerLeave((peer) => {
          const seatId = peers.current.get(peer);
          peers.current.delete(peer);
          if (seatId) dispatch({ type: 'peerLeft', seatId });
        });
        conn.onMessage((data, from) => receive(conn, parseMessage(data), from));
      },
      (error: unknown) => console.error('Could not join the room:', error),
    );
    return () => {
      cancelled = true;
      open?.leave();
      connection.current = null;
      peers.current.clear();
    };
    // `entry` is read only through `key`, `playerName` and `attempt`, on
    // purpose: a new object with the same room, name and attempt is the same room.
  }, [key, playerName, attempt]);

  /** Handles one checked message from browser `from`. */
  const receive = (conn: RoomConnection, message: OnlineMessage | null, from: PeerId) => {
    const current = stateRef.current;
    if (message === null || current === null) return; // spec: A bad message is ignored
    if (message.type === 'hello') {
      peers.current.set(from, message.seatId);
      const seat: Seat = { id: message.seatId, name: message.name };
      const connected = new Set([current.me.id, ...peers.current.values()]);
      dispatch({ type: 'helloReceived', seat, record: message.record, connected });
      // A third visitor is told the room is in use (spec: Two players per room).
      const meeting = meet(current.record, message.record, current.me, seat, connected);
      if (meeting.meIn && !meeting.themIn) conn.send({ type: 'inUse' }, from);
      return;
    }
    if (message.type === 'inUse') return dispatch({ type: 'inUseReceived' });
    const seatId = peers.current.get(from);
    if (seatId === undefined) return; // not introduced yet
    switch (message.type) {
      case 'move':
        return dispatch({ type: 'moveReceived', seatId, game: message.game, index: message.index, pit: message.pit });
      case 'rematch':
        return dispatch({ type: 'rematchReceived', seatId, game: message.game });
      case 'leave':
        return dispatch({ type: 'leftReceived', seatId });
      case 'chat': {
        const them = opponent(current);
        if (them === null || them.id !== seatId) return; // only the other player's messages
        return chatDispatch({ type: 'received', id: message.id, name: them.name, text: message.text });
      }
    }
  };

  // --- Timers ----------------------------------------------------------------------
  const phase = state ? onlinePhase(state) : null;
  const full = state !== null && isFull(state);
  const ended = phase === 'ended';

  // Keep track of when the room stopped having both players.
  useEffect(() => {
    if (state === null) return;
    if (full) setNotFullSince(null);
    else setNotFullSince((since) => since ?? envRef.current.now());
  }, [full, state === null]);

  // Spec: Rooms close when not full.
  useEffect(() => {
    if (notFullSince === null || ended || state === null) return;
    const wait = Math.max(0, ROOM_IDLE_MS - (envRef.current.now() - notFullSince));
    const timer = setTimeout(() => {
      const current = stateRef.current;
      if (current === null) return;
      dispatch({ type: 'roomClosed', reason: current.record.seats.second === null ? 'nobodyCame' : 'didntComeBack' });
    }, wait);
    return () => clearTimeout(timer);
  }, [notFullSince, ended, state === null]);

  // Spec: Reaching the online service. "Can't connect" only after 10 seconds
  // without any relay, and gone as soon as one is back.
  useEffect(() => {
    if (reachable || entry === null) return setOffline(false);
    const timer = setTimeout(() => setOffline(true), OFFLINE_MS);
    return () => clearTimeout(timer);
  }, [reachable, entry === null]);

  // Spec: Nothing lost on the way. While the other player is here, say hello
  // again every 10 seconds: reconcile brings a page that missed a move up to date.
  const peerHere = state?.peer === 'connected';
  useEffect(() => {
    if (!peerHere) return;
    const timer = setInterval(() => {
      const current = stateRef.current;
      if (current) connection.current?.send(helloFrom(current));
    }, HELLO_MS);
    return () => clearInterval(timer);
  }, [peerHere]);

  // Once the room has ended for this tab, leave it and forget it.
  useEffect(() => {
    if (!ended || state === null) return;
    connection.current?.leave();
    connection.current = null;
    if (envRef.current.storage) forgetRoom(envRef.current.storage, state.record.key);
  }, [ended]);

  // --- Saving for a refresh ----------------------------------------------------------
  useEffect(() => {
    const { storage, now } = envRef.current;
    if (state === null || ended || storage === null || key === null) return;
    const save = () =>
      saveRoom(storage, { me: state.me, record: state.record, chat: chat.messages, notFullSince, savedAt: now() });
    save();
    // Saved again as the page goes away, so "savedAt" is the moment of a refresh.
    window.addEventListener('pagehide', save);
    return () => window.removeEventListener('pagehide', save);
  }, [state?.record, state?.me, chat.messages, notFullSince, ended, key]);

  // --- Actions -----------------------------------------------------------------------
  const send = (message: OnlineMessage) => connection.current?.send(message);

  const play = useCallback((pit: number) => {
    const current = stateRef.current;
    if (current === null) return;
    const event: OnlineEvent = { type: 'movePlayed', pit };
    if (onlineReducer(current, event) === current) return; // not allowed now
    dispatch(event);
    send({ type: 'move', game: current.record.game, index: current.record.moves.length, pit });
  }, []);

  const say = useCallback((typed: string) => {
    const current = stateRef.current;
    const text = cleanChatText(typed);
    if (current === null || text === null || current.peer !== 'connected' || onlinePhase(current) === 'ended') {
      return false;
    }
    const id = randomId();
    chatDispatch({ type: 'sent', id, name: current.me.name, text });
    send({ type: 'chat', id, text });
    return true;
  }, []);

  const askRematch = useCallback(() => {
    const current = stateRef.current;
    if (current === null) return;
    const event: OnlineEvent = { type: 'rematchAsked' };
    if (onlineReducer(current, event) === current) return;
    dispatch(event);
    send({ type: 'rematch', game: current.record.game });
  }, []);

  const leave = useCallback(() => {
    const current = stateRef.current;
    send({ type: 'leave' });
    connection.current?.leave();
    connection.current = null;
    if (current && envRef.current.storage) forgetRoom(envRef.current.storage, current.record.key);
  }, []);

  const landed = useCallback(() => dispatch({ type: 'animationDone' }), []);
  const openChat = useCallback(() => chatDispatch({ type: 'opened' }), []);
  const closeChat = useCallback(() => chatDispatch({ type: 'closed' }), []);

  if (entry === null || state === null) return null;
  return { state, chat, offline, play, landed, say, askRematch, leave, openChat, closeChat };
}
