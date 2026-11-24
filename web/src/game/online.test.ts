import { describe, expect, it } from 'vitest';
import { newBoard } from '../engine';
import type { RoomRecord, Seat } from '../online/protocol';
import { newRecord } from '../online/record';
import {
  initialOnline,
  nameOn,
  onlinePhase,
  onlineReducer,
  onlineStatus,
  playableOnline,
  type OnlineEvent,
  type OnlineState,
} from './online';

const ED: Seat = { id: 'ed0000000001', name: 'Ed' };
const SAM: Seat = { id: 'sam000000001', name: 'Sam' };
const ALEX: Seat = { id: 'alex00000001', name: 'Alex' };
const T = 1_700_000_000_000;
const both = new Set([ED.id, SAM.id]);

const run = (state: OnlineState, events: OnlineEvent[]) => events.reduce(onlineReducer, state);

/** Ed waiting alone in "friday rematch". */
const edWaiting = () => initialOnline(ED, newRecord('friday rematch', ED, T));

/** Ed's view once Sam has joined: Ed is South and moves first. */
function edPlaying(): OnlineState {
  const samsRecord = newRecord('Friday Rematch', SAM, T + 500);
  return onlineReducer(edWaiting(), { type: 'helloReceived', seat: SAM, record: samsRecord, connected: both });
}

/** Sam's view once Ed has been met. */
function samPlaying(): OnlineState {
  const sams = initialOnline(SAM, newRecord('Friday Rematch', SAM, T + 500));
  return onlineReducer(sams, { type: 'helloReceived', seat: ED, record: newRecord('friday rematch', ED, T), connected: both });
}

/** Lets every queued animation finish. */
function landAll(state: OnlineState): OnlineState {
  let s = state;
  while (s.animating) s = onlineReducer(s, { type: 'animationDone' });
  return s;
}

const fromSam = (index: number, pit: number, game = 0): OnlineEvent => ({
  type: 'moveReceived',
  seatId: SAM.id,
  game,
  index,
  pit,
});

