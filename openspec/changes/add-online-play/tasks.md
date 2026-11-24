# Tasks

> **How to use this list.** Each task is a block Claude writes and explains. You read it, ask questions, and commit at natural stopping points. **Your piece (optional)** marks something small you can do yourself, or hand back.
>
> Specs: `specs/online-play`, `specs/room-chat`, and the `kalah-rules` and `web-play` deltas. Design: `design.md`.
>
> - A Rust task is done when `cargo fmt --check`, `cargo clippy --workspace --all-targets -- -D warnings` and `cargo test --workspace` pass.
> - A web task is done when `npm run typecheck` and `npm test` pass in `web/`.
> - Each spec scenario's test is marked with a `Scenario:` comment.

## 1. Replaying a game (Rust)

- [x] 1.1 **(test first, then implement)** Give `MoveError` `impl Display` (short plain-English reasons) and `impl std::error::Error` in `mancala-core`. Tests:
  - each case's `to_string()`;
  - a `MoveError` can be returned as `Box<dyn std::error::Error>` through `?`.

  Verify: the tests pass, the CLI's wording and tests are unchanged, and `cargo tree -p mancala-core` is still empty.
  - **Concepts:** traits and `impl Trait for Type` (Book ch. 10.2), `fmt::Display` and `Formatter`, the `Error` trait and `Box<dyn Error>` (ch. 9.2, 17.2).
- [x] 1.2 **(test first, then implement)** Add `ReplayError { index, error }` and `Board::replay(moves: &[usize]) -> Result<Board, ReplayError>` (design.md decision 6). Tests:
  - the spec scenarios: *A legal game*, *No moves*, *An illegal move in the list*, *A move after the end*;
  - a property test: for 200 seeded random games, `replay` of the moves equals playing them one by one.

  Verify: the tests pass, and replay never returns a half-replayed board.
  - **Concepts:** custom error structs that wrap another error, `iter().enumerate()`, `?` with `map_err`, and `try_fold` (ch. 9, 13.2), written both ways, keeping the clearer one.
  - **Your piece (optional):** write `impl Display for ReplayError`, for example "move 3 (place 2): that pit is empty".
- [x] 1.3 **(test first, then implement)** Export `replayMoves(moves: Uint8Array) -> Result<WasmBoard, JsError>` from `mancala-wasm`, with a native `try_replay` twin. Add `replayMoves(moves: number[]): BoardSnapshot` to `engine.ts`. Tests:
  - native: matches `Board::replay`, and the error message names the place and the reason;
  - `engine.test.ts` against the real WASM: a short game, an empty list, and an illegal list that throws.

  Verify: `cargo test -p mancala-wasm` and `npm test` pass, and the `.d.ts` shows `replayMoves`.
  - **Concepts:** `&[u8]` from a `Uint8Array`, converting `u8` to `usize`, `Result<_, JsError>`.

## 2. Rooms, messages and records (pure TypeScript)

- [x] 2.1 **(test first, then implement)** Write `online/rooms.ts` (design.md decision 2):
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
- [x] 2.2 **(test first, then implement)** Write `online/protocol.ts`: the `OnlineMessage` union (`hello`, `move`, `chat`, `rematch`, `leave`, `inUse`, all `v: 1`) and `parseMessage(data: unknown)` (design.md decision 4). Tests:
  - every kind, valid;
  - for each kind, a wrong type, out-of-range numbers, a 21-character player name, a record whose room name fails `roomKey`, and *A bad message is ignored* (1,000-character chat text);
  - an unknown kind, `v: 2`, `null`, a string, and an array.

  Verify: the tests pass, and nothing that isn't an `OnlineMessage` gets through.
  - **Your piece (optional):** write the chat-text check (a string, 1–300 characters after trimming).
- [x] 2.3 **(test first, then implement)** Write `online/record.ts` (design.md decision 3):
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

- [x] 3.1 **(test first, then implement)** Define `RoomConnection` and `Connect` in `online/transport.ts` (design.md decision 1). Write the in-memory network in `test/network.ts`:
  - connections with the same room key reach each other, and others don't;
  - `disconnect(peer)` fires `onPeerLeave` on the others;
  - deliveries can be held back and released, or dropped.

  Its own tests cover each of these. Verify: the tests pass.
- [x] 3.2 Choose and pin Trystero:
  - an exact version, at least two weeks old (0.26.0 is the candidate);
  - check its import path and its `joinRoom` / `makeAction` / `onPeerJoin` / `onPeerLeave` / `leave` API in the installed package.

  Then write `online/trystero.ts`, which implements `Connect` with `appId: 'mancala-trainer'` and `password` set to the room key, and loads Trystero with a dynamic `import()`. Close design.md's open question with what you found.

  Verify:
  - `npm run typecheck` passes;
  - `npm run build` puts Trystero in its own chunk, not in the main bundle;
  - `npm ls` shows the pinned version.

