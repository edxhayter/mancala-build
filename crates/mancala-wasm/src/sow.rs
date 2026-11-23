//! The seed-by-seed path of a move, for the sowing animation.
//!
//! The engine (`mancala-core`) only gives the result of a move. The page needs
//! the steps: which pit or store each seed lands in, in order. This walks the
//! same ring as the rules, and a property test checks it against `Board::play`.

use mancala_core::{Board, Player};

/// Where on one player's side a seed can land.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Place {
    /// One of the player's pits, 0..=5 in their own numbering.
    Pit(usize),
    /// The player's store.
    Store,
}

/// One pit or store on the board.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct Slot {
    pub player: Player,
    pub place: Place,
}

impl Slot {
    /// One byte for JavaScript: `player * 7 + place`, where player is
    /// 0 (South) or 1 (North) and place is 0..=5 for a pit, 6 for the store.
    pub fn code(self) -> u8 {
        let player = match self.player {
            Player::South => 0,
            Player::North => 1,
        };
        let place = match self.place {
            Place::Pit(pit) => pit as u8,
            Place::Store => 6,
        };
        player * 7 + place
    }

    /// How many seeds `board` has in this slot (used by the tests).
    #[cfg(test)]
    pub fn count(self, board: &Board) -> u8 {
        match self.place {
            Place::Pit(pit) => board.pits(self.player)[pit],
            Place::Store => board.store(self.player),
        }
    }
}

/// Every slot a move sows into, one entry per seed, in order.
///
/// Sowing goes round a ring of 13 slots: the mover's six pits, the mover's
/// store, then the opponent's six pits. The opponent's store is not on the ring
/// at all, so it can never receive a seed. The starting pit *is* on the ring,
/// so 13 or more seeds come back round to it.
pub fn sow_path(board: &Board, pit: usize) -> Vec<Slot> {
    let mover = board.to_move();
    let ring: Vec<Slot> = (0..6)
        .map(|n| Slot {
            player: mover,
            place: Place::Pit(n),
        })
        .chain([Slot {
            player: mover,
            place: Place::Store,
        }])
        .chain((0..6).map(|n| Slot {
            player: mover.opponent(),
            place: Place::Pit(n),
        }))
        .collect();

    let seeds = board.pits(mover)[pit] as usize;
    (1..=seeds).map(|k| ring[(pit + k) % ring.len()]).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use mancala_core::{Rng, Status};

    fn pit(player: Player, n: usize) -> Slot {
        Slot {
            player,
            place: Place::Pit(n),
        }
    }
    fn store(player: Player) -> Slot {
        Slot {
            player,
            place: Place::Store,
        }
    }
    use Player::{North, South};

    // Scenario: Seeds travel pit to pit (web-play) — South plays pit 1 from the start.
    #[test]
    fn simple_sow_from_the_start() {
        let path = sow_path(&Board::new(), 0);
        assert_eq!(
            path,
            vec![pit(South, 1), pit(South, 2), pit(South, 3), pit(South, 4)]
        );
    }

    // Scenario: The opponent's store is skipped (kalah-rules position).
    #[test]
    fn the_opponents_store_is_skipped() {
        let board = Board::from_parts([0, 0, 1, 0, 0, 10], 0, [0; 6], 0, South);
        let path = sow_path(&board, 5);
        let expected = vec![
            store(South),
            pit(North, 0),
            pit(North, 1),
            pit(North, 2),
            pit(North, 3),
            pit(North, 4),
            pit(North, 5),
            pit(South, 0),
            pit(South, 1),
            pit(South, 2),
        ];
        assert_eq!(path, expected);
        assert!(!path.contains(&store(North)), "never North's store");
    }

    // kalah-rules: A lap of 13 seeds returns to the starting pit.
    #[test]
    fn a_lap_of_13_returns_to_the_starting_pit() {
        let board = Board::from_parts([13, 0, 0, 0, 0, 0], 0, [1; 6], 0, South);
        let path = sow_path(&board, 0);
        assert_eq!(path.len(), 13);
        assert_eq!(path.last(), Some(&pit(South, 0)));
        assert_eq!(path.iter().filter(|s| **s == store(South)).count(), 1);
    }

    #[test]
    fn north_sows_from_its_own_numbering() {
        let (board, _) = Board::new().play(0).unwrap(); // North to move
        let path = sow_path(&board, 2);
        assert_eq!(
            path,
            vec![pit(North, 3), pit(North, 4), pit(North, 5), store(North)]
        );
    }

    #[test]
    fn slot_codes() {
        assert_eq!(pit(South, 0).code(), 0);
        assert_eq!(store(South).code(), 6);
        assert_eq!(pit(North, 0).code(), 7);
        assert_eq!(store(North).code(), 13);
    }

    const ALL_SLOTS: [Slot; 14] = {
        use Place::{Pit, Store};
        [
            Slot {
                player: South,
                place: Pit(0),
            },
            Slot {
                player: South,
                place: Pit(1),
            },
            Slot {
                player: South,
                place: Pit(2),
            },
            Slot {
                player: South,
                place: Pit(3),
            },
            Slot {
                player: South,
                place: Pit(4),
            },
            Slot {
                player: South,
                place: Pit(5),
            },
            Slot {
                player: South,
                place: Store,
            },
            Slot {
                player: North,
                place: Pit(0),
            },
            Slot {
                player: North,
                place: Pit(1),
            },
            Slot {
                player: North,
                place: Pit(2),
            },
            Slot {
                player: North,
                place: Pit(3),
            },
            Slot {
                player: North,
                place: Pit(4),
            },
            Slot {
                player: North,
                place: Pit(5),
            },
            Slot {
                player: North,
                place: Store,
            },
        ]
    };

    /// The property test from design.md decision 3: following the path seed by
    /// seed must give exactly what the engine's `play()` gives.
    #[test]
    fn path_matches_the_engine_over_random_games() {
        let mut rng = Rng::new(2026);
        let mut checked = 0;
        for _game in 0..400 {
            let mut board = Board::new();
            while board.status() == Status::InProgress {
                let legal = board.legal_moves();
                let chosen = legal[rng.below(legal.len())];
                for &p in &legal {
                    let mover = board.to_move();
                    let path = sow_path(&board, p);
                    let (after, outcome) = board.play(p).unwrap();

                    // Rebuild "after sowing" from the path alone.
                    let start = pit(mover, p);
                    let sown = |slot: Slot| {
                        let base = if slot == start { 0 } else { slot.count(&board) };
                        base + path.iter().filter(|s| **s == slot).count() as u8
                    };

                    if after.status() != Status::InProgress {
                        continue; // the final sweep moves everything; covered by the animation tests
                    }
                    let last = *path.last().unwrap();
                    for slot in ALL_SLOTS {
                        if outcome.captured > 0 {
                            // A capture empties the landing pit and the one opposite into the store.
                            let opposite = match last.place {
                                Place::Pit(n) => pit(mover.opponent(), 5 - n),
                                Place::Store => unreachable!("a capture never ends in a store"),
                            };
                            if slot == last || slot == opposite || slot == store(mover) {
                                continue;
                            }
                        }
                        assert_eq!(
                            sown(slot),
                            slot.count(&after),
                            "slot {slot:?}, pit {p}, board {board:?}"
                        );
                    }
                    if outcome.captured > 0 {
                        assert_eq!(sown(store(mover)) + outcome.captured, after.store(mover));
                    }
                    checked += 1;
                }
                board = board.play(chosen).unwrap().0;
            }
        }
        assert!(checked > 10_000, "only {checked} moves checked");
    }
}
