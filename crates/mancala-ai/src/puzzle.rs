//! Puzzles: positions with one clearly best move (design.md decisions 1-3).

use mancala_core::{Board, Rng, Status};
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

/// The puzzle for `seed`. The same seed always gives the same puzzle.
///
/// Plays short seeded random games from the start and keeps the first
/// position that `clear_best_move` accepts (design.md decision 2).
pub fn generate_puzzle(seed: u64) -> Puzzle {
    generate_puzzle_traced(seed).puzzle
}

/// A puzzle with how it was found: for tests and for measuring.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct Generated {
    pub puzzle: Puzzle,
    /// The moves from the starting position that reach the puzzle.
    pub moves: Vec<usize>,
    /// How many positions were checked with the deep search (the last one passed).
    pub candidates: u32,
}

/// `generate_puzzle`, also returning the moves played and the positions tried.
pub fn generate_puzzle_traced(seed: u64) -> Generated {
    let mut rng = Rng::new(seed);
    let mut candidates = 0;
    // Every attempt draws from the same `rng`, so the whole search, and the
    // puzzle it ends on, depends only on the seed.
    loop {
        let length = MIN_MOVES + rng.below(MAX_MOVES - MIN_MOVES + 1);
        let Some((board, moves)) = random_walk(&mut rng, length) else {
            continue; // the game ended during the walk: start another
        };
        candidates += 1;
        if let Some(answer) = clear_best_move(&board) {
            break Generated {
                puzzle: Puzzle { board, answer },
                moves,
                candidates,
            };
        }
    }
}

/// `length` random legal moves from the start, or `None` if the game ends first.
fn random_walk(rng: &mut Rng, length: usize) -> Option<(Board, Vec<usize>)> {
    let mut board = Board::new();
    let mut moves = Vec::with_capacity(length);
    for _ in 0..length {
        let legal = board.legal_moves();
        if legal.is_empty() {
            return None;
        }
        let pit = legal[rng.below(legal.len())];
        board = board.play(pit).expect("legal_moves() are legal").0;
        moves.push(pit);
    }
    Some((board, moves))
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

#[cfg(test)]
mod generation_tests {
    use super::*;
    use mancala_core::Player;
    use std::collections::HashSet;

    /// How many seeds the everyday tests use. Each puzzle needs one or more
    /// 12-move searches, which are slow in a debug build; the full 200 run in
    /// `many_seeds_in_release` (`cargo test --release -- --ignored`).
    const QUICK_SEEDS: u64 = 6;

    fn total_seeds(board: &Board) -> u32 {
        let pits = |p| board.pits(p).iter().map(|&s| u32::from(s)).sum::<u32>();
        pits(Player::South)
            + pits(Player::North)
            + u32::from(board.store(Player::South))
            + u32::from(board.store(Player::North))
    }

    /// Everything the spec promises about one generated puzzle.
    fn check(seed: u64) -> Generated {
        let generated = generate_puzzle_traced(seed);
        let Puzzle { board, answer } = generated.puzzle;

        // Scenario: Puzzles come from real games
        assert_eq!(total_seeds(&board), 48, "seed {seed}");
        assert_eq!(board.status(), Status::InProgress, "seed {seed}");
        assert!(board.legal_moves().len() >= 2, "seed {seed}");
        assert!(generated.moves.len() >= MIN_MOVES, "seed {seed}");
        let mut replay = Board::new();
        for &pit in &generated.moves {
            replay = replay.play(pit).expect("every move in the walk is legal").0;
        }
        assert_eq!(replay, board, "seed {seed}: the moves reach the puzzle");

        // Scenario: The answer is clearly best
        let scores = search_scores(&board, PUZZLE_DEPTH).scores;
        let best = scores.iter().find(|&&(pit, _)| pit == answer).unwrap().1;
        for &(pit, score) in &scores {
            if pit != answer {
                assert!(best - score >= MARGIN, "seed {seed}: {scores:?}");
            }
        }
        generated
    }

    // Scenario: Same seed, same puzzle
    #[test]
    fn same_seed_same_puzzle() {
        for seed in [1, 42, 2026] {
            assert_eq!(generate_puzzle(seed), generate_puzzle(seed), "seed {seed}");
        }
    }

    // Scenario: Puzzles come from real games
    // Scenario: The answer is clearly best
    // Scenario: Every seed gives a puzzle
    #[test]
    fn puzzles_from_a_few_seeds() {
        for seed in 0..QUICK_SEEDS {
            check(seed);
        }
    }

    /// The full checks over 200 seeds, including variety. Slow in debug builds.
    // Scenario: Every seed gives a puzzle
    // Scenario: Puzzles vary
    #[test]
    #[ignore = "slow: run with cargo test --release -p mancala-ai -- --ignored"]
    fn many_seeds_in_release() {
        let puzzles: Vec<Puzzle> = (0..200).map(|seed| check(seed).puzzle).collect();

        // `Board` isn't `Hash`, so compare positions as plain arrays.
        let positions: HashSet<_> = puzzles
            .iter()
            .map(|p| {
                let b = p.board;
                let side = |player| (b.pits(player), b.store(player));
                (
                    side(Player::South),
                    side(Player::North),
                    b.to_move() == Player::South,
                )
            })
            .collect();
        assert!(
            positions.len() > 150,
            "only {} different positions",
            positions.len()
        );

        let answers: HashSet<usize> = puzzles.iter().map(|p| p.answer).collect();
        assert!(answers.len() >= 4, "answers only use pits {answers:?}");

        let south = puzzles
            .iter()
            .filter(|p| p.board.to_move() == Player::South)
            .count();
        assert!(
            0 < south && south < puzzles.len(),
            "both players are to move in some puzzles"
        );
    }
}