## 4. Online state

- [x] 4.1 **(test first, then implement)** Write the `chatReducer` in `game/chat.ts` (design.md decision 5). Tests:
  - *Chatting*: the order, with names;
  - duplicate ids are dropped;
  - only the latest 200 messages are kept;
  - *Messages while the chat is closed*: the friend's messages count, your own don't, and opening clears the count;
  - *Messages while the chat is open*: no count.

  Verify: the tests pass.
- [x] 4.2 **(test first, then implement)** Write the `onlineReducer` in `game/online.ts` (design.md decision 5). Tests:
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
- [x] 4.3 **(test first, then implement)** Write the `useOnlineRoom` hook in `online/useOnlineRoom.ts` (design.md decisions 5 and 7). Use the in-memory network and `renderHook`. Tests:
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

- [x] 5.1 **(test first, then implement)** In the New game sheet:
  - enable the Online card, with **Your name** (remembered in `localStorage` `mancala.name`), **Room name** with its hint, the note that anyone with the same name can join (the network-address part was dropped in the 2026-11-24 revision, task 8.5), and **Enter room**;
  - update the web-play tests for *Modes that are not available yet* and *Online can be chosen*.

  Tests:
  - *A name is required* (empty, or only spaces);
  - *Names that aren't allowed* show the hint, and **Enter room** stays unavailable;
  - the room name isn't remembered;
  - the name is remembered;
  - the level and order choices are hidden.

  Verify: the tests pass, and the existing sheet tests pass.
- [x] 5.2 **(test first, then implement)** Add online mode to `App` (design.md decision 8):
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
- [x] 5.3 **(test first, then implement)** Handle connection problems and the end of a game through the page, with two `App`s and the in-memory network:
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
- [x] 5.4 **(test first, then implement)** Build the `ChatPanel` and the header's **Chat** button with the unread badge (design.md decision 8). Tests, through two `App`s:
  - *Chatting*;
  - *Empty messages and long messages*;
  - *Nobody to talk to*;
  - *Markup is shown as typed*;
  - *Messages while the chat is closed* (the badge, and its accessible name);
  - *Messages while the chat is open*;
  - *Chat after leaving*;
  - chat survives a rematch and a refresh.

  Verify: the tests pass. If `App.tsx` is over about 400 lines, also extract the per-mode `Board` props into a helper, and check that the tests still pass.
  - **Done as:** `App.tsx` reached 451 lines, so the per-mode `Board` props moved to `game/boardView.ts`, and the chat's "can't send" reason to `chatBlockedReason` in `game/online.ts`. That leaves 422 lines.
- [x] 5.5 Check online play on a sideways phone:
  - `OnlineStatus` sits in the header's status slot;
  - the room name is visually hidden in the header, kept for screen readers, and is the chat panel's title;
  - the chat covers the board and closes with one tap.

  Add tests in `phone.test.tsx` (with `matchMedia` mocked), including *Opening the chat on a phone*. Verify: the tests pass, and the layout is checked in a browser at 844×390 with nothing overlapping.
  - **Done (2026-11-24):** the tests are in `phone.test.tsx`. **Browser check by Claude** on the production build in headless Chrome, with Ed at 1280×860 and Sam on a sideways phone at 844×390, playing over the **real Trystero and Nostr relays**:
    - Joining took 0.2–0.35 s. A move arrived in about 0.1 s.
    - The chat message `good luck <b>Ed</b>` showed as typed, and the badge arrived at once.
    - A refreshed tab rejoined in 0.3 s.
    - Nothing scrolled sideways at either size, and there were no console errors.
  - **Three fixes came out of the check:**
    1. The open chat covered the right end of the board on desktop. The page now makes room for it.
    2. "New game" wrapped onto two lines in the phone header. On the phone, "Ed vs Sam" is now visually hidden like the room name.
    3. A hidden tab, where browsers barely run timers, animated moves at about one step a second. Hidden pages now skip the animation (`usePageVisible`, with a test).

## 6. Final checks

- [x] 6.1 Run all the checks:
  - Rust: `cargo fmt --check`, `cargo clippy --workspace --all-targets -- -D warnings` and `cargo test --workspace`;
  - web: `npm run typecheck`, `npm test` and `npm run build`.

  Confirm that `cargo tree -p mancala-core` is still empty, and that every scenario in the four spec files has a test marked with a `Scenario:` comment. Verify: everything is clean, and no scenario is missing.
  - **Done (2026-11-24):** Rust has 154 passed and 2 ignored (the slow release-only tests). The web suite has 300 passed, typecheck is clean, and the build succeeds. `mancala-core` still has no dependencies, and `mancala-ai` depends only on core. Every scenario in the four spec files has a matching `Scenario:` comment.
