# Tasks

> **How to use this list.** Each task is a block Claude writes and explains. You read it, ask questions, and commit at natural stopping points. **Your piece (optional)** marks something small you can do yourself, or hand back.
>
> Specs: `specs/online-play`, `specs/room-chat`, and the `kalah-rules` and `web-play` deltas. Design: `design.md`.
>
> - A Rust task is done when `cargo fmt --check`, `cargo clippy --workspace --all-targets -- -D warnings` and `cargo test --workspace` pass.
> - A web task is done when `npm run typecheck` and `npm test` pass in `web/`.
> - Each spec scenario's test is marked with a `Scenario:` comment.

## 1. Replaying a game (Rust)

- [ ] 1.1 **(test first, then implement)** Give `MoveError` `impl Display` (short plain-English reasons) and `impl std::error::Error` in `mancala-core`. Tests:
  - each case's `to_string()`;
  - a `MoveError` can be returned as `Box<dyn std::error::Error>` through `?`.

  Verify: the tests pass, the CLI's wording and tests are unchanged, and `cargo tree -p mancala-core` is still empty.
  - **Concepts:** traits and `impl Trait for Type` (Book ch. 10.2), `fmt::Display` and `Formatter`, the `Error` trait and `Box<dyn Error>` (ch. 9.2, 17.2).
- [ ] 1.2 **(test first, then implement)** Add `ReplayError { index, error }` and `Board::replay(moves: &[usize]) -> Result<Board, ReplayError>` (design.md decision 6). Tests:
  - the spec scenarios: *A legal game*, *No moves*, *An illegal move in the list*, *A move after the end*;
  - a property test: for 200 seeded random games, `replay` of the moves equals playing them one by one.

  Verify: the tests pass, and replay never returns a half-replayed board.
  - **Concepts:** custom error structs that wrap another error, `iter().enumerate()`, `?` with `map_err`, and `try_fold` (ch. 9, 13.2), written both ways, keeping the clearer one.
  - **Your piece (optional):** write `impl Display for ReplayError`, for example "move 3 (place 2): that pit is empty".
- [ ] 1.3 **(test first, then implement)** Export `replayMoves(moves: Uint8Array) -> Result<WasmBoard, JsError>` from `mancala-wasm`, with a native `try_replay` twin. Add `replayMoves(moves: number[]): BoardSnapshot` to `engine.ts`. Tests:
  - native: matches `Board::replay`, and the error message names the place and the reason;
  - `engine.test.ts` against the real WASM: a short game, an empty list, and an illegal list that throws.

  Verify: `cargo test -p mancala-wasm` and `npm test` pass, and the `.d.ts` shows `replayMoves`.
  - **Concepts:** `&[u8]` from a `Uint8Array`, converting `u8` to `usize`, `Result<_, JsError>`.

## 2. Rooms, messages and records (pure TypeScript)

- [ ] 2.1 **(test first, then implement)** Write `online/rooms.ts` (design.md decision 2):
  - `roomKey(typed)`: trims, lower-cases, collapses spaces, and checks 3–30 letters, digits, spaces or hyphens, giving `null` otherwise;
  - `displayName(typed)`;
  - `roomLink(name, location)` (`…/#room=…`, keeping the `/mancala-build/` base);
  - `readRoomLink(hash)`;
  - `ROOM_IDLE_MS`, and `expired(lastTogetherAt, now)`.

  Tests:
  - *Names that lead to the same room*;
  - *Names that aren't allowed* (2 characters, 31 characters, `<`, `/`, an emoji);
  - letters with accents and non-English letters are allowed;
  - a link round-trips through `readRoomLink`, and a bad fragment gives `null`;
  - `expired` at 9:59 and at 10:00.

  Verify: the tests pass.
  - **Your piece (optional):** write `roomKey`. The trickiest part is the Unicode letter class `\p{L}` with the `u` flag.
- [ ] 2.2 **(test first, then implement)** Write `online/protocol.ts`: the `OnlineMessage` union (`hello`, `move`, `chat`, `rematch`, `leave`, `inUse`, all `v: 1`) and `parseMessage(data: unknown)` (design.md decision 4). Tests:
  - every kind, valid;
  - for each kind, a wrong type, out-of-range numbers, a 21-character player name, a record whose room name fails `roomKey`, and *A bad message is ignored* (1,000-character chat text);
  - an unknown kind, `v: 2`, `null`, a string, and an array.

  Verify: the tests pass, and nothing that isn't an `OnlineMessage` gets through.
  - **Your piece (optional):** write the chat-text check (a string, 1–300 characters after trimming).
