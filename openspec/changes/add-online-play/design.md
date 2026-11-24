# Design

## Context

See proposal.md for why. The requirements are in `specs/online-play`, `specs/room-chat` and the `kalah-rules` and `web-play` deltas.

What exists today:

- **`mancala-core`.** `Board::play(pit) -> Result<(Board, MoveOutcome), MoveError>`. `MoveError` has three cases, but no `Display` or `std::error::Error`. The CLI words them itself (`mancala-cli/src/game.rs`). The crate has no dependencies.
- **`mancala-wasm`.** Its wrappers turn errors into `JsError` through a `js(String)` helper, and each has a plain-Rust `try_*` twin that can be tested natively.
- **`web/`.** The game, puzzle and explainer reducers are pure functions. `App.tsx` (about 310 lines) owns them all, along with one `usePlayback` for the animation and one `Board`. `presentation.ts` words captions from a name (`moveCaption(name, outcome)`). The animation speed is kept in `localStorage`. The page is static, published to `https://edxhayter.github.io/mancala-build/`.
- **Platform limits.** GitHub Pages serves only static files, so the two browsers have to talk through someone else's servers.
- **What the live check found (2026-11-24).** The first version connected the browsers directly over WebRTC (Trystero), using relays only to introduce them. Two players on the same Wi-Fi never connected. Both pages waited, as if they were in different rooms. Many networks (office and guest Wi-Fi, and some home routers) stop devices from reaching each other directly, and fixing that would need a TURN relay service with an account. Decision 1 was revised as a result.

## Goals / Non-Goals

**Goals:**
- No server to run or pay for. The site stays a static Pages site.
- Every game and chat rule lives in pure, tested TypeScript (and Rust for replay). The network library sits behind a small interface, so all the online logic can be tested in jsdom with an in-memory stand-in.
- Both browsers reach the same state through the same rules, with no "server copy" of the game.

**Non-Goals:**
- Stopping a determined cheater. Each browser checks every move, so a buggy or tampered peer can't put the game into an illegal state. But a friend could still, for example, run an AI in another tab. This is play between friends.
- Speed. Moves take a fraction of a second through the relays, which is plenty for a turn-based game.

## Decisions

### 1. Every message goes through public Nostr relays, with our own small client behind our own interface

*Revised 2026-11-24 after the live check. The first version used Trystero to connect the browsers directly over WebRTC; see "What the live check found" in Context.*

Kalah is turn-based and its messages are tiny: a move is a few bytes, and a hello with the whole room record is under 1 kB. So there's no need for a direct connection at all. Every message goes through public **Nostr relays**. These are free, independently run message relays that a browser reaches over an ordinary secure websocket (`wss://`), like any website, so they work wherever the site itself loads. That includes two players on the same Wi-Fi.

**How a message travels** (`online/relays.ts` and friends):
- **Relays.** A few well-known public relays (task 8.1 picks them by checking that they accept and pass on our messages). Each message is published to all of them, and each browser subscribes on all of them. One relay being down doesn't matter.
  - **Chosen in task 8.1 (probed 2026-11-24).** Each candidate was asked to pass an ephemeral, `x`-tagged event from one socket to another.
    - **Passed** (delivery time): `nostr.mom` 34 ms, `relay.snort.social` 32 ms, `relay.nostr.dev.br` 30 ms, `relay.primal.net` 55 ms, `relay.nostr.net` 66 ms, `nos.lol` 94 ms, `offchain.pub` 197 ms, `nostr.bitcoiner.social` 216 ms.
    - **Failed:** `relay.damus.io`, `relay.nostr.band`, `nostr.oxtr.dev`, `relay.mostr.pub`, `nostr-pub.wellorder.net` and `nostr.robosats.org` wouldn't connect. `nostr.wine` needs an account. `relay.degmods.com` didn't deliver.
    - **The `RELAYS` constant:** `nos.lol`, `relay.primal.net`, `nostr.mom`, `relay.snort.social` and `relay.nostr.net`. That is five relays from different operators.
- **The room's address on the relays.** The *topic* is `SHA-256("mancala-trainer:" + roomKey)`, written in hex.
  - Each event carries the tag `["x", topic]`.
  - Its *kind* is in the 20000–29999 range, which Nostr calls *ephemeral*: relays pass these events on to subscribers but don't store them.
  - Relays never see the room name.
