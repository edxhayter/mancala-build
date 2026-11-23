# Tasks

> **How to use this list.** Each task names the concepts to read, then gives hints that start vague and get more specific, inside a collapsed block. Open them one at a time, only when you're stuck. If the hints aren't enough, ask Claude for the next rung of hints, and then for the solution if you want it. Solutions are deliberately left out of this file so they can't spoil the puzzle.
>
> Spec scenarios live in `specs/kalah-rules/spec.md`, and design decisions in `design.md`. The **(test first)** tasks should fail (or not compile) when you write them. That's expected.

## 1. Workspace setup

- [x] 1.1 Create a Cargo workspace at the repo root with one library crate, `crates/mancala-core`, and add a `.gitignore` for `target/`. Verify: `cargo test` from the repo root runs and reports 0 failures (the default generated test is fine).
  - **Read:** Book ch. 1.3 (Cargo), ch. 14.3 (Cargo Workspaces).
  <details><summary>Hint 1</summary>A workspace root `Cargo.toml` has a `[workspace]` section and no `[package]`. Look up the `members` key and the `resolver` key.</details>
  <details><summary>Hint 2</summary><code>cargo new --lib crates/mancala-core</code> creates the crate. Check that the edition in its Cargo.toml is the newest one your toolchain supports.</details>

- [x] 1.2 Set up the module skeleton: `lib.rs` declares `mod board;` and `mod rng;`, both files exist (empty is fine), and add an empty `tests/rules.rs`. Verify: `cargo build` succeeds with no errors.
  - **Read:** Book ch. 7 (Packages, Crates and Modules), especially 7.2 and 7.5.
  <details><summary>Hint 1</summary>A <code>mod foo;</code> line tells the compiler to look for <code>src/foo.rs</code>. Without that line the file is ignored completely.</details>
  <details><summary>Hint 2</summary>Files in <code>tests/</code> are compiled as separate crates. They import your library by its crate name, with hyphens turned into underscores.</details>

## 2. Player

- [x] 2.1 **(test first)** Write unit tests (a `#[cfg(test)] mod tests` inside `board.rs`) for: `opponent()` of each player, the store index of each player (6 and 13), relative pit to absolute index (South 0 → 0, North 0 → 7, North 5 → 12), and the opposite of an absolute index (scenario *Opposite pits*: South 1 ↔ North 4, North 0 ↔ South 5). Verify: tests exist and fail to compile because the items don't exist yet.
  - **Read:** Book ch. 11.1 (How to Write Tests), 11.3 (Test Organization: unit tests).
  <details><summary>Hint 1</summary>Inside the test module, <code>use super::*;</code> brings everything from the parent module into scope, private items included.</details>
  <details><summary>Hint 2</summary>For the opposite test, check both directions with absolute indices: opposite(1) should be 11 and opposite(11) should be 1. Then work out what 1 and 11 are in relative terms.</details>

- [x] 2.2 Implement `enum Player { South, North }` with `opponent()`, a store-index helper, a relative-to-absolute pit helper, and a free or associated `opposite(index)` function. Add derives and a `///` doc comment on the enum. Verify: all 2.1 tests pass.
  - **Read:** Book ch. 6.1–6.2 (Enums, `match`), ch. 5.3 (Method Syntax), Appendix C (Derivable Traits).
  <details><summary>Hint 1</summary>A <code>match self { Player::South => ..., Player::North => ... }</code> is the core of every helper. The compiler forces you to handle both arms. That's a feature: add a third player someday and it'll tell you every place to update.</details>
  <details><summary>Hint 2</summary>You'll want to compare and copy players freely, and print them in test failures. Which four derives does that need?</details>
  <details><summary>Hint 3</summary>The opposite formula only needs one subtraction (see design.md decision 2). Think about why it works for both sides of the ring.</details>

## 3. Board basics

- [x] 3.1 **(test first)** In `tests/rules.rs`, write integration tests for the scenarios *New game*, *Reading a position* and *Legal moves at the start*. Verify: the tests exist and fail to compile.
  - **Read:** Book ch. 11.3 (Integration tests).
  <details><summary>Hint 1</summary>These tests may only use <code>pub</code> items. If you find yourself wanting to read a private field, that's a sign the public API is missing a method.</details>

