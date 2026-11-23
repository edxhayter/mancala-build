# Proposal

## Why

The engine and the AI only run in a terminal, so playing needs Rust installed and a command line. A web page makes the trainer playable by anyone with a link, and it's the step the whole architecture has been built towards: a std-only Rust core compiled to WebAssembly behind a thin TypeScript UI, hosted on GitHub Pages. It also gives a proper visual board. Seeds can be *seen* moving, which fixes the "hard to follow the bot" problem the CLI only partly solved with a recap.

## What Changes

- Add a fourth Rust crate, `crates/mancala-wasm`, that wraps `mancala-core` and `mancala-ai` for JavaScript using `wasm-bindgen`, and is built with `wasm-pack`. The core and AI crates don't change.
- Add a web app in `web/`, built with Vite, React and TypeScript:
  - New game options: opponent (AI easy, medium or hard; random bot; hotseat), your side, and an optional seed.
  - A clickable board drawn from the viewer's side, using the same rule as the CLI: your pits along the bottom running towards your store on the right, with hotseat turning to face whoever is moving.
  - **Sowing animation:** after every move, the seeds visibly travel pit to pit, skipping the opponent's store, then any capture and the end-of-game sweep play out.
  - The computer's moves are announced, with per-move feedback, a recap of the opponent's turn, and a final score with the result.
- **A visual design rooted in a real board.** The look is an homage to the developer's own Ghana/Nigeria Oware board (photo in `design/reference/`): honey-coloured carved wood, a scalloped outline, a hinge knob, grey-green nickernut seeds, and a woven cream, black and rust cloth. Two or three concepts are reviewed and one is chosen before any components are built.
- Run the AI in a **Web Worker**, so the page never freezes while it thinks. A "thinking…" state shows while it works.
- Publish the site to GitHub Pages automatically with a GitHub Actions workflow on every push to `main`. The workflow runs the Rust and web tests before it deploys.
- Add tests: Rust unit tests for the WASM layer (including the sowing path checked against the engine), and Vitest with React Testing Library tests for the game logic and components, run against the real WASM build.

### Out of scope

- Online play between two browsers (WebRTC). That's a later change.
- Game review, hints, puzzles, saving games or move history.
- Sound, themes, dark mode beyond what the browser gives for free, mobile app packaging and offline (PWA) support.
- Any change to the rules, the AI or the CLI.

### Rust concepts exercised

- Compiling to a new target (`wasm32-unknown-unknown`) and the `cdylib` crate type
- `wasm-bindgen`: `#[wasm_bindgen]` on structs and methods, passing numbers, arrays and errors across the Rust/JavaScript boundary
- Keeping a thin adapter crate over unchanged libraries
- Writing logic as plain Rust so it can be unit-tested natively, with the binding layer kept tiny

(The change also introduces TypeScript, React, Vite, Web Workers and GitHub Actions. The design explains each one where it's used.)

## Capabilities

### New Capabilities

- `web-play`: playing Kalah in a web browser. Covers starting a game with options, the board and its viewpoint, making moves, the sowing animation, the computer opponents without freezing the page, move feedback and recap, the end of the game, and publishing the site.

### Modified Capabilities

None. `kalah-rules`, `ai-opponent` and `terminal-play` are used as they are.

## Impact

- New crate `crates/mancala-wasm`, which depends on `wasm-bindgen`, `mancala-core` and `mancala-ai`. `mancala-core` and `mancala-ai` keep their current dependencies (none, and core only).
- New `web/` folder with its own `package.json` and `package-lock.json`, plus Node tooling (Vite, React, TypeScript, Vitest, Testing Library).
- New `.github/workflows/pages.yml`. GitHub Pages must be switched to "GitHub Actions" as its source in the repository settings, a one-time manual step.
- Local setup: `rustup target add wasm32-unknown-unknown` and `wasm-pack` must be installed. Node and npm are already present.
- Generated files (the WASM package, `node_modules`, the built site) are git-ignored.