- [ ] 2.3 **(test first, then implement)** Write `online/record.ts` (design.md decision 3):
  - `RoomRecord` and `newRecord(name, first, now)`;
  - `sideOf(record, seatId)`: the first player plays South in even games;
  - `reconcile(mine, theirs)`, using `replayMoves`;
  - `seatFor(record, newcomer, connectedSeatIds)`, returning `second`, `takeover` or `inUse`;
  - `rematched(record)`.

  Tests:
  - the further-on record wins;
  - a move lost in a drop is recovered;
  - a record that doesn't replay is ignored;
  - on a tie, the earlier-opened room wins, the same in both browsers (*Entering at the same moment*);
  - the seat rules: empty, *Taking over a seat that was left behind* (same name, any case), *A stranger can't take a seat*, and in use while both are connected;
  - a rematch swaps sides and clears the moves, and keeps the room name.

  Verify: the tests pass.

## 3. The connection

- [ ] 3.1 **(test first, then implement)** Define `RoomConnection` and `Connect` in `online/transport.ts` (design.md decision 1). Write the in-memory network in `test/network.ts`:
  - connections with the same room key reach each other, and others don't;
  - `disconnect(peer)` fires `onPeerLeave` on the others;
  - deliveries can be held back and released, or dropped.

  Its own tests cover each of these. Verify: the tests pass.
- [ ] 3.2 Choose and pin Trystero:
  - an exact version, at least two weeks old (0.26.0 is the candidate);
  - check its import path and its `joinRoom` / `makeAction` / `onPeerJoin` / `onPeerLeave` / `leave` API in the installed package.

  Then write `online/trystero.ts`, which implements `Connect` with `appId: 'mancala-trainer'` and `password` set to the room key, and loads Trystero with a dynamic `import()`. Close design.md's open question with what you found.

  Verify:
  - `npm run typecheck` passes;
  - `npm run build` puts Trystero in its own chunk, not in the main bundle;
  - `npm ls` shows the pinned version.

## 4. Online state

- [ ] 4.1 **(test first, then implement)** Write the `chatReducer` in `game/chat.ts` (design.md decision 5). Tests:
  - *Chatting*: the order, with names;
  - duplicate ids are dropped;
  - only the latest 200 messages are kept;
  - *Messages while the chat is closed*: the friend's messages count, your own don't, and opening clears the count;
  - *Messages while the chat is open*: no count.

  Verify: the tests pass.
- [ ] 4.2 **(test first, then implement)** Write the `onlineReducer` in `game/online.ts` (design.md decision 5). Tests:
  - *A friend joins* (first player South, phases `yours` / `theirs`);
  - *Waiting for the other player*;
  - *An out-of-turn move is ignored*;
  - *An illegal move is ignored*;
  - a move for an old game or with the wrong index is ignored;
  - *The other player drops and returns*;
  - adopting a record on reconnect doesn't animate;
  - *Playing again with sides swapped*;
  - *Ed leaves*;
  - *A third person enters the room* (`inUse`);
  - the room closes (`roomClosed`) with each reason, and no pit is playable after it.

  Verify: the tests pass.
  - **Concepts:** the same reducer patterns as `game/reducer.ts` and `game/puzzle.ts`, with a `never` check for unhandled events.
- [ ] 4.3 **(test first, then implement)** Write the `useOnlineRoom` hook in `online/useOnlineRoom.ts` (design.md decisions 5 and 7). Use the in-memory network and `renderHook`. Tests:
  - two hooks in the same room exchange `hello` and agree on the record;
  - `play`, `say`, `askRematch` and `leave` dispatch and send;
  - bad data from the network is dropped;
  - the record and chat are saved to and restored from `sessionStorage`, and deleted on leave;
  - storage that throws doesn't break anything;
  - the 30-second note appears with fake timers (*A slow join*);
  - the 10-minute timer, with fake timers: *Nobody comes*, *The other player doesn't come back*, and *Back in time* (the timer resets once both are connected);
  - a saved record that has expired is discarded on load, so the name opens a new room.

  Verify: the tests pass.

## 5. Online in the page (React)

