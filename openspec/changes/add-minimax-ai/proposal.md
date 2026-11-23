# Proposal

## Why

The only computer opponent is a bot that plays random legal moves, which is no challenge and teaches nothing about the game. A trainer needs an opponent that actually plays well, at adjustable strengths. The later features (game review, hints, puzzles) also need something that can judge which moves are good. A minimax search built on the engine's `play(&self)` is the natural next step. It's also the first time performance matters in this project, so the change measures speed before tuning anything.

## What Changes

- Add a third workspace crate, `crates/mancala-ai`, a std-only library that depends only on `mancala-core`. It can be reused unchanged by the web UI later.
- Add a game-tree search: minimax with alpha-beta pruning. It scores positions by the difference between the stores (with a large bonus or penalty for a won or lost game), and it handles extra turns correctly, so the same player moves again rather than the turn alternating automatically.
- Add three named strength levels, **easy**, **medium** and **hard**, each a fixed search depth chosen using the benchmarks.
- When several moves score equally, the AI picks one at random using the existing seeded `Rng`. Games vary, but replay exactly with the same `--seed`.
- Add benchmarks with the `criterion` crate, as a dev-dependency of `mancala-ai` only, plus a small report of positions searched and time per depth.
- Add the AI to the terminal game: `--opponent ai` and `--level easy|medium|hard` (default medium). The random bot stays as `--opponent random`, and hotseat is unchanged.
- Add tests: tactics (it takes a winning capture, it finds a forced win), every move it plays is legal, the same seed gives the same moves, alpha-beta agrees with plain minimax, and strength (the AI beats the random bot almost every time, and harder levels beat easier ones).

### Out of scope

- Time-limited search (iterative deepening), transposition tables, opening books and endgame databases. Benchmarks come first, and these are candidates for later.
- Explaining the AI's moves, hints for the human, or game review. Those are later changes, built on this search.
- Changing the default opponent. A plain `mancala` still plays the random bot.
- Any change to the rules or to `mancala-core`'s public API.

### Rust concepts exercised

- Recursion, and why alpha-beta can skip whole branches safely
- Enums carrying data (`Controller::Ai(Level)`), `impl` blocks on enums, `i32` arithmetic and constants
- Writing property-style tests that compare two implementations
- Dev-dependencies, `benches/` with `criterion`, `--release` builds, and `#[ignore]` for slow tests
- Measuring before optimising: `std::time::Instant`, counting work done

## Capabilities

### New Capabilities

- `ai-opponent`: the computer opponent's move choice. Covers legality, strength levels, how ties are broken, repeatability with a seed, and the tactical and playing-strength guarantees the tests check.

### Modified Capabilities

- `terminal-play`: *Choosing how to play* gains the `ai` opponent and the `--level` option. A new requirement makes everything the spec says about "the bot" (side choice, board view, move announcements, recap, seed) apply to the AI too.

## Impact

- New crate `crates/mancala-ai`, picked up by the workspace's `crates/*` glob.
- `crates/mancala-cli` gains a dependency on `mancala-ai`, plus changes to `args.rs`, `game.rs` and `main.rs`.
- Second external crate, `criterion`, used only for `mancala-ai`'s benchmarks. It isn't part of the library or the `mancala` binary. `Cargo.lock` grows accordingly.
- No changes to `mancala-core` or its spec.
