# Tasks

> **How to use this list.** Each task is a block Claude writes and explains. You read it, ask questions, and commit at natural stopping points. **Your piece (optional)** marks something small you can do yourself, or hand back.
>
> Specs: `specs/puzzle-generation`, `specs/puzzle-play`, and the `web-play` delta. Design: `design.md`. A Rust task is done when `cargo fmt --check`, `cargo clippy --workspace --all-targets -- -D warnings` and `cargo test --workspace` pass. A web task is done when `npm run typecheck` and `npm test` pass in `web/`. Each spec scenario's test is marked with a `Scenario:` comment.

## 1. Puzzle generation (Rust)

- [x] 1.1 **(test first, then implement)** Create `crates/mancala-ai/src/puzzle.rs` with the `Puzzle` struct, the named constants and `clear_best_move(board)` (design.md decisions 1 and 3). Re-export them from `lib.rs`. Tests use hand-built positions (`Board::from_parts`): *A position with a tie for best is not a puzzle* (the start position at depth 1 has a 4-way tie, then the same idea at full depth), *A position where the best move is only slightly better is not a puzzle* (find or build one, checked against `search_scores`), a clear capture or winning move that is accepted, plus a finished game and a one-move position that are rejected. Verify: the tests pass, and `cargo tree -p mancala-ai -e normal` still lists only `mancala-core`.
  - **Concepts:** modules and `pub use` ([Book ch. 7](https://doc.rust-lang.org/book/ch07-00-managing-growing-projects-with-packages-crates-and-modules.html)), `Option`, sorting with `sort_by_key` and `std::cmp::Reverse`, slice patterns (`[best, second, ..]`).
  - **Your piece (optional):** write the "top two scores differ by at least `MARGIN`" check yourself.
- [x] 1.2 **(test first, then implement)** Write `generate_puzzle(seed)`: seeded random walks of `MIN_MOVES..=MAX_MOVES` moves from the start, retrying until `clear_best_move` accepts one (design.md decision 2). Tests: *Same seed, same puzzle*, *Puzzles come from real games* (48 seeds in total, game in progress, at least two legal moves, and the answer equals `clear_best_move` of the position), *The answer is clearly best* (searching again confirms the margin), *Every seed gives a puzzle* and *Puzzles vary*. Use a small seed count by default and the full 200 in a release-only or `#[ignore]` test, after timing them. Verify: the tests pass, and the debug-build test time stays reasonable (note it in the task).
  - **Concepts:** `loop` with `break value`, `continue`, a `&mut Rng` borrowed across a loop, property-style tests over many seeds.
  - **Proving "reached by legal play":** have the walk keep the moves it played in a test-only helper, or replay them in the test. Pick whichever reads more simply.
  - **Timing (2026-11-24):** the 6 everyday seeds take about 9 s in a debug build (12 took 18 s, so the count was halved). The full 200-seed test is `#[ignore]`d and takes 40 s with `cargo test --release -p mancala-ai -- --ignored`, about 0.2 s per puzzle including the test's own re-search. `generate_puzzle_traced` returns the moves and the candidate count for the tests and for task 1.3.
- [x] 1.3 Add `examples/puzzle_stats.rs` (design.md decision 4): generate 200 puzzles and print the candidates per puzzle, the time per puzzle (mean and worst), the answers by pit and by mover, and how many candidates margins 1–4 would keep. Run it in release, add the results as a short table to design.md decision 4, and settle `MAX_MOVES` and `MARGIN`. Look at about 10 printed puzzles and decide on the random walk vs the easy-AI walk (the design's open question). If `MARGIN` changes, update `specs/puzzle-generation` in the same task. Verify: `cargo run --release -p mancala-ai --example puzzle_stats` runs, the table is in design.md, and the open questions are answered there.
  - **Concepts:** `examples/` programs, `std::time::Instant`, simple formatted tables with `println!` width specifiers.
  - **Your piece (optional):** run the example yourself, and judge whether the sample puzzles look like positions from a real game.

## 2. The WASM API and the engine wrapper

- [ ] 2.1 **(test first, then implement)** In `mancala-wasm`, add `generatePuzzle(seed: u32) -> WasmPuzzle` with `board()` and `answer()` (design.md decision 5). Native tests: the same seed gives the same board and answer as `mancala_ai::generate_puzzle(u64::from(seed))`, and the answer is one of the board's legal moves. Verify: `cargo test -p mancala-wasm` passes, `npm run wasm` rebuilds `pkg/`, and the new types appear in the generated `.d.ts`.
  - **Concepts:** another `#[wasm_bindgen]` struct, `u32` → `u64` with `From`.
- [ ] 2.2 **(test first, then implement)** In `engine.ts`, add `PuzzleSnapshot` and `newPuzzle(seed)`, freeing the WASM objects before returning. Tests against the real WASM: the same seed gives an equal snapshot, the answer is in `legalMoves(board)`, and the game is in progress. Verify: `npm test` passes.

## 3. Puzzle state (pure TypeScript)

- [ ] 3.1 **(test first, then implement)** Add `moveCaption(name, result)` to `presentation.ts` and rewrite `caption(settings, …)` to use it (design.md decision 8), plus a `puzzleNames(puzzle)` helper for "You" and "Opponent". Verify: the existing caption tests still pass unchanged, and the new tests cover "You captured 5 seeds." and "You get another turn."
- [ ] 3.2 **(test first, then implement)** Write the puzzle reducer in `game/puzzle.ts` (design.md decision 7): the phases `loading` / `solving` / `animating` / `done`, the events `requested`, `arrived` (ignoring a stale `requestId`), `pitChosen`, `showAnswer` and `animationDone`, plus the tally. Tests use fixed puzzles built from `from_parts` positions: *The right move*, *A wrong move*, *Last try*, *Out of tries*, *Asking for the answer*, *Skipping a puzzle*, *Counting*, a wrong pit chosen twice (no change), and a pit chosen while loading or animating (no change). Verify: the tests pass.
  - **Concepts:** a second reducer with its own discriminated union, deriving values (tries left) instead of storing them, exhaustive `switch` with `never`.
  - **Your piece (optional):** write the tally logic: when a puzzle counts as played, and when it counts as solved.

## 4. Puzzles in the page (React)

- [ ] 4.1 **(test first, then implement)** Add `PuzzleClient`, its direct implementation and its worker implementation (`puzzle.worker.ts`), and the `usePuzzleSupply` hook that keeps one puzzle prepared ahead (design.md decision 6). Add a `manualPuzzles()` test helper like `manualAi()`. Tests: *Preparing a puzzle*, *The next puzzle is ready* (the second request is already made while the first puzzle is shown), and a stale arrival being ignored. Verify: the tests pass.
  - **Concepts:** a second Web Worker, Promises held in a `useRef`, effect cleanup.
- [ ] 4.2 **(test first, then implement)** Enable Puzzles in `NewGameSheet`, with `onStart` reporting `{ kind: 'game', settings } | { kind: 'puzzles' }`. Add `mode` to `App`, the puzzle header ("Puzzle · Find the best move", "Solved X of Y"), `PuzzleStatus` (the message, the tries, **Show the answer**, **Next puzzle**), and the puzzle board wiring: the viewer is the mover, the names come from `puzzleNames`, wrong pits are left out of `playable`, and the marks are passed through. Change `PuzzleMarks.wrong` to `number[]` and update the Board mark test. Tests: *Puzzles can be chosen*, *Modes that are not available yet* (now Online only), *Choosing puzzles*, *The right move*, *A wrong move*, *Asking for the answer*, *Reveal follows the animation setting*, *Skipping a puzzle*, *Counting*, *A new visit starts from zero*, *Leaving puzzles during preparation* and *Usable while preparing*. Verify: the tests pass, the existing App tests pass unchanged apart from the sheet scenario, and **you've played about 10 puzzles in the browser** and compared the page with the puzzle concept artboard.
  - **Concepts:** lifting state to `App`, conditional rendering by mode, passing a `ReactNode` into the header.
- [ ] 4.3 Check puzzles on a sideways phone: `PuzzleStatus` in the compact header, with the actions as small text buttons (design.md decision 7). Add a test (with `matchMedia` mocked) that the puzzle status and both actions are in the header on a sideways phone. Verify: the test passes, and **you've solved a puzzle on a real phone** (or in the browser's device toolbar) without anything overlapping.

## 5. Final checks

- [ ] 5.1 Run the Rust checks (`cargo fmt --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace`) and the web checks (`npm run typecheck`, `npm test`, `npm run build`). Confirm `cargo tree -p mancala-core` is still empty and `cargo tree -p mancala-ai -e normal` still lists only core. Check that every scenario in this change's three spec files has a test marked with a `Scenario:` comment. Verify: all clean, and none are missing.
- [ ] 5.2 **(your step)** Merge to `main`, and confirm the Pages run is green and puzzles work on the live site. Verify: you've solved a few puzzles at `https://edxhayter.github.io/mancala-build/`.

## Workflow follow-up

- Archive the change after playing puzzles on the published site for a while.
