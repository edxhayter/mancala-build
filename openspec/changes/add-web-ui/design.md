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
    game/                     # pure TS: state reducer, viewer rule, captions, animation steps
    ai/                       # worker + AiClient interface
    components/               # React: App, Header, Board (SVG), StatusLine, NewGameSheet, SettingsPopover, RotatePrompt, EndOfGame
    styles/tokens.css         # design tokens from decision 10
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
```

- **Players and levels cross the boundary as small numbers.** wasm-bindgen can export Rust enums, but plain numbers keep the JS side simple, and the TypeScript wrapper (`engine.ts`) turns them back into readable types (`'south' | 'north'`, `'easy' | …`).
- **`play` returns a new board.** This matches the engine's `play(&self)` and React's preference for immutable state, so each render gets its own `WasmBoard`.
- **The seed is `u32` in JS and widened to `u64` in Rust.** A JS `number` can't hold every `u64`, and `u32` avoids `BigInt`. The page picks a fresh seed for each game (`crypto.getRandomValues`) and never shows it. Tests pass fixed seeds so AI games are repeatable. 4 billion seeds is plenty.
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
  settings: { opponent: 'ai' | 'local'; level: Level; playerFirst: boolean };
  seed: number;                    // picked per game, never shown (decision 2)
  board: BoardSnapshot;            // plain numbers copied out of WasmBoard: pits, stores, toMove, status
  phase: 'human' | 'thinking' | 'animating' | 'over';
  caption: string | null;          // "South gets another turn." / "AI captured 6 seeds." (spec: Move announcements)
  gameId: number;                  // bumps on every new game
};
```

Events: `newGame`, `movePlayed(PlayResult)`, `animationDone`, `aiChose(pit, gameId)`. The functions that compute the viewer and the caption text are **plain TypeScript functions ported from the CLI** (its viewer rule and `describe_outcome`), unit-tested with Vitest. The CLI's turn recap is **not** ported: the sowing animation shows the same thing.

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
- **No random bot on the web.** The only computer opponent is the AI. The random bot stays a CLI feature.
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
- `Board` also takes optional **puzzle marks** for the viewer's pits: `wrong` (rust ring) and `reveal` (warm glow). This change doesn't use them, but the puzzle change will, without reworking the board (decision 10).
- `Header`: title, the current matchup ("You vs AI · Medium" / "Two players"), a **New game** button and a **settings** icon button (`aria-label="Settings"`).
- `NewGameSheet` (a dialog): four choices in a 2×2 grid. **Computer** and **Two players** are selectable; **Online** and **Puzzles** are shown "coming later", disabled. With Computer: level (Easy/Medium/Hard) and *You play* First/Second. Buttons: Cancel, Start game. Choices are `<button aria-pressed>`.
- `SettingsPopover`: anchored under the settings icon. It holds only **Sowing speed** (Slow/Normal/Instant).
- `StatusLine`: "Your move" / "AI is thinking…" / "North to move", plus the caption from decision 4, in an `aria-live="polite"` region so screen readers hear it.
- `RotatePrompt`: shown instead of the game on a phone held upright (decision 10).
- `EndOfGame`: the scores, the result and a New game button, replacing the status line when the game is over.

**Testing:** React Testing Library renders components and interacts the way a user would ("click the button labelled South pit 3"). It works with the real WASM loaded by a Vitest setup file (`initSync` with the `.wasm` bytes read from disk) and the direct `AiClient`.

### 10. Visual design: an homage to a real board (approved brief)

**Reference:** `design/reference/example_board.webp`, the developer's own folding Oware board from Ghana/Nigeria. The look is built from that object, not from a general idea of "African games".
**Approved concepts:** `design/concepts/`, which holds the source of the concept canvas (Design artboards, `.dc.html`). The canvas itself is at https://claude.ai/artifact/63vpXyWpBqrsvUeaeiDGX7 (private to the developer). Its **Concept A** page is the approved direction:
- `Main.dc.html`: desktop, playing
- `NewGame.dc.html`: the New game sheet
- `Settings.dc.html`: the settings pop-over
- `PhoneLandscape.dc.html`: phone, landscape
- `PhoneRotate.dc.html`: phone, held upright
- `Puzzle.dc.html`: a later change
- `Board.dc.html`: the shared board, including the geometry and seed-placement code to port

The "Earlier takes" (B carved print, C cloth-forward, two upright phone layouts) were **rejected** and are kept only for reference.