- **Encryption.** The content is AES-GCM ciphertext, made with the browser's own Web Crypto. The key is derived from the room key with PBKDF2, and every message has a fresh random IV. Anyone who knows the room name can read a room's messages, which is the same as being able to join it.
- **Signing.** Nostr requires every event to be signed (Schnorr over secp256k1). Each tab makes a throwaway key when it connects. Our one new dependency is `@noble/secp256k1`, a tiny, audited library with no dependencies, pinned to an exact version at least two weeks old. Its public key is the tab's `PeerId`.
- **Inside the encrypted content:** `{ id, to?, data }`.
  - `id` is random, and lets a message that arrives from several relays be handled once.
  - `to` is set when a message is meant for one peer only, such as `inUse`; the others ignore it.
  - `data` is the wire message from decision 4, still `unknown` until `parseMessage` checks it.
  - Anything that fails to decrypt or parse is dropped.
- **Presence**, since there is no connection to open or close:
  - every tab sends a small **beat** every 5 seconds;
  - a peer *joins* when its first beat or message arrives;
  - a peer *leaves* after 15 seconds of silence, or at once on a **bye**, which is sent on leaving or when the page closes (`pagehide`).
  - Beats and byes stay inside the transport; the app sees only `onPeerJoin` / `onPeerLeave`, as before.
- **Nothing lost on the way.** Relays don't promise delivery or order. A move can't be applied out of order, because the reducer only accepts the next index. So the hook re-sends its **hello every 10 seconds** while the other player is connected. The existing `reconcile` (the further-on record wins) brings a page that missed a move up to date within one round, about 15 seconds at worst. Chat messages aren't re-sent; losing one is rare, and chat is never stored anyway.
- **Reaching the relays.** The client reconnects to each relay with growing delays (1 s, 2 s, 4 s, … capped at 30 s). If no relay has connected within 10 seconds, the page says that online play can't connect right now (*Reaching the online service*), and it keeps trying.

**Alternatives considered:**
- **Keep WebRTC and fall back to relays when it fails** (option A). Fast where direct connections work, but two transports to build and test, and a wait before the fallback starts. Rejected: one path for everyone is simpler, and relays are fast enough for turns.
- **A TURN relay service** (Metered, ExpressTURN, Cloudflare). Every option needed an account, and either public credentials or a server of our own.
- **Trystero just for its Nostr helpers** (it exports `createEvent` and `subscribe`). Rejected: it depends on the library's internals, and brings the whole WebRTC library along.
- **`nostr-tools`.** A capable library, but far more than five relay messages need. The small client is also easy to read and test.
- **PeerJS, copy-paste offers, or a relay we run.** These were already rejected in the first version: PeerJS's IDs stay taken after a refresh, pasting offers is clumsy, and we chose not to run a server.

**It is loaded only when needed.** `online/relays.ts` and the signing library are imported with a dynamic `import()`, so players who never go online don't download them.

**Our interface** (`online/transport.ts`):

```
interface RoomConnection {
  send(message: OnlineMessage, to?: PeerId): void   // to everyone in the room, or one peer
  onMessage(handler: (data: unknown, from: PeerId) => void): void
  onPeerJoin(handler: (peer: PeerId) => void): void
  onPeerLeave(handler: (peer: PeerId) => void): void
  onReachable(handler: (reachable: boolean) => void): void   // added with the relays: is any relay connected?
  leave(): void
}
type Connect = (roomKey: string) => Promise<RoomConnection>
```

The data arrives as `unknown`, because it came from another browser and has to be checked (decision 4). There are two implementations: the relay client, and `test/network.ts`, an in-memory network. The test network links connections that share a room key. It can delay or drop deliveries, and disconnect a peer, so tests can act out drops, refreshes and a third visitor.

### 2. Rooms are found by name, and close when not full

The user chose this on 2026-11-24, replacing random codes: people should be able to type a room name rather than pass links around.

