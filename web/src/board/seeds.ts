// Where each seed sits in its cup: a sunflower spiral, ported from Board.dc.html.
//
// The layout depends only on (count, key, D). There is no randomness, so the
// same position is always drawn the same way (spec: Seeds stay put between
// moves), and when a seed lands, the seeds already there don't move.

/** One seed, relative to the cup's centre. */
export interface SeedSpot {
  x: number;
  y: number;
  /** Half-width and half-height of the seed's oval. */
  rx: number;
  ry: number;
  /** Degrees. */
  rotate: number;
  /** Every third seed uses the second seed tone. */
  alt: boolean;
  /** Every third seed shows its scar (hilum). */
  scar: boolean;
}

const GOLDEN_ANGLE = 2.39996; // radians, about 137.5°

/**
 * @param count seeds in the cup
 * @param key   a fixed number per cup (1..14), so each cup looks a little different
 * @param D     cup diameter in px
 */
export function seedSpots(count: number, key: number, D: number): SeedSpot[] {
  const dense = count > 9; // pack tighter when the cup is fuller
  const spread = ((dense ? 5.4 : 8.4) * D) / 100;
  const size = ((dense ? 0.85 : 1) * D) / 100;

  const spots: SeedSpot[] = [];
  for (let k = 0; k < count; k++) {
    // Each seed sits a little further out than the last, turned by the golden angle.
    const distance = count === 1 ? 0 : spread * Math.sqrt(k + 0.6);
    const angle = k * GOLDEN_ANGLE + key * 0.9;
    const width = (21 + ((k * 7 + key * 3) % 4)) * size; // 21-24 px at D = 100
    spots.push({
      // `+ 0` turns -0 into 0 (sin of some angles times 0 gives -0).
      x: Math.cos(angle) * distance + 0,
      y: Math.sin(angle) * distance + 0,
      rx: width / 2,
      ry: (width * 0.8) / 2,
      rotate: (k * 53 + key * 29) % 180,
      alt: (k + key) % 3 === 1,
      scar: (k + key) % 3 === 0,
    });
  }
  return spots;
}
