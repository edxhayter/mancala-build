# Design

## Context

See proposal.md for why. The requirements are in `specs/puzzle-generation`, `specs/puzzle-play` and the `web-play` delta.

What exists today:

- `mancala-ai` exposes `search_scores(board, depth)`. It returns an **exact** score for every legal move (each root move is searched with a full window), so "best by at least 2" can be checked directly. `Level::Hard.depth()` is 12. Scores are the store lead from the mover's side, with ±1000 for a win or loss (`eval.rs`).
- `mancala-core` has `Board::from_parts`, `legal_moves`, `play`, `status`, and the seeded `Rng` (`new`, `below`). Its doc comment already says it is "good enough for tests and puzzles".
- `mancala-wasm` wraps the board and the AI (`WasmBoard`, `PlayResult`, `Ai`). `web/src/engine.ts` turns these into plain snapshots and frees the WASM objects straight away.
- The page has one game reducer (`game/reducer.ts`) and an `AiClient` with a direct implementation (for tests) and a Web Worker implementation. It also has `usePlayback` for the sowing animation, and a `Board` that already draws `marks.wrong` (rust ring) and `marks.reveal` (warm glow).
- The puzzle layout was sketched in the add-web-ui design concepts (`openspec/changes/archive/2026-11-24-add-web-ui/design/concepts/Puzzle.dc.html`). The header reads "Puzzle · Find the best move". The status line has "Not that one. Try again." and "Two tries left", with **Show the answer** and **Next puzzle** beside them.

## Goals / Non-Goals

**Goals:**
- Puzzle generation is plain Rust, tested natively, with no browser code, like the rest of the engine and AI.
- The game reducer and its tests are not changed. Puzzles get their own small state machine.
- The page never waits on a deep search in the main thread, and usually doesn't wait at all.

**Non-Goals:**
- Making generation fast with clever search tricks (a transposition table or iterative deepening). We measure first, and prefetching hides the time.
- A puzzle "rating", or picking puzzles to suit the player.

## Decisions

### 1. Generation lives in `mancala-ai`, in a new `puzzle` module

A puzzle is "a position plus the AI's verdict", so it needs `search_scores`. `mancala-core` must not depend on the AI. `mancala-wasm` could hold it, but then it could only be tested through the WASM wrapper, and the CLI couldn't reuse it later. A separate `mancala-puzzles` crate would mean another `Cargo.toml` and dependency line for about 100 lines of code.

So: `crates/mancala-ai/src/puzzle.rs`, re-exported from `lib.rs`. `mancala-ai` still depends only on `mancala-core`.

The public API:

- `pub struct Puzzle { pub board: Board, pub answer: usize }`. It derives `Clone, Copy, PartialEq, Eq, Debug`, which are all cheap because `Board` is `Copy`.
- `pub fn clear_best_move(board: &Board) -> Option<usize>`: the checking rule on its own (decision 3). It is public so tests can hand it particular positions (*A position with a tie for best is not a puzzle*), and so a future "hint" feature can reuse it.
- `pub fn generate_puzzle(seed: u64) -> Puzzle`: the whole recipe (decision 2).
- Constants: `PUZZLE_DEPTH` (= `Level::Hard.depth()`), `MARGIN` (= 2), `MIN_MOVES` (= 4), `MAX_MOVES`. They are named so the example program and the tests use the same values the code does.

*Rust concepts:* module files and `pub use`, deriving traits, `Option` as "maybe there's an answer".

### 2. Candidates come from short seeded random games; failures just try again

`generate_puzzle(seed)` builds one `Rng` from the seed and loops:

1. Pick a length `k` in `MIN_MOVES..=MAX_MOVES` with `rng`.
2. From `Board::new()`, play `k` random legal moves (`rng.below(moves.len())`). If the game ends first, `continue` to the next attempt.
3. If `clear_best_move(&board)` is `Some(answer)`, `break` out of the loop with `Puzzle { board, answer }`.

Every attempt draws from the **same** `Rng`, so the whole sequence of attempts, and therefore the puzzle, depends only on the seed (*Same seed, same puzzle*).

The loop has no attempt limit. The spec says every seed gives a puzzle, and a limit would need a "no puzzle" result that nothing could sensibly handle. The test over 200 seeds, and the measuring example (decision 4), show that the acceptance rate is comfortably above zero.

