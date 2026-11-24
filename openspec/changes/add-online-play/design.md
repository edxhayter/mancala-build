# Design

## Context

See proposal.md for why. The requirements are in `specs/online-play`, `specs/room-chat` and the `kalah-rules` and `web-play` deltas.

What exists today:

- **`mancala-core`.** `Board::play(pit) -> Result<(Board, MoveOutcome), MoveError>`. `MoveError` has three cases, but no `Display` or `std::error::Error`. The CLI words them itself (`mancala-cli/src/game.rs`). The crate has no dependencies.
- **`mancala-wasm`.** Its wrappers turn errors into `JsError` through a `js(String)` helper, and each has a plain-Rust `try_*` twin that can be tested natively.
- **`web/`.** The game, puzzle and explainer reducers are pure functions. `App.tsx` (about 310 lines) owns them all, along with one `usePlayback` for the animation and one `Board`. `presentation.ts` words captions from a name (`moveCaption(name, outcome)`). The animation speed is kept in `localStorage`. The page is static, published to `https://edxhayter.github.io/mancala-build/`.
- **Platform limits.** GitHub Pages serves only static files, so the two browsers have to find each other through someone else's servers. WebRTC needs a *signalling* step: two browsers swap connection offers through any channel, and then talk directly over an encrypted data channel.

## Goals / Non-Goals

**Goals:**
- No server to run or pay for. The site stays a static Pages site.
- Every game and chat rule lives in pure, tested TypeScript (and Rust for replay). The network library sits behind a small interface, so all the online logic can be tested in jsdom with an in-memory stand-in.
- Both browsers reach the same state through the same rules, with no "server copy" of the game.

**Non-Goals:**
- Stopping a determined cheater. Each browser checks every move, so a buggy or tampered peer can't put the game into an illegal state. But a friend could still, for example, run an AI in another tab. This is play between friends.
- Working on every network. Without a TURN relay, some strict corporate or mobile networks can't connect (see Risks).

## Decisions

### 1. Signalling: Trystero over public Nostr relays, behind our own interface

The web app adds one dependency: **Trystero**. It joins browsers into a named "room" and handles the WebRTC offers, answers and STUN for us. Its default strategy swaps offers through public **Nostr relays**, a network of free, independently run message relays. With `password` set to the room key (decision 2), Trystero encrypts the offers it posts, so the relays see only a hashed topic and ciphertext. After that, the browsers talk directly over a WebRTC data channel, which is encrypted (DTLS) and ordered.

**Alternatives considered:**
- **PeerJS cloud.** One free broker. Its last release was mid-2025. A peer's ID stays "taken" for a while after a refresh, which works against *Rejoining after a refresh*. It is also one company's server, so if it's down, online play is down.
- **Copy-paste offers by hand.** No third party at all, but the codes are hundreds of characters long, and a refresh would need a fresh swap. That is far too clumsy compared with typing a room name.
- **A relay we run (for example a Cloudflare Worker).** The most reliable option, but the project chose not to own a server (asked 2026-11-24).

**Version.** We pin an exact version at least two weeks old when the task is done. 0.26.0 (2026-10-04) is the candidate. 0.27.0 is too new and restructures the packages. The task checks the import path and the `joinRoom` / `makeAction` / `onPeerJoin` / `onPeerLeave` API on the pinned version before writing the adapter.

**It is loaded only when needed.** `online/trystero.ts` imports Trystero with a dynamic `import()`, so players who never go online don't download it.

**Our interface** (`online/transport.ts`):

```
interface RoomConnection {
  send(message: OnlineMessage, to?: PeerId): void   // to everyone in the room, or one peer
  onMessage(handler: (data: unknown, from: PeerId) => void): void
  onPeerJoin(handler: (peer: PeerId) => void): void
  onPeerLeave(handler: (peer: PeerId) => void): void
  leave(): void
}
type Connect = (roomKey: string) => Promise<RoomConnection>
```

