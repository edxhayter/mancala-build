//! Looking ahead: minimax search.

#[cfg(test)]
use crate::eval::evaluate;
#[cfg(test)]
use mancala_core::{Board, Player, Status};

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
}
