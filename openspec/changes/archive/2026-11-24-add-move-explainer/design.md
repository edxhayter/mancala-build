# Design

## Context

See proposal.md for why. The requirements are in `specs/move-explainer` and the `ai-opponent` delta.

What exists today:

- `mancala-ai::search_scores(board, depth)` gives each legal root move an **exact** score. Each root move is searched with a full alpha-beta window, so equal scores really are ties. `minimax` returns only a number, and nothing records *which* moves produced it. `evaluate` is the store lead from one side, ±1000 for a finished game.
- Puzzles are generated in a dedicated Web Worker (`puzzles/puzzle.worker.ts`, `PuzzleClient.make(seed)`). A supply keeps one puzzle prepared ahead. The puzzle reducer ends in phase `done` with `outcome` solved or revealed.
- The game reducer's `human` phase means "the person is to move and nothing is animating".
- `usePlayback(move, active, stepMs, onDone)` animates one `PlayedMove` and is shared by games and puzzles. `moveCaption(name, result)` words a capture or an extra turn.
- `NewGameSheet` is the existing pattern for a dialog (scrim, focus, Escape). `StatusLine` and `PuzzleStatus` sit under the board on desktop and in the header on a sideways phone.
- `wasm-bindgen` is 0.2.130, which can return a `Vec` of exported structs to JavaScript.

## Goals / Non-Goals

**Goals:**
- The explanation is the search's own evidence (its line), not a separate heuristic story that could disagree with the answer.
- How the AI chooses moves, and its speed, are unchanged.
- One explainer (panel, words, replay) serves both puzzles and games.

**Non-Goals:**
- Making the line search as fast as `search_scores`. It runs once per explanation, in a worker.
- Letting the player branch off the line, or saving explanations.

## Decisions

### 1. A line-tracking search next to `search_scores`, not replacing it

`search_lines(board, depth) -> Vec<MoveLine>` sits in `search.rs`, next to `search_scores`. `MoveLine { pit: usize, score: i32, line: Vec<usize> }`, where `line[0] == pit`.

**Why not make `search_scores` return lines too?** Building lines means allocating and copying a `Vec` at nodes all over the tree. The AI calls `search_scores` on every computer move, and the hard level is tuned to about 0.25 s. The explainer runs once per explanation, so it can pay that cost and the AI doesn't have to.

**Why not work the line out afterwards** (search again from each position along the way)? That costs a full search per move of the line (up to 12), and it's easy to get subtly wrong at extra turns. Tracking the line during the one search is simpler to prove correct.

*Rust concepts:* a second function sharing the evaluation, `Vec<usize>` as an owned list, keeping a public API small.

### 2. Building the line: copy on improvement

`minimax_line(board, depth, me, alpha, beta, nodes, line: &mut Vec<usize>) -> i32` works like `minimax`, with one difference. For each child it gives the recursive call a fresh `child_line`. When a move **strictly improves** this node's best, it sets `line` to that move followed by `child_line`. At a leaf (depth 0 or game over), `line` is left empty.

**Why the line is still exact under pruning.** Alpha-beta skips moves that can't change the result. A node cut off early can return a bound instead of an exact value, and the line from it would be meaningless. But the line we keep only ever follows moves that strictly improved a node's best *inside its window*, so every node on it was searched exactly. That's the standard "principal variation" argument. Each root move gets a full window, so every root move's line is exact. The tests in task 1.1 check this directly, so the argument doesn't have to be taken on trust:

- replaying the line and calling `evaluate` gives exactly the move's score
- the score always equals `search_scores` for the same position and depth

**Ties inside the line** go to the first best move in `legal_moves()` order, because only a strict improvement replaces the line. So lines are deterministic, with no `Rng` involved.

*Rust concepts:* passing `&mut Vec` down a recursion, `clear`/`push`/`extend_from_slice`, and why "strictly greater" matters.

### 3. `explain_moves`: the API the page uses

`pub fn explain_moves(board: &Board) -> Vec<MoveLine>` runs `search_lines` at `EXPLAIN_DEPTH` (= `Level::Hard.depth()`, 12) and sorts the result best first. The sort is stable, so ties keep pit order. It needs a game in progress with at least one legal move, like `choose_move`. It lives in a small `explain.rs` and is re-exported from `lib.rs`. `mancala-ai` still depends only on `mancala-core`.

**Why 12 for game analysis, even against an easy AI?** The player asked for the *best* move. Using the hard depth means the analyzer agrees with puzzles and with the hard AI.

### 4. WASM and the engine wrapper

`#[wasm_bindgen(js_name = explainMoves)] pub fn explain_moves(board: &WasmBoard) -> Result<Vec<WasmMoveLine>, JsError>`. Each `WasmMoveLine` has `pit()`, `score()` and `line() -> Vec<u8>`. A finished position returns an error, the same way `Ai::choose` does.

`engine.ts` adds `explainMoves(board): MoveExplanation[]`, where `MoveExplanation` is `{ pit, score, line: number[] }` as plain data. Every `WasmMoveLine` is freed before the function returns (add-web-ui decision 4).

