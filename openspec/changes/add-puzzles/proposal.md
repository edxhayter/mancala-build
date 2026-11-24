# Proposal

## Why

The site lets you play Kalah but doesn't yet help you get better at it. A puzzle mode ("here's a position: find the best move") turns it into a trainer. The pieces are already in place. The AI scores every move in a position exactly (`search_scores`), the board can mark a wrong pit or reveal the answer, and the New game sheet already lists Puzzles as "coming later".

## What Changes

- **Puzzle generation (Rust, in `mancala-ai`).** A function that turns a seed into a puzzle: it plays a seeded random game for a while, then keeps the position only if the hard AI's search finds **one clearly best move** for the player to move. The same seed always gives the same puzzle. Puzzles never run out, because every new seed gives a new one. There are no difficulty levels: puzzles come as one mixed stream.
- **WASM API.** One new function that takes a seed and returns a puzzle: the position and the answer pit.
- **Puzzles in the page.** Puzzles becomes selectable in the New game sheet. The page then shows a puzzle from the mover's side, and works like this:
  - The right pit plays the move with the sowing animation and says it's solved.
  - A wrong pit gets the rust ring and you try again, with up to **3 tries**. After the third miss, the answer is revealed: the pit glows and its move is sown.
  - **Show the answer** and **Next puzzle** work at any time.
  - The header shows a count for this visit ("Solved 4 of 6"). It isn't saved.
- Puzzles are worked out in the existing Web Worker, and the next one is prepared while you solve the current one, so the page never waits on a deep search.
- **Board.** The `wrong` puzzle mark takes a list of pits instead of one, so every missed pit stays marked.

### Out of scope

- Difficulty levels, themed puzzles (captures only, endgames, …) or hand-made puzzle sets.
- Saving progress between visits, streaks, or sharing a puzzle by link.
- Explaining *why* the answer is best (scores per move, a line of play). That belongs with game review and hints.
- Puzzles in the terminal app.
- Online play.

### Rust concepts this change exercises

- Designing a small public API in a library crate (`Puzzle`, `generate_puzzle`) and choosing which crate owns it.
- Loops with `loop`/`break` value, early `continue`, and a retry limit.
- Sorting and comparing slices to find the best and second-best scores (`iter().max()`, `sort_by_key`, pattern matching on slices).
- Deterministic randomness (seeding `Rng`) and property-style tests over many seeds.
- An `examples/` program for measuring (acceptance rate and time per puzzle) before choosing constants.
- Exposing a new struct through `wasm-bindgen`.

## Capabilities

### New Capabilities
- `puzzle-generation`: what makes a valid puzzle (a position in progress with one clearly best move by deep search), and that generation is repeatable from a seed.
- `puzzle-play`: solving puzzles in the web page: choosing a pit, tries and marks, revealing the answer, moving on, and the count for the visit.

### Modified Capabilities
- `web-play`: *Starting a game* changes so Puzzles can be selected in the New game sheet. Online is still listed as coming later.

## Impact

- `crates/mancala-ai`: a new `puzzle` module and a measuring example. `mancala-core` is unchanged, and `mancala-ai` still depends only on core.
- `crates/mancala-wasm`: a `generatePuzzle(seed)` export and a puzzle result type.
- `web/`:
  - `engine.ts` gets a `newPuzzle` wrapper.
  - The AI worker and `AiClient` get a puzzle request.
  - A new puzzle reducer and puzzle screen.
  - `App` switches between a game and puzzles.
  - The New game sheet enables Puzzles.
  - The header and status line get puzzle variants.
  - The `Board` `wrong` mark becomes a list.
- No new dependencies. The site is published the same way.