- [x] 3.2 Implement `pub struct Board` with private fields (`[u8; 14]` and the player to move), `Board::new()`, and getters `pits(player)`, `store(player)`, `to_move()`. Re-export `Board` and `Player` from `lib.rs` and give each public item a `///` doc comment. Verify: *New game* and *Reading a position* pass, and `cargo doc --open` shows the documented API.
  - **Read:** Book ch. 5.1–5.3 (Structs, methods, associated functions), ch. 7.3–7.4 (`pub`, `use`, re-exports with `pub use`).
  <details><summary>Hint 1</summary><code>Board::new()</code> is an associated function (no <code>self</code>) that returns <code>Self</code>. Array repeat syntax builds an array where every element has the same value.</details>
  <details><summary>Hint 2</summary>For <code>pits(player)</code>, you need six consecutive elements of the array starting at that player's first pit. Look up slicing with ranges. Then decide (an open question in design.md) whether to return the slice itself or copy it into a <code>[u8; 6]</code>. <code>try_into()</code> is one way to do the copy.</details>
  <details><summary>Hint 3</summary>If <code>pits</code> returns <code>&[u8]</code>, the compiler links that borrow to <code>&self</code>. That's lifetime elision in action (ch. 10.3, just skim it for now).</details>

- [x] 3.3 Implement `Board::from_parts(south_pits, south_store, north_pits, north_store, to_move)` with a doc comment saying it does not check seed totals. Add a test that builds the *Empty pits are not legal* position and reads it back. Verify: that test passes.
  <details><summary>Hint 1</summary>Start from an all-zero array and copy each side in. <code>copy_from_slice</code> on a sub-slice is worth looking up.</details>

- [x] 3.4 Implement `legal_moves()` returning the pit numbers (0..=5) on the mover's side that have seeds. For now, ignore the game-over case (task 7.3 adds it). Verify: *Legal moves at the start* and *Empty pits are not legal* pass.
  - **Read:** Book ch. 8.1 (Vectors), ch. 13.2 (Iterators). The iterator version is optional but worth trying.
  <details><summary>Hint 1</summary>Returning a <code>Vec&lt;usize&gt;</code> is the simplest choice. A loop with <code>push</code> works fine.</details>
  <details><summary>Hint 2</summary>Iterator version: a range over 0..6, keep only the pits with seeds, then collect. Look up <code>filter</code> and <code>collect</code>.</details>

## 4. Move API and validation

- [x] 4.1 **(test first)** Write tests for *Pit number out of range*, and for *Empty pit* using `from_parts` (a position where the chosen pit is 0). Each test also asserts the position is unchanged. Verify: the tests exist and fail to compile.
  <details><summary>Hint 1</summary><code>assert_eq!(result, Err(MoveError::EmptyPit))</code> needs <code>MoveError</code> to derive <code>PartialEq</code> and <code>Debug</code>. Also look up <code>matches!</code> as an alternative.</details>

- [x] 4.2 Define `MoveError` (`PitOutOfRange`, `EmptyPit`, `GameOver`) and `MoveOutcome { extra_turn, captured }`. Add a private `apply(&mut self, pit)` that only validates for now (returns a default outcome when the move is valid), and a public `play(&self, pit) -> Result<(Board, MoveOutcome), MoveError>` built on it as in design.md decision 4. Add derives (`Board` needs `Clone, Copy, PartialEq, Eq, Debug`) and doc comments. Verify: the 4.1 tests pass.
  - **Read:** Book ch. 9.2 (`Result`, the `?` operator), ch. 4.1–4.2 (ownership, references and borrowing).
  <details><summary>Hint 1</summary>Inside <code>play</code>: make a copy of <code>*self</code> into a mutable local, call <code>apply</code> on it, and use <code>?</code> to pass any error straight back.</details>
  <details><summary>Hint 2</summary>Why can you write <code>let mut b = *self;</code> at all? Try removing <code>Copy</code> from the derive and read the compiler error carefully. It's one of the most important errors in Rust.</details>
  <details><summary>Hint 3</summary>Validate in the order: out of range, then empty. (Game over is added in 7.3.) Checking the range first matters: what would happen if you indexed the array with pit 99 before checking?</details>