**Why random moves, and not moves from the easy AI?** Random moves are the simplest and cheapest. They also reach positions where something is wrong for one side, and those positions are exactly where a clear best move exists. The cost is that some positions look odd: big early leads, or a side that has neglected one pit. If the example shows a lot of lopsided puzzles, the walk can switch to "the easy AI with random tie-breaks" without changing the spec, the API or the tasks (see Open Questions).

*Rust concepts:* `loop` with `break value`, `continue`, ranges (`a..=b`), borrowing the `Rng` mutably across a loop.

### 3. Checking a candidate: one search, then compare the top two

`clear_best_move` works like this:

1. Return `None` if the game is over or there are fewer than two legal moves.
2. `let scores = search_scores(board, PUZZLE_DEPTH).scores`.
3. Sort the scores from best to worst, and look at the first two entries with a slice pattern (`[best, second, ..]`).
4. Return `Some(best.pit)` only if `best.score - second.score >= MARGIN`.

Ties are rejected by the same rule, since their difference is 0.

**Why a margin of 2, and not "any unique best"?** A move that wins by 1 seed in a 12-move line is often a coin-flip for a person, and it may stop being best at depth 14. Two seeds is the smallest gap that still feels like a real difference. A win scored against a non-win clears it by about 1000, so endgame puzzles always qualify. The example (decision 4) reports how many candidates each margin keeps. If 2 turns out too strict or too loose, the spec's number changes in the same task.

**Why depth 12?** It matches what the hard AI sees, so a puzzle never has an answer that the site's own strongest opponent wouldn't play.

### 4. Measure before fixing the constants: `examples/puzzle_stats.rs`

`depth_table.rs` was used to choose the AI's depths. In the same spirit, `cargo run --release -p mancala-ai --example puzzle_stats` generates, say, 200 puzzles and prints:

- how many candidates were tried per puzzle
- the time per puzzle (average and worst)
- how the answers spread over pits and movers
- how many candidates each margin (1, 2, 3, 4) would keep

The numbers it prints go into this design as a short table, which records why `MAX_MOVES` and `MARGIN` have the values they do. WASM in a browser is typically 1.5–3× slower than native release builds. The table should show an average under about 1 s native, so a puzzle is usually ready in the background before the player wants it.

**Measured 2026-11-24** (release build, Apple Silicon, `MIN_MOVES` 4, `MAX_MOVES` 30, `MARGIN` 2, depth 12, seeds 0–199):

| Measure | Result |
|---|---|
| Time per puzzle | mean 0.124 s, worst 0.636 s |
| Candidates per puzzle | mean 1.59, worst 8 |
| Moves into the game | mean 17.5 |
| Answer by pit (1–6) | 37, 28, 23, 24, 31, 57 |
| South to move | 101 of 200 |
| Random positions accepted by margin 1 / 2 / 3 / 4 | 79.5% / 59.8% / 43.5% / 32.8% |

What we decided from it:

- **`MAX_MOVES` stays at 30.** Even the worst puzzle is well under 1 s natively, so about 2 s in the browser at worst, and that time is hidden by preparing the next puzzle ahead.
- **`MARGIN` stays at 2.** A margin of 3 would cut acceptance to 44% and make answers a little more decisive. But 2 keeps generation fast, and a two-seed difference is already a real lesson for a beginner. If puzzles feel too subtle in play, raising `MARGIN` is a one-line change, plus the spec's number.
- **The random walk stays (the open question is answered).** Ten sample puzzles look like real middlegames and endgames. A few are lopsided (one side far ahead), but in those the task is still meaningful: "lose by 12, not 14" or "find the win". Pit 6 is the answer more often than the others, because it is the pit most often giving an extra turn.

### 5. WASM: one function, one small result type

`#[wasm_bindgen(js_name = generatePuzzle)] pub fn generate_puzzle(seed: u32) -> WasmPuzzle`. The result has `board() -> WasmBoard` and `answer() -> u8`. The seed is `u32` for the same reason as `Ai::new`: JavaScript numbers hold a `u32` exactly. It is widened with `u64::from` before it reaches `mancala-ai`.

`engine.ts` adds `newPuzzle(seed): PuzzleSnapshot { seed, board: BoardSnapshot, answer: number }`. It frees both WASM objects before returning (add-web-ui decision 4).

### 6. A separate `PuzzleClient` with its own worker

Puzzles get their own interface, `PuzzleClient { make(seed): Promise<PuzzleSnapshot> }`. It has a direct implementation for tests and a `puzzle.worker.ts` worker implementation, following the shape of `ai/client.ts`.

