import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { onlinePhase, onlineStatus } from '../game/online';
import { createNetwork, type Network } from '../test/network';
import { blockedStorage, memoryStorage } from '../test/storage';
import { ROOM_IDLE_MS } from './rooms';
import type { RoomStorage } from './saved';
import { SLOW_JOIN_MS, useOnlineRoom, type RoomEntry } from './useOnlineRoom';

/** Lets queued network deliveries and the re-renders they cause run. */
async function settle() {
  await act(async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  });
}

/**
 * Each tab's clock runs a millisecond behind the previous tab's start, so the
 * tab created first really did open the room first (tabs created in the same
 * millisecond would tie, and a random id would decide).
 */
let opened = 0;

/** One browser tab in a room, with its own storage. */
function tab(net: Network, entry: RoomEntry, storage: RoomStorage = memoryStorage()) {
  const offset = opened++;
  const env = { connect: net.connect, storage, now: () => Date.now() + offset };
  return renderHook(({ e }) => useOnlineRoom(env, e), { initialProps: { e: entry as RoomEntry | null } });
}

const ED = { roomName: 'friday rematch', playerName: 'Ed' };
const SAM = { roomName: 'Friday Rematch', playerName: 'Sam' };

afterEach(() => {
  vi.useRealTimers();
});

