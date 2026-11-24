//! Errors print as plain English and work with `?` (add-online-play task 1.1).

use mancala_core::{Board, MoveError};
use std::error::Error;

#[test]
fn move_errors_print_plain_reasons() {
    assert_eq!(
        MoveError::PitOutOfRange.to_string(),
        "pits are numbered 0 to 5"
    );
    assert_eq!(MoveError::EmptyPit.to_string(), "that pit is empty");
    assert_eq!(MoveError::GameOver.to_string(), "the game is already over");
}

/// `?` turns a `MoveError` into a `Box<dyn Error>`, because `MoveError`
/// implements `std::error::Error`.
fn play_twice(first: usize, second: usize) -> Result<Board, Box<dyn Error>> {
    let (board, _) = Board::new().play(first)?;
    let (board, _) = board.play(second)?;
    Ok(board)
}

#[test]
fn a_move_error_works_with_question_mark() {
    assert!(play_twice(2, 1).is_ok());
    // South's pit 2 ends in South's store, so South moves again; pit 2 is now empty.
    let error = play_twice(2, 2).unwrap_err();
    assert_eq!(error.to_string(), "that pit is empty");
}