describe('entering a room', () => {
  // Scenario: Opening a new room
  it('waits for someone, with no pit playable', () => {
    const state = edWaiting();
    expect(onlinePhase(state)).toBe('waiting');
    expect(onlineStatus(state).message).toBe('Waiting for someone to join');
    expect(playableOnline(state)).toEqual([]);
  });

  // Scenario: A friend joins
  it('when a friend joins, a game starts with the first player as South, to move', () => {
    const ed = edPlaying();
    const sam = samPlaying();
    expect(ed.record).toEqual(sam.record);
    expect(onlinePhase(ed)).toBe('yours');
    expect(onlineStatus(ed).message).toBe('Your turn');
    expect(onlinePhase(sam)).toBe('theirs');
    expect(onlineStatus(sam).message).toBe("Ed's turn");
    expect(playableOnline(ed)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(playableOnline(sam)).toEqual([]);
  });
});

describe('your side and your turn', () => {
  // Scenario: Waiting for the other player
  it("Ed can't play on Sam's turn, and Sam's move is animated when it arrives", () => {
    let ed = landAll(run(edPlaying(), [{ type: 'movePlayed', pit: 0 }])); // no extra turn: Sam to move
    expect(onlinePhase(ed)).toBe('theirs');
    expect(onlineReducer(ed, { type: 'movePlayed', pit: 1 })).toBe(ed);

    ed = onlineReducer(ed, fromSam(1, 0));
    expect(ed.animating).toBe(true);
    expect(ed.lastMove).toMatchObject({ by: 'north', pit: 0 });
    ed = landAll(ed);
    expect(onlinePhase(ed)).toBe('yours');
    expect(ed.record.moves).toEqual([0, 0]);
  });

  // Scenario: Names in the game
  it("captions the other player's moves with their name", () => {
    // From the start: Ed 0, Sam 1, Ed 1 ... set up a capture for Sam later is
    // long-winded; the caption wording is checked here with a plain move.
    let ed = landAll(run(edPlaying(), [{ type: 'movePlayed', pit: 0 }]));
    expect(ed.caption).toBe('You play pit 1.');
    ed = landAll(onlineReducer(ed, fromSam(1, 5)));
    expect(ed.caption).toBe('Sam plays pit 6.');
    expect(nameOn(ed, 'north')).toBe('Sam');
  });

  it('a move that arrives during an animation is queued, then animated', () => {
    let ed = run(edPlaying(), [{ type: 'movePlayed', pit: 0 }]); // still animating
    ed = onlineReducer(ed, fromSam(1, 0));
    expect(ed.queue).toHaveLength(1);
    expect(ed.record.moves).toEqual([0, 0]);
    ed = onlineReducer(ed, { type: 'animationDone' });
    expect(ed.lastMove).toMatchObject({ by: 'north' });
    ed = onlineReducer(ed, { type: 'animationDone' });
    expect(ed.animating).toBe(false);
  });
});

describe('moves are checked', () => {
  // Scenario: An out-of-turn move is ignored
  it("ignores a move for Sam on Ed's turn", () => {
    const ed = edPlaying();
    expect(onlineReducer(ed, fromSam(0, 0))).toBe(ed);
  });

  // Scenario: An illegal move is ignored
  it('ignores an illegal move', () => {
    // Ed 0, Sam 0, Ed 1, Sam 0 again: Sam's pit 0 is empty by then.
    let ed = landAll(run(edPlaying(), [{ type: 'movePlayed', pit: 0 }]));
    ed = landAll(onlineReducer(ed, fromSam(1, 0)));
    ed = landAll(onlineReducer(ed, { type: 'movePlayed', pit: 1 }));
    expect(ed.board.pits.north[0]).toBe(0);
    expect(onlineReducer(ed, fromSam(3, 0))).toBe(ed);
  });

  it('ignores a move for another game, out of order, or from a stranger', () => {
    const ed = landAll(run(edPlaying(), [{ type: 'movePlayed', pit: 0 }]));
    expect(onlineReducer(ed, fromSam(1, 0, 1))).toBe(ed);
    expect(onlineReducer(ed, fromSam(0, 0))).toBe(ed);
    expect(onlineReducer(ed, fromSam(2, 0))).toBe(ed);
    expect(onlineReducer(ed, { type: 'moveReceived', seatId: ALEX.id, game: 0, index: 1, pit: 0 })).toBe(ed);
  });
});

describe('connections', () => {
  // Scenario: The other player drops and returns
  it('waits while the other player is away, and carries on when they return', () => {
    let ed = onlineReducer(edPlaying(), { type: 'peerLeft', seatId: SAM.id });
    expect(onlinePhase(ed)).toBe('away');
    expect(onlineStatus(ed).message).toBe('Sam has lost connection. Waiting for them to come back.');
    expect(playableOnline(ed)).toEqual([]);

    ed = onlineReducer(ed, { type: 'helloReceived', seat: SAM, record: ed.record, connected: both });
    expect(onlinePhase(ed)).toBe('yours');
    expect(ed.board).toEqual(newBoard());
  });

  it('adopting a further-on record on reconnect shows it at once, without animating', () => {
    const ed = edPlaying();
    const samsRecord: RoomRecord = { ...ed.record, moves: [0, 0] };
    const after = onlineReducer(onlineReducer(ed, { type: 'peerLeft', seatId: SAM.id }), {
      type: 'helloReceived',
      seat: SAM,
      record: samsRecord,
      connected: both,
    });
    expect(after.record.moves).toEqual([0, 0]);
    expect(after.animating).toBe(false);
    expect(after.lastMove).toBeNull();
    expect(onlinePhase(after)).toBe('yours');
  });

  it('after a refresh, says it is connecting until the other player is met', () => {
    const restored = initialOnline(ED, edPlaying().record);
    expect(onlinePhase(restored)).toBe('connecting');
    expect(onlineStatus(restored).message).toBe('Connecting to Sam…');
  });

  // Scenario: A third person enters the room
  it('a third visitor changes nothing for the players, and is turned away themselves', () => {
    const ed = edPlaying();
    const all = new Set([ED.id, SAM.id, ALEX.id]);
    expect(onlineReducer(ed, { type: 'helloReceived', seat: ALEX, record: null, connected: all })).toBe(ed);

    const alex = initialOnline(ALEX, newRecord('friday rematch', ALEX, T + 9000));
    const turnedAway = onlineReducer(alex, { type: 'helloReceived', seat: ED, record: ed.record, connected: all });
    expect(onlinePhase(turnedAway)).toBe('ended');
    expect(onlineStatus(turnedAway).message).toBe('This room is in use. Try another name.');
  });

  // Scenario: Ed leaves
  it('when the other player leaves, the room ends', () => {
    const sam = onlineReducer(samPlaying(), { type: 'leftReceived', seatId: ED.id });
    expect(onlinePhase(sam)).toBe('ended');
    expect(onlineStatus(sam).message).toBe('Ed has left the room.');
    expect(playableOnline(sam)).toEqual([]);
  });

  it('the room closing ends it, with the reason', () => {
    const waiting = onlineReducer(edWaiting(), { type: 'roomClosed', reason: 'nobodyCame' });
    expect(onlineStatus(waiting).message).toBe('The room closed: nobody joined in 10 minutes.');
    const away = onlineReducer(onlineReducer(edPlaying(), { type: 'peerLeft', seatId: SAM.id }), {
      type: 'roomClosed',
      reason: 'didntComeBack',
    });
    expect(onlineStatus(away).message).toBe("The room closed: Sam didn't come back within 10 minutes.");
    expect(onlineReducer(away, { type: 'movePlayed', pit: 0 })).toBe(away);
  });
});

describe('rematch', () => {
  /** Ed's game, finished: a record whose moves end the game. */
  function finished(): OnlineState {
    // Play the game out with the first legal pit until it ends.
    let ed = edPlaying();
    let index = 0;
    while (ed.board.status.kind === 'playing') {
      const pit = ed.board.pits[ed.board.toMove].findIndex((n) => n > 0);
      if (ed.board.toMove === 'south') {
        ed = landAll(onlineReducer(ed, { type: 'movePlayed', pit }));
      } else {
        ed = landAll(onlineReducer(ed, fromSam(index, pit)));
      }
      index++;
    }
    return ed;
  }

  // Scenario: Playing again with sides swapped
  it('needs both players, then swaps sides', () => {
    let ed = finished();
    expect(onlinePhase(ed)).toBe('over');
    ed = onlineReducer(ed, { type: 'rematchAsked' });
    expect(onlineStatus(ed).detail).toBe('Waiting for Sam…');

    ed = onlineReducer(ed, { type: 'rematchReceived', seatId: SAM.id, game: 0 });
    expect(ed.record.game).toBe(1);
    expect(ed.record.moves).toEqual([]);
    expect(onlinePhase(ed)).toBe('theirs'); // Sam is South now and moves first
    expect(onlineStatus(ed).message).toBe("Sam's turn");
  });

  it("tells you when the other player wants a rematch", () => {
    const ed = onlineReducer(finished(), { type: 'rematchReceived', seatId: SAM.id, game: 0 });
    expect(onlineStatus(ed).detail).toBe('Sam wants a rematch');
  });

  it('ignores a rematch before the game is over', () => {
    const ed = edPlaying();
    expect(onlineReducer(ed, { type: 'rematchAsked' })).toBe(ed);
    expect(onlineReducer(ed, { type: 'rematchReceived', seatId: SAM.id, game: 0 })).toBe(ed);
  });
});