- **Room key.** `roomKey(typed)` is the normalised name: trimmed, lower-cased (`toLocaleLowerCase` after NFC), with runs of spaces collapsed to one. It must then be 3–30 characters of letters (`\p{L}`), digits, spaces and hyphens, or it is `null`. The key decides the room's topic and encryption key on the relays (decision 1). The *display* name is the name as the first player in the room typed it, after trimming.
- **Why this is safe enough.** A name like "friday rematch" can be guessed, so anyone who types it can enter. The spec accepts that for a casual game between friends, and adds three limits:
  - a room is *in use* once two people are in it;
  - a seat left by a dropped player can be retaken only under that player's name (decision 3);
  - the page warns before entering.

  The relays see only a hash of the key, and encrypted messages. That hides rooms from casual relay snooping, though not from someone who guesses the name.
- **Closing after 10 minutes without two players** (`ROOM_IDLE_MS = 10 * 60_000`). Nothing outlives the browsers, because no server holds rooms. A room "exists" only while someone is in it, so freeing the name means the last person in it leaves. Each tab in a room runs one timer. It starts whenever fewer than two players are connected (including the start, while waiting), resets when both are connected, and on expiry the tab:
  - leaves the room (sending a bye);
  - deletes the saved record;
  - shows why ("nobody joined" or "Sam didn't come back").

  Each tab measures with its own clock, so machines whose clocks disagree don't matter. Both players' tabs see the same drop, so both close at about the same time.
- **A tab that comes back** (refresh, or a laptop waking up) checks the saved record's `lastTogetherAt`. That is the last time both players were connected, or the opening time if nobody ever joined. If that's 10 minutes or more ago, the tab discards the record and enters the name as a new room. Otherwise it rejoins.
- **The share link** is only a convenience: `…/mancala-build/#room=friday%20rematch`. It opens the Online choice with the name filled in. The `#` part never leaves the browser, and GitHub Pages serves the same `index.html`, so no routing is needed.
- **Alternatives considered:**
  - random codes in links: private, but people have to pass links around, which the user didn't want;
  - a name plus a short suffix: readable, but still something to pass around;
  - a server that reserves names: no server, by choice (decision 1).

### 3. A room record that both browsers keep, and the rule that settles differences

Each browser keeps a `RoomRecord` for its room:

```
RoomRecord {
  key, name               // the room key and the display name (decision 2)
  openedAt: number        // when the first player opened it (their own clock), for the tie-break below
  seats: { first: Seat, second: Seat | null }   // Seat = { id, name }
  game: number            // 0 for the first game, +1 for each rematch
  moves: number[]         // this game's pits, in order, from the starting position
  rematch: { first: boolean, second: boolean }
  results: number[]       // one per earlier game: first player's store minus second's (added for the match score)
}
```

- **The first player in** is whoever opened the room. They play South in even games and North in odd games. So a rematch (`game + 1`, `moves: []`) swaps sides without anyone deciding it, as *Rematch* requires.
- **The match score comes from the results** (added 2026-11-24 for *Match score*).
  - `results[i]` is game *i*'s final store difference from the first player's side: positive means they won, negative means they lost, 0 is a draw. There is exactly one entry for each earlier game, so `results.length === game`.
  - The game that just finished isn't in `results` until the rematch starts. Instead, `matchScore(record)` adds it from the replayed board when that game is over. That way the score shows the moment the game ends, and nothing is counted twice.
  - The rematch appends it (`askRematch`). Because results travel inside the record, reconcile and refresh carry the score with no extra messages.
  - Wins are counted from the sign of each entry, and the tie-break is the sum of the entries. That is just the seed total from the first player's side.
- **The position comes from the moves.** `replayMoves(moves)` rebuilds the board (decision 6), so a record can always be checked from scratch.
- **Seat ids.** Each tab makes a random seat id when it enters a room, and keeps it in `sessionStorage` with the record (decision 7). That is how a refreshed tab proves it is the same player.

**When two browsers meet** (a first join, a reconnect, or both refreshed), each sends `hello { seatId, name, record }`. Both then run the same pure function, `reconcile(mine, theirs)`:

1. A record that fails `replayMoves` is ignored.
2. **The further-on record wins**, comparing `(game, moves.length, seats filled, rematch requests)`. Counting seats means a room already in use always beats a newcomer's brand-new record, even if the newcomer's clock is behind (found while writing task 2.3).
3. On a tie, the record of the **earlier-opened room** wins, comparing `(openedAt, first.id)`. This is *Entering at the same moment*. Both tabs thought they opened an empty room, and both pick the same winner. The loser becomes the second player. The tie-break only has to be the same in both browsers, not fair, so the clocks don't need to agree.

