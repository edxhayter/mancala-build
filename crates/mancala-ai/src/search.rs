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

/// One legal move with its exact score and the line of best play behind it.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct MoveLine {
    /// The move (0-5), for the player to move.
    pub pit: usize,
    /// Its score, exactly as `search_scores` gives it.
    pub score: i32,
    /// The move itself, then the moves both sides make next in the AI's best
    /// play. Replaying it reaches a position whose evaluation is `score`.
    pub line: Vec<usize>,
}

/// Like `search_scores`, but also returns each move's line of best play (the
/// "principal variation") (add-move-explainer design.md decisions 1 and 2).
///
/// Slower than `search_scores`, because it copies lines as it goes, so the AI
/// keeps using `search_scores` to choose its moves.
pub fn search_lines(board: &Board, depth: u32) -> Vec<MoveLine> {
    assert!(depth >= 1, "search depth must be at least 1");
    let me = board.to_move();
    let mut nodes = 0;
    let mut rest = Vec::new();
    board
        .legal_moves()
        .into_iter()
        .map(|pit| {
            let (child, _) = board.play(pit).expect("legal_moves() are legal");
            let score = minimax_line(
                &child,
                depth - 1,
                me,
                i32::MIN,
                i32::MAX,
                &mut nodes,
                &mut rest,
            );
            let mut line = vec![pit];
            line.extend_from_slice(&rest);
            MoveLine { pit, score, line }
        })
        .collect()
}

/// `minimax`, also filling `line` with the best moves from this position on.
///
/// A move's line is kept only when it is *strictly* better than everything
/// before it. Along those moves every score was searched inside its window,
/// so it is exact, and the line really produces it. Lines from pruned
/// branches are bounds, not exact, and they always get replaced or ignored.
fn minimax_line(
    board: &Board,
    depth: u32,
    me: Player,
    mut alpha: i32,
    mut beta: i32,
    nodes: &mut u64,
    line: &mut Vec<usize>,
) -> i32 {
    *nodes += 1;
    line.clear(); // a leaf has no moves after it

    let moves = board.legal_moves();
    if depth == 0 || board.status() != Status::InProgress || moves.is_empty() {
        return evaluate(board, me);
    }

    let maximising = board.to_move() == me;
    let mut best = if maximising { i32::MIN } else { i32::MAX };
    let mut child_line = Vec::new(); // reused for each child, to save allocations
    for pit in moves {
        let (child, _) = board.play(pit).expect("legal_moves() are legal");
        let score = minimax_line(&child, depth - 1, me, alpha, beta, nodes, &mut child_line);
        let improves = if maximising {
            score > best
        } else {
            score < best
        };
        if improves {
            best = score;
            line.clear();
            line.push(pit);
            line.extend_from_slice(&child_line);
        }
        if maximising {
            alpha = alpha.max(best);
        } else {
            beta = beta.min(best);
        }
        if alpha >= beta {
            break; // the other player would never allow this position
        }
    }
    best
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

    /// Plays `line` from `board`, checking every move is legal, and returns the end.
    fn replay(board: &Board, line: &[usize]) -> Board {
        line.iter().fold(*board, |position, &pit| {
            position
                .play(pit)
                .unwrap_or_else(|e| panic!("{pit} is not legal in {position:?}: {e:?}"))
                .0
        })
    }

    // Scenario: Lines agree with the scores
    // Scenario: A line proves its score
    #[test]
    fn lines_agree_with_scores_and_prove_them() {
        let mut rng = mancala_core::Rng::new(77);
        let mut checked = 0;
        while checked < 300 {
            let moves = rng.below(40);
            let board = random_position(&mut rng, moves);
            if board.status() != Status::InProgress {
                continue;
            }
            for depth in 1..=6 {
                let lines = search_lines(&board, depth);
                let scores: Vec<(usize, i32)> = lines.iter().map(|l| (l.pit, l.score)).collect();
                assert_eq!(
                    scores,
                    search_scores(&board, depth).scores,
                    "depth {depth} on {board:?}"
                );

                for l in &lines {
                    assert_eq!(l.line[0], l.pit);
                    let end = replay(&board, &l.line);
                    let len = l.line.len() as u32;
                    assert!(len <= depth, "line {:?} longer than {depth}", l.line);
                    if len < depth {
                        assert_ne!(
                            end.status(),
                            Status::InProgress,
                            "a short line must end the game: {:?}",
                            l.line
                        );
                    }
                    assert_eq!(
                        evaluate(&end, board.to_move()),
                        l.score,
                        "line {:?} at depth {depth} on {board:?}",
                        l.line
                    );
                }
            }
            checked += 1;
        }
    }

    // Scenario: Lines for a winning and a losing move
    #[test]
    fn lines_for_a_winning_and_a_losing_move() {
        // Pit 4 (shown as 5) captures North's last 5 seeds and wins at once;
        // pit 0 (shown as 1) loses with best play (see choose.rs).
        let board = Board::from_parts(
            [1, 0, 0, 0, 1, 0],
            18,
            [5, 0, 0, 0, 0, 0],
            23,
            Player::South,
        );
        let lines = search_lines(&board, 12);
        let line_for = |pit| &lines.iter().find(|l| l.pit == pit).unwrap().line;

        let win = line_for(4);
        assert_eq!(win, &vec![4]);
        assert_eq!(
            replay(&board, win).status(),
            Status::Finished {
                winner: Some(Player::South)
            }
        );

        let lose = line_for(0);
        assert!(lose.len() > 1, "North replies: {lose:?}");
        assert_eq!(
            replay(&board, lose).status(),
            Status::Finished {
                winner: Some(Player::North)
            }
        );
    }
}
