//! Invariant ("property-style") tests: play thousands of random games and check
//! rules that must hold after every single move.

use mancala_core::{Board, Player, Rng, Status};

const GAMES: u32 = 2_000;
/// A real game never gets close to this. If one does, something is looping.
const MAX_MOVES: u32 = 1_000;

/// Every seed on the board: all pits and both stores.
fn total_seeds(board: &Board) -> u32 {
    let mut total = 0;
    for player in [Player::South, Player::North] {
        total += board
            .pits(player)
            .iter()
            .map(|&s| u32::from(s))
            .sum::<u32>();
        total += u32::from(board.store(player));
    }
    total
}

// Scenario: Conservation over random games
#[test]
fn conservation_over_random_games() {
    let mut rng = Rng::new(0x5EED);

    for game in 0..GAMES {
        let mut board = Board::new();
        let mut moves = 0;

        while board.status() == Status::InProgress {
            assert!(
                moves < MAX_MOVES,
                "game {game}: no finish after {MAX_MOVES} moves"
            );

            let legal = board.legal_moves();
            assert!(
                !legal.is_empty(),
                "game {game} move {moves}: in progress but no legal moves"
            );
            let pit = legal[rng.below(legal.len())];

            let before = board;
            let (next, _) = board
                .play(pit)
                .unwrap_or_else(|e| panic!("game {game} move {moves}: pit {pit} rejected: {e:?}"));

            assert_eq!(
                board, before,
                "game {game} move {moves}: play changed the original"
            );
            assert_eq!(
                total_seeds(&next),
                48,
                "game {game} move {moves}: seeds not conserved"
            );

            board = next;
            moves += 1;
        }

        assert!(matches!(board.status(), Status::Finished { .. }));
        assert_eq!(
            board.pits(Player::South),
            [0; 6],
            "game {game}: South pits not empty"
        );
        assert_eq!(
            board.pits(Player::North),
            [0; 6],
            "game {game}: North pits not empty"
        );
        assert_eq!(
            board.store(Player::South) + board.store(Player::North),
            48,
            "game {game}: stores don't hold all 48 seeds"
        );
    }
}
