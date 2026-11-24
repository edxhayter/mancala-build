# Tasks

> **How to use this list.** Each task is a block Claude writes and explains. You read it, ask questions, and commit at natural stopping points. **Your piece (optional)** marks something small you can do yourself, or hand back.
>
> Specs: `specs/move-explainer` and the `ai-opponent` delta. Design: `design.md`. A Rust task is done when `cargo fmt --check`, `cargo clippy --workspace --all-targets -- -D warnings` and `cargo test --workspace` pass. A web task is done when `npm run typecheck` and `npm test` pass in `web/`. Each spec scenario's test is marked with a `Scenario:` comment.

## 1. The line of best play (Rust)

- [x] 1.1 **(test first, then implement)** In `search.rs`, add `MoveLine` and `search_lines(board, depth)` with a line-tracking `minimax_line` (design.md decisions 1 and 2). Tests: *Lines agree with the scores* (300 random positions at depths 1–6, compared with `search_scores`), *A line proves its score* (replay each line: every move is legal, the length is at most `depth` and shorter only if the game ends, and `evaluate` of the end equals the score), and *Lines for a winning and a losing move* (the `Plays the winning move` position at depth 12). Verify: the tests pass, and `search_scores` and its tests are unchanged.
  - **Concepts:** passing `&mut Vec<usize>` down a recursion, `clear` / `push` / `extend_from_slice`, the "strictly better" rule for keeping a line, the principal variation and why pruning doesn't break it.
  - **Your piece (optional):** write the "replay a line and evaluate the end" test helper.
- [x] 1.2 **(test first, then implement)** Add `explain.rs` with `EXPLAIN_DEPTH` and `explain_moves(board)`, sorted best first and stable for ties (design.md decision 3), and re-export them. Tests: the order is best first, ties keep pit order, and every legal move appears once. Then measure `search_lines` against `search_scores` at depth 12 on 50 `puzzle_stats` positions. Add it as a section of the example, record the ratio in design.md's Risks, and switch to a reused buffer only if it's above about 3×. Verify: the tests pass, the ratio is recorded, and `cargo tree -p mancala-ai -e normal` still lists only core.
  - **Concepts:** stable sorting (`sort_by_key` keeps equal items in order), `Reverse`, timing with `Instant`.

## 2. The WASM API and the engine wrapper

- [x] 2.1 **(test first, then implement)** In `mancala-wasm`, add `WasmMoveLine` and `explainMoves(board)`, returning a `Vec` of them and an error for a finished game (design.md decision 4). Native tests: the result matches `mancala_ai::explain_moves` for a few positions, and a finished game is an error. Verify: `cargo test -p mancala-wasm` passes, `npm run wasm` rebuilds, and the `.d.ts` shows `explainMoves(board: WasmBoard): WasmMoveLine[]`.
  - **Concepts:** returning `Vec<T>` of exported structs, `Result<Vec<T>, JsError>`.
- [x] 2.2 **(test first, then implement)** In `engine.ts`, add `MoveExplanation` and `explainMoves(board)`, freeing every WASM object. Tests against the real WASM: the start position explains 6 moves, best first, each line starting with its own pit, and a finished board throws. Verify: `npm test` passes.

## 3. Words, steps and the explainer state (pure TypeScript)

- [x] 3.1 **(test first, then implement)** Write `describeLine(board, explanation, names)` in `game/explain.ts` (design.md decision 5): `now` (extra turn, captures N, or nothing), `result` in words (win, lose, draw, level, N ahead, N behind), the `steps` with captions, and `best`. Tests use real lines from `explainMoves` and hand-made ones: *Best first, in words*, *Equal best moves*, each result phrase, and the captions "You play pit 5." and "Opponent plays pit 2 and captures 6 seeds.". Verify: the tests pass.
  - **Your piece (optional):** write the function that turns a final position and score into the result words.
  - **Done as:** `describeMoves` (the whole list, with `best` worked out from the top score) on top of `describeLine`, `stepCaption` and `resultWords` (your optional piece, if you want to rewrite it).
- [x] 3.2 **(test first, then implement)** Write the explainer reducer in `game/explainer.ts` (design.md decision 7): `opened`, `analysisAsked`, `analysisArrived` (ignored when stale), `showWhy`, `nextMove`, `back` and `closed`. Tests cover opening on the list, *Stepping through a line* (steps advance, and there is no Next move after the last), *Back from a replay*, and *A late analysis is ignored* (a different `gameId` or board). Verify: the tests pass.
  - **Concepts:** a reducer for UI flow, union types for the view (`list` | `replay`), deriving the board to draw.
  - **Done as:** the design's events plus `stepLanded`. A replay step's animation ending marks it landed, and **Next move** only works after that. A late analysis is ignored when the explainer isn't waiting for it, or the game id or board doesn't match.

