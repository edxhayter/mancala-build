# Design

## Context

The engine (`mancala-core`) gives us everything a search needs: `Board` is `Copy` (15 bytes), `play(&self)` returns a new position without touching the old one, `legal_moves()` lists the choices, and `status()` says when the game is over. The engine's design was shaped with this change in mind (its decision 4).

The CLI (`mancala-cli`) already has `Controller { Human, RandomBot }`, a viewer rule and a turn recap that key off "is this side a computer?" See proposal.md for why the AI comes next, and the two delta specs for the behaviour required.

## Goals / Non-Goals

**Goals:**
- A search that's correct first. Its scores are checked against a simpler, slower version.
- A small, std-only API the CLI uses now and the web UI can use later.
- Real numbers (positions searched, time per move) before choosing the level depths or optimising anything.

**Non-Goals:**
- The strongest possible Kalah AI. Medium and hard only need to be a real challenge for a person.
- Multithreading, transposition tables or move ordering. They're noted under Risks as later options, to try only if the benchmarks say they're needed.

## Decisions

### 1. A separate crate, `crates/mancala-ai`

```
crates/mancala-ai/
  Cargo.toml        # [dependencies] mancala-core (path)
                    # [dev-dependencies] criterion
                    # [[bench]] name = "search", harness = false
  src/lib.rs        # Level, choose_move, search_scores, evaluate
  benches/search.rs # criterion benchmarks
  examples/depth_table.rs   # prints nodes and time per depth
  tests/strength.rs # AI vs random, hard vs easy
```

**Why a crate, not a module in core:** core is "the rules" and should stay that way. The AI is one *user* of the rules, like the CLI. A separate crate also keeps `criterion` well away from `mancala-core`, which must stay dependency-free for WASM.
**Why not inside the CLI:** the web UI (change 4) needs the same AI.
**Teaches:** dev-dependencies (only compiled for tests and benches), `[[bench]]` targets, `examples/`.

### 2. Minimax from the AI's point of view (not negamax)

```
fn minimax(board, depth, me: Player, alpha, beta, nodes: &mut u64) -> i32
    if depth == 0 or game over: return evaluate(board, me)
    if board.to_move() == me: maximise over children   // my move
    else:                      minimise over children  // their move
```

Every score is "how good is this for **me**", where `me` is the player the AI is choosing a move for. Whether a node maximises or minimises comes from `board.to_move()`, **not** from alternating levels of the tree. That's what makes extra turns work: after an extra turn the same player is to move again, so the next level keeps maximising.

**Why not negamax:** negamax (one function that flips the sign each level) is shorter, but it assumes players alternate, so every extra turn needs a special case. Plain minimax with an explicit `me` is easier to follow and gets extra turns right with no extra code.
**Depth counts moves, not turns:** each `play` uses one unit of depth, including extra-turn moves. That's simple and keeps the cost predictable.
**Teaches:** recursion, `i32::MIN`/`MAX` sentinels, passing `&mut u64` to count work.

### 3. Evaluation: store difference, with a large bonus for a finished game

```
const WIN: i32 = 1000;
evaluate(board, me) =
    finished, I won  ->  WIN + (my_store - their_store)
    finished, I lost -> -WIN + (my_store - their_store)
    finished, draw   ->  0
    otherwise        ->  my_store - their_store
```

**Why:** in Kalah, seeds in a store can never leave, so the store difference is a solid and cheap estimate. The `WIN` bonus makes a guaranteed win beat any amount of "ahead on seeds", which is what the *Plays the winning move* scenario needs.
**Alternative:** also count seeds on each side, or the mobility. These might be stronger, but they're harder to reason about. Revisit only if the strength tests fail.

### 4. Alpha-beta pruning, checked against plain minimax

Alpha-beta is the same search, plus two numbers (`alpha`: the best score the maximiser is already guaranteed; `beta`: the same for the minimiser). When a branch can't change the result, it stops searching it. It returns **exactly the same scores** as plain minimax, just with less work.

The crate keeps a plain `minimax_full` (no pruning, test-only, behind `#[cfg(test)]`) and a property test that, for hundreds of random positions and depths 1–5, checks that both give the same score for every root move, and that alpha-beta never searches *more* positions.

