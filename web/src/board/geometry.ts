// The board's measurements, from design.md decision 10 and Board.dc.html.
// Everything follows from D, the diameter of one cup.

export interface Geometry {
  /** Cup diameter. */
  D: number;
  /** Distance between neighbouring cup centres. */
  P: number;
  /** Radius of the wood disc around each cup. */
  r: number;
  /** Height of the number band above and below the board. */
  L: number;
  width: number;
  height: number;
  /** y of the top row, the centre line (stores, seam, knob) and the bottom row. */
  yTop: number;
  yMid: number;
  yBottom: number;
  /** x of column k: -1 is the left store, 0..5 the pits, 6 the right store. */
  x: (k: number) => number;
}

export function geometry(D: number): Geometry {
  const P = 1.18 * D;
  const r = 0.62 * D;
  const L = 30 + 0.28 * D;
  const width = 7 * P + 2 * r;
  const height = P + 2 * r + 2 * L;
  const yMid = height / 2;
  return {
    D,
    P,
    r,
    L,
    width,
    height,
    yTop: yMid - P / 2,
    yMid,
    yBottom: yMid + P / 2,
    x: (k) => r + (k + 1) * P,
  };
}
