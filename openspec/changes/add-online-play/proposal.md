# Proposal

## Why

So far the site only lets you play the computer, or a friend sitting at the same device. Playing a friend somewhere else is the obvious next step, and the New game sheet already shows **Online** as "coming later". The project's architecture has always planned online play as peer-to-peer over WebRTC, so that the site can stay on static GitHub Pages hosting. A chat in the room makes it feel like playing *with* someone rather than against a silent board.

## What Changes

- **Rooms you find by name.** Choosing **Online** in the New game sheet asks for your name and a room name, such as "friday rematch". If the room is empty you wait there. If someone is waiting, you join them. Your friend just types the same name, with no links needed (a Copy link is there if you want it). There are no accounts and no lobby, and a room holds exactly two players.
- **Rooms close when not full.** A room that has gone 10 minutes without two players connected closes, and its name is free again. That covers nobody turning up, and a player who drops and doesn't come back.
- **Peer-to-peer connection.** The two browsers connect directly over WebRTC. Public signalling relays are used only to introduce them. The project runs no server of its own, and the moves and chat never pass through anyone else's server.
- **Display names.** Each player gives a name (remembered for next time). It is shown in the header, in the status line and captions ("Sam plays pit 4 and captures 6 seeds."), and in the chat.
- **Playing.** Each player sees the board from their own side. You can play only on your turn. Your friend's moves arrive and are sown with the usual animation. Both browsers check every move against the rules, so a game can't drift apart.
- **Room chat.** A chat panel sends short text messages to the other player. An **unread badge** counts new messages while the chat is closed. Messages are shown as plain text and are not saved: they are kept only while the tab is open.
- **Reconnect after a drop.** If either player refreshes or loses their connection briefly, they rejoin the same room and the game carries on from where it was. While the other player is away, the page says so and the game waits.
- **Rematch.** When a game ends, both players can choose **Rematch** to play again in the same room, with sides swapped so the other player moves first. The chat carries on.
- **Leaving.** Starting any other kind of game leaves the room, and the other player is told.
- **Rust: checking a whole game.** `mancala-core` gains a way to replay a list of moves from the start and report the first illegal one, if any. Browsers use it to check the game they are handed when they reconnect.

### Out of scope

- A public lobby, a list of open rooms, matchmaking or ratings. Reporting or blocking other players. A guessed room name can bring in a stranger, but leaving is the remedy for now (see design.md Risks).
- Spectators, or rooms with more than two people.
- Accounts, saved games, game history, or chat that is saved after the tab closes.
- A relay (TURN) server for networks that block direct connections. The page says clearly when a connection can't be made.
- Clocks, time limits, or claiming a win when the other player doesn't come back.
- Emoji reactions, typing indicators, and muting.
- Analyze or Why? during online games.
- Online play in the terminal app.

### Rust concepts this change exercises

- Custom error types: a `ReplayError` that says *which* move failed and *why*, wrapping the existing `MoveError`.
- Implementing `std::fmt::Display` and `std::error::Error` for your own types, so errors print well and work with `?`.
- Iterating with `enumerate` and returning early with `?`, or folding a game with `try_fold`.
- Exposing a fallible function to JavaScript through `wasm-bindgen` (`Result<_, JsError>`).

## Capabilities

### New Capabilities
- `online-play`: playing Kalah with a friend in another browser: entering a room by its name, rooms closing when not full, player names, sides and turns, checking moves, waiting through and recovering from a dropped connection, rematches, and leaving.
- `room-chat`: text chat between the two players in an online room: sending and showing messages, limits on messages, the unread badge, and messages lasting only as long as the tab.

### Modified Capabilities
- `kalah-rules`: adds replaying a whole game from its list of moves, with the first illegal move reported.
- `web-play`: *Starting a game* now lets you choose Online, so it is no longer listed as coming later.

## Impact

- `crates/mancala-core`: game replay, its error type, and tests. Its dependencies stay at none.
- `crates/mancala-wasm`: a `replayMoves` export.
- `web/`:
  - A new **dependency**, a small WebRTC room library that uses public signalling relays, kept behind an interface the app owns so that tests use an in-memory stand-in.
  - New modules for room names and keys, the message format and its checks, the online game state, and the chat state.
  - The New game sheet's Online card, a waiting screen with the room name, an online status and Rematch, and a chat panel with a badge.
  - `App` gains a third mode, "online", alongside games and puzzles.
- **Privacy:** a direct connection means each player's browser can see the other's network (IP) address. The page says this before you enter a room. It also says that anyone who types the same room name can join, so a less common name keeps a room to yourselves.
- **Publishing:** no change to the Pages workflow. The site stays fully static.
