//! Replaying a whole game from its list of moves (kalah-rules: Replaying a game).

use mancala_core::{Board, MoveError, ReplayError, Rng, Status};

/// Plays `moves` one at a time from a new game, panicking on an illegal move.
fn play_each(moves: &[usize]) -> Board {
    moves.iter().fold(Board::new(), |board, &pit| {
        board.play(pit).expect("a legal move").0
    })
}

// Scenario: A legal game
#[test]
fn a_legal_game() {
    let replayed = Board::replay(&[2, 5, 0]).expect("all three moves are legal");
    assert_eq!(replayed, play_each(&[2, 5, 0]));
}

// Scenario: No moves
#[test]
fn no_moves() {
    assert_eq!(Board::replay(&[]), Ok(Board::new()));
}

// Scenario: An illegal move in the list
#[test]
fn an_illegal_move_in_the_list() {
    // South plays 0 (no extra turn), North plays 0, then South's pit 0 is empty.
    let error = Board::replay(&[0, 0, 0]).unwrap_err();
    assert_eq!(
        error,
        ReplayError {
            index: 2,
            error: MoveError::EmptyPit
        }
    );
}

#[test]
fn a_pit_out_of_range_is_reported_too() {
    let error = Board::replay(&[2, 9]).unwrap_err();
    assert_eq!(error.index, 1);
    assert_eq!(error.error, MoveError::PitOutOfRange);
}

/// The moves of one seeded random game, played to the end.
fn random_game(rng: &mut Rng) -> Vec<usize> {
    let mut board = Board::new();
    let mut moves = Vec::new();
    while board.status() == Status::InProgress {
        let legal = board.legal_moves();
        let pit = legal[rng.below(legal.len())];
        moves.push(pit);
        board = board.play(pit).unwrap().0;
    }
    moves
}

// Scenario: A move after the end
#[test]
fn a_move_after_the_end() {
    let mut moves = random_game(&mut Rng::new(7));
    let end = moves.len();
    moves.push(0);
    let error = Board::replay(&moves).unwrap_err();
    assert_eq!(
        error,
        ReplayError {
            index: end,
            error: MoveError::GameOver
        }
    );
}

/// Property: for many random games, replaying every prefix gives the same
/// board as playing the moves one by one.
#[test]
fn replay_matches_playing_one_by_one() {
    let mut rng = Rng::new(0xC0FFEE);
    for _ in 0..200 {
        let moves = random_game(&mut rng);
        for len in [0, 1, moves.len() / 2, moves.len()] {
            let prefix = &moves[..len];
            assert_eq!(Board::replay(prefix), Ok(play_each(prefix)));
        }
    }
}

#[test]
fn replay_errors_say_which_move_and_why() {
    let error = ReplayError {
        index: 2,
        error: MoveError::EmptyPit,
    };
    assert_eq!(error.to_string(), "move 3 (place 2): that pit is empty");
}