- [x] 6.2 **Two real browsers, in dev.** With `npm run dev`, play a full game between a normal window and a private window, using the real Trystero and Nostr relays:
  - enter a room by name in one window, then type the same name in a different case in the other;
  - chat, with the badge;
  - refresh mid-game;
  - rematch;
  - leave.

  Verify: everything works, and there are no console errors. Write down how long joining took.
  - **Done by Claude (2026-11-24)**, with two differences from the plan:
    - It ran on the **production build** (`vite preview`), not `npm run dev`. That is the same code the live site serves.
    - It used two headless Chrome tabs (desktop, and a sideways phone) instead of a normal and a private window. The tabs have separate session storage but share local storage.
  - Both used the real Trystero and Nostr relays. Results:
    - **Joining:** 0.2–0.4 s, by link and by typing "  CLAUDE CHECK … " in capitals.
    - **Play:** moves arrived in about 0.1 s.
    - **Chat:** `<b>` showed as typed, and the badge arrived.
    - **Refresh:** the tab rejoined in 0.3 s.
    - **End of game:** played to the end ("Ed won!" on both). The rematch swapped sides, so Sam moved first.
    - **Leaving:** Sam's tab said "Ed has left the room.", and Ed's address bar link was cleared.
    - There were no console errors.
  - **Still worth doing yourself:** two real browsers or devices (see 6.3).
  - **Later finding:** both tabs were on the same machine, so they could always reach each other directly. That hid the problem in 6.3.
- [ ] 6.3 **(your step)** Merge to `main`, and confirm that the Pages run is green. Then play a game on the live site between **two different networks**, such as a laptop on Wi-Fi and a phone on mobile data, meeting by typing the room name on both. Verify: you joined, chatted, and finished a game. Note any network where joining failed.
  - **Tried 2026-11-24 (live site, two people on the same Wi-Fi): they never met.** Both pages waited as if in different rooms, because the network blocked the direct WebRTC connection. This led to the 2026-11-24 revision (design.md decision 1), so all traffic now goes through the relays. 6.3 stays open until the retry in 8.8 works.

## 7. Match score (added 2026-11-24)

- [x] 7.1 **(test first, then implement)** Keep the score in the room record (design.md decision 3, the *Match score* note):
  - `results` in `RoomRecord`, checked by `parseRecord` (one per earlier game, each −48 to 48), and appended by `askRematch`;
  - `matchScore(record)`, which counts the just-finished game too;
  - `matchWords` in `game/online.ts`.

  Tests:
  - *The score after a game*, *Level wins, broken by seeds*, *A draw counts for neither* and *All level* (with hand-made results);
  - a bad `results` is rejected;
  - reconcile and a rematch carry the score.

  Verify: the tests pass.
- [x] 7.2 **(test first, then implement)** Show the score:
  - the header's "Ed 2 – 1 Sam" once a game has finished (just "2 – 1" on a sideways phone, with the full score for screen readers);
  - the match line in the status when a game ends.

  Tests, through two `App`s: *The score after a game*, and *The score lasts as long as the room* (a rematch, a refresh, and a new room at 0 – 0). Verify: the tests pass, and every earlier check from 6.1 still passes.

## 8. Connection through relays (revision of 2026-11-24)

> Replaces the direct WebRTC connection (Trystero) with our own small client that sends every message through public Nostr relays. See design.md decision 1 and the new `online-play` requirements: *Playing on any network*, *Reaching the online service* and *Nothing lost on the way*. Everything above `Connect` stays as it is.

- [x] 8.1 Pick the relays. Write a small probe script (in the scratchpad, not the repo) that, for each candidate relay:
  - opens a websocket;
  - subscribes to an ephemeral kind with an `x` tag;
  - publishes a signed test event from a second socket;
  - times how long it takes to arrive.

  Candidates include `nos.lol`, `relay.damus.io`, `relay.primal.net`, `nostr.mom` and some of Trystero's list. Keep four that pass, preferring different operators, as the `RELAYS` constant. Record the results and timings in design.md decision 1. Verify: at least four relays pass from this machine.