## 4. The analysis worker

- [x] 4.1 **(test first, then implement)** Rename `PuzzleClient` to `AnalysisClient` (and `puzzle.worker.ts` to `analysis.worker.ts`), add `explain(board)`, and have `make(seed)` attach the puzzle's `explanation` (design.md decision 6). Update the direct client, `manualPuzzles` (now also recording explain requests) and the supply. Tests: a made puzzle carries an explanation with its answer first and starred, and `explain` answers for a game position. Verify: all the existing puzzle tests pass after the rename, and the new tests pass.
  - **Done as:** `src/analysis/client.ts` and `analysis.worker.ts`, plus the `test/analysis.ts` helpers (`manualAnalysis`, and `fakePuzzle` for made-up puzzles with a real explanation). The explanation is attached inside `engine.newPuzzle`, so the direct and worker clients behave the same. App's prop is now `analysis`. The supply stays in `puzzles/`.

## 5. The explainer in the page (React)

- [x] 5.1 **(test first, then implement)** Build the `Explainer` sheet (the list, with the pit number, star, `now`, `result` and Show why for each pit) and the `ReplayBar` (caption, Next move, Back). In `App`, wire them in with the playback priority from design.md decision 7, and add **Why?** to `PuzzleStatus` in phase `done`. Tests: *Why after solving*, *No explanation while solving*, *Best first, in words* (through the page), *Stepping through a line* (instant speed), *Back from a replay*, closing returns to the finished puzzle with Next puzzle working, and the sheet's focus and Escape. Verify: the tests pass, and **you've opened Why? on a few puzzles in the browser** and stepped through a line.
  - **Concepts:** reusing a dialog pattern, choosing what to animate from several states, `aria-live` captions.
- [x] 5.2 **(test first, then implement)** Add **Analyze** to the game's status line (only for `phase === 'human'` against the AI), with "Analyzing…", the `analysisAsked` / `analysisArrived` wiring through `AnalysisClient.explain`, and closing back to the game. Tests: *Analyze on your turn* (the same position and mover after closing, and no move played), *Not on the computer's turn*, *Not in two-player games* and *A late analysis is ignored* (both a new game and a move played while analyzing). Verify: the tests pass, the existing game tests pass, and **you've analyzed a few positions in a game in the browser**.
- [x] 5.3 Check the explainer on a sideways phone: the sheet fits the short screen (scrolling inside if needed), and the replay bar sits in the header's status slot. Add a test (with `matchMedia` mocked) that the replay bar is in the header on a sideways phone. Verify: the test passes, and the layout is checked in a browser at phone size with nothing overlapping.
  - **Done (2026-11-24):** the test is in `phone.test.tsx`. **Browser check by Claude** on the production build in headless Chrome, at 1280×860 and a sideways phone at 844×390:
    - Analyze from the start position was ready in about 260 ms.
    - A replay showed "AI plays pit 3 and gets another turn."
    - Why? after a revealed puzzle listed every pit.
    - There were no console errors.
  - **Two fixes came out of the check:**
    1. On the phone, the sheet ran off the screen, so it is now more compact there.
    2. Several pits read "you win the game" but only one was starred, so wins and losses now say "by N seeds". The spec's words are updated to match.
  - **Still yours (also for 5.1 and 5.2):** try Why? and Analyze yourself, and step through a few lines.

## 6. Final checks

- [x] 6.1 Run the Rust checks (`cargo fmt --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace`) and the web checks (`npm run typecheck`, `npm test`, `npm run build`). Confirm `cargo tree -p mancala-core` is still empty and `cargo tree -p mancala-ai -e normal` still lists only core. Check that every scenario in `specs/move-explainer` and the `ai-opponent` delta has a test marked with a `Scenario:` comment. Verify: all clean, and none are missing.
  - **Done (2026-11-24):** Rust has 143 passed and 2 ignored (the slow release-only tests). The web suite has 148 passed, typecheck is clean, and the build succeeds. `mancala-core` still has no dependencies, and `mancala-ai` still depends only on core. Every scenario in `move-explainer` and the `ai-opponent` delta has a matching `Scenario:` comment.
- [x] 6.2 **(your step)** Merge to `main`, confirm the Pages run is green, and try Why? on a puzzle and Analyze in a game on the live site.

## Workflow follow-up

- Archive `add-puzzles` first (its task 5.2 is the live-site check), so `puzzle-play` is in the main specs before this change is archived.
- Archive this change after using the explainer on the published site for a while.

> **6.2 done (2026-11-24):** merged in PR #8, and the Pages run was green (45415406894). Archived at the user's request.
