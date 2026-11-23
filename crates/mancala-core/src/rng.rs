/// A tiny seeded random number generator (xorshift64).
///
/// The same seed always produces the same sequence, so a test that fails can be
/// replayed exactly. Fast and good enough for tests and puzzles, but **not**
/// suitable for anything security-related.
#[derive(Clone, Debug)]
pub struct Rng {
    state: u64,
}

impl Rng {
    /// Creates a generator from `seed`. Any seed works, including 0.
    pub fn new(seed: u64) -> Self {
        // xorshift gets stuck at 0 forever (0 shifted and xored is still 0),
        // so swap a zero seed for a fixed non-zero constant.
        let state = if seed == 0 {
            0x9E37_79B9_7F4A_7C15
        } else {
            seed
        };
        Rng { state }
    }

    /// The next pseudo-random 64-bit number.
    pub fn next_u64(&mut self) -> u64 {
        let mut x = self.state;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.state = x;
        x
    }

    /// A random index in `0..n`. Panics if `n` is 0.
    ///
    /// Uses a plain remainder, which is very slightly biased towards small
    /// numbers. That doesn't matter for picking moves.
    pub fn below(&mut self, n: usize) -> usize {
        (self.next_u64() % n as u64) as usize
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn same_seed_gives_same_sequence() {
        let mut a = Rng::new(42);
        let mut b = Rng::new(42);
        for _ in 0..1000 {
            assert_eq!(a.next_u64(), b.next_u64());
        }
    }

    #[test]
    fn different_seeds_give_different_sequences() {
        let mut a = Rng::new(1);
        let mut b = Rng::new(2);
        assert_ne!(a.next_u64(), b.next_u64());
    }

    #[test]
    fn zero_seed_does_not_get_stuck() {
        let mut rng = Rng::new(0);
        assert_ne!(rng.next_u64(), 0);
    }

    #[test]
    fn below_stays_in_range() {
        let mut rng = Rng::new(7);
        for _ in 0..1000 {
            assert!(rng.below(6) < 6);
        }
    }
}
