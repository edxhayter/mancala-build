# Tasks

> **How to use this list.** Each task is a block Claude writes and explains. You read it, ask questions, and commit at natural stopping points. **Your piece (optional)** marks something small you can do yourself, or hand back.
>
> Spec: `specs/web-play/spec.md`. Design: `design.md`. A Rust task is done when `cargo fmt --check`, `cargo clippy --workspace --all-targets -- -D warnings` and `cargo test --workspace` pass. A web task is done when `npm run typecheck` and `npm test` pass in `web/`.
>
> **Order:** the visual design comes first (group 1), before any code. If the chosen design needs something from the code (extra data from the engine for the animation, a different board shape, and so on), the plan is updated before the code is built.

## 1. Visual design direction (before any code)

- [x] 1.1 Make 2–3 static concepts of the board in a starting position, following design.md decision 10, each a different take: close to the reference photo, a stylised "carved print" take, and a cloth-forward take. Publish them as one page to compare side by side. Verify: **you have chosen one** (or a mix) and noted what to change.
  - **Your piece:** this task is mostly yours. Mark up what you like and don't like in each concept.
- [x] 1.2 Write the design brief into design.md decision 10: the chosen concept, the palette sampled from the photo, fonts (and their licences), sizes, spacing and motion notes. List anything the design needs from the code that the plan doesn't yet provide, and update the spec, design and tasks for it. Verify: **you approve the brief**, and any code implications are either handled in the plan or confirmed as not needed.
  - **Concepts:** design tokens, font licensing for self-hosting, turning a visual into rules a component can follow.

## 2. Tooling and the WASM crate

