# Proposal

## Why

Every mode in the trainer (puzzles, play against the AI, game review, online play) needs one trusted source of truth for the rules of Kalah. Building and fully testing that engine first, as a pure Rust crate with no UI or browser code, gives the rest of the project a solid base. It is also the gentlest way into Rust: ownership, enums, structs, error handling and testing all come up naturally here.

## What Changes

- Add a Cargo workspace with a first crate, `crates/mancala-core`, that depends only on `std`.
- Add a `Board` type for standard Kalah: 6 pits per side, 4 seeds per pit, two stores, and whose turn it is. The internal layout stays private behind a small public API.
- Add move execution: sowing counter-clockwise, skipping the opponent's store, an extra turn when the last seed lands in your own store, and captures.
- Add illegal-move handling through a `MoveError` enum. A rejected move leaves the board unchanged.
- Add game-end detection and final sweep (leftover seeds go to the owner of that side), plus a `status()` that reports in progress, win or draw.
- Add a `MoveOutcome` summary (extra turn, seeds captured) for later UI and review features.
- Add a test suite. Example-based tests cover each rule; property-style tests check invariants over many random games, using a small hand-written seeded random number generator.

### Out of scope

- Any AI or move search (change 3), CLI (change 2), WASM bindings or web UI (change 4).
- Configurable rules or other mancala variants. Seed count and rules are hard-coded.
- Move history, undo, serialisation (e.g. serde or JSON) and the `Pit` index newtype. The newtype is a stretch goal and not required to finish this change.

### Rust concepts exercised

- Cargo workspaces and crates, modules and `pub` visibility as a privacy boundary
- Structs, fixed-size arrays, enums with and without data, `match`
- `impl` blocks, `&self` vs `&mut self`, the `Copy`/`Clone` traits and `#[derive]`
- `Result`, `Option` and custom error enums
- Unit tests, `#[cfg(test)]`, `assert_eq!`, and property-style testing with a seeded RNG

## Capabilities

### New Capabilities

- `kalah-rules`: the rules of standard Kalah as the engine enforces them. Covers the starting position, legal moves, sowing, extra turns, captures, game end and scoring, and the invariants every position must satisfy.

### Modified Capabilities

None. This is the first capability in the project.

## Impact

- New: root `Cargo.toml` (workspace), `crates/mancala-core/` (library crate).
- No external dependencies.
- Every later change (CLI, AI, WASM/web, review, puzzles, P2P) will depend on `mancala-core`'s public API, so the API shape agreed here (`Board::new`, `play`, `status`, `MoveOutcome`, `MoveError`) matters beyond this change.