describe('useOnlineRoom', () => {
  it('two tabs in the same room meet and agree on the record', async () => {
    const net = createNetwork();
    const ed = tab(net, ED);
    await settle();
    expect(onlinePhase(ed.result.current!.state)).toBe('waiting');
    const sam = tab(net, SAM);
    await settle();
    const edState = ed.result.current!.state;
    const samState = sam.result.current!.state;
    expect(edState.record).toEqual(samState.record);
    expect(onlinePhase(edState)).toBe('yours');
    expect(onlinePhase(samState)).toBe('theirs');
  });

  it('a move is played locally and arrives at the other tab', async () => {
    const net = createNetwork();
    const ed = tab(net, ED);
    const sam = tab(net, SAM);
    await settle();
    act(() => ed.result.current!.play(0));
    await settle();
    expect(sam.result.current!.state.record.moves).toEqual([0]);
    expect(net.sent.some((m) => (m.data as { type: string }).type === 'move')).toBe(true);

    // Not Ed's turn any more: nothing is sent.
    const before = net.sent.length;
    act(() => ed.result.current!.play(1));
    expect(net.sent.length).toBe(before);
  });

  it('chat goes both ways; only while connected', async () => {
    const net = createNetwork();
    const ed = tab(net, ED);
    expect(ed.result.current!.say('anyone?')).toBe(false); // nobody to talk to
    const sam = tab(net, SAM);
    await settle();
    act(() => void ed.result.current!.say('good luck'));
    await settle();
    act(() => void sam.result.current!.say('you too'));
    await settle();
    const lines = (h: typeof ed) => h.result.current!.chat.messages.map((m) => `${m.name}: ${m.text}`);
    expect(lines(ed)).toEqual(['Ed: good luck', 'Sam: you too']);
    expect(lines(sam)).toEqual(['Ed: good luck', 'Sam: you too']);
    expect(sam.result.current!.chat.unread).toBe(1);
  });

  it('a rematch and leaving are sent', async () => {
    const net = createNetwork();
    const ed = tab(net, ED);
    const sam = tab(net, SAM);
    await settle();
    act(() => ed.result.current!.leave());
    await settle();
    expect(onlineStatus(sam.result.current!.state).message).toBe('Ed has left the room.');
  });

  // Scenario: A bad message is ignored (and other bad data)
  it('drops bad data from the network', async () => {
    const net = createNetwork();
    const ed = tab(net, ED);
    const sam = tab(net, SAM);
    await settle();
    const before = ed.result.current!.state;
    net.inject('friday rematch', 'peer2', { v: 1, type: 'move', game: 0, index: 0, pit: 9 });
    net.inject('friday rematch', 'peer2', { v: 1, type: 'chat', id: 'msg000000001', text: 'a'.repeat(1000) });
    net.inject('friday rematch', 'peer2', '<script>');
    await settle();
    expect(ed.result.current!.state).toBe(before);
    expect(ed.result.current!.chat.messages).toEqual([]);
    expect(sam.result.current).not.toBeNull();
  });

  it('saves the room and chat for a refresh, and forgets them on leaving', async () => {
    const net = createNetwork();
    const storage = memoryStorage();
    const ed = tab(net, ED, storage);
    const sam = tab(net, SAM);
    await settle();
    act(() => ed.result.current!.play(0));
    act(() => void ed.result.current!.say('hi'));
    await settle();

    // Refresh: the tab goes away, and a new one starts with the same storage.
    ed.unmount();
    await settle();
    // (Sam's page would still be animating Ed's move; the hook leaves that to the page.)
    expect(sam.result.current!.state.peer).toBe('away');
    const again = tab(net, ED, storage);
    await settle();
    expect(again.result.current!.state.me).toEqual(sam.result.current!.state.record.seats.first);
    expect(again.result.current!.state.record.moves).toEqual([0]);
    expect(again.result.current!.chat.messages.map((m) => m.text)).toEqual(['hi']);
    expect(sam.result.current!.state.peer).toBe('connected');

    act(() => again.result.current!.leave());
    expect(storage.data.size).toBe(0);
  });

  it('still works when storage is blocked', async () => {
    const net = createNetwork();
    const ed = tab(net, ED, blockedStorage);
    const sam = tab(net, SAM, blockedStorage);
    await settle();
    expect(onlinePhase(ed.result.current!.state)).toBe('yours');
    expect(onlinePhase(sam.result.current!.state)).toBe('theirs');
  });

  // Scenario: A slow join
  it('notes after 30 seconds that nobody has joined', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const net = createNetwork();
    const ed = tab(net, ED);
    await settle();
    expect(ed.result.current!.slowJoin).toBe(false);
    act(() => vi.advanceTimersByTime(SLOW_JOIN_MS));
    expect(ed.result.current!.slowJoin).toBe(true);
  });

  // Scenario: Nobody comes
  it('closes the room after 10 minutes with nobody, freeing the name', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const net = createNetwork();
    const ed = tab(net, ED);
    await settle();
    act(() => vi.advanceTimersByTime(ROOM_IDLE_MS - 1000));
    expect(onlinePhase(ed.result.current!.state)).toBe('waiting');
    act(() => vi.advanceTimersByTime(1000));
    expect(onlineStatus(ed.result.current!.state).message).toBe('The room closed: nobody joined in 10 minutes.');
    await settle();
    expect(net.peers('friday rematch')).toEqual([]);

    // Someone entering the name afterwards finds an empty room.
    const sam = tab(net, SAM);
    await settle();
    expect(onlinePhase(sam.result.current!.state)).toBe('waiting');
  });

  // Scenario: The other player doesn't come back
  it("closes the room 10 minutes after the other player drops, and they find a new room", async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const net = createNetwork();
    const samStorage = memoryStorage();
    const ed = tab(net, ED);
    const sam = tab(net, SAM, samStorage);
    await settle();
    sam.unmount();
    await settle();
    act(() => vi.advanceTimersByTime(ROOM_IDLE_MS));
    expect(onlineStatus(ed.result.current!.state).message).toBe(
      "The room closed: Sam didn't come back within 10 minutes.",
    );
    await settle();

    // Sam comes back later in the same tab: the saved room has expired.
    act(() => vi.advanceTimersByTime(60_000));
    const back = tab(net, SAM, samStorage);
    await settle();
    expect(onlinePhase(back.result.current!.state)).toBe('waiting');
    expect(back.result.current!.state.record.seats.first.name).toBe('Sam');
  });

  // Scenario: Back in time
  it('keeps the game if the other player is back within 10 minutes, and restarts the clock', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const net = createNetwork();
    const ed = tab(net, ED);
    const samStorage = memoryStorage();
    const sam = tab(net, SAM, samStorage);
    await settle();
    sam.unmount();
    await settle();
    act(() => vi.advanceTimersByTime(9 * 60_000));
    const back = tab(net, SAM, samStorage);
    await settle();
    expect(onlinePhase(ed.result.current!.state)).toBe('yours');
    // The 9 minutes don't count against the next drop.
    act(() => vi.advanceTimersByTime(5 * 60_000));
    expect(onlinePhase(ed.result.current!.state)).toBe('yours');
    expect(onlinePhase(back.result.current!.state)).toBe('theirs');
  });

  it('turns away a third tab', async () => {
    const net = createNetwork();
    const ed = tab(net, ED);
    const sam = tab(net, SAM);
    await settle();
    const alex = tab(net, { roomName: 'FRIDAY rematch', playerName: 'Alex' });
    await settle();
    expect(onlineStatus(alex.result.current!.state).message).toBe('This room is in use. Try another name.');
    expect(onlinePhase(ed.result.current!.state)).toBe('yours');
    expect(onlinePhase(sam.result.current!.state)).toBe('theirs');
  });
});
