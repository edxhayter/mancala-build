# Tasks

> **How to use this list.** Each task is a block Claude writes and explains. You read it, ask questions, and commit at natural stopping points. **Your piece (optional)** marks something small you can write yourself, or hand back.
>
> Specs: `specs/ai-opponent/spec.md` (new) and `specs/terminal-play/spec.md` (changes). Design: `design.md`. A task is done only when `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings` and `cargo test` pass.

## 1. Crate setup

- [x] 1.1 Create `crates/mancala-ai` (library) depending on `mancala-core`, with `criterion` as a dev-dependency and a `[[bench]] name = "search", harness = false` entry with an empty benchmark. Verify: `cargo build -p mancala-ai` succeeds, `cargo tree -p mancala-ai -e normal` lists only `mancala-core`, and `cargo tree -p mancala-core` still lists nothing.
  - **Concepts:** `[dependencies]` vs `[dev-dependencies]`, bench targets, why `harness = false` (design.md decision 1).
  - **Your piece (optional):** add `criterion` with `cargo add --dev criterion -p mancala-ai` and compare what it writes.

## 2. Evaluation and plain minimax

- [x] 2.1 **(test first, then implement)** Write unit tests for `evaluate`: the start position scores 0, being 3 seeds ahead scores +3 (and -3 for the other player), a finished win scores above `WIN`, and a finished loss scores below `-WIN`. Then implement `evaluate` and `WIN` (design.md decision 3). Verify: the tests pass.
  - **Concepts:** `const`, `i32` vs `u8` (and why to convert before subtracting), `match` on `Status`.
- [x] 2.2 **(test first, then implement)** Write tests for a plain, test-only `minimax_full` (no pruning): at depth 1 the capture position scores pit 1 best, an extra-turn position keeps maximising for the same player, and depth 0 returns `evaluate`. Then implement it recursively, counting positions in a `&mut u64` (design.md decision 2). Verify: the tests pass.
  - **Concepts:** Book ch. 3.3 (functions), recursion, `&mut` parameters, deciding max or min from `board.to_move()`.
  - **Your piece (optional):** write the depth-0 / game-over base case.

## 3. Alpha-beta

- [x] 3.1 **(test first)** Write the property test (design.md decision 4): for 300 random positions (reached by seeded random play from the start) and depths 1–5, the alpha-beta search and `minimax_full` give the same score for every root move, and alpha-beta searches no more positions. Verify: it fails to compile, because the alpha-beta search doesn't exist yet.
- [x] 3.2 Implement the alpha-beta `minimax` and the public `search_scores(board, depth) -> SearchResult { scores, nodes }`, which uses a full window per root move (design.md decision 5). Verify: the 3.1 test passes, and print (in the test output) how many positions alpha-beta saved across the run.
  - **Concepts:** why pruning is safe (the opponent would never allow that line), `alpha`/`beta` as "already guaranteed" bounds, `break` out of a loop.

## 4. Choosing a move

- [x] 4.1 **(test first, then implement)** Write tests for *Takes the big capture*, *Plays the winning move*, *Same seed, same move* and *Only best moves are chosen*, plus `Level::depth()` increasing from easy to hard. Then implement `Level` and `choose_move(board, level, rng)` with the seeded tie-break (design.md decisions 5 and 6). Verify: all the tests pass.
  - **Concepts:** `Iterator::max`, `filter`, collecting the best moves, `impl` on an enum.
  - **Your piece (optional):** write `Level::depth()`.

## 5. Strength and speed

- [x] 5.1 In `tests/strength.rs`, write *Never plays an illegal move* (all levels, both sides, many seeds, against the random bot), *Medium is a real challenge* (100 games, at least 90 wins), and an `#[ignore]`d *Harder beats easier*. Verify: `cargo test -p mancala-ai` passes, and `cargo test --release -p mancala-ai -- --ignored` passes.
  - **Concepts:** integration tests for a library, `#[ignore]`, release vs debug test speed (design.md decision 9).
- [x] 5.2 Add `examples/depth_table.rs` (positions searched and time for depths 1–10 from the start and a mid-game position) and the criterion benchmarks in `benches/search.rs` (design.md decision 7). Run both in release mode, pick the final depths for easy, medium and hard, update `Level::depth()`, and record the chosen depths and measured times in design.md decision 6. Verify: hard takes under about 0.5 s per move in release, and the 5.1 tests still pass with the final depths.
  - **Concepts:** `std::time::Instant`, `criterion::black_box`, reading criterion's report, measuring before optimising.
  - **Your piece (optional):** run the depth table yourself and suggest the depths before Claude updates them.

## 6. The AI in the terminal

- [x] 6.1 **(test first, then implement)** Extend `args.rs`: tests for *Playing the AI*, *Choosing the AI's level*, *Invalid option value* (now listing `ai`) and *Invalid level*; then add `Opponent::Ai`, a `Level` value enum and `--level` (default `medium`), mapping to `mancala_ai::Level`. Verify: the tests pass, and `--help` shows the new option.
- [x] 6.2 **(test first, then implement)** In `tests/game_play.rs`, add *The AI announces its moves*, *Recap of the AI's turn* and *Replaying a game against the AI*. Then add `Controller::Ai(Level)`, `Controller::is_computer()`, `Players::against(human, opponent)` (replacing `against_bot`), and an AI turn that calls `choose_move`. Update the viewer and recap checks to use `is_computer()` (design.md decision 8). Verify: the new tests and every existing CLI test pass.
  - **Concepts:** enum variants carrying data, `matches!`, refactoring with the compiler's help.
- [x] 6.3 Wire up `main`: `--opponent ai --level …` builds the AI player, and the seed is printed for any computer opponent. Add a binary test that `--opponent ai --level hard` followed by `q` exits successfully and prints a seed. Verify: the tests pass, and you can play a full game against each level by hand.
  - **Your piece (optional):** play one game at each level and say whether the strengths feel right.

## 7. Final checks

- [ ] 7.1 Run `cargo fmt --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace`, and `cargo test --release -p mancala-ai -- --ignored`. Confirm `cargo tree -p mancala-core` is empty and `cargo tree -p mancala-ai -e normal` lists only `mancala-core`. Verify: all clean.
- [ ] 7.2 Check that every scenario in both delta specs has a test with a `// Scenario:` comment. Verify: none are missing.

## Workflow follow-up

- Archive the change after reviewing it and playing against each level.