## 5. Sowing and turn passing

- [ ] 5.1 **(test first)** Write tests for *Simple sow from the start*, *Sowing crosses onto the opponent's side*, *Opponent's store is skipped*, and *North chooses a pit by its own numbering*. Verify: the tests compile but fail (nothing moves yet).
  <details><summary>Hint 1</summary>A small test helper, e.g. a function that asserts a board's pits and stores for both players in one call, will make the dozens of scenario tests ahead much shorter. Helpers in <code>tests/</code> files are ordinary functions.</details>

- [ ] 5.2 Implement sowing in `apply`: pick up all the seeds from the pit and drop one into each following slot, skipping the opponent's store. Then set the player to move to the opponent (extra turns come next). Verify: all 5.1 tests pass.
  - **Read:** Book ch. 3.5 (Control flow: `loop`, `while`), ch. 3.2 (integer types; note the `%` operator).
  <details><summary>Hint 1</summary>Track two things: the current index, and how many seeds are left in your hand. Each step moves the index forward around the ring of 14.</details>
  <details><summary>Hint 2</summary>The skip is a check inside the loop: if the next index is the opponent's store, advance once more before dropping. Make sure a skipped slot doesn't use up a seed.</details>
  <details><summary>Hint 3</summary>Remember the last index you dropped into. Extra turns (5.4) and captures (6.2) both depend on it, so have the sowing step end with it available.</details>

- [ ] 5.3 **(test first)** Write tests for *South earns an extra turn*, *North earns an extra turn* and *No extra turn otherwise*, checking both `to_move()` and `MoveOutcome::extra_turn`. Verify: the tests fail.

- [ ] 5.4 Implement the extra turn: if the last seed landed in the mover's own store, keep the same player and report `extra_turn: true`. Verify: the 5.3 tests and all earlier tests pass.
  <details><summary>Hint 1</summary>This is a single comparison between the last index and the mover's store index. The <code>Player</code> helpers from 2.2 pay off here.</details>

## 6. Captures

- [ ] 6.1 **(test first)** Write tests for *South captures*, *North captures*, *No capture when the opposite pit is empty*, *No capture on the opponent's side*, *No capture when landing in a non-empty own pit*, and *A lap of 13 seeds returns to the starting pit*, including the `captured` counts. Verify: the tests fail.

- [ ] 6.2 Implement captures as described in the *Capture* requirement and record the count in `MoveOutcome::captured`. Verify: all 6.1 tests and all earlier tests pass.
  <details><summary>Hint 1</summary>"Landed in an empty pit" means the pit holds exactly 1 seed after sowing: the one you just dropped.</details>
  <details><summary>Hint 2</summary>There are three conditions, and all must hold: the last index is on the mover's side (not a store), that pit now holds exactly 1, and the opposite pit is non-zero.</details>
  <details><summary>Hint 3</summary>If the 13-seed lap test fails but the others pass, check whether you emptied the starting pit <em>before</em> sowing began. When does the origin pit become 0 in your code?</details>

## 7. Game end and status

- [ ] 7.1 **(test first)** Write tests for *Mover empties their own side*, *Mover empties the opponent's side by capturing*, *Game-ending move into own store gives no extra turn*, *In progress*, *North wins*, *South wins* and *Draw*. Verify: the tests fail.