**Decisions made while reviewing (2026-11-23):**
- Concept A ("honey and linen") chosen. The cloth surround (C) was too loud; the linen ground keeps one thin woven band under the header.
- Stores are **round cups the same size as the pits**, one at each end on the centre line between the rows, like the end lobes of the real board. They are labelled with their owner ("AI" / "You").
- Less on screen: no subtitle, no turn recap, no seed. The opponent is **Computer** or **Two players**. Online and Puzzles appear in the New game sheet as "coming later".
- Sowing speed lives in a small **settings pop-over**, not on the main screen.
- **Phones play in landscape.** Upright phones get a "turn your phone sideways" prompt. That keeps "your side at the bottom" everywhere and gives 76 px cups.
- **Caption** for extra turns and captures: shown quietly beside the turn indicator and announced to screen readers. This was recommended and pending the developer's confirmation when the brief was written.

**Palette (design tokens, sampled from the photo):**

| Token | Value | Use |
|---|---|---|
| `--wood` | `#ba6f35` | board surface (with grain) |
| `--wood-edge` | `#834d2d` | hinge knob, shadows on the wood |
| `--cup-lip` | `#c17b51` | lighter ring at the top of a cup |
| `--cup` | `#965d31` | cup interior |
| `--cup-deep` | `#532004` | inner shadow of a cup |
| `--seed` / `--seed-alt` | `#958f85` / `#8a877c` | seeds (alternating tone; cooled slightly from the photo's warm cast) |
| `--seed-light` / `--seed-dark` | `#b3ada2` / `#615c53` | seed highlight and shadow, scar (hilum) |
| `--linen` | `#efe4d3` | page ground (fine weave texture) |
| `--linen-panel` | `#f4eadb` | sheets and pop-overs |
| `--ink` | `#2b1810` | text, icons, selected underlines |
| `--ink-soft` | `#6b4a35` | secondary text, unselected options (passes 4.5:1 on linen) |
| `--rust` | `#8e2a2e` | woven band accent; puzzle "wrong" ring |
| `--tab` | `#c8844c` | wooden-tab buttons (ink text on it) |

**Type:** *Marcellus SC* (display: title, status, numbers on the board, button labels) and *Atkinson Hyperlegible* (everything else). Both are under the SIL Open Font Licence and are **self-hosted** via the `@fontsource` npm packages. Sizes: title 48 (desktop) / 24 (phone landscape); status 30 / 20; body 16; small labels 12, upper case, tracking 0.12em; board numbers 12 + 0.10 × cup size.

**Board geometry** (from `Board.dc.html`; D = cup diameter): pitch between cup centres P = 1.18 D; wood disc around each cup r = 0.62 D; number band beside the board 30 + 0.28 D. The opponent's numbers are on their side, the viewer's on theirs. Cup size: **100 px desktop**, **76 px phone landscape**, scaling down to fit narrower windows. **Seeds:** a sunflower spiral (golden angle) per cup with fixed per-cup variation in size (±2 px), angle and tone, and a scar on every third seed. They pack tighter above 9 seeds (stores can hold up to 48). The hinge knob is 0.32 D, at the centre on the seam.

**Controls:** quiet underlined text options for choices, and the wooden "tab" button (`--tab`, rounded, soft bevel) for the main action. Icons are inline stroke SVG (the sliders icon for settings), never emoji. Touch targets are at least 44 px.

**Layouts:**
- **Desktop and tablet:** header row (title left; matchup, New game and settings right), the woven band, the board centred, the status line under it.
- **Phone landscape:** one slim header row (title, status in the middle, matchup, New game, settings), with the board filling the rest. Side padding of 48 px clears the notch.
- **Phone upright** (`(orientation: portrait) and (max-width: 599px)`): `RotatePrompt`, which shows the title, a small decorative board, a rotate icon and "Turn your phone sideways to play". The game state is kept and the board reappears when the phone is turned.

**Motion:** speeds as in decision 6. A seed travels from cup to cup and settles with a small ease-out, like a hand dropping it. The highlight on the receiving cup is a subtle warm glow on the wood, not a bright UI colour.

**Puzzle marks (for a later change):** `wrong` is a 4 px `--rust` ring just outside the cup. `reveal` is a warm glow (`rgba(255,214,150,.85)` ring plus a soft outer glow).

**What we avoid:** default system or Inter fonts, gradient washes, glassmorphism, drop-shadow cards on grey, emoji icons, generic "African pattern" clip-art, and anything that reads as a stock SaaS dashboard.

**Why SVG for the real board:** the concepts use HTML and CSS for speed, but the build draws the board in SVG. Curved cups, the scalloped outline and many small seeds are natural there, it scales cleanly, and it can be tested by role and label. The geometry and seed placement port across directly from `Board.dc.html`.

**What this needs from the code** (checked in task 1.2): nothing new from the engine or the AI. The plan changes are: remove the random bot and the seed UI, replace the recap with captions, add the rotate prompt, the New game sheet and the settings pop-over, and add the board's puzzle-mark props. All of these are reflected in the spec and tasks.

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
