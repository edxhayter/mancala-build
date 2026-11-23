/// One of the two players. South moves first.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Player {
    South,
    North,
}

impl Player {
    /// The other player.
    pub fn opponent(self) -> Player {
        match self {
            Player::South => Player::North,
            Player::North => Player::South,
        }
    }

    /// Absolute array index of this player's store.
    pub fn store_index(self) -> usize {
        match self {
            Player::South => 6,
            Player::North => 13,
        }
    }

    /// Converts this player's pit number (0..=5) to an absolute array index.
    pub fn pit_index(self, pit: usize) -> usize {
        match self {
            Player::South => pit,
            Player::North => pit + 7,
        }
    }
}

/// Absolute index of the pit opposite `index` (valid for pit indices 0..=5 and 7..=12)
fn opposite(index: usize) -> usize {
    12 - index
}

/// Why a move was rejected. A rejected move never changes the board.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum MoveError {
    /// The pit number was not in 0..=5.
    PitOutOfRange,
    /// The chosen pit has no seeds in it.
    EmptyPit,
    /// The game has already finished, so no moves are allowed.
    GameOver,
}

/// A summary of what a legal move did.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
pub struct MoveOutcome {
    /// True if the last seed landed in the mover's own store, so they move again.
    pub extra_turn: bool,
    /// Seeds moved into the mover's store by a capture (including the capturing
    /// seed itself). Zero if there was no capture.
    pub captured: u8,
}

/// A Kalah position: the seeds in every pit and store, and whose turn it is.
///
/// The fields are private. Read the position through the methods below, and
/// change it only by playing moves.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct Board {
    /// All 14 slots in sowing order: South pits 0..=5, South store (6),
    /// North pits 7..=12, North store (13).
    slots: [u8; 14],
    to_move: Player,
}

impl Board {
    /// The starting position: 4 seeds in every pit, empty stores, South to move.
    pub fn new() -> Self {
        let mut slots = [4; 14];
        slots[Player::South.store_index()] = 0;
        slots[Player::North.store_index()] = 0;
        Board {
            slots,
            to_move: Player::South,
        }
    }

    /// Builds any position from its parts. Useful for tests and puzzles.
    ///
    /// This does **not** check that the seeds add up to 48, so it can build
    /// positions that could never happen in a real game.
    pub fn from_parts(
        south_pits: [u8; 6],
        south_store: u8,
        north_pits: [u8; 6],
        north_store: u8,
        to_move: Player,
    ) -> Self {
        let mut slots = [0; 14];

        let s = Player::South.pit_index(0);
        slots[s..s + 6].copy_from_slice(&south_pits);
        slots[Player::South.store_index()] = south_store;

        let n = Player::North.pit_index(0);
        slots[n..n + 6].copy_from_slice(&north_pits);
        slots[Player::North.store_index()] = north_store;

        Board { slots, to_move }
    }

    /// The seeds in `player`'s six pits, in that player's own order (pit 0 first).
    pub fn pits(&self, player: Player) -> [u8; 6] {
        let start = player.pit_index(0);
        self.slots[start..start + 6]
            .try_into()
            .expect("a 6-element slice always fits a [u8; 6]")
    }

    /// The seeds in `player`'s store.
    pub fn store(&self, player: Player) -> u8 {
        self.slots[player.store_index()]
    }

    /// The player whose turn it is.
    pub fn to_move(&self) -> Player {
        self.to_move
    }

    /// The pits (0..=5) the player to move may legally play, in ascending order.
    pub fn legal_moves(&self) -> Vec<usize> {
        let my_pits = self.pits(self.to_move);
        (0..6).filter(|&pit| my_pits[pit] > 0).collect()
    }

    /// Plays `pit` (0..=5, on the mover's side) and returns the new position and
    /// a summary of what happened. `self` is never changed, so you can try
    /// several moves from the same position.
    pub fn play(&self, pit: usize) -> Result<(Board, MoveOutcome), MoveError> {
        let mut next = *self;
        let outcome = next.apply(pit)?;
        Ok((next, outcome))
    }

    /// Plays `pit` on this board in place. All the rules live here.
    /// Validates before changing anything, so an error leaves the board untouched.
    fn apply(&mut self, pit: usize) -> Result<MoveOutcome, MoveError> {
        // Range check first: indexing with pit 99 would panic.
        if pit > 5 {
            return Err(MoveError::PitOutOfRange);
        }
        if self.slots[self.to_move.pit_index(pit)] == 0 {
            return Err(MoveError::EmptyPit);
        }

        let mover = self.to_move;
        let start = mover.pit_index(pit);

        // Sow: pick up every seed, then drop one in each following slot,
        // skipping the opponent's store.
        let mut seeds = self.slots[start];
        self.slots[start] = 0;
        let skip = mover.opponent().store_index();
        let mut index = start;
        while seeds > 0 {
            index = (index + 1) % 14; // after slot 13, wrap round to slot 0
            if index == skip {
                continue;
            }
            self.slots[index] += 1;
            seeds -= 1;
        }
        // `index` is now the slot where the last seed landed.

        // Extra turn if the last seed landed in the mover's own store.
        let extra_turn= if index == mover.store_index() { true } else { false };

        let captured = self.capture(mover, index);

        // Game end (section 7) will go here.

        if !extra_turn {
            self.to_move = mover.opponent();
        }
        Ok(MoveOutcome {
            extra_turn,
            captured,
        })
    }

    /// If `last` (where the mover's last seed landed) qualifies for a capture,
    /// moves that seed and everything opposite into the mover's store.
    /// Returns the number of seeds captured (0 if no capture).
    fn capture(&mut self, mover: Player, last: usize) -> u8 {
        // 1. The last seed must be in one of the mover's own pits (not a store).
        let my_pits = mover.pit_index(0)..=mover.pit_index(5);
        if !my_pits.contains(&last) {
            return 0;
        }
        // 2. That pit must have been empty, so it now holds only the seed just dropped.
        if self.slots[last] != 1 {
            return 0;
        }
        // 3. The opposite pit must have something to take.
        let across = opposite(last);
        if self.slots[across] == 0 {
            return 0;
        }

        let captured = self.slots[across] + self.slots[last];
        self.slots[across] = 0;
        self.slots[last] = 0;
        self.slots[mover.store_index()] += captured;
        captured
    }
}

impl Default for Board {
    /// Same as [`Board::new`].
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn opponent_of_south_is_north() {
        assert_eq!(Player::South.opponent(), Player::North);
    }

    #[test]
    fn opponent_of_north_is_south() {
        assert_eq!(Player::North.opponent(), Player::South);
    }

    #[test]
    fn store_indices() {
        assert_eq!(Player::South.store_index(), 6);
        assert_eq!(Player::North.store_index(), 13);
    }

    #[test]
    fn pit_index_converts_relative_to_absolute() {
        assert_eq!(Player::South.pit_index(0), 0);
        assert_eq!(Player::North.pit_index(0), 7);
        assert_eq!(Player::North.pit_index(5), 12);
    }

    // Spec scenario: Opposite pits
    #[test]
    fn opposite_pits() {
        assert_eq!(opposite(1), 11); // South pit 1 ↔ North pit 4
        assert_eq!(opposite(11), 1); // and back again
        assert_eq!(opposite(7), 5); // North pit 0 ↔ South pit 5
    }
}
