// The typed wrapper around the Rust engine (design.md decisions 2 and 4).
//
// The rest of the app never touches WASM objects. Every function here takes
// and returns plain data ("snapshots"), and frees each WASM object before it
// returns, so React state never holds WebAssembly memory.

import init, { Ai, WasmBoard, explainMoves as wasmExplainMoves, generatePuzzle } from './wasm/mancala_wasm';

export type Player = 'south' | 'north';

/** How hard the AI plays: search depth 2, 6 or 12 (see mancala-ai). */
export type Level = 'easy' | 'medium' | 'hard';

/** Whether the game is still going, and if not, how it ended. */
export type Status =
  | { kind: 'playing' }
  | { kind: 'won'; winner: Player }
  | { kind: 'draw' };

/** A position as plain numbers. Pits use each player's own numbering, 0..=5. */
export interface BoardSnapshot {
  pits: Record<Player, number[]>;
  stores: Record<Player, number>;
  toMove: Player;
  status: Status;
}

/** One pit (0..=5) or the store, on one player's side. */
export interface Slot {
  player: Player;
  place: number | 'store';
}

export interface MoveResult {
  board: BoardSnapshot;
  extraTurn: boolean;
  captured: number;
  /** Where each sown seed landed, in order (for the animation). */
  path: Slot[];
}

/** A puzzle: find the best move for whoever is to move (add-puzzles design.md decision 5). */
export interface PuzzleSnapshot {
  /** The seed it was made from; the same seed always gives the same puzzle. */
  seed: number;
  board: BoardSnapshot;
  /** The one clearly best pit (0..=5, the mover's own numbering). */
  answer: number;
  /** Every legal move, best first, ready for the explainer (add-move-explainer). */
  explanation: MoveExplanation[];
}

/** One move's explanation (add-move-explainer design.md decision 4). */
export interface MoveExplanation {
  /** The move (0..=5, the mover's own numbering). */
  pit: number;
  /** Its score from the mover's side: the store lead, ±1000 for a won or lost game. */
  score: number;
  /** The move, then each side's next moves in the AI's best play (each in its own player's numbering). */
  line: number[];
}

/** Loads the WASM module. Call once, before anything else here (main.tsx does). */
export async function initEngine(): Promise<void> {
  await init();
}

export function opponent(player: Player): Player {
  return player === 'south' ? 'north' : 'south';
}

// --- Numbers across the boundary: 0 = South, 1 = North -----------------------

const playerFromNumber = (n: number): Player => (n === 0 ? 'south' : 'north');
const playerToNumber = (p: Player): number => (p === 'south' ? 0 : 1);

function statusFromNumber(n: number): Status {
  switch (n) {
    case -1:
      return { kind: 'playing' };
    case 2:
      return { kind: 'draw' };
    default:
      return { kind: 'won', winner: playerFromNumber(n) };
  }
}

/** A slot code is `player * 7 + place`, where place 6 is the store. */
function slotFromCode(code: number): Slot {
  const place = code % 7;
  return {
    player: playerFromNumber(Math.floor(code / 7)),
    place: place === 6 ? 'store' : place,
  };
}

// --- Snapshot <-> WasmBoard ---------------------------------------------------

function snapshotOf(wasm: WasmBoard): BoardSnapshot {
  return {
    // Array.from turns the Uint8Array into an ordinary number[].
    pits: { south: Array.from(wasm.pits(0)), north: Array.from(wasm.pits(1)) },
    stores: { south: wasm.store(0), north: wasm.store(1) },
    toMove: playerFromNumber(wasm.toMove()),
    status: statusFromNumber(wasm.status()),
  };
}

function wasmOf(board: BoardSnapshot): WasmBoard {
  return WasmBoard.fromParts(
    Uint8Array.from(board.pits.south),
    board.stores.south,
    Uint8Array.from(board.pits.north),
    board.stores.north,
    playerToNumber(board.toMove),
  );
}

/** Builds a WasmBoard, runs `use` on it, and always frees it afterwards. */
function withWasm<T>(board: BoardSnapshot, use: (wasm: WasmBoard) => T): T {
  const wasm = wasmOf(board);
  try {
    return use(wasm);
  } finally {
    wasm.free();
  }
}

// --- The API the app uses -----------------------------------------------------

export function newBoard(): BoardSnapshot {
  const wasm = new WasmBoard();
  try {
    return snapshotOf(wasm);
  } finally {
    wasm.free();
  }
}

/** The mover's pits that can be played (non-empty, game in progress). */
export function legalMoves(board: BoardSnapshot): number[] {
  return withWasm(board, (wasm) => Array.from(wasm.legalMoves()));
}

/** Plays `pit` (0..=5, the mover's own numbering). Throws if it isn't legal. */
export function play(board: BoardSnapshot, pit: number): MoveResult {
  return withWasm(board, (wasm) => {
    const result = wasm.play(pit); // throws a JS Error for an illegal move
    try {
      const after = result.board();
      try {
        return {
          board: snapshotOf(after),
          extraTurn: result.extraTurn(),
          captured: result.captured(),
          path: Array.from(result.path(), slotFromCode),
        };
      } finally {
        after.free();
      }
    } finally {
      result.free();
    }
  });
}

// --- Puzzles ------------------------------------------------------------------

/** The puzzle for `seed` (a whole number that fits in a u32). Can take a moment: call it in a worker. */
export function newPuzzle(seed: number): PuzzleSnapshot {
  const puzzle = generatePuzzle(seed);
  try {
    const board = puzzle.board();
    try {
      const snapshot = snapshotOf(board);
      return { seed, board: snapshot, answer: puzzle.answer(), explanation: explainMoves(snapshot) };
    } finally {
      board.free();
    }
  } finally {
    puzzle.free();
  }
}

// --- Explanations -------------------------------------------------------------

/**
 * Every legal move for the player to move, best first, looking 12 moves ahead.
 * Can take a moment: call it in a worker. Throws if the game is over.
 */
export function explainMoves(board: BoardSnapshot): MoveExplanation[] {
  return withWasm(board, (wasm) => {
    const lines = wasmExplainMoves(wasm);
    try {
      return lines.map((l) => ({ pit: l.pit(), score: l.score(), line: Array.from(l.line()) }));
    } finally {
      lines.forEach((l) => l.free());
    }
  });
}

// --- The AI -------------------------------------------------------------------

const LEVEL_NUMBERS: Record<Level, number> = { easy: 0, medium: 1, hard: 2 };

/**
 * The AI for one game. Its random tie-breaks come from `seed`, so the same
 * seed always plays the same way. Call `free()` when the game is over.
 */
export class AiPlayer {
  private ai: Ai;

  constructor(seed: number) {
    this.ai = new Ai(seed);
  }

  /** The pit (0..=5) the AI plays for whoever is to move in `board`. */
  choose(board: BoardSnapshot, level: Level): number {
    return withWasm(board, (wasm) => this.ai.choose(wasm, LEVEL_NUMBERS[level]));
  }

  free(): void {
    this.ai.free();
  }
}
