// The typed wrapper around the Rust engine (design.md decisions 2 and 4).
//
// The rest of the app never touches WASM objects. Every function here takes
// and returns plain data ("snapshots"), and frees each WASM object before it
// returns, so React state never holds WebAssembly memory.

import init, { WasmBoard } from './wasm/mancala_wasm';

export type Player = 'south' | 'north';

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
