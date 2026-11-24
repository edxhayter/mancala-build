//! Explaining a position: every move, best first, with its line of best play
//! (add-move-explainer design.md decision 3).

use mancala_core::Board;

use crate::choose::Level;
use crate::search::{MoveLine, search_lines};

/// How far explanations look: as far as the hard AI, so they agree with
/// puzzles and with the strongest opponent.
pub const EXPLAIN_DEPTH: u32 = Level::Hard.depth();

/// Every legal move for the player to move, best first, each with its score
/// and line. Equal scores keep pit order.
///
/// # Panics
/// If there are no legal moves, e.g. the game is over.
pub fn explain_moves(board: &Board) -> Vec<MoveLine> {
    explain_moves_at(board, EXPLAIN_DEPTH)
}

fn explain_moves_at(board: &Board, depth: u32) -> Vec<MoveLine> {
    assert!(
        !board.legal_moves().is_empty(),
        "explain_moves needs a position with at least one legal move"
    );
    let mut lines = search_lines(board, depth);
    // `sort_by_key` is stable: moves with equal scores stay in pit order.
    lines.sort_by_key(|line| std::cmp::Reverse(line.score));
    lines
}

#[cfg(test)]
mod tests {
    use super::*;
    use mancala_core::Player;

    #[test]
    fn best_first_and_every_move_once() {
        let board = Board::from_parts(
            [1, 0, 0, 0, 1, 0],
            18,
            [5, 0, 0, 0, 0, 0],
            23,
            Player::South,
        );
        let lines = explain_moves(&board);
        assert_eq!(lines[0].pit, 4, "the winning move comes first");
        let scores: Vec<i32> = lines.iter().map(|l| l.score).collect();
        assert!(scores.windows(2).all(|w| w[0] >= w[1]), "{scores:?}");

        let mut pits: Vec<usize> = lines.iter().map(|l| l.pit).collect();
        pits.sort();
        assert_eq!(pits, board.legal_moves());
    }

    #[test]
    fn ties_keep_pit_order() {
        // One move ahead from the start, pits 2-5 all score +1, pits 0-1 score 0.
        let pits: Vec<usize> = explain_moves_at(&Board::new(), 1)
            .iter()
            .map(|l| l.pit)
            .collect();
        assert_eq!(pits, vec![2, 3, 4, 5, 0, 1]);
    }

    #[test]
    #[should_panic(expected = "at least one legal move")]
    fn a_finished_game_has_nothing_to_explain() {
        explain_moves(&Board::from_parts([0; 6], 30, [0; 6], 18, Player::South));
    }
}