- [ ] 5.1 **(test first, then implement)** In the New game sheet:
  - enable the Online card, with **Your name** (remembered in `localStorage` `mancala.name`), **Room name** with its hint, the note about anyone with the same name joining and network addresses, and **Enter room**;
  - update the web-play tests for *Modes that are not available yet* and *Online can be chosen*.

  Tests:
  - *A name is required* (empty, or only spaces);
  - *Names that aren't allowed* show the hint, and **Enter room** stays unavailable;
  - the room name isn't remembered;
  - the name is remembered;
  - the level and order choices are hidden.

  Verify: the tests pass, and the existing sheet tests pass.
- [ ] 5.2 **(test first, then implement)** Add online mode to `App` (design.md decision 8):
  - the `online` prop;
  - entering a room, and `OnlineStatus` with the room name and **Copy link**;
  - a `#room=` link opens the sheet with the name filled in, with a silent rejoin when `sessionStorage` has the room and it hasn't expired;
  - the header's room name and "Ed vs Sam";
  - turns, and the friend's moves animated.

  Test it with two `App`s on one in-memory network:
  - *Opening a new room*;
  - *Joining by typing the name* (a different case);
  - *Opening a shared link*;
  - *A friend joins*;
  - *Entering at the same moment*;
  - *Names in the game*;
  - *Waiting for the other player*;
  - *Your side and your turn* (each board from its own side);
  - Analyze is never offered online.

  Verify: the tests pass, and all the existing App, puzzle and explainer tests still pass.
- [ ] 5.3 **(test first, then implement)** Handle connection problems and the end of a game through the page, with two `App`s and the in-memory network:
  - *The other player drops and returns*;
  - *Refreshing mid-game* (unmount, then mount again with the same storage);
  - *Taking over a seat that was left behind* (new storage, same room name and player name);
  - *A stranger can't take a seat*;
  - *A third person enters the room*;
  - *Nobody comes* and *The other player doesn't come back* (fake timers), then the same name opens an empty room;
  - *Playing again with sides swapped*;
  - *Ed leaves*;
  - *A slow join*.

  Verify: the tests pass.
- [ ] 5.4 **(test first, then implement)** Build the `ChatPanel` and the header's **Chat** button with the unread badge (design.md decision 8). Tests, through two `App`s:
  - *Chatting*;
  - *Empty messages and long messages*;
  - *Nobody to talk to*;
  - *Markup is shown as typed*;
  - *Messages while the chat is closed* (the badge, and its accessible name);
  - *Messages while the chat is open*;
  - *Chat after leaving*;
  - chat survives a rematch and a refresh.

  Verify: the tests pass. If `App.tsx` is over about 400 lines, also extract the per-mode `Board` props into a helper, and check that the tests still pass.
- [ ] 5.5 Check online play on a sideways phone:
  - `OnlineStatus` sits in the header's status slot;
  - the room name is visually hidden in the header, kept for screen readers, and is the chat panel's title;
  - the chat covers the board and closes with one tap.

  Add tests in `phone.test.tsx` (with `matchMedia` mocked), including *Opening the chat on a phone*. Verify: the tests pass, and the layout is checked in a browser at 844×390 with nothing overlapping.

## 6. Final checks

- [ ] 6.1 Run all the checks:
  - Rust: `cargo fmt --check`, `cargo clippy --workspace --all-targets -- -D warnings` and `cargo test --workspace`;
  - web: `npm run typecheck`, `npm test` and `npm run build`.

  Confirm that `cargo tree -p mancala-core` is still empty, and that every scenario in the four spec files has a test marked with a `Scenario:` comment. Verify: everything is clean, and no scenario is missing.
- [ ] 6.2 **Two real browsers, in dev.** With `npm run dev`, play a full game between a normal window and a private window, using the real Trystero and Nostr relays:
  - enter a room by name in one window, then type the same name in a different case in the other;
  - chat, with the badge;
  - refresh mid-game;
  - rematch;
  - leave.

  Verify: everything works, and there are no console errors. Write down how long joining took.
- [ ] 6.3 **(your step)** Merge to `main`, and confirm that the Pages run is green. Then play a game on the live site between **two different networks**, such as a laptop on Wi-Fi and a phone on mobile data, meeting by typing the room name on both. Verify: you joined, chatted, and finished a game. Note any network where joining failed.

## Workflow follow-up

- Archive this change after using online play with a friend for a while.
- If joining fails often on real networks, propose a follow-up change for a TURN relay or another signalling strategy (design.md Risks).
