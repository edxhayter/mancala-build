# Proposal

## Why

The site can tell you which move is best, but never *why*. Puzzles reveal the answer without explaining it, and in a game against the AI there's no way to ask "what should I play here?". For someone learning Kalah, the why is what makes a lesson stick: "pit 5 looks fine, but the opponent replies pit 2 and captures 6". The AI already works this out by looking 12 moves ahead. This change shows the player what it found, in puzzles and in games.

## What Changes

- **The line of best play (Rust, in `mancala-ai`).** Alongside each move's score, the search can return the moves it expects next, for both sides, that produce that score (the "principal variation"). Replaying a line reaches a position whose evaluation is exactly the move's score, so an explanation always adds up.
- **WASM API.** One function, `explainMoves(board)`, that returns every legal move with its score and its line, searched 12 moves deep.
- **One explainer, used in two places.** It is a panel that lists every legal pit, best first (with ties all starred), and gives each pit's result in plain words:
  - "Pit 3 ★ extra turn · after best play you're 4 seeds ahead"
  - "Pit 6 · you lose the game"

  Each pit has **Show why**. It replays that pit's line on the board, one move at a time, with the sowing animation and a caption for each move ("Opponent plays pit 2 and captures 6 seeds"). **Next move** and **Back** control the replay.
- **Puzzles.** Once a puzzle is solved or revealed, a **Why?** button opens the explainer. The explanation is worked out with the puzzle in the background, so it's ready straight away. It is never available during wrong tries.
- **Games against the AI.** On your turn, an **Analyze** button runs the same deep search on the current position and opens the explainer ("Analyzing…" while it works, without freezing the page). Closing the explainer returns to the game exactly as it was. Nothing is played for you, and analyzing doesn't change the game. It isn't offered on the computer's turn, while a move is animating, after the game ends, or in two-player games.

### Out of scope

- Reviewing a move after you've played it ("you played pit 2; pit 4 was better"), or a whole-game review.
- The analyzer in two-player (hotseat) games.
- Hints during a puzzle.
- Explanations in strategic terms ("keeps seeds out of reach"). The explainer shows outcomes and lines, not principles.
- Exploring replies other than the line the AI expects ("what if the opponent played pit 4?").
- Explainers in the terminal app.

### Rust concepts this change exercises

- Returning more than one value from a recursive function (a score and a `Vec` of moves), and building the line on the way back up the recursion.
- Why alpha-beta's pruned branches have no meaningful line, but the line along the best moves is still exact.
- `struct`s that own a `Vec` (`MoveLine`), and `Clone` versus moving values.
- Property tests that check one function against another (`search_scores`) and against the evaluation of the replayed line.
- A `wasm-bindgen` function returning a list of structured results across the boundary.

## Capabilities

### New Capabilities
- `move-explainer`: explaining moves in the web page: the per-pit results in words, replaying a pit's line of best play, the **Why?** button after a puzzle, and **Analyze** on your turn against the AI.

### Modified Capabilities
- `ai-opponent`: adds a requirement that the AI can report, for each legal move, the line of best play behind its score. Existing requirements are unchanged.

## Impact

- `crates/mancala-ai`: a line-tracking search next to `search_scores`, with tests. How the AI chooses its moves is unchanged.
- `crates/mancala-wasm`: an `explainMoves` export.
- `web/`:
  - `engine.ts` gets an `explainMoves` wrapper.
  - The puzzle worker becomes an "analysis" worker. It makes puzzles (now with their explanation) and analyzes game positions.
  - New `Explainer` panel and line-replay state, reusing the playback hook.
  - `PuzzleStatus` gets **Why?**, and the game's status line gets **Analyze**.
- Generating a puzzle takes about one extra deep search, which preparing ahead hides. Analyzing a game position takes about one deep search, under about 2 s in the browser at worst.
- No new dependencies.
