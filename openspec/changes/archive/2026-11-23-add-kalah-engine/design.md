# Design

## Context

The repository is empty apart from OpenSpec, so this change sets the code layout that every later change builds on. See proposal.md for the motivation and specs/kalah-rules/spec.md for the exact rules and scenarios. The developer is new to Rust, so each decision below also notes what it teaches.

Later changes that shape this design:
- **Change 3 (minimax AI)** will call "play a move" millions of times and needs to try many moves from one position cheaply.
- **Change 4 (WASM + web UI)** will wrap this crate. The crate must not depend on anything browser-specific.
- **Changes 5 and 6 (review, puzzles)** need to build arbitrary positions and ask "who won?" of any position.

## Goals / Non-Goals

**Goals:**
- A small public API that is hard to misuse: callers cannot put the board into an impossible state.
- All rules logic in one place, so a rules bug is fixed once.
- Tests that read like the spec scenarios.

**Non-Goals:**
- Speed tuning. Make it correct first. Change 3 measures performance before any optimisation.
- Move history, undo, serialisation, `Display` pretty-printing. A `Debug` derive is enough for now; a pretty printer is a natural fit for change 2's CLI.

## Decisions

### 1. Cargo workspace from day one

```
mancala_trainer/
  Cargo.toml              # [workspace] members = ["crates/*"]
  crates/
    mancala-core/
      Cargo.toml
      src/
        lib.rs            # declares modules, re-exports the public API
        board.rs          # Board, Player, Status, MoveOutcome, MoveError
        rng.rs            # tiny seeded RNG (test support, reused in change 6)
      tests/
        rules.rs          # integration tests: spec scenarios via the public API
```

**Why:** changes 2 and 4 add `crates/mancala-cli` and `crates/mancala-wasm` next to the core crate. Setting up the workspace now costs one extra `Cargo.toml` and avoids moving files later.
**Alternative:** a single crate at the repo root. That's simpler today, but it means a restructure in change 2.
**Teaches:** crates vs modules, `lib.rs`, the difference between unit tests (inside `src/`) and integration tests (`tests/`, which can only see the public API, exactly like a real user of the crate).

### 2. Board: a private flat array of 14 slots, behind methods

```
 index:   0  1  2  3  4  5 | 6  | 7  8  9 10 11 12 | 13
          South pits 0..5  | S  | North pits 0..5  | N
                           |store|                  |store
 opposite(i) = 12 - i      (for pit indices 0..5 and 7..12)
```

`Board { pits: [u8; 14], to_move: Player }`. Both fields are private. Callers use methods: `pits(player) -> [u8; 6]` (or a slice), `store(player) -> u8`, `to_move()`, `status()`, `legal_moves()`, `play(pit)`.

**Why:** sowing is a single loop, `i = (i + 1) % 14`, skipping the opponent's store, and the opposite pit is one subtraction. Keeping the array private means the 0..13 layout is an internal detail that can never leak into the CLI, UI or AI code.
**Alternatives:**
- *Public array.* Same sowing code, but every caller has to know that index 6 is a store. Mistakes compile silently.
- *Two `Side { pits: [u8; 6], store: u8 }` structs.* Very readable, but sowing has to jump between two arrays, which makes the loop noticeably harder to get right.
**Teaches:** `pub` vs private fields, why a module boundary protects invariants, `impl` blocks, small helper methods.

`u8` is enough: there are only 48 seeds in the game.

### 3. Player as an enum with helper methods

`enum Player { South, North }`, with methods such as `opponent()`, `store_index()` and `pit_index(pit: usize)` (relative pit 0..5 to absolute index).

**Why:** all the "which side am I on" arithmetic lives in one tested place. Both South and North go through the same code path, which is why the spec has mirrored scenarios to catch asymmetry bugs.
**Teaches:** enums, `match`, `impl` on an enum, `#[derive(Clone, Copy, PartialEq, Eq, Debug)]`.

### 4. Layered move API: private `apply(&mut self)`, public `play(&self)`

```
 play(&self, pit) --copy self--> tmp --tmp.apply(pit)--> Ok((tmp, outcome))
                                           |
                                all the rules live here:
                                validate -> sow -> capture? -> game end? -> next player
```

- `fn apply(&mut self, pit: usize) -> Result<MoveOutcome, MoveError>`: changes the board in place. It validates first, so an error leaves the board untouched.
- `pub fn play(&self, pit: usize) -> Result<(Board, MoveOutcome), MoveError>`: copies, applies and returns the copy. The original is never changed.