The data arrives as `unknown`, because it came from another browser and has to be checked (decision 4). There are two implementations: the Trystero adapter, and `test/network.ts`, an in-memory network. The test network links connections that share a room key. It can delay or drop deliveries, and disconnect a peer, so tests can act out drops, refreshes and a third visitor.

### 2. Rooms are found by name, and close when not full

The user chose this on 2026-11-24, replacing random codes: people should be able to type a room name rather than pass links around.

- **Room key.** `roomKey(typed)` is the normalised name: trimmed, lower-cased (`toLocaleLowerCase` after NFC), with runs of spaces collapsed to one. It must then be 3–30 characters of letters (`\p{L}`), digits, spaces and hyphens, or it is `null`. The key is Trystero's room id, with `appId: 'mancala-trainer'`, and it is also Trystero's `password`. The *display* name is the name as the first player in the room typed it, after trimming.
- **Why this is safe enough.** A name like "friday rematch" can be guessed, so anyone who types it can enter. The spec accepts that for a casual game between friends, and adds three limits:
  - a room is *in use* once two people are in it;
  - a seat left by a dropped player can be retaken only under that player's name (decision 3);
  - the page warns before entering.

  Trystero hashes the room id into the relay topic and encrypts the offers with the password. That hides rooms from casual relay snooping, though not from someone who guesses the name.
- **Closing after 10 minutes without two players** (`ROOM_IDLE_MS = 10 * 60_000`). Nothing outlives the browsers, because no server holds rooms. A room "exists" only while someone is in it, so freeing the name means the last person in it leaves. Each tab in a room runs one timer. It starts whenever fewer than two players are connected (including the start, while waiting), resets when both are connected, and on expiry the tab:
  - leaves the Trystero room;
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
}
```

- **The first player in** is whoever opened the room. They play South in even games and North in odd games. So a rematch (`game + 1`, `moves: []`) swaps sides without anyone deciding it, as *Rematch* requires.
- **The position comes from the moves.** `replayMoves(moves)` rebuilds the board (decision 6), so a record can always be checked from scratch.
- **Seat ids.** Each tab makes a random seat id when it enters a room, and keeps it in `sessionStorage` with the record (decision 7). That is how a refreshed tab proves it is the same player.

**When two browsers meet** (a first join, a reconnect, or both refreshed), each sends `hello { seatId, name, record }`. Both then run the same pure function, `reconcile(mine, theirs)`:

1. A record that fails `replayMoves` is ignored.
2. **The further-on record wins**, comparing `(game, moves.length)`.
3. On a tie, the record of the **earlier-opened room** wins, comparing `(openedAt, first.id)`. This is *Entering at the same moment*. Both tabs thought they opened an empty room, and both pick the same winner. The loser becomes the second player. The tie-break only has to be the same in both browsers, not fair, so the clocks don't need to agree.

This needs no "host" to be online. It also covers a move lost in a drop: if Sam's move left Sam's browser but never reached Ed's, Sam's record is one move longer and wins, so Ed's page gets the move.

There can't be two *different* records with moves of the same length. Only the player to move can add a move, and nobody can move while the other is away. So step 3 only ever decides between two brand-new rooms.

**Who may sit where** is also decided the same way in both browsers. When a hello arrives with an unknown seat id:

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
- integer ranges (`pit` 0–5, and moves at most 200 per game, which is far more than any real game);
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
  - runs the 30-second "networks may block direct connections" timer, and the 10-minute not-full timer that closes the room (decision 2), keeping `lastTogetherAt` up to date.

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

- **`App` gains a third mode, `'online'`.** It joins `'game' | 'puzzles'`, and uses the existing playback order. `App` takes an `online?: { connect, storage }` prop (by default Trystero and the real storage), so tests can pass the in-memory network. Two `App`s can then be rendered in one test, one for each player.
- **New game sheet.** The Online card is enabled. Choosing it hides the level and order choices, and shows:
  - **Your name** (remembered);
  - **Room name**, checked as you type, with a hint: "3–30 letters, numbers, spaces or hyphens";
  - the note: "Anyone who types the same room name can join. Playing online connects your browser directly to theirs, so each can see the other's network address."

  **Start game** becomes **Enter room** while Online is chosen.
- **Opening a shared link.** On load, a valid `#room=` name opens the New game sheet with Online chosen and the room name filled in. If this tab already has a saved record for that room that hasn't expired, it rejoins silently with no sheet. Closing the sheet clears the fragment and shows the default game.
- **`OnlineStatus`** takes the status slot (under the board, or in the header on a sideways phone), the same way `PuzzleStatus` does:
  - while waiting: the room name, "Waiting for someone to join", **Copy link** (`navigator.clipboard`, with a selectable field as fallback), and the 30-second note;
  - during a game: "Your turn" or "Sam's turn", and the caption;
  - "Sam has lost connection. Waiting for them to come back.", "Sam has left the room.", "This room is in use. Try another name.", or "The room closed: nobody joined in 10 minutes." / "…Sam didn't come back within 10 minutes.";
  - at the end: the result with **Rematch**, then "Waiting for Sam…" or "Sam wants a rematch".
