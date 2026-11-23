# Proposal

## Why

The rules engine is finished and fully tested, but you can't play it yet. A terminal front end turns `mancala-core` into a game you can play straight away, and it's the first real *user* of the engine's public API. Any awkward spots in that API show up here, before the AI (change 3) and the web UI (change 4) start relying on it. It also introduces the parts of Rust the engine didn't need: a binary crate, an external dependency, reading input and writing output, and generic code.

## What Changes

- Add a second workspace crate, `crates/mancala-cli`, that builds a binary called `mancala`. It depends on `mancala-core` and on `clap` for command-line options.
- Draw the board in the terminal: North's pits across the top (from North's point of view), South's along the bottom, the stores at each end, pit numbers labelled, and whose turn it is.
- Add two ways to play:
  - **Hotseat:** two people take turns at one keyboard.
  - **Versus a random bot:** you play one side, and the computer picks a random legal move for the other. Use `--seed` to make the bot's choices repeatable.
- Choose options on the command line: opponent (`human` or `random`), which side you play against the bot, and the seed.
- Read moves as pit numbers 1–6, which is easier for people than the engine's 0–5. Explain any invalid input (not a number, out of range, empty pit) and ask again. `q` or end of input quits cleanly.
- After each move, report what happened (extra turn, seeds captured). When the game ends, show the final score and the winner or a draw.
- Add tests: option parsing, board rendering, input parsing, and complete scripted games that run through the game loop without a real terminal.

### Out of scope

- Any real AI or move search. The random bot is a stand-in until change 3.
- Changes to `mancala-core`'s rules or public API. If the CLI needs something new, the design explains why it stays in the CLI.
- Colours, cursor movement or a full-screen terminal UI (e.g. `ratatui`). Plain lines of text only.
- Undo, move history, saving or loading games, and online play.

### Rust concepts exercised

- Binary crates, `main.rs` vs `lib.rs`, and depending on another crate in the same workspace
- Adding an external dependency (`clap`) and using derive macros for argument parsing
- Reading from stdin and writing to stdout, `String` vs `&str`, and parsing text into numbers
- Generics and trait bounds (`impl BufRead`, `impl Write`) so the game loop can be tested with fake input
- Error handling at a program's edge: `Result` from `main`, the `?` operator with I/O errors
- Implementing a trait (`std::fmt::Display`) and `match` over the engine's enums

## Capabilities

### New Capabilities

- `terminal-play`: playing Kalah in a terminal. Covers starting a game with options, how the board is shown, entering moves and handling bad input, the random bot opponent, per-move feedback, and the end-of-game result.

### Modified Capabilities

None. The rules in `kalah-rules` are used as they are.

## Impact

- New crate `crates/mancala-cli`, picked up automatically by the workspace's `crates/*` glob. No change to the root `Cargo.toml`.
- First external dependency in the project (`clap`), used only by the CLI. `mancala-core` stays std-only so it can still be compiled to WASM.
- `Cargo.lock` will grow to include `clap` and its dependencies.
- No changes to `mancala-core` code or its spec.