- [x] 2.1 Install the WebAssembly toolchain: `rustup target add wasm32-unknown-unknown` and `wasm-pack`. Verify: `rustup target list --installed` shows `wasm32-unknown-unknown`, and `wasm-pack --version` prints a version.
  - **Concepts:** compile targets (your Mac's native one vs `wasm32`), what wasm-pack adds on top of `cargo build`.
  - **Your piece (optional):** run both install commands yourself.
- [x] 2.2 Create `crates/mancala-wasm` (`crate-type = ["cdylib", "rlib"]`, depending on `wasm-bindgen`, `mancala-core` and `mancala-ai`) with a single `#[wasm_bindgen]` function returning a version string. Verify: `cargo test --workspace` passes, `wasm-pack build crates/mancala-wasm --target web` produces a `.wasm` file and JS glue, and `cargo tree -p mancala-core` / `cargo tree -p mancala-ai -e normal` are unchanged.
  - **Concepts:** crate types, `#[wasm_bindgen]`, the generated `pkg/` (look inside the `.d.ts` file).

## 3. The WASM API

- [ ] 3.1 **(test first, then implement)** In `sow.rs`, write `sow_path(board, pit)` and its tests: the *Seeds travel pit to pit* path from the start, a path that skips the opponent's store, the 13-seed lap, and the property test from design.md decision 3 (path increments reproduce `play()` over thousands of seeded random moves). Verify: the tests pass.
  - **Concepts:** modelling the ring with an enum (`Place::Pit(n) | Place::Store`), property tests against a trusted implementation.
- [ ] 3.2 **(test first, then implement)** Add `WasmBoard`, `PlayResult` and `Ai` (design.md decision 2), with native unit tests for the number encodings (players, status, slots), `from_parts` round-tripping, `play` returning errors for illegal moves, and `Ai` repeatability from a seed. Verify: `cargo test -p mancala-wasm` passes and `wasm-pack build` succeeds. Then read the generated `.d.ts` together to see the TypeScript types wasm-bindgen produced.
  - **Concepts:** `#[wasm_bindgen(constructor)]`, `Result<T, JsError>`, `&[u8]` / `Vec<u8>` ↔ `Uint8Array`, why `u32` for the seed.

## 4. The web app skeleton

- [ ] 4.1 Scaffold `web/` with Vite (React + TypeScript template), add Vitest, React Testing Library and jsdom, and add the npm scripts and `.gitignore` entries from design.md decision 8. Set `base` for production. Set up the design tokens from the brief as CSS variables in `web/src/styles/tokens.css`, and add the self-hosted fonts. Verify: `npm run dev` serves a page using the tokens and fonts, and `npm run typecheck`, `npm test` (one placeholder test) and `npm run build` succeed.
  - **Concepts:** `package.json` and scripts, `node_modules` vs the lockfile, what Vite does in dev vs build, `tsconfig`, CSS custom properties, `@font-face`.
- [ ] 4.2 Write `engine.ts`: load the WASM once, and wrap it in typed functions returning plain snapshots (`newBoard`, `play`, `legalMoves`, …) that free WASM objects immediately. Add the Vitest setup that loads the real `.wasm` from disk with `initSync`. **(test first)** Tests: a new board's snapshot, playing pit 0 matches *Simple sow from the start*, an illegal move throws. Verify: the tests pass against the real WASM.
  - **Concepts:** TypeScript types and union types (`'south' | 'north'`), `async`/`await` for loading, why snapshots instead of live WASM objects (design.md decision 4).

## 5. Game state (pure TypeScript)

- [ ] 5.1 **(test first, then implement)** In `game/`, port the CLI's presentation rules that the page needs: `viewer(settings, board)`, `caption(player, outcome)` (from `describe_outcome`: extra turn or "captured N seeds") and `describeResult`. The turn recap is not ported (design.md decision 4). Unit-test each against the same cases as the CLI tests. Verify: the tests pass.
  - **Concepts:** pure functions, `type` vs `interface`, discriminated unions, porting Rust `match` to TS `switch`.
  - **Your piece (optional):** port `describe_outcome` yourself from `crates/mancala-cli/src/game.rs` as `caption`.
- [ ] 5.2 **(test first, then implement)** Write the game reducer (design.md decision 4): `newGame`, `movePlayed`, `animationDone`, `aiChose` (ignoring a stale `gameId`), with phase changes (`human` / `thinking` / `animating` / `over`), the caption set after each move, and a fresh unseen seed per game. Verify: reducer tests cover a hotseat turn change, an extra turn, a capture caption, a game against the AI, a stale AI answer and the end of a game.
  - **Concepts:** reducers, immutability (`{ ...state, phase: 'over' }`), exhaustive `switch` with the `never` type.

## 6. The board and page (React)

- [ ] 6.1 **(test first, then implement)** Build the SVG `Board`, `Cup`, `Store` and `Seeds` components to the brief (porting the geometry and seed placement from `design/concepts/Board.dc.html`): rows and same-size round stores placed by the viewer rule, the optional puzzle marks (`wrong` / `reveal`), seeds drawn individually and placed deterministically, playable cups focusable with `role="button"` and labels like "South pit 3, 5 seeds", and only the mover's non-empty pits playable on a person's turn. Tests (React Testing Library) for *Starting position*, *Playing North*, *Empty and opposing pits can't be played*, *Keyboard play*, *Seeds in the starting position* and *Seeds stay put between moves* (seed placement is the same on every render). Verify: the tests pass, and **you've reviewed the board in the browser** against the chosen concept.
  - **Concepts:** components and props, JSX, SVG (`viewBox`, `<path>`, `<ellipse>`), rendering lists with `key`, a seeded layout function.
- [ ] 6.2 **(test first, then implement)** Build `App`, `Header`, `NewGameSheet`, `StatusLine` and `EndOfGame` to the brief and the concept artboards (controls that belong to the scene, not default form widgets), wired to the reducer, with the default game from *Ready on first visit*. Tests for *Ready on first visit*, *Choosing a different game*, *Modes that are not available yet*, *Playing a pit* (hotseat, animation off), *Extra turn is reported*, *A capture is reported* and *A finished game*. Verify: the tests pass, a hotseat game can be played to the end in the browser (without animation yet), and **you've reviewed the page**.
  - **Concepts:** `useReducer`, dialogs and focus, `aria-pressed`, `aria-live`, lifting state up, conditional rendering.
- [ ] 6.3 **(test first, then implement)** Add the phone layouts (design.md decision 10): the slim landscape header with the board scaled to 76 px cups, and `RotatePrompt` for upright phones (`(orientation: portrait) and (max-width: 599px)`), keeping the game state while it's shown. Tests (with `matchMedia` mocked) for *Phone held upright* and *Phone held sideways*. Verify: the tests pass, and **you've reviewed it on a real phone** (or the browser's device toolbar) in both orientations.

## 7. Computer opponents

- [ ] 7.1 **(test first, then implement)** Add the `AiClient` interface, a direct implementation (for tests) and a Web Worker implementation (design.md decision 5). In `App`, ask the client whenever a computer is to move, show "thinking…", and dispatch `aiChose` with the `gameId`. Tests (with the direct client and fixed seeds) for *The AI replies*, *Computer moves first when the player moves second*, *No recap* and *The page stays responsive* (a new game during thinking, then the stale reply is ignored), plus a check that the same seed gives the same AI moves. Verify: the tests pass, and in the browser hard never freezes the page.
  - **Concepts:** Web Workers, `postMessage`/`onmessage`, `useEffect` for side effects and its cleanup, Promises.
  - **Your piece (optional):** time a hard move in the browser (the dev tools Performance tab, or `console.time`) and compare it with the native benchmark.

## 8. Sowing animation

- [ ] 8.1 **(test first, then implement)** Write `buildSteps(before, result)` (design.md decision 6). Tests: *Seeds travel pit to pit* step by step, *The opponent's store is skipped*, *A capture is shown*, the sweep at the end of a game, and a property test that the last step always equals the engine's board over many seeded random moves. Verify: the tests pass.
- [ ] 8.2 Add the playback hook and the `SettingsPopover` with the speed control (slow, normal, instant; remembered in `localStorage`). Step through at the chosen pace, draw each seed travelling and settling, highlight the receiving cup as the brief describes, keep cups unplayable while animating, dispatch `animationDone` at the end, and skip straight to the end for instant or reduced motion. Tests with fake timers for the order of the steps, *Choosing the speed*, *Speed is remembered* and *Reduced motion*. Verify: the tests pass, and **you've reviewed the motion in the browser**, so you can follow the AI's turn seed by seed.
  - **Concepts:** `useEffect` with timers and cleanup, `vi.useFakeTimers()`, `matchMedia`, `localStorage`, SVG transforms and CSS transitions.
  - **Your piece (optional):** tune the speeds, easing and highlight to taste.

## 9. Publishing

- [ ] 9.1 Add `.github/workflows/pages.yml` (design.md decision 9). Check the production build locally with `npm run build` and `npx vite preview --base /mancala-build/`. Verify: the preview works under `/mancala-build/`, and the workflow file passes a YAML lint (`npx yaml-lint` or the GitHub UI).
  - **Concepts:** GitHub Actions jobs, steps and caches, Pages artifacts, base paths.
- [ ] 9.2 **(your step)** In GitHub: Settings → Pages → Source: "GitHub Actions". Then push and merge to `main`. Verify: the workflow run is green, the site is live at `https://edxhayter.github.io/mancala-build/`, and a full game against the AI works there (*A push to main publishes the site*).

## 10. Final checks

- [ ] 10.1 Run the Rust checks (`cargo fmt --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace`) and the web checks (`npm run typecheck`, `npm test`, `npm run build`). Confirm `cargo tree -p mancala-core` is still empty and `cargo tree -p mancala-ai -e normal` still lists only core. Verify: all clean.
- [ ] 10.2 Check that every scenario in `specs/web-play/spec.md` has a test or (for *A push to main publishes the site* and *Failing tests block publishing*) a recorded manual check, each marked with a `Scenario:` comment. Verify: none are missing.

## Workflow follow-up

- Archive the change after playing a few games on the published site.