**Why test it this way:** pruning bugs are silent. The AI still plays legal moves, just slightly worse ones. Comparing against the obviously correct version catches them.
**Teaches:** two implementations of one idea, property testing (as in the engine's random-game test).

### 5. Root: an exact score for every move, then a seeded tie-break

```
pub fn search_scores(board: &Board, depth: u32) -> SearchResult   // { scores: Vec<(usize, i32)>, nodes: u64 }
pub fn choose_move(board: &Board, level: Level, rng: &mut Rng) -> usize
```

At the root, each legal move is searched with a **full window** (`alpha = MIN`, `beta = MAX`), so every root move gets an exact score. `choose_move` keeps the moves with the highest score and picks one with `rng.below(n)`.

**Why a full window at the root:** with normal pruning at the root, moves after the best one get only an upper bound ("no better than X"), so you can't tell a tie from a worse move. Searching each root move fully costs some speed, but pruning still happens everywhere below the root. A cheaper trick (a window of `best - 1`) can come later if the benchmarks want it.
**Why `search_scores` is public:** tests use it, and so will hints and game review in later changes ("pit 3 scores +4, pit 1 scores -2").

### 6. Levels live in the AI crate

```
pub enum Level { Easy, Medium, Hard }
impl Level { pub fn depth(self) -> u32 }   // starting values: 2 / 5 / 8
```

The depths are **starting values**. Task group 5 measures them and adjusts them so that hard takes under about half a second per move in a release build on the developer's machine, and medium wins at least 90% against random. The final numbers are recorded in this decision when that task is done.

The CLI's clap `Level` value enum maps onto `mancala_ai::Level`, the same way `Side` maps onto `Player`, so `mancala-ai` never depends on clap.

### 7. Benchmarks: criterion for timing, a small example for the depth table

- `benches/search.rs` uses criterion to time `search_scores` at each level's depth from the start position and from a fixed mid-game position. Run it with `cargo bench -p mancala-ai`. Criterion runs each case many times and reports a confidence interval, so small changes are measurable.
- `examples/depth_table.rs` prints, for depths 1 to 10, the positions searched and the time taken (`std::time::Instant`). That's the table used to choose the level depths. Run it with `cargo run --release -p mancala-ai --example depth_table`.

**Why both:** criterion is precise but measures time only. Positions searched explains *why* a depth is slow, and shows how much alpha-beta saves.
**Teaches:** `--release` versus debug speed (often 10–50×), `black_box`, reading benchmark output.

### 8. CLI integration

- `Controller` gains `Ai(Level)`, an enum variant that **carries data**. `Controller::is_computer()` replaces the two places that check for `RandomBot` (recap on the bot ending the game) and the viewer rule's "is this side human?". The viewer, side choice and recap rules then apply to the AI with no further changes.
- `Players::against_bot(human)` becomes `Players::against(human, opponent: Controller)`.
- The AI's turn reuses the bot's flow: choose with `choose_move(&board, level, &mut rng)`, announce as `North (AI, hard) plays pit 3.`, and return `Turn::Played`.
- `args.rs` gains `Opponent::Ai` and `--level` (`ValueEnum`, default `medium`). `main` prints the seed for any computer opponent, not just `random`.

### 9. Slow tests are `#[ignore]`d

The strength tests play many complete games. At hard depth that takes seconds in a release build and much longer in debug. *Medium is a real challenge* (100 games) runs normally. *Harder beats easier* is marked `#[ignore]` and run with `cargo test --release -p mancala-ai -- --ignored`, which the final-checks task includes.

## Risks / Trade-offs

- **[Hard is too slow on some machines]** → the depths are measured, not guessed (decision 6). If needed, the cheap speed-ups, in order, are: move ordering (try extra-turn and capture moves first), the `best - 1` root window, then a transposition table. Each one is measured before it's kept.
- **[A pruning bug makes the AI quietly weaker]** → the alpha-beta and plain minimax comparison test (decision 4).
- **[Strength tests are flaky]** → all games use fixed seeds, so results are the same on every run. The thresholds have a margin (90%, not 99%).
- **[Depth counts moves, so extra-turn chains look "shorter" to the AI]** → an accepted simplification. The strength tests show whether it matters.
- **[criterion adds many crates to `Cargo.lock` and slows the first `cargo bench`]** → it's a dev-dependency only. The `mancala` binary and `mancala-core` don't include it.
