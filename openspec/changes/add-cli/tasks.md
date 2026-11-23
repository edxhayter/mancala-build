# Tasks

> **How to use this list.** Each task is a block Claude writes and explains. You read it, ask questions, and commit when it's a natural stopping point. Where a task has a **Your piece (optional)** line, that's a small bit you can write yourself, or hand back to Claude.
>
> Spec scenarios live in `specs/terminal-play/spec.md`, and design decisions in `design.md`. Every task is "done" only when `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings` and `cargo test` all pass.

## 1. Crate setup

- [x] 1.1 Create `crates/mancala-cli` with both `src/lib.rs` and `src/main.rs`, a `[[bin]]` named `mancala`, a path dependency on `mancala-core`, and `clap` (version 4, `derive` feature). Declare the empty modules `args`, `render`, `input` and `game`. `main` prints a placeholder line. Verify: `cargo run -p mancala-cli` prints the placeholder, and `cargo tree -p mancala-core` still lists no dependencies.
  - **Concepts:** Book ch. 7.1 (packages and crates: one package, a lib and a bin), ch. 14.3 (workspace path dependencies), Cargo reference on `[[bin]]` and dependency features (design.md decision 1).
  - **Your piece (optional):** add the `clap` line to `Cargo.toml` yourself, or run `cargo add clap --features derive` and compare what it writes.

## 2. Command-line options

- [x] 2.1 **(test first)** In `args.rs`, write unit tests using `Cli::try_parse_from` for the scenarios *Defaults*, *Hotseat*, *Playing North against the bot* and *Invalid option value*, plus `--seed 42` parsing to `Some(42)`. Verify: the tests exist and fail to compile.
  - **Concepts:** Book ch. 11.1 (tests), `Result::is_err`.
- [x] 2.2 Implement the `Cli` struct and the `Opponent` and `Side` value enums with clap's derive API, with doc comments that become the `--help` text (design.md decision 6). Verify: the 2.1 tests pass, and `cargo run -p mancala-cli -- --help` shows all three options and their defaults.
  - **Concepts:** derive macros and attributes (`#[derive(Parser)]`, `#[arg(...)]`), `Option<u64>` for optional flags, Book ch. 19.5 (macros, skim).
  - **Your piece (optional):** write the doc comment for `--seed` and check how it appears in `--help`.

## 3. Board rendering

- [x] 3.1 **(test first)** In `render.rs`, write unit tests for the scenarios *Starting position* (the exact text from design.md decision 2) and *Position after a move* (South's row reads `0 5 5 5 5 4`, North to move). Add one test with a two-digit store (e.g. 48) to check the alignment. Verify: the tests exist and fail to compile.
- [x] 3.2 Implement `BoardView<'a>(pub &'a Board)` and `impl fmt::Display` for it, drawing North's pits 6→1 on top, South's 1→6 underneath, the stores on each end, and the "to move" line. Verify: the 3.1 tests pass.
  - **Concepts:** Book ch. 10.2 (traits), ch. 10.3 (lifetimes, skim), the orphan rule, tuple structs (ch. 5.1), `write!` / `writeln!` and width specifiers like `{:>2}` (`std::fmt` docs).
  - **Your piece (optional):** in a scratch branch, try `impl std::fmt::Display for mancala_core::Board` instead and read the compiler error (E0117). It's the orphan rule in action.
- [x] 3.3 **(test first, then implement)** Draw the board from a viewer's side. Change `BoardView` to `{ board, viewer }` and update the 3.1 tests to use `viewer: South`. Add tests for *Playing North puts North at the bottom* and *Hotseat view follows the player to move* (South plays pit 1, viewed from North: South's row on top reads `4 5 5 5 5 0`). See them fail, then pick each row, label and store from `viewer` / `viewer.opponent()` (design.md decision 2). Verify: all render tests pass, and the placeholder `main` still draws the starting board.
  - **Concepts:** structs with named fields holding a reference (ch. 5.1), reusing `Player::opponent()`, removing hard-coded assumptions.

## 4. Input parsing

- [x] 4.1 **(test first)** In `input.rs`, write unit tests for `parse_input`: `"3"` → `Move(2)`, `"  1  "` → `Move(0)`, `"banana"` → `NotANumber`, `"0"` and `"7"` → `OutOfRange`, `"q"` and `"quit"` → `Quit`, and an empty line → `NotANumber`. Verify: the tests exist and fail to compile.
- [x] 4.2 Implement the `Command` and `InputError` enums and `parse_input` (design.md decision 3). Verify: the 4.1 tests pass.
  - **Concepts:** Book ch. 8.2 (strings, `&str` vs `String`), `str::trim`, `str::parse` and `ParseIntError` (ch. 9.2), `match` with guards (ch. 19.2 / 18.3).
  - **Your piece (optional):** make `Q` and `QUIT` work too, and add the test cases.