- **Header.** The room name ("Friday rematch") sits beside the matchup "Ed vs Sam". On a sideways phone the room name is visually hidden but kept for screen readers (like `puzzle-title-long`), and it is shown as the chat panel's title instead. A **Chat** button carries the unread badge. The badge is a count in the button's accessible name, for example "Chat, 2 unread".
- **`ChatPanel`** is a non-modal panel, so the board stays playable on desktop:
  - It docks to the right of the board on desktop, and covers the board on a sideways phone, with a close button.
  - It has a list of messages with an `aria-live="polite"` region, a text box with `maxLength={300}`, and **Send**. Enter sends. Send is disabled while `peer !== 'connected'`, with a short reason.
  - Whether it's open is kept for the visit, but not stored.
- **Names in captions.** `moveCaption(name, outcome)` already takes a name. Online passes "You" for your own moves and the friend's name for theirs. That gives "You capture 6 seeds." and "Sam plays pit 4 and captures 6 seeds.", following the explainer's wording.
- **Analyze isn't offered**, because the `move-explainer` spec allows it only against the computer. The online status line doesn't take an `onAnalyze` prop.

## Risks / Trade-offs

- **[Some networks block direct WebRTC connections, and there's no TURN relay]**
  - Typical public STUN success is around 85–90%. When it fails, both pages simply keep waiting.
  - Mitigation: the 30-second note suggests another network such as mobile data. A TURN service can be added later, as a Trystero config option, without changing the specs.
- **[The public Nostr relays could be slow, down, or rate-limited]**
  - Trystero uses several relays at once, so one going down is survivable.
  - The signalling sits behind `Connect`, so moving to another Trystero strategy (MQTT or BitTorrent trackers) or to our own relay is a contained change.
  - Mitigation: the manual check in task 6.2 tests the real relays from two different networks.
- **[Each player can see the other's IP address]**
  - That is inherent to peer-to-peer. The page says so before entering a room (*Entering a room by name*).
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
- **[Trystero's API changes between versions]**
  - Pinning an exact version and the single adapter file limit the damage.
  - Mitigation: the adapter's only test is the manual two-browser check, because WebRTC can't run in jsdom.

## Migration Plan

Nothing to migrate. Nothing is stored on any server. The new `localStorage` key holds only the name. It is published by the Pages workflow on merge to `main`, and rolled back by reverting the merge. Rooms are never stored, so a room name is free again once its room closes.

## Open Questions

- The exact Trystero version and import path, confirmed in task 3.2 against the release at least two weeks old. This doesn't change the interface in decision 1.
