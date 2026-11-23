# Design

## Context

Three crates exist: `mancala-core` (rules, no dependencies), `mancala-ai` (search, depends only on core) and `mancala-cli` (terminal). The CLI already solved several presentation problems the web needs too: the viewer rule, 1–6 pit numbering, the turn recap (`TurnLog`) and seeded repeatability. Those are *ideas* to reuse. The code itself is Rust-in-a-terminal and isn't shared.

The local machine has Node 25 and npm 11, but not `wasm-pack` or the `wasm32-unknown-unknown` target. The repository is `github.com/edxhayter/mancala-build`, so Pages will serve the site under `/mancala-build/`. See proposal.md for why, and `specs/web-play/spec.md` for the behaviour.

## Goals / Non-Goals

**Goals:**
- All game rules and AI decisions come from the existing Rust crates, compiled to WASM. TypeScript never re-implements a rule.
- The page never freezes, even at hard.
- Most of the UI logic is in plain TypeScript functions that can be tested without a browser.
- One command builds everything, locally and in CI.

**Non-Goals:**
- Sharing presentation code with the CLI.
- Pixel-perfect visual tests, or cross-browser automation (Playwright and the like). Component tests plus manual checks are enough for now.
- State-management libraries (Redux and the like). React's own `useReducer` is enough.

## Decisions

### 1. Layout

```
crates/mancala-wasm/          # Rust → WASM adapter
  Cargo.toml                  # crate-type = ["cdylib", "rlib"]; deps: wasm-bindgen, mancala-core, mancala-ai
  src/lib.rs                  # #[wasm_bindgen] types: WasmBoard, PlayResult, Ai
  src/sow.rs                  # sow_path(): plain Rust, unit-tested natively
web/
  package.json                # scripts: wasm, dev, build, test, typecheck, lint
  vite.config.ts              # base: '/mancala-build/' for production builds
  index.html
  src/
    wasm/                     # wasm-pack output (git-ignored, generated)
    engine.ts                 # loads the WASM once; typed wrapper (Board, play, legalMoves…)
    game/                     # pure TS: state reducer, viewer rule, recap, messages, animation steps
    ai/                       # worker + AiClient interface
    components/               # React: App, NewGamePanel, Board, Pit, Store, StatusBar, Recap
  test/                       # Vitest setup: loads the real WASM from disk
.github/workflows/pages.yml
```

**Why `web/` at the top level:** it's a separate toolchain (npm, Vite) with its own lockfile. Putting it inside `crates/` would confuse Cargo's `crates/*` glob.
**Why `cdylib` + `rlib`:** `cdylib` is what wasm-pack needs to produce a `.wasm` file. `rlib` lets `cargo test` link the crate natively, so its logic is tested like any other Rust code.

### 2. The WASM API: small, immutable, numbers in, numbers out

```rust
#[wasm_bindgen] pub struct WasmBoard { board: Board }      // Copy inside, opaque to JS
  new() / from_parts(south: &[u8], south_store, north: &[u8], north_store, to_move: u8)
  pits(player: u8) -> Vec<u8>      // → Uint8Array in JS
  store(player: u8) -> u8
  to_move() -> u8                  // 0 = South, 1 = North
  status() -> i8                   // -1 in progress, 0 South won, 1 North won, 2 draw
  legal_moves() -> Vec<u8>
  play(pit: u8) -> Result<PlayResult, JsError>   // never changes self

#[wasm_bindgen] pub struct PlayResult
  board() -> WasmBoard, extra_turn() -> bool, captured() -> u8,
  path() -> Vec<u8>                // sowing steps, see decision 3

#[wasm_bindgen] pub struct Ai { rng: Rng }
  new(seed: u32)
  choose(&mut self, board: &WasmBoard, level: u8) -> u8    // the AI: 0 easy, 1 medium, 2 hard
  random_move(&mut self, board: &WasmBoard) -> u8           // the random bot
```

- **Players and levels cross the boundary as small numbers.** wasm-bindgen can export Rust enums, but plain numbers keep the JS side simple, and the TypeScript wrapper (`engine.ts`) turns them back into readable types (`'south' | 'north'`, `'easy' | …`).
- **`play` returns a new board.** This matches the engine's `play(&self)` and React's preference for immutable state, so each render gets its own `WasmBoard`.
- **The seed is `u32` in JS and widened to `u64` in Rust.** A JS `number` can't hold every `u64`, and a `BigInt` seed would be awkward in a form field. 4 billion seeds is plenty.
- **No `serde`.** Getters returning numbers and `Vec<u8>` are enough, and they keep the crate small.

**Teaches:** `#[wasm_bindgen]`, how Rust types map to JS (`Vec<u8>` ↔ `Uint8Array`, `Result` ↔ thrown exception), and why a thin adapter keeps the core portable.

### 3. Sowing path: computed in the WASM crate and checked against the engine

The engine has no "trace" of a move. `kalah-rules` only defines the result. The animation needs the *steps*, so `sow.rs` provides:

```rust
pub fn sow_path(board: &Board, pit: usize) -> Vec<Slot>   // Slot = (Player, Place::Pit(0..=5) | Place::Store)
```