`Board` derives `Clone, Copy, PartialEq, Eq, Debug`. It's 15 bytes, so copying is about as cheap as passing a pointer.

**Why:** the sowing loop is naturally written as "change this array". Minimax (change 3) naturally wants "give me the child position and leave the parent alone". Layering gives both from one implementation of the rules.
**Alternatives:** only `&mut self` (minimax then needs clone-before-move or a tricky `undo`), or only `&self -> Board` (the sowing code has to build a new array by hand, which is clumsier).
**Teaches:** `&self` vs `&mut self`, the `Copy` trait, value semantics, returning tuples, the `?` operator.

### 5. Results: `MoveOutcome`, `MoveError` and `Status`

```
struct MoveOutcome { extra_turn: bool, captured: u8 }      // Copy, cheap
enum   MoveError   { PitOutOfRange, EmptyPit, GameOver }
enum   Status      { InProgress, Finished { winner: Option<Player> } }   // None = draw
```

- `captured` counts every seed moved into the store by a capture, including the capturing seed itself (see the Capture scenarios).
- `extra_turn` is `false` on a game-ending move.
- `status()` is worked out from the board: the game is finished if and only if all pits are empty, which is always true after the final sweep. No separate "game over" flag is stored, so it can never get out of sync.

**Why:** the UI and game review need to know *what happened* without comparing two boards. An event list (`Vec<Event>`) was rejected because it allocates on every move, which would slow down minimax, and the UI can animate sowing itself.
**Teaches:** structs vs enums, enums carrying data, `Option`, writing a custom error type. Implementing `std::fmt::Display` and `std::error::Error` for `MoveError` is a small optional extension.

### 6. Building test positions

The spec scenarios need arbitrary positions, e.g. `South [1,0,0,2,0,0] ...`. Add a constructor such as `Board::from_parts(south_pits, south_store, north_pits, north_store, to_move)`.

**Visibility choice:** make it `pub`, but document that it does not check the 48-seed total. Puzzles (change 6) and the analysis features need to build positions anyway, and integration tests in `tests/` can only call `pub` items.
**Alternative:** `#[cfg(test)]` or `pub(crate)`. That hides it, but then integration tests can't use it, so the scenarios would have to be unit tests inside `board.rs`.
**Teaches:** constructors as associated functions (`Self { .. }`), the trade-off between visibility and convenience.

### 7. Property-style tests with a hand-written seeded RNG

`rng.rs` holds a tiny xorshift64 generator: a `u64` state and a `next_u64()` that does three shift-xor steps, plus a helper to pick an index below `n`. A test plays a few thousand random games from a fixed seed and checks after every move that there are 48 seeds, that `play` didn't change the original, and that every game ends.

**Why:** no dependency, completely repeatable (the same seed gives the same games, so a failure can be reproduced), and change 6 needs seeded randomness for puzzle generation anyway.
**Alternative:** the `proptest` crate. It's more powerful (it shrinks failing cases to minimal examples), but it adds a dependency and a macro DSL to learn. It can be revisited later.
**Teaches:** bit operations, wrapping arithmetic, `loop`/`while let`, writing test helpers.

## Risks / Trade-offs

- **[Off-by-one errors in sowing and the 13-seed lap]** → the spec includes explicit lap, skip-store and mirrored scenarios. Write those tests first.
- **[South-only bugs: logic that silently assumes South]** → every rule with a side has a North scenario, and random games exercise both players.
- **[`from_parts` allows inconsistent positions, e.g. a game that should be over, or the wrong total]** → document it. Optionally let `status()` stay correct on any input by working out "finished" from the pits rather than a flag.
- **[The fixed array layout is a hidden convention]** → all index arithmetic is confined to `Player`/`Board` helper methods with their own unit tests. No other module sees an absolute index.
- **[The API shape becomes load-bearing for changes 2–7]** → kept small on purpose. Adding methods later is easy; removing them is a breaking change.

## Open Questions

- Should `pits(player)` return `[u8; 6]` (a copy) or `&[u8]` (a borrowed slice)? Both satisfy the spec. Trying both is a good borrowing exercise, and the choice can be made while coding.
- Introduce the `Pit` newtype (only 0..=5 is representable) now or later? It's a stretch goal. It changes the type signature of `play`, but not any behaviour in the spec.
