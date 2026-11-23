//! Looking ahead: minimax search with alpha-beta pruning.

use crate::eval::evaluate;
use mancala_core::{Board, Player, Status};

/// The result of searching every legal move from a position.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct SearchResult {
    /// Each legal pit (0-5) with its exact score for the player to move.
    pub scores: Vec<(usize, i32)>,
    /// How many positions were looked at (for benchmarks and curiosity).
    pub nodes: u64,
}

/// Scores every legal move for the player to move, looking `depth` moves ahead
/// (the move itself counts as one). `depth` must be at least 1.
///
/// Each root move is searched with a full window, so every score is exact and
/// equal scores really are ties (design.md decision 5).
pub fn search_scores(board: &Board, depth: u32) -> SearchResult {
    assert!(depth >= 1, "search depth must be at least 1");
    let me = board.to_move();
    let mut nodes = 0;
    let scores = board
        .legal_moves()
        .into_iter()
        .map(|pit| {
            let (child, _) = board.play(pit).expect("legal_moves() are legal");
            let score = minimax(&child, depth - 1, me, i32::MIN, i32::MAX, &mut nodes);
            (pit, score)
        })
        .collect();
    SearchResult { scores, nodes }
}

/// Minimax with alpha-beta pruning. Same answer as `minimax_full`, less work.
///
/// - `alpha`: the score `me` is already guaranteed elsewhere in the tree.
/// - `beta`: the score the opponent is already guaranteed (they want it low).
///
/// Once `alpha >= beta`, the player choosing here has found something the
/// *other* player would never allow, so the remaining moves can't matter.
fn minimax(
    board: &Board,
    depth: u32,
    me: Player,
    mut alpha: i32,
    mut beta: i32,
    nodes: &mut u64,
) -> i32 {
    *nodes += 1;

    let moves = board.legal_moves();
    if depth == 0 || board.status() != Status::InProgress || moves.is_empty() {
        return evaluate(board, me);
    }

    if board.to_move() == me {
        // My move: take the highest score.
        let mut best = i32::MIN;
        for pit in moves {
            let (child, _) = board.play(pit).expect("legal_moves() are legal");
            best = best.max(minimax(&child, depth - 1, me, alpha, beta, nodes));
            alpha = alpha.max(best);
            if alpha >= beta {
                break; // the opponent would never let the game reach here
            }
        }
        best
    } else {
        // Their move: they take the lowest score (worst for me).
        let mut best = i32::MAX;
        for pit in moves {
            let (child, _) = board.play(pit).expect("legal_moves() are legal");
            best = best.min(minimax(&child, depth - 1, me, alpha, beta, nodes));
            beta = beta.min(best);
            if alpha >= beta {
                break; // I would never let the game reach here
            }
        }
        best
    }
}

