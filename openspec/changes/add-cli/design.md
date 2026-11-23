# Design

## Context

`mancala-core` is finished and std-only. Its public API is `Board` (`new`, `from_parts`, `pits`, `store`, `to_move`, `legal_moves`, `status`, `play`), plus `Player`, `Status`, `MoveError`, `MoveOutcome` and `Rng`. The workspace root's `members = ["crates/*"]` glob means a new crate folder is picked up with no root changes. See proposal.md for why the CLI comes next, and `specs/terminal-play/spec.md` for the behaviour it must have.

The main constraint is **testability without a terminal**. Every spec scenario should be checkable by `cargo test`, with no person typing.

## Goals / Non-Goals

**Goals:**
- Keep `main.rs` tiny. All the logic lives in a library inside the CLI crate, so tests can reach it.
- Make the game loop runnable with scripted input and captured output.
- Leave a clear place to plug in the real AI in change 3.

**Non-Goals:**
- Changing `mancala-core`. Anything the CLI needs that isn't in the core API is built in the CLI.
- Pixel-perfect output stability. Tests check what matters (numbers, messages) rather than every space.

## Decisions

### 1. One crate with both `lib.rs` and `main.rs`

```
crates/mancala-cli/
  Cargo.toml          # [[bin]] name = "mancala"; deps: mancala-core (path), clap (derive)
  src/
    main.rs           # parse options, lock stdin/stdout, call run(), map result to exit code
    lib.rs            # declares the modules below, re-exports what tests need
    args.rs           # clap Cli struct, Opponent / Side value enums
    render.rs         # BoardView: draws a Board as text
    input.rs          # parse one line of input into a Command, or an InputError
    game.rs           # the game loop, controllers, messages
  tests/
    game_play.rs      # whole games driven by scripted input
    binary.rs         # runs the real `mancala` binary to check exit codes
```

**Why:** integration tests (`tests/`) can only use a *library* crate's public items. If everything lived in `main.rs`, the only way to test would be to run the program as a separate process. A thin `main.rs` that calls into `lib.rs` is the standard Rust pattern for this (Book ch. 12.3).
**Alternative:** two crates (`mancala-cli-lib` and `mancala-cli`). That's more ceremony for no benefit at this size.
**Teaches:** binary vs library targets in one package, `[[bin]]`, path dependencies.

### 2. The board renderer lives in the CLI, as `Display` on a wrapper type

```
pub struct BoardView<'a> { pub board: &'a Board, pub viewer: Player }
impl fmt::Display for BoardView<'_> { ... }   // println!("{}", BoardView { board: &b, viewer: Player::South })
```

The board is drawn from the **viewer's** side: the viewer's pits along the bottom running 1 → 6 towards their own store on the right, and the opponent's along the top. Layout from South's view (two-character cells, since a store can hold up to 48):

```
       6    5    4    3    2    1        North
     [ 4] [ 4] [ 4] [ 4] [ 4] [ 4]
[ 0]                               [ 0]
     [ 4] [ 4] [ 4] [ 4] [ 4] [ 4]
       1    2    3    4    5    6        South
South to move
```

The top row is the opponent's pits printed 6 → 1, so each sits above the pit opposite it (pit 1 is opposite the other side's pit 6, as in `kalah-rules`). From North's view the same code swaps the roles: North along the bottom with its store on the right, South along the top with its store on the left. Every row, label and store is picked from `viewer` and `viewer.opponent()`, with nothing hard-coded to South or North.

**The engine needs no change.** `kalah-rules` already numbers pits per player, so any front end can draw from either side. The future web/P2P change should draw each client from its own player's view in the same way.

**Why in the CLI, not core:** the 1–6 labels and the layout are terminal choices. The web UI (change 4) will draw its own board, so a `Display` in core would only serve one user and would grow core's API, which the engine design deliberately kept small.
**Why a wrapper type:** Rust's *orphan rule* says you can only implement a trait for a type if your crate owns the trait or the type. The CLI owns neither `Display` nor `Board`, so `impl Display for Board` won't compile here. Wrapping `&Board` in a type the CLI *does* own is the standard workaround. Hitting this rule on purpose is a useful lesson.
**Alternative:** a plain `fn render(board: &Board) -> String`. That's simpler, but it misses implementing a standard trait and the orphan rule. Either satisfies the spec.
**Teaches:** traits, `impl Trait for Type`, the orphan rule, structs holding references, a first look at lifetimes (`'a`), `write!` / `writeln!`, format width specifiers (`{:>2}`).

### 3. Input parsing is a pure function

```
pub enum Command    { Move(usize) /* 0..=5, engine numbering */, Quit }
pub enum InputError { NotANumber, OutOfRange }
pub fn parse_input(line: &str) -> Result<Command, InputError>
```

It trims the line, treats `q`/`quit` as `Quit`, parses a number, checks 1–6, and subtracts 1. An empty pit is **not** detected here. That comes from `Board::play` returning `MoveError::EmptyPit`, so the engine stays the one source of truth for legality.

**Why:** a function with no I/O is trivial to unit test (`parse_input("  7 ")`), and the 1–6 vs 0–5 conversion happens in exactly one place.
**Teaches:** `&str` methods (`trim`, `eq_ignore_ascii_case`), `str::parse::<usize>()` and its `Result`, `match` with guards, mapping errors.

### 4. Who moves: an enum of controllers

```
enum Controller { Human, RandomBot }
struct Players { south: Controller, north: Controller }   // built from the CLI options
```