It walks the same ring as the rules (the mover's pits after `pit`, the mover's store, the opponent's pits, skipping the opponent's store, round again) once per seed. Across the boundary each slot is encoded as one byte: `player * 7 + place` (place 0–5 is a pit, 6 is the store).

**Why not change `mancala-core`:** core's API was deliberately kept small. A trace is purely a presentation need, with no other user yet.
**The risk** is that this duplicates a small piece of the rules. **The mitigation** is a property test: over thousands of seeded random moves, adding one seed at each step of `sow_path` to the board before the move must reproduce exactly what `play()` gives, whenever the move had no capture and didn't end the game. For captures, it must match apart from the two capture slots. If the path ever disagrees with the engine, the test fails.
**Captures and the sweep** aren't part of the path. The animation works them out by comparing the board after sowing with the result `play()` returned (decision 6).

### 4. The UI's state: a reducer over immutable snapshots

The whole game is one `useReducer` state:

```ts
type GameState = {
  settings: { opponent: 'ai' | 'random' | 'human'; level: Level; side: Side; seed: number };
  board: BoardSnapshot;            // plain numbers copied out of WasmBoard: pits, stores, toMove, status
  phase: 'human' | 'thinking' | 'animating' | 'over';
  turnLog: TurnLog;                // like the CLI's: who, storeBefore, moves[]
  recap: string[] | null;          // shown before a person moves
  messages: string[];              // "South gets another turn." etc.
  gameId: number;                  // bumps on every new game
};
```

Events: `newGame`, `movePlayed(PlayResult)`, `animationDone`, `aiChose(pit, gameId)`. The functions that compute the viewer, the recap text and the messages are **plain TypeScript functions ported from the CLI**, unit-tested with Vitest.

**Why a reducer:** every transition is a pure function, `(state, event) → state`, so it can be tested without React or a browser.
**Why snapshots instead of keeping a `WasmBoard` in state:** WASM objects hold memory that must be freed (`.free()`). Copying out plain numbers means React state never holds WASM memory, and only the engine wrapper creates and frees WASM objects.

### 5. The AI runs in a Web Worker

```
main thread                         worker (ai.worker.ts)
  AiClient.choose(board, level) ──▶  init WASM once; one Ai per (gameId, seed)
                              ◀──  { gameId, pit }
```

- A **Web Worker** runs a script on a separate thread. Heavy work there can't freeze the page. The worker loads its own copy of the WASM module.
- The worker keeps one `Ai` per game, created from the game's seed, so the random tie-breaks follow the same sequence as the CLI and stay repeatable.
- **Stale answers:** every request carries the `gameId`. If a new game starts while the AI is thinking, the reply arrives with the old `gameId` and the reducer ignores it. That's the spec's *The page stays responsive* scenario.
- **The random bot** goes through the same `AiClient` and worker, calling `Ai::random_move`. It's instant, but using one path for both computer opponents keeps the reducer simple, and the seed works the same way.
- `AiClient` is a TypeScript interface. The real implementation uses the worker. Tests use a **direct** implementation that calls the WASM in-process, so tests don't need worker support in jsdom.

**Teaches:** threads in the browser, `postMessage`, why stale responses need an ID.

### 6. Animation: a list of steps, played by a timer

`buildSteps(before, result)` (pure TS) turns a move into a list of board snapshots:
1. The chosen pit empties.
2. One snapshot per entry in `result.path`, each adding a seed to that slot.
3. If the final board differs from the last sowing snapshot (a capture or the sweep), one more step moves those seeds into the stores.
4. The last step must equal `result.board`. Tests check this for every move in random games.

A React hook plays the steps at the chosen speed: **slow** (about 400 ms per seed), **normal** (about 180 ms) or **instant** (last step only). The setting is stored in `localStorage`, so it's remembered between visits. The hook highlights the slot that just received a seed, and the seed is drawn travelling from the previous cup and settling (decision 10). During playback the phase is `animating` and no pit is clickable. If `window.matchMedia('(prefers-reduced-motion: reduce)')` matches, only the last step is shown.

**Why snapshots rather than moving DOM elements:** each step is plain data, easy to test and to render. Seeds "moving" means counts changing with a highlight, which reads clearly and needs no physics. A CSS transition on the highlight gives the motion.

### 7. Components and accessibility

- `Board` draws the board as **SVG** (decision 10): the opponent's row (pits 6 → 1), the two end-cup stores, and the viewer's row (pits 1 → 6), all chosen with the viewer rule.
- Each playable cup is a focusable SVG group with `role="button"`, `tabIndex={0}`, `aria-disabled` when it can't be played, and a label such as "South pit 3, 5 seeds". Enter and Space play it, the same as a click. Testing Library finds these by role and label just like HTML buttons.
- `NewGamePanel` holds the opponent, level, side and seed inputs and a "New game" button.
- `StatusBar` shows whose turn it is and the thinking state. `Recap` and the messages show the text from decision 4. A final-score panel appears when the game is over.

**Testing:** React Testing Library renders components and interacts the way a user would ("click the button labelled South pit 3"). It works with the real WASM loaded by a Vitest setup file (`initSync` with the `.wasm` bytes read from disk) and the direct `AiClient`.