- [ ] 7.2 Define `pub enum Status { InProgress, Finished { winner: Option<Player> } }` and implement `status()`. After every move in `apply`, check whether either side is empty, sweep the leftover seeds to each owner's store, and make sure a game-ending move reports no extra turn. Add doc comments. Verify: all 7.1 tests pass.
  - **Read:** Book ch. 6.1 (enums holding data), ch. 6.1 again for `Option<T>`, ch. 6.3 (`if let`).
  <details><summary>Hint 1</summary>Work out <code>status()</code> from the board itself (design.md decision 5): if every pit is empty the game is finished, so compare the two stores. No stored flag needed.</details>
  <details><summary>Hint 2</summary><code>Ordering</code> from <code>std::cmp</code> plus <code>match a.cmp(&b)</code> is a neat way to get win, lose or draw in one expression.</details>
  <details><summary>Hint 3</summary>Order matters inside <code>apply</code>: sow → capture → game-end check and sweep → decide who moves next. Doing the sweep before the extra-turn decision makes the "no extra turn when the game ends" rule easy.</details>

- [ ] 7.3 Make `play` reject any move on a finished board with `GameOver`, and make `legal_moves()` return an empty list when the game is over. Add the *Game already over* test. Verify: it passes, along with all earlier tests.
  <details><summary>Hint 1</summary>Which validation check should come first now, and why?</details>

## 8. Invariants over random games

- [ ] 8.1 Implement a small xorshift64 RNG in `rng.rs` (`new(seed)`, `next_u64()`, and a helper that picks an index below `n`) with a unit test showing two RNGs with the same seed produce the same sequence. Verify: the RNG unit test passes.
  - **Read:** Book ch. 3.2 (integer types, overflow behaviour), Rust reference on the `^`, `<<` and `>>` operators. Search "xorshift64" for the three shift constants (13, 7, 17).
  <details><summary>Hint 1</summary>The state must never be 0 (xorshift gets stuck there). Decide what <code>new(0)</code> should do.</details>
  <details><summary>Hint 2</summary>"Index below n" can just be <code>next_u64() % n</code>. It's slightly biased, which doesn't matter for tests. Make the helper <code>pub</code> so the integration tests (and change 6) can use it.</details>

- [ ] 8.2 **(test)** Add a *Conservation over random games* test: from a fixed seed, play at least 2,000 games to the end by picking random legal moves. After every move, assert there are 48 seeds in total. At the end, assert `Status::Finished` and that all pits are empty. Add a move cap per game so a bug causes a test failure instead of an infinite loop. Verify: the test passes and takes under a few seconds with `cargo test --release`.
  <details><summary>Hint 1</summary>Structure: an outer loop over games, an inner loop while the status is in progress. Pick a random move from <code>legal_moves()</code> and replace the board with the result of <code>play</code>.</details>
  <details><summary>Hint 2</summary>If it fails, print the seed and move number in the assert message (<code>assert_eq!(a, b, "game {} move {}", g, m)</code>) so you can replay exactly that game.</details>

- [ ] 8.3 **(test)** Add the *Exploring two moves from one position* test, and extend 8.2 to assert that the board before each `play` is unchanged afterwards. Verify: both pass.
  <details><summary>Hint 1</summary>Because <code>Board</code> is <code>Copy + PartialEq</code>, keeping a copy and comparing with <code>assert_eq!</code> is all it takes.</details>

## 9. Final checks

- [ ] 9.1 Run `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings` and `cargo test` across the workspace, and fix anything reported. Verify: all three exit cleanly.
  <details><summary>Hint 1</summary>Clippy suggestions are a great way to learn idiomatic Rust. For each one, read the linked explanation rather than just applying the fix.</details>

- [ ] 9.2 Check that every spec scenario in `specs/kalah-rules/spec.md` has a matching test (a comment with the scenario name above each test makes this easy). Verify: no scenario is missing a test.

## Stretch goals (optional, not tracked)

- Introduce a `Pit` newtype that can only hold 0..=5 (e.g. `Pit::new(n) -> Option<Pit>`) and change `play` to take it. What happens to `MoveError::PitOutOfRange`? (Book ch. 19.3 / "newtype pattern".)
- Implement `std::fmt::Display` and `std::error::Error` for `MoveError` (Book ch. 9, and ch. 10.2 on traits).
- Try `pits()` both ways, as `[u8; 6]` and as `&[u8]`, and note which one is easier for callers.

## Workflow follow-up

- Archive the change once all tracked tasks are done and reviewed (`openspec archive add-kalah-engine`).