/// Plain minimax with no pruning: looks at *every* position `depth` moves ahead.
///
/// Slow but obviously correct, so it's kept for tests only: the faster
/// alpha-beta search (task 3.2) must always agree with it.
///
/// Scores are always from `me`'s point of view. Whether this position
/// maximises or minimises depends on whose turn it is, *not* on the depth, so
/// an extra turn (same player again) keeps maximising.
#[cfg(test)]
pub(crate) fn minimax_full(board: &Board, depth: u32, me: Player, nodes: &mut u64) -> i32 {
    *nodes += 1;

    let moves = board.legal_moves();
    if depth == 0 || board.status() != Status::InProgress || moves.is_empty() {
        return evaluate(board, me);
    }

    let scores = moves.into_iter().map(|pit| {
        let (child, _) = board.play(pit).expect("legal_moves() are legal");
        minimax_full(&child, depth - 1, me, nodes)
    });

    let best = if board.to_move() == me {
        scores.max() // my move: I pick the best for me
    } else {
        scores.min() // their move: they pick the worst for me
    };
    best.expect("there was at least one move")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::eval::{WIN, evaluate};
    use mancala_core::{Board, Player};

    /// The score of each legal root move, using the plain (unpruned) search.
    fn root_scores_full(board: &Board, depth: u32) -> Vec<(usize, i32)> {
        let me = board.to_move();
        let mut nodes = 0;
        board
            .legal_moves()
            .into_iter()
            .map(|pit| {
                let (child, _) = board.play(pit).unwrap();
                (pit, minimax_full(&child, depth - 1, me, &mut nodes))
            })
            .collect()
    }

    #[test]
    fn depth_zero_is_just_the_evaluation() {
        let board = Board::from_parts([4; 6], 5, [4; 6], 2, Player::South);
        let mut nodes = 0;
        assert_eq!(
            minimax_full(&board, 0, Player::South, &mut nodes),
            evaluate(&board, Player::South)
        );
        assert_eq!(nodes, 1, "one position looked at");
    }

    #[test]
    fn sees_the_capture_at_depth_1() {
        // The `South captures` position: pit 0 (shown as 1) captures 6.
        let board = Board::from_parts([1, 0, 0, 2, 0, 0], 0, [1, 1, 1, 1, 5, 1], 0, Player::South);
        // Pit 3 also captures a little: its last seed lands in empty pit 5,
        // opposite North's 1 seed, for +2. Pit 0's capture of 6 is still best.
        let scores = root_scores_full(&board, 1);
        assert_eq!(scores, vec![(0, 6), (3, 2)]);
    }

    #[test]
    fn keeps_maximising_after_an_extra_turn() {
        // South plays pit 5 (1 seed) into the store: extra turn. South then has a
        // choice: pit 4 captures North's 5 seeds (and ends the game), pit 3 doesn't.
        // A search that wrongly assumed the turn passed would pick the worse reply.
        let board = Board::from_parts([0, 0, 0, 1, 1, 1], 0, [5, 0, 0, 0, 0, 0], 0, Player::South);
        let scores = root_scores_full(&board, 2);
        let pit5 = scores.iter().find(|(pit, _)| *pit == 5).unwrap().1;
        assert!(pit5 > WIN, "pit 5 then pit 4 wins outright, got {pit5}");
    }

    #[test]
    fn minimises_on_the_opponents_move() {
        // Depth 2 from the start: whatever South does, North replies with its best,
        // so no South move can score above what North allows.
        let full = root_scores_full(&Board::new(), 2);
        let mut nodes = 0;
        for (pit, score) in full {
            let (child, _) = Board::new().play(pit).unwrap();
            if child.to_move() == Player::North {
                let worst_reply = child
                    .legal_moves()
                    .into_iter()
                    .map(|reply| evaluate(&child.play(reply).unwrap().0, Player::South))
                    .min()
                    .unwrap();
                assert_eq!(score, worst_reply, "pit {pit}");
            }
            nodes += 1;
        }
        assert_eq!(nodes, 6);
    }

    /// A position part-way through a game: `moves` random legal moves from the start.
    fn random_position(rng: &mut mancala_core::Rng, moves: usize) -> Board {
        let mut board = Board::new();
        for _ in 0..moves {
            let legal = board.legal_moves();
            if legal.is_empty() {
                break;
            }
            board = board.play(legal[rng.below(legal.len())]).unwrap().0;
        }
        board
    }

    #[test]
    fn alpha_beta_agrees_with_plain_minimax() {
        let mut rng = mancala_core::Rng::new(2026);
        let (mut full_nodes, mut pruned_nodes) = (0u64, 0u64);
        let mut checked = 0;

        while checked < 300 {
            // Two steps: `rng` can't be borrowed mutably twice in one call.
            let moves = rng.below(40);
            let board = random_position(&mut rng, moves);
            if board.status() != Status::InProgress {
                continue;
            }
            for depth in 1..=5 {
                let me = board.to_move();
                let mut nodes = 0;
                let full: Vec<(usize, i32)> = board
                    .legal_moves()
                    .into_iter()
                    .map(|pit| {
                        let (child, _) = board.play(pit).unwrap();
                        (pit, minimax_full(&child, depth - 1, me, &mut nodes))
                    })
                    .collect();

                let result = search_scores(&board, depth);
                assert_eq!(result.scores, full, "depth {depth} on {board:?}");
                assert!(
                    result.nodes <= nodes,
                    "alpha-beta searched more at depth {depth}"
                );

                full_nodes += nodes;
                pruned_nodes += result.nodes;
            }
            checked += 1;
        }

        println!(
            "plain minimax: {full_nodes} positions, alpha-beta: {pruned_nodes} ({:.0}% saved)",
            100.0 * (1.0 - pruned_nodes as f64 / full_nodes as f64)
        );
    }
}