## 5. The game loop

- [ ] 5.1 Write the message helpers in `game.rs`: the text for each `InputError` and for `MoveError::EmptyPit`, `describe_outcome(player, outcome)` (extra turn and/or "captured N"), and `describe_result(board)` (scores plus winner or draw). Unit-test each one. Verify: the unit tests pass, including the draw and both winners.
  - **Concepts:** `Option<String>`, `format!`, `match` on `Status::Finished { winner }` (design.md decision 9).
- [ ] 5.2 **(test first)** In `tests/game_play.rs`, write hotseat tests that call `run` with scripted input and a `Vec<u8>` for output. Cover: *A valid move is played*, *Surrounding spaces are ignored*, *Not a number*, *Out of range*, *Empty pit*, *Quit command*, *End of input*, *Extra turn is reported*, *Capture is reported* (start from the `kalah-rules` capture position), *A finished game* and *A drawn game* (start one move from the end), and *Hotseat view follows the player to move* (the board after South's move shows North's side at the bottom). Verify: the tests exist and fail to compile.
  - **Concepts:** Book ch. 11.3 (integration tests), `&[u8]` as a `BufRead`, `String::from_utf8`.
- [ ] 5.3 Implement `Controller`, `Players`, `GameConfig`, `GameEnd` and `run<R: BufRead, W: Write>` for human players: show the board, prompt (and flush), read a line, parse it, play it or explain the error, report the outcome, and finish or loop. Choose the viewer for each board with the rule in design.md decision 5 (design.md decisions 4, 5 and 9). Verify: all the 5.2 tests pass.
  - **Concepts:** Book ch. 10.1 (generics and trait bounds), `BufRead::read_line` returning `Ok(0)` at end of input, `Write::flush`, `io::Result` and `?`, `loop` with `break` and a value (ch. 3.5).
  - **Your piece (optional):** write the *Quit command* handling branch inside the loop.
- [ ] 5.4 **(test first, then implement)** Add the random bot. First write tests in `tests/game_play.rs` for: *Bot replies to a move*; *Playing North puts North at the bottom* (human as North: the boards show North's side at the bottom); *Repeatable with a seed* (run the same script twice with seed 42 and compare the output); and a bot-vs-bot game (both sides `RandomBot`, empty input) that must end in `GameEnd::Finished`, which shows the bot only plays legal moves and a game always ends. Then implement `Controller::RandomBot` using `Rng::below` over `legal_moves()`, announcing each move as pit 1–6. Verify: the new tests and all earlier tests pass.
  - **Concepts:** `&mut` borrows of the RNG inside the loop (ch. 4.2), `match` over the controller.

## 6. Wiring up `main`

- [ ] 6.1 **(test first)** In `tests/binary.rs`, run the real binary through `env!("CARGO_BIN_EXE_mancala")` and check: `--opponent wizard` exits with a non-zero status and names `human` and `random`; input `q` exits successfully and prints that the game was abandoned; a bot game with no `--seed` prints a seed. Verify: the tests exist and fail, because `main` is still the placeholder.
  - **Concepts:** `std::process::Command`, `Stdio::piped`, writing to a child's stdin, `ExitStatus::success`.
- [ ] 6.2 Implement `main`: parse `Cli`, build `Players` from the options, choose and print a seed when none is given (design.md decision 7), call `run` with locked stdin/stdout, and map the result to an `ExitCode` (design.md decision 8). Verify: the 6.1 tests pass, and `cargo run -p mancala-cli` lets you play a full game against the bot by hand.
  - **Concepts:** `fn main() -> ExitCode`, `std::io::stdin().lock()`, `SystemTime` and `UNIX_EPOCH`, `eprintln!` for errors.
  - **Your piece (optional):** play a full hotseat game with `--opponent human` and note anything confusing about the output. We'll fix it before 7.1.

## 7. Final checks

- [ ] 7.1 Run `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings` and `cargo test` across the whole workspace, and fix anything reported. Confirm `cargo tree -p mancala-core` still shows no dependencies. Verify: all four are clean.
- [ ] 7.2 Check that every scenario in `specs/terminal-play/spec.md` has a test, with a `// Scenario:` comment above each one. Verify: no scenario is missing a test.

## Workflow follow-up

- Archive the change once you've reviewed it and played a few games.
