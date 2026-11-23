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