### 5. Words and replay steps are worked out in TypeScript from the line

A pure `describeLine(board, explanation, names)` in `game/explain.ts` replays the line with the existing `play()` and returns:

- `now`: what the first move does: `'extra turn'`, `'captures N'` or `null`. These are the same facts `moveCaption` uses.
- `result`: the words for the final position from the mover's side. If the final position is finished, it says "you win the game", "you lose the game" or "a draw". Otherwise it uses the score (the store lead): "level", "you're N seeds ahead" or "you're N seeds behind".
- `steps`: one `PlayedMove` per move of the line, each with a caption such as "You play pit 5." or "Opponent plays pit 2 and captures 6 seeds.". The names come from the caller: "Opponent" in puzzles, "AI" in games.
- `best`: whether this move's score equals the top score. It is starred if so.

**Why not word it in Rust?** The words belong to the page (the CLI may phrase things differently), and `play()` already gives every capture and extra turn the captions need. Rust provides only the facts: scores and lines.

### 6. One "analysis" worker for puzzles and explanations

`PuzzleClient` becomes `AnalysisClient`, with `make(seed): Promise<PuzzleSnapshot>` and `explain(board): Promise<MoveExplanation[]>`. Its worker file becomes `analysis.worker.ts`.

When the worker makes a puzzle, it also explains its position. `PuzzleSnapshot` gains `explanation: MoveExplanation[]`, so the puzzle explainer is ready the moment the puzzle ends (*Explaining a finished puzzle*). This adds about one deep search per puzzle, which is hidden by preparing ahead.

**Why not a third worker for game analysis?** Games and puzzles are never on screen together, so the one worker is idle while a game is played. The AI worker stays untouched, so the computer's moves never wait on an analysis.

### 7. Explainer state: a third small reducer, owned by `App`

`game/explainer.ts` holds `ExplainerState | null`:

- **The position:** `position` (the board being explained) and `items` (the `describeLine` results).
- **The view:** either `{ kind: 'list' }` or `{ kind: 'replay', pit, step }`.
- **For analysis:** `source`, which is `'puzzle'`, or `'game'` with the `gameId` and board the analysis was asked for, so a late answer can be checked.

Events:

- `opened { source, position, explanations, names }`
- `analysisAsked { gameId, board }`, which shows "Analyzing…"
- `analysisArrived { gameId, board, explanations }`, which is ignored unless the `gameId` and board still match the game *and* it's still the person's turn
- `showWhy { pit }`, `nextMove`, `back` and `closed`

**Playback.** While a replay is on, the board shows `steps[step]` through the same `usePlayback` hook. App picks the move to animate in this order: the explainer replay, then the puzzle, then the game. A replay step's `onDone` only marks that step as landed. **Next move** starts the next one.

**While the explainer is open:** no pits are playable, and the game reducer is never sent anything, so the AI can't be triggered. Closing returns to exactly the state before (*Analyzing a game against the computer*).

**Where it shows:**

- The list is a dialog sheet in the `NewGameSheet` style, on desktop and phone alike, so it needs no space under the board.
- During a replay, the sheet closes so the board can be seen. A replay bar with the caption, **Next move** and **Back** takes the status slot: under the board on desktop, or in the header on a sideways phone.
- **Why?** joins `PuzzleStatus` in phase `done`. **Analyze** joins the game's status line only when `phase === 'human'` and `opponent === 'ai'`.

*Concepts:* a reducer for UI flow, deriving the board to draw from several states, a dialog's focus handling reused.

## Risks / Trade-offs

- [The line search is slower than `search_scores` because of allocations] → It's measured in task 1.2 against `search_scores` at depth 12 on the `puzzle_stats` positions. If it's more than about 3× slower, the copies switch to a reused buffer per depth (a "triangular PV table") without changing the API. **Measured 2026-11-24** (release, 50 puzzle positions, depth 12): `search_scores` takes 0.077 s each and `search_lines` 0.086 s each, a cost of **1.11×**. Reusing one `child_line` buffer per node keeps allocations low, so no further optimisation is needed.
- [Analysis in the browser can take a second or two in busy positions] → "Analyzing…", in a worker, cancellable by simply playing on or starting a new game, since stale answers are ignored.
- [A long line (12 moves) is tedious to step through] → Stepping is manual, so the player sees as much as they want and can go **Back** at any time. The result in words is always visible without replaying.
- [Explanations at depth 12 aren't "perfect play"] → The words say "after best play", meaning the AI's best within its look-ahead. The design never claims the game is solved.
- [`App.tsx` grows again with a third mode of drawing] → The explainer's state, sheet and replay bar live in their own files, and `App` only chooses which move to animate and which status to show.

## Migration Plan

Nothing to migrate. `PuzzleSnapshot` gains a field, but only inside the page. It is published by the Pages workflow on merge to `main`, and rolled back by reverting the merge.
