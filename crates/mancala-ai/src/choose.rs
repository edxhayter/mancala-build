//! Turning search scores into a single move.

use mancala_core::{Board, Rng};

use crate::search::search_scores;

/// How strong the AI plays: how many moves ahead it looks.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Level {
    Easy,
    Medium,
    Hard,
}

impl Level {
    /// Search depth in moves (each move, including extra-turn moves, counts as one).
    /// Chosen from `examples/depth_table.rs` (design.md decision 6): hard takes
    /// about 0.25 s from the start position in a release build.
    pub fn depth(self) -> u32 {
        match self {
            Level::Easy => 2,
            Level::Medium => 6,
            Level::Hard => 12,
        }
    }
}

/// The AI's move (a pit, 0-5) for the player to move.
///
/// Searches every legal move to the level's depth, then picks at random among
/// the moves with the best score, so games vary but replay exactly from the
/// same seed.
///
/// # Panics
/// If there are no legal moves, e.g. the game is over.
pub fn choose_move(board: &Board, level: Level, rng: &mut Rng) -> usize {
    let result = search_scores(board, level.depth());
    pick_best(&result.scores, rng)
}

/// A random choice among the best-scoring moves.
fn pick_best(scores: &[(usize, i32)], rng: &mut Rng) -> usize {
    let best = scores
        .iter()
        .map(|&(_, score)| score)
        .max()
        .expect("choose_move needs a position with at least one legal move");
    let tied: Vec<usize> = scores
        .iter()
        .filter(|&&(_, score)| score == best)
        .map(|&(pit, _)| pit)
        .collect();
    tied[rng.below(tied.len())]
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::search::search_scores;
    use mancala_core::{Board, Player};

    const ALL_LEVELS: [Level; 3] = [Level::Easy, Level::Medium, Level::Hard];

    #[test]
    fn harder_levels_look_further() {
        assert!(Level::Easy.depth() >= 1);
        assert!(Level::Easy.depth() < Level::Medium.depth());
        assert!(Level::Medium.depth() < Level::Hard.depth());
    }

    // Scenario: Takes the big capture
    #[test]
    fn takes_the_big_capture() {
        let board = Board::from_parts([1, 0, 0, 2, 0, 0], 0, [1, 1, 1, 1, 5, 1], 0, Player::South);
        let mut rng = Rng::new(1);
        assert_eq!(
            choose_move(&board, Level::Easy, &mut rng),
            0,
            "pit 1 on screen"
        );
    }

    // Scenario: Plays the winning move
    #[test]
    fn plays_the_winning_move() {
        // Pit 4 (shown as 5) captures North's last 5 seeds: the game ends 25-23 to South.
        // Pit 0 (shown as 1) captures nothing, and North then wins with best play.
        let board = Board::from_parts(
            [1, 0, 0, 0, 1, 0],
            18,
            [5, 0, 0, 0, 0, 0],
            23,
            Player::South,
        );
        let deep = search_scores(&board, 12).scores;
        assert!(
            deep.contains(&(0, -1006)),
            "pit 0 really is a forced loss: {deep:?}"
        );
        for level in ALL_LEVELS {
            let mut rng = Rng::new(1);
            assert_eq!(choose_move(&board, level, &mut rng), 4, "{level:?}");
        }
    }

    // Scenario: Same seed, same move
    #[test]
    fn same_seed_same_move() {
        let board = Board::new();
        for seed in 0..20 {
            let first = choose_move(&board, Level::Medium, &mut Rng::new(seed));
            let second = choose_move(&board, Level::Medium, &mut Rng::new(seed));
            assert_eq!(first, second, "seed {seed}");
        }
    }

    // Scenario: Only best moves are chosen
    #[test]
    fn only_best_moves_are_chosen() {
        // From the start, looking one move ahead, pits 2-5 all put a seed in the
        // store (+1) and pits 0-1 don't (0): a four-way tie for best.
        let scores = search_scores(&Board::new(), 1).scores;
        let mut seen = Vec::new();
        for seed in 0..100 {
            let pit = pick_best(&scores, &mut Rng::new(seed));
            assert!((2..=5).contains(&pit), "seed {seed} chose pit {pit}");
            if !seen.contains(&pit) {
                seen.push(pit);
            }
        }
        assert!(
            seen.len() > 1,
            "ties should be broken differently by different seeds"
        );
    }
}
