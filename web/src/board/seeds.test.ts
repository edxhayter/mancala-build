import { describe, expect, it } from 'vitest';
import { seedSpots } from './seeds';

describe('seedSpots', () => {
  it('one spot per seed', () => {
    expect(seedSpots(0, 3, 100)).toHaveLength(0);
    expect(seedSpots(4, 3, 100)).toHaveLength(4);
    expect(seedSpots(48, 13, 100)).toHaveLength(48);
  });

  // Scenario: Seeds stay put between moves (the layout is a pure function)
  it('the same count in the same cup always gives the same layout', () => {
    expect(seedSpots(7, 5, 100)).toEqual(seedSpots(7, 5, 100));
  });

  it('a seed landing in a cup leaves the others where they were', () => {
    expect(seedSpots(5, 2, 100).slice(0, 4)).toEqual(seedSpots(4, 2, 100));
  });

  it('different cups look different', () => {
    expect(seedSpots(4, 1, 100)).not.toEqual(seedSpots(4, 2, 100));
  });

  it('a single seed sits in the middle', () => {
    const [only] = seedSpots(1, 9, 100);
    expect([only.x, only.y]).toEqual([0, 0]);
  });

  it('seeds stay inside a 100 px cup until it is very full', () => {
    for (const spot of seedSpots(12, 4, 100)) {
      expect(Math.hypot(spot.x, spot.y) + spot.rx).toBeLessThan(50);
    }
  });
});
