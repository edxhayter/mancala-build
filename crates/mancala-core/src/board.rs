/// One of the two players. South moves first.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Player {
    South,
    North
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
        assert_eq!(opposite(7), 5);  // North pit 0 ↔ South pit 5
    }
}