On each turn the loop looks up the controller for `board.to_move()`. A `Human` reads a line, and a `RandomBot` picks `legal[rng.below(legal.len())]` and announces it.

**Why an enum:** there are two kinds of player today and one more (minimax) in change 3. A `match` over three variants is easy to follow, and the compiler will point at every place to update when change 3 adds `Controller::Minimax`.
**Alternative:** a `trait Agent { fn choose_move(&mut self, board: &Board) -> usize }` with `Box<dyn Agent>`. That's more flexible, but humans need the input reader and can quit, which makes the trait signature awkward. Trait objects are better learned in change 3, when there's a real reason for them.
**Teaches:** enums as strategy, `match`, struct fields of enum type.

### 5. The game loop is generic over input and output

```
pub struct GameConfig { pub players: Players, pub seed: u64, pub start: Board }
pub enum   GameEnd    { Finished(Status), Abandoned }
pub fn run<R: BufRead, W: Write>(config: GameConfig, input: R, output: W) -> io::Result<GameEnd>
```

`main` calls `run(config, stdin().lock(), stdout().lock())`. Tests call it with a byte string as input (`&b"3\n1\nq\n"[..]` implements `BufRead`) and a `Vec<u8>` as output, then check the returned `GameEnd` and search the output text.

**Choosing the viewer** (see the spec's *Board display* requirement): against the bot it's always the human's side. In hotseat it's `board.to_move()` while the game is running, and South once it's over. A bot-vs-bot game, which only tests use, is shown from South. This rule lives in one small function, so the loop and the tests agree.

`start` is always `Board::new()` from the command line. Tests can pass any position (built with `Board::from_parts`), so end-of-game and capture scenarios don't need 30 scripted moves.

**Why:** this is the standard way to test interactive Rust programs without a terminal. Generic functions are compiled separately for each concrete type they're used with, so there's no runtime cost.
**Alternative:** run the binary as a child process and pipe text into it. That works (and decision 8 uses it for exit codes), but it's slower and the failures are harder to read.
**Teaches:** generics, trait bounds, `BufRead::read_line` (returns `Ok(0)` at end of input), `Write` and `writeln!`, `io::Result` and `?`.

### 6. Options with `clap`'s derive API

```
#[derive(Parser)] struct Cli {
    #[arg(long, value_enum, default_value_t = Opponent::Random)] opponent: Opponent,
    #[arg(long, value_enum, default_value_t = Side::South)]      side: Side,
    #[arg(long)]                                                  seed: Option<u64>,
}
#[derive(ValueEnum, Clone, Copy)] enum Opponent { Human, Random }
#[derive(ValueEnum, Clone, Copy)] enum Side { South, North }
```

`--side` only matters against the bot. With `--opponent human` it's accepted and ignored.

**Why clap:** chosen by the developer. It's the de-facto standard, and the derive API turns a struct into a parser with help text, value checking and error messages (the spec's *Invalid option value* scenario comes free). It is the project's first external dependency. It goes in the CLI crate only, so `mancala-core` stays std-only and WASM-friendly.
**Alternative:** parsing `std::env::args()` by hand. That's no dependency, but there's more code to write and the error messages are worse.
**Testing:** `Cli::try_parse_from(["mancala", "--opponent", "wizard"])` returns an `Err` without exiting, so option handling is unit-testable.
**Teaches:** adding a crates.io dependency with features (`clap = { version = "4", features = ["derive"] }`), derive macros, attributes, `Option<T>` for optional flags.

### 7. Seed when none is given

Use the current time's nanoseconds (`SystemTime::now().duration_since(UNIX_EPOCH)`) as a `u64` seed, and print it: `Bot seed: 1732370000123456789 (replay with --seed 1732370000123456789)`.

**Why:** std-only and good enough for "different game each time". Printing it satisfies the spec's replay requirement.
**Alternative:** the `rand` crate. That's another dependency for something this small.

### 8. Exit codes

- `main` returns `ExitCode`. A finished or abandoned game gives `ExitCode::SUCCESS`.
- An I/O error (e.g. stdout closed) prints to stderr and returns `ExitCode::FAILURE`.
- Bad options never reach `run`. clap prints the error and exits with status 2 itself.

`tests/binary.rs` runs the real binary using the `CARGO_BIN_EXE_mancala` path that Cargo provides to integration tests, and checks the exit status for bad options and for immediate quit. That's std-only, with no extra test crates.

### 9. Messages

All user-facing text is built in `game.rs` from small helper functions (e.g. `describe_outcome(player, outcome) -> Option<String>`, `describe_result(status) -> String`), so the tests and the loop share exactly the same wording. Prompts use `write!` (no newline) followed by `flush()`. Without the flush, the prompt can stay in the output buffer and never appear before the program waits for input.

## Risks / Trade-offs

- **[Tests that compare whole screens break on any spacing tweak]** → tests search the output for the key lines and numbers (`contains`). The exact layout is tested once, in `render.rs`'s unit tests.
- **[clap adds compile time and a lot of transitive crates to `Cargo.lock`]** → it's accepted as the cost of the developer's choice. It only affects the CLI crate. `mancala-core` builds and tests without it.
- **[Forgetting to flush the prompt, so the terminal seems frozen]** → called out in decision 9, and covered by always flushing in one `prompt()` helper.
- **[A human playing North against the bot sees the bot move before they've had a chance to look]** → the loop prints the board before every move, including the bot's, and announces the bot's pit, so the sequence can always be followed.
- **[Time-based seeds collide if two games start in the same nanosecond]** → this is harmless. It just means two identical bot games.