This needs no "host" to be online. It also covers a move lost in a drop: if Sam's move left Sam's browser but never reached Ed's, Sam's record is one move longer and wins, so Ed's page gets the move.

There can't be two *different* records with moves of the same length. Only the player to move can add a move, and nobody can move while the other is away. So step 3 only ever decides between two brand-new rooms.

**Who may sit where** is also decided the same way in both browsers. After reconciling, `meet` admits the two players **in order of seat id**, so both browsers seat them in the same order. When a hello arrives with an unknown seat id:

- if the second seat is empty, the newcomer takes it;
- if a seat's player isn't connected right now **and** the newcomer's name matches that seat's name (compared like room keys), the newcomer takes it over (*Taking over a seat that was left behind*);
- otherwise the newcomer is sent `inUse` and ignored from then on (*A stranger can't take a seat*).

A third visitor connects to both players, and both see each other connected, so both say `inUse`. Nothing about the game changes.

*Concepts:* making a pure function of both sides' data the single source of agreement, instead of electing a leader.

### 4. Messages and how they're checked

`online/protocol.ts` defines every message as a TypeScript union, with a version field `v: 1`:

- `hello { seatId, name, record }`
- `move { game, index, pit }`
- `chat { id, text }`
- `rematch { game }`
- `leave {}`
- `inUse {}`

`parseMessage(data: unknown): OnlineMessage | null` checks every field before anything is used:

- the types;
- integer ranges (`pit` 0–5; moves at most 200 per game, far more than any real game; `results` exactly one per earlier game, each −48 to 48);
- player name 1–20 characters after trimming, and a room name that passes `roomKey`;
- chat text 1–300 characters;
- ids of a fixed shape.

Anything else is `null` and dropped, which is how *A bad message is ignored* is met.

**A `move` is applied only if** `game` is the current game, `index === moves.length`, it is the sender's side to move, and the pit is legal. That covers *Moves are checked in both browsers*. The sender adds its own move the same way, through the reducer, and sends it only if the reducer accepted it.

**Plain text by construction.** Names and messages are rendered as React text children, never `dangerouslySetInnerHTML`, and never linkified. React escapes them, so markup shows as typed.

### 5. The online state: a reducer for the room, a reducer for the chat, and one hook that does the talking

Following the existing pattern, the logic is pure, and the effects live in one place:

- **`game/online.ts`: the `onlineReducer`.** It holds:
  - the record and `me` (seat id and role);
  - `peer`: `'none' | 'connected' | 'away' | 'left' | 'inUse'`, and `closed`: `null | 'nobodyCame' | 'didntComeBack'`;
  - the derived `board`, and `lastMove` / `caption` for the animation;
  - `phase`: `'waiting' | 'yours' | 'theirs' | 'animating' | 'over' | 'closed'`.

  Its events are `created`, `joined`, `helloReceived`, `peerLeft`, `movePlayed`, `moveReceived`, `animationDone`, `rematchAsked`, `rematchReceived`, `leftReceived`, `inUseReceived` and `roomClosed`. A received move animates with the same `PlayedMove` shape the game reducer uses, so `usePlayback` and `Board` need no changes. Adopting a whole record on reconnect does not animate: the board just shows the result.
- **`game/chat.ts`: the `chatReducer`.** It holds:
  - `messages`, up to the latest 200, with duplicates (the same `id`) dropped;
  - `open`;
  - `unread`, which goes up only for the friend's messages while closed, and is cleared by `opened`.
- **`online/useOnlineRoom.ts`: the only code that touches the network.** Given `connect`, the room key and the seat, it:
  - connects;
  - turns transport callbacks into reducer events, through `parseMessage`;
  - offers the actions `play(pit)`, `say(text)`, `askRematch()` and `leave()`, each of which dispatches locally and then sends;
  - saves the record and chat to `sessionStorage` after each change;
  - re-sends its hello every 10 seconds while the other player is connected (decision 1, *Nothing lost on the way*), shows "can't connect right now" when the transport reports that no relay is reachable, and runs the 10-minute not-full timer that closes the room (decision 2), keeping `lastTogetherAt` up to date.

  Because reducers stay pure, sending is done by the action functions, never inside a reducer.

*Concepts:* the same "pure core, thin effects" split as the AI worker and the analysis client.

### 6. Rust: `Board::replay` and `ReplayError` in `mancala-core`

```
pub struct ReplayError { pub index: usize, pub error: MoveError }
impl Board { pub fn replay(moves: &[usize]) -> Result<Board, ReplayError> }
```

`replay` starts from `Board::new()` and plays each pit in turn. At the first `Err`, it returns `ReplayError { index, error }`, and it never returns a half-replayed board. This is a good fit for `iter().enumerate()` with `?` and `map_err`, or `try_fold`. The task tries both and keeps the clearer one.

`MoveError` and `ReplayError` gain `impl Display` and `impl std::error::Error`. This is std only, so the crate still has no dependencies. The CLI keeps its own friendlier wording, so its output doesn't change.

**Why in Rust and not a TypeScript loop over `play()`?** It is a rule about games, so it belongs with the rules, it's testable natively, and it's a natural first custom error type. WASM exports `replayMoves(moves: Uint8Array) -> Result<WasmBoard, JsError>`, whose message names the place and reason. `engine.ts` wraps it as `replayMoves(moves: number[]): BoardSnapshot`, which throws.

### 7. What is stored where

| What | Where | Why |
|---|---|---|
| Your name | `localStorage` `mancala.name` | Remembered for next time (*Names*). |
| Room record, seat id, chat, `lastTogetherAt` | `sessionStorage` `mancala.room.<key>` | It survives a refresh in the same tab, and is gone when the tab closes (*Chat lasts as long as the tab*). A new tab isn't confused with the old one. |

Every read and write is wrapped in `try`/`catch`. Storage can be blocked, for example in a private window. Then a refresh simply joins as a new player, which the takeover rule (decision 3) still handles. Leaving a room deletes its `sessionStorage` entry.

### 8. The page

- **`App` gains a third mode, `'online'`.** It joins `'game' | 'puzzles'`, and uses the existing playback order. `App` takes an `online?: { connect, storage }` prop (by default the relay client and the real storage), so tests can pass the in-memory network. Two `App`s can then be rendered in one test, one for each player.
- **New game sheet.** The Online card is enabled. Choosing it hides the level and order choices, and shows:
  - **Your name** (remembered);
  - **Room name**, checked as you type, with a hint: "3–30 letters, numbers, spaces or hyphens";
  - the note: "Anyone who types the same room name can join." (Revised 2026-11-24: the IP-address sentence went with WebRTC, and the relays aren't mentioned, because players don't need to know about them.)

  **Start game** becomes **Enter room** while Online is chosen.
- **Opening a shared link.** On load, a valid `#room=` name opens the New game sheet with Online chosen and the room name filled in. If this tab already has a saved record for that room that hasn't expired, it rejoins silently with no sheet. Closing the sheet clears the fragment and shows the default game.
- **`OnlineStatus`** takes the status slot (under the board, or in the header on a sideways phone), the same way `PuzzleStatus` does:
  - while waiting: the room name, "Waiting for someone to join", **Copy link** (`navigator.clipboard`, with a selectable field as fallback), or "Can't connect to online play right now. Still trying…" while no relay is reachable;
  - during a game: "Your turn" or "Sam's turn", and the caption;
  - "Sam has lost connection. Waiting for them to come back.", "Sam has left the room.", "This room is in use. Try another name.", or "The room closed: nobody joined in 10 minutes." / "…Sam didn't come back within 10 minutes.";
  - at the end: the result with **Rematch**, then "Waiting for Sam…" or "Sam wants a rematch".
- **Header.** The room name ("Friday rematch") sits beside the matchup "Ed vs Sam". Once a game has finished, that becomes the score, "Ed 2 – 1 Sam". On a sideways phone just "2 – 1" shows, and screen readers get the full score. When a game ends, the status adds the match line, for example "Match: Ed 1 – 1 Sam · Ed leads by 7 seeds". On a sideways phone the room name is visually hidden but kept for screen readers (like `puzzle-title-long`), and it is shown as the chat panel's title instead. A **Chat** button carries the unread badge. The badge is a count in the button's accessible name, for example "Chat, 2 unread".
- **`ChatPanel`** is a non-modal panel, so the board stays playable on desktop:
  - It docks to the right of the board on desktop, and covers the board on a sideways phone, with a close button.
  - It has a list of messages with an `aria-live="polite"` region, a text box with `maxLength={300}`, and **Send**. Enter sends. Send is disabled while `peer !== 'connected'`, with a short reason.
  - Whether it's open is kept for the visit, but not stored.
- **Names in captions.** `moveCaption(name, outcome)` already takes a name. Online passes "You" for your own moves and the friend's name for theirs. That gives "You capture 6 seeds." and "Sam plays pit 4 and captures 6 seeds.", following the explainer's wording.
- **Analyze isn't offered**, because the `move-explainer` spec allows it only against the computer. The online status line doesn't take an `onAnalyze` prop.

## Risks / Trade-offs

- **[The public Nostr relays could be slow, down, rate-limited, or drop messages]**
  - Every message goes to several relays, and one is enough.
  - The 10-second hello re-sync recovers lost moves, and the page says when no relay can be reached.
  - Relays could start refusing our events (some ask for proof of work or payment). Task 8.1 picks relays that accept them, and the list is one constant.
  - Everything sits behind `Connect`, so moving to other relays, or to a relay we run, is a contained change.
- **[Messages take longer than a direct connection]**
  - Measured in task 8.7: about 50 ms per message, and about 0.2 s to join. That's far quicker than feared, and fine for turns.
- **[The relays see who is talking]**
  - Relays see each player's IP address (as any website does), a hashed topic, and ciphertext, but not the room name or the moves. Players no longer see each other's addresses.
- **[Beats cost a little traffic]**
  - A beat every 5 s to each relay is a few hundred bytes. Beats stop when the tab leaves the room.
- **[A move in flight when the connection drops]**
  - The record-reconcile rule (decision 3) recovers it on reconnect. A chat message in flight at that moment may be lost. That's acceptable, because chat is not stored anyway.
- **[Someone else guesses or reuses a room name]**
  - They can only enter an empty room, or join someone who is waiting alone. Once two people are in it, the room is in use, and a dropped seat needs the same player name.
  - The worst case is a stranger joining someone who is waiting. They can play and chat, but the player can leave at any time.
  - Mitigation: the warning before entering, and the suggestion to pick a less common name. Reporting or blocking stays out of scope.
- **[Two groups pick the same name at the same time]** → The first two people in play. The others are told it's in use and pick another name.
- **[A tampered peer]**
  - It can't put the game into an illegal position: moves are checked, and records are replayed. It *could* send messages of the right shape, such as leaving or asking for a rematch. That's acceptable in a game between friends (see Non-Goals).
- **[`App.tsx` keeps growing]**
  - The room logic lives in `online/` and `game/online.ts`, and the status and chat in their own components. `App` only picks the mode, the move to animate, and the status to show.
  - If it passes about 400 lines, task 5.4 extracts the per-mode `Board` props into a helper.
- **[Background tabs barely run timers]**
  - A player who switches tab would come back to moves still being sown at about one step a second.
  - Mitigation: hidden pages skip the sowing animation (`usePageVisible`), so the board is up to date on return. Found in the task 5.5 browser check.
- **[The signing library changes between versions]**
  - It's pinned to an exact version, and is used in one file.
  - The relay client is tested in jsdom against a fake relay. The real relays are checked by hand (tasks 8.7 and 8.8).

## Migration Plan

Nothing to migrate. Nothing is stored on any server. The new `localStorage` key holds only the name. It is published by the Pages workflow on merge to `main`, and rolled back by reverting the merge. Rooms are never stored, so a room name is free again once its room closes.

## Open Questions

None left. Which relays to use is settled by task 8.1.

*History.* **Resolved in task 3.2, then replaced by the revised decision 1:** Trystero is pinned at exactly **0.26.0** (2026-10-04). `import { joinRoom } from 'trystero'` re-exports the Nostr strategy (`@trystero-p2p/nostr`). In this version:
- `room.onPeerJoin` and `room.onPeerLeave` are properties you assign;
- `room.makeAction(name)` returns an object with `send(data, { target })` and an assignable `onMessage(data, { peerId })`;
- `room.leave()` returns a promise.

`online/trystero.ts` adapted these to `RoomConnection`. Task 8.6 removes it.