- [x] 8.2 **(test first, then implement)** Pure helpers in `online/nostr.ts`:
  - `roomTopic(key)` (the SHA-256 hex) and `roomKind(topic)` (20000–29999);
  - `deriveKey(key)` (PBKDF2, then AES-GCM), `seal(data)` and `open(text)`, with a random IV, where `open` returns null on any failure;
  - `newIdentity()` and `signEvent(identity, kind, tags, content)` (a NIP-01 event id and Schnorr signature with the pinned `@noble/secp256k1`).

  Tests:
  - the topic and kind are the same for keys that differ only in case or spaces;
  - a seal and open round-trips, and a different key or tampered text gives null;
  - a signed event's id matches NIP-01 and its signature verifies.

  Verify: the tests pass, and the library is pinned to an exact version at least two weeks old.
  - **Concepts:** Web Crypto (`crypto.subtle`), hashing, symmetric encryption with a fresh IV, and why we sign but don't need to verify (relays do).
- [x] 8.3 **(test first, then implement)** The relay client in `online/relayClient.ts`:
  - one websocket per relay, with `REQ` / `EVENT` / `CLOSE`;
  - reconnecting with back-off (1, 2, 4 … 30 s);
  - `reachable` true while any relay is open.

  Tests use a fake `WebSocket` (injected): subscribe on open, publish to every open relay, re-subscribe after a reconnect, the back-off sequence, and `reachable` going true and false. Verify: the tests pass.
- [x] 8.4 **(test first, then implement)** `connectWithRelays: Connect` in `online/relays.ts` (design.md decision 1):
  - sealed `{ id, to?, data }`, with duplicates dropped by `id` and messages for other peers ignored;
  - a beat every 5 s; join on first hearing, leave after 15 s of silence or on a bye; a bye on `leave()` and on `pagehide`;
  - `onReachable`.

  Tests: two connections on a fake relay meet and exchange messages; the same event from two relays is handled once; `to` reaches only its peer; silence makes a peer leave, and a bye does it at once; a bad ciphertext is dropped. Verify: the tests pass.
  - **Done as:** when a tab hears someone new, it answers at once with a beat. Their first beat may have gone out before the newcomer was listening, so without this the second tab would wait up to 5 s to learn about the first.
- [x] 8.5 **(test first, then implement)** In the hook and the page:
  - re-send hello every 10 s while the other player is connected;
  - show "Can't connect to online play right now. Still trying…" while `onReachable` is false for over 10 s;
  - remove the 30-second network note;
  - the sheet's note becomes just "Anyone who types the same room name can join.";
  - `RoomConnection` gains `onReachable`, and the in-memory network implements it.

  Tests: *A lost move arrives later* (the network drops one move, and the pages agree within 15 s with fake timers), *Can't connect* (the test network unreachable, then reachable), and the updated sheet note. The old *A slow join* tests are removed. Verify: the tests pass.
- [x] 8.6 Remove Trystero (the package and `online/trystero.ts`), and make the relay client the default `Connect` in `App`. Verify:
  - `npm ls` no longer lists `trystero`;
  - `npm run build` puts the relay client and the signing library in their own chunk;
  - every Rust and web check from 6.1 passes, and every scenario still has a test.
  - **Done (2026-11-24):** `trystero` is uninstalled and `online/trystero.ts` is deleted. `App` loads the relay client on first use, so it builds as its own 12 kB chunk (`relays-*.js`, versus Trystero's 74 kB). Rust has 154 passed and 2 ignored. The web suite has 338 passed. Every scenario has a test.
- [x] 8.7 **Two real browsers (by Claude).** On the production build, play a full game between two *separate* Chrome instances over the real relays: entering by name, chat, a refresh, a rematch, the match score, and leaving. Record the join time and the time per move. Verify: everything works, with no console errors.
  - **Done (2026-11-24)** on the production build, between two *separate* headless Chrome instances (a desktop, and a sideways phone), over the real relays:
    - **Joining:** 0.16–0.21 s after Enter room, by typing the name in capitals with stray spaces.
    - **Speed:** moves arrived in about **52 ms** each, and the chat badge in 52 ms.
    - **Refresh:** the tab rejoined in about 0.17 s.
    - **End of game:** played to the end, with the match score "Ed 0 – 1 Sam" on both pages (just "0 – 1" in the phone header). The rematch worked.
    - **Leaving** was seen in 52 ms.
    - There were no console errors.
  - **A fix came out of the check:** leaving dropped the `leave` message still in the send queue, so the other page showed "lost connection" instead of "left the room". Whether a message goes out is now decided when it is sent, and there is a test for it.
- [ ] 8.8 **(your step)** Merge, and confirm the Pages run is green. Then retry on the live site with **two devices on the same Wi-Fi** (the case that failed), and if you can, once across two different networks. Verify: you meet, play a game and chat. 6.3 can then be ticked.

## Workflow follow-up

- Archive this change after using online play with a friend for a while.
- If joining fails often on real networks, propose a follow-up change for a TURN relay or another signalling strategy (design.md Risks).
