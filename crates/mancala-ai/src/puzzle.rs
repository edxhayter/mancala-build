//! Puzzles: positions with one clearly best move (design.md decisions 1-3).

use mancala_core::{Board, Status};
use std::cmp::Reverse;

use crate::choose::Level;
use crate::search::search_scores;

/// How far the answer is checked: as far as the hard AI looks, so a puzzle's
/// answer is always a move the site's strongest opponent would play.
pub const PUZZLE_DEPTH: u32 = Level::Hard.depth();

/// How much better the answer must score than the next-best move.
pub const MARGIN: i32 = 2;

/// A puzzle comes from at least this many moves into a game.
pub const MIN_MOVES: usize = 4;

/// ...and at most this many.
pub const MAX_MOVES: usize = 30;

/// A position and the one move that is clearly best in it.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct Puzzle {
    pub board: Board,
    /// The best pit (0-5) for the player to move.
    pub answer: usize,
}

/// The move that beats every other by at least `MARGIN` at `PUZZLE_DEPTH`,
/// or `None` if no move does (a tie, a narrow lead, a finished game, or
/// nothing to choose between).
pub fn clear_best_move(board: &Board) -> Option<usize> {
    clear_best_move_at(board, PUZZLE_DEPTH)
}

/// The same check at any depth, so tests can use quick shallow searches.
fn clear_best_move_at(board: &Board, depth: u32) -> Option<usize> {
    if board.status() != Status::InProgress || board.legal_moves().len() < 2 {
        return None;
    }
    let mut scores = search_scores(board, depth).scores;
    // Best first. `Reverse` flips the order, so the highest score sorts first.
    scores.sort_by_key(|&(_, score)| Reverse(score));
    match scores.as_slice() {
        [(pit, best), (_, second), ..] if best - second >= MARGIN => Some(*pit),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use mancala_core::Player;

    /// The real scores, best first, so each test can show its position is what it claims.
    fn sorted_scores(board: &Board) -> Vec<i32> {
        let mut scores: Vec<i32> = search_scores(board, PUZZLE_DEPTH)
            .scores
            .into_iter()
            .map(|(_, score)| score)
            .collect();
        scores.sort_by_key(|&score| Reverse(score));
        scores
    }

    // Scenario: A position with a tie for best is not a puzzle
    #[test]
    fn a_tie_is_not_a_puzzle() {
        // Looking one move ahead from the start, pits 2-5 all score +1.
        assert_eq!(clear_best_move_at(&Board::new(), 1), None);

        // Late in a game: three of South's moves all win by the same score.
        let board = Board::from_parts(
            [4, 0, 2, 0, 1, 0],
            22,
            [0, 0, 0, 0, 2, 3],
            14,
            Player::South,
        );
        let scores = sorted_scores(&board);
        assert_eq!(scores[0], scores[1], "really a tie: {scores:?}");
        assert_eq!(clear_best_move(&board), None);
    }

    // Scenario: A position where the best move is only slightly better is not a puzzle
    #[test]
    fn a_narrow_lead_is_not_a_puzzle() {
        let board = Board::from_parts(
            [0, 0, 1, 1, 2, 0],
            19,
            [0, 0, 1, 1, 1, 3],
            19,
            Player::North,
        );
        let scores = sorted_scores(&board);
        assert_eq!(scores[0] - scores[1], 1, "really ahead by 1: {scores:?}");
        assert_eq!(clear_best_move(&board), None);
    }

    #[test]
    fn a_clear_lead_is_a_puzzle() {
        // `South captures` from kalah-rules. The capture (pit 0) is best one move
        // ahead, but 12 moves deep pit 3 is clearly better: deep checking matters.
        let board = Board::from_parts([1, 0, 0, 2, 0, 0], 0, [1, 1, 1, 1, 5, 1], 0, Player::South);
        let scores = sorted_scores(&board);
        assert!(scores[0] - scores[1] >= MARGIN, "{scores:?}");
        assert_eq!(clear_best_move(&board), Some(3));
    }

    #[test]
    fn the_winning_move_is_a_puzzle() {
        // Pit 4 wins the game; pit 0 loses it (see choose.rs).
        let board = Board::from_parts(
            [1, 0, 0, 0, 1, 0],
            18,
            [5, 0, 0, 0, 0, 0],
            23,
            Player::South,
        );
        assert_eq!(clear_best_move(&board), Some(4));
    }

    #[test]
    fn nothing_to_choose_is_not_a_puzzle() {
        let finished = Board::from_parts([0; 6], 30, [0; 6], 18, Player::South);
        assert_eq!(clear_best_move(&finished), None, "game over");

        let one_move =
            Board::from_parts([0, 0, 0, 0, 0, 3], 20, [1, 2, 3, 4, 5, 6], 4, Player::South);
        assert_eq!(one_move.legal_moves(), vec![5]);
        assert_eq!(clear_best_move(&one_move), None, "only one legal move");
    }
}