### 10. Visual design: an homage to a real board

**Reference:** `design/reference/example_board.webp`, the developer's own folding Oware board from Ghana/Nigeria. The look is built from that object, not from a general idea of "African games".

**From the board:**
- **Form (seen straight down):** two halves meeting at a seam, with the round **hinge knob** at the centre. A 2×6 grid of deep round cups. A **scalloped outline** that follows the cups. Kalah needs stores, so a larger **carved oval end cup** is added at each end in the same style.
- **Wood:** honey to orange-brown, an oiled satin finish, subtle grain running along the board. Each cup has a darker inner shadow so it reads as deep.
- **Seeds:** grey-green, matte, slightly irregular ovals (nickernut seeds). Each is drawn with a small variation in size, angle and tone. Placement is **deterministic** per cup and count, so seeds don't jump around on re-render, and they pack tighter past about 12. The count is always shown beside the cup.
- **Surround:** the board rests on a cloth inspired by the woven textile in the photo (cream ground, black geometric bands, small rust-red accents), drawn for this game rather than copied. The carved figures and other objects in the photo are not used.
- **Lettering:** an incised or carved-feeling display face for the title, scores and result, echoing the pedestal's cut-outs, and a plain readable face for messages and controls. Both are self-hosted (no requests to third-party font servers).
- **Starting palette** (to be refined by sampling the photo in task 1.2): honey wood, cup shadow, seed grey-green, linen cream, ink black, rust red.

**Motion:** speeds as in decision 6. A seed travels from cup to cup and settles with a small ease-out, like a hand dropping it. The highlight on the receiving cup is subtle (a warm glow on the wood), not a bright UI colour.

**What we avoid:** default system or Inter fonts, gradients, glassmorphism, drop-shadow cards on grey, emoji icons, generic "African pattern" clip-art, and anything that reads as a stock SaaS dashboard. Controls (new game, opponent, speed) are styled to belong to the scene, like labels and small wooden tabs, not default form widgets.

**Why SVG:** curved cups, a scalloped outline and dozens of individually shaped seeds are natural in SVG and awkward with CSS boxes. SVG also scales cleanly from phone to desktop, and it can be tested by role and label.

**Process:**
1. Task 1.1, before any code, makes 2–3 static concepts of the same position (close to the photo; a stylised "carved print" take; a cloth-forward take). The developer chooses one, or a mix.
2. Task 1.2 records the choice here, with the final colour values, fonts, sizes and spacing, and updates the plan if the design needs anything from the code. Task 4.1 then sets these up as CSS variables ("design tokens") that every component uses.
3. Each visual component task is done only after the developer has reviewed it in the browser.

### 8. Building

- `npm run wasm` runs `wasm-pack build ../crates/mancala-wasm --target web --out-dir ../../web/src/wasm`.
- `npm run dev` / `npm run build` run `wasm` first, then Vite. `npm test` runs `wasm`, then Vitest.
- `vite.config.ts` sets `base: '/mancala-build/'` for production builds only, so local dev serves from `/`.
- `.gitignore` adds `web/node_modules`, `web/dist` and `web/src/wasm`.

### 9. Deployment: one GitHub Actions workflow

`.github/workflows/pages.yml`, on push to `main` (and manually via `workflow_dispatch`):
1. Check out the code, install stable Rust with the `wasm32-unknown-unknown` target, install `wasm-pack`, and set up Node with an npm cache.
2. Run `cargo fmt --check`, `cargo clippy --workspace --all-targets -- -D warnings` and `cargo test --workspace`.
3. In `web/`: `npm ci`, `npm run typecheck`, `npm test`, `npm run build`.
4. Upload `web/dist` with `actions/upload-pages-artifact` and deploy with `actions/deploy-pages`.

Any failing step stops the run before deploying, so the old site stays up. **Manual step (once):** in the repo's Settings → Pages, set *Source* to "GitHub Actions".

## Risks / Trade-offs

- **[Drawing a convincing wooden board takes iteration]** → concepts and developer review happen before components are built (decision 10), and the brief is the yardstick for every visual task.

- **[The sowing path disagrees with the engine]** → the property test in decision 3, plus the rule that the last animation step must equal the engine's board.
- **[Hard is slower in WASM than native]** → the worker keeps the page responsive regardless. If hard takes much more than about 1 s in the browser, measure in the browser and consider lowering hard's depth in a follow-up change (`ai-opponent` defines levels by look-ahead, not by exact depth).
- **[WASM memory leaks from un-freed objects]** → only `engine.ts` creates `WasmBoard`/`PlayResult`, copies them into snapshots and frees them straight away. React state holds plain data.
- **[Many new tools at once (npm, Vite, React, TS, Vitest, workers, Actions)]** → the tasks introduce them one at a time, each with a working check before the next.
- **[jsdom has no Web Workers]** → `AiClient` with a direct implementation for tests (decision 5). The worker itself is checked manually and in the built site.
- **[Base path mistakes break the deployed site but not local dev]** → `npm run build && npx vite preview --base /mancala-build/` reproduces the Pages setup locally before pushing.