**Why not add a puzzle request to the AI worker?** A worker answers one message at a time. If a puzzle was still being generated in the background when the player started a game against the computer, the AI's first move would queue behind it for a second or two. A second worker costs a second copy of the WASM module (a few hundred KB of memory), and in return `AiClient`, its tests and the AI worker stay exactly as they are.

`usePuzzleSupply(client)` keeps one puzzle prepared ahead. `take()` returns the prepared puzzle's promise and immediately starts preparing the next one from `freshSeed()` (*The next puzzle is ready*). Each request carries a `requestId`, so an answer for a puzzle that has been left is ignored (*Leaving puzzles during preparation*), the same way `gameId` works for the AI.

### 7. Puzzle state: its own reducer, owned by `App`

`game/puzzle.ts` holds a pure reducer, tested without React:

- **Phase:** `loading` → `solving` → `animating` → `done`.
- **The puzzle:** `requestId`, `puzzle` (or null while loading), `wrong` (pits tried and missed, in order).
- **The result:** `outcome` (`'solved' | 'revealed' | null`) and `caption`.
- **The move being shown:** `lastMove`, the same shape as the game's, so `usePlayback` and `buildSteps` are reused unchanged.
- **The count:** `tally: { solved, played }` for this visit.

Events:

- `requested { requestId }`: a new puzzle has been asked for. Leaving an unfinished puzzle counts it as played.
- `arrived { requestId, puzzle }`: a puzzle is ready. One with a stale id is ignored.
- `pitChosen { pit }`: the answer starts the animation with outcome `solved`. A wrong pit is added to `wrong`, and the third wrong pit becomes a reveal.
- `showAnswer`
- `animationDone`

The tally counts once per puzzle: when it is solved or revealed, or when it is skipped while unfinished.

`App` keeps a `mode: 'game' | 'puzzles'` alongside the existing game reducer and the new puzzle reducer. Both reducers live in `App`, so the count survives a trip to a game and back for the rest of the visit, without saving anything. The New game sheet's `onStart` now reports a choice, `{ kind: 'game', settings } | { kind: 'puzzles' }`. That keeps `Settings` (and every test built on it) unchanged.

The view is split so `App.tsx` doesn't grow past one reading:

- `PuzzleStatus` holds the message, the tries left, and **Show the answer** / **Next puzzle**.
- The header shows "Puzzle · Find the best move" and "Solved X of Y" in place of the matchup.
- On a sideways phone, `PuzzleStatus` sits in the header's status slot like the game's status line, with the two actions as small text buttons. This gets checked on a phone in the tasks.

*Concepts:* discriminated unions for events and for the sheet's choice, reusing a hook with a different state, keeping one source of truth.

### 8. Board and words

- `PuzzleMarks.wrong` becomes `number[]`, so every missed pit keeps its ring. `reveal` stays a single pit. The marked pits are left out of `playable`.
- The viewer is always `puzzle.board.toMove`. The names are "You" for the mover and "Opponent" for the other side.
- Captions reuse the game's wording. `presentation.ts` gets a small `moveCaption(name, result)`, and the existing `caption(settings, …)` is rewritten to call it, so the game's caption tests guard the shared wording. For example, "Solved! You captured 5 seeds." and "The best move was pit 2. You get another turn."
- Pit numbers in messages are as shown on screen (1–6), and are worked out from the viewer's pit index.

## Risks / Trade-offs

- [Generation is slow in some positions: depth 12 on a busy midgame board] → It runs in a worker with one puzzle prepared ahead. The example shows the worst case, and if needed `MAX_MOVES` is lowered, because later positions have fewer seeds and search faster.
- [Random walks give unnatural positions] → Measure and look at a sample of puzzles in the browser during the review task. The fallback walk is in decision 2.
- [The answer at depth 12 could differ from a perfect answer] → Accepted. The margin makes a reversal at a greater depth unlikely, and the page never claims the move is "perfect", only "best".
- [Two WASM instances (game AI and puzzles)] → Small memory cost, in return for keeping the AI worker untouched (decision 6).
- [The test over 200 seeds at depth 12 is slow in a debug build] → Those tests use fewer seeds by default and the full count under `#[ignore]` or in release, as the strength tests do. The task decides after timing them.

## Migration Plan

Nothing to migrate. The site is published by the existing Pages workflow on merge to `main`. Rolling back means reverting the merge, because no stored data changes.

## Open Questions

None left. Both were answered by the measurements in decision 4.
