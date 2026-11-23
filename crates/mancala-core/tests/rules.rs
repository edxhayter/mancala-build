//! Rule tests, one per scenario in openspec/.../specs/kalah-rules/spec.md.
//! These can only use the crate's public API, like any outside user.

use mancala_core::{Board, MoveError, Player};

/// Checks every pit and store on the board in one call.
fn assert_position(
    board: &Board,
    south: [u8; 6],
    south_store: u8,
    north: [u8; 6],
    north_store: u8,
) {
    assert_eq!(board.pits(Player::South), south, "South pits");
    assert_eq!(board.store(Player::South), south_store, "South store");
    assert_eq!(board.pits(Player::North), north, "North pits");
    assert_eq!(board.store(Player::North), north_store, "North store");
}

// Scenario: New game
#[test]
fn new_game() {
    let board = Board::new();
    assert_position(&board, [4; 6], 0, [4; 6], 0);
    assert_eq!(board.to_move(), Player::South);
    // "AND the game status is in progress" is checked once status() exists (task 7.2).
}

// Scenario: Reading a position
#[test]
fn reading_a_position() {
    let board = Board::new();
    assert_eq!(board.pits(Player::North), [4, 4, 4, 4, 4, 4]);
    assert_eq!(board.store(Player::North), 0);
    assert_eq!(board.to_move(), Player::South);
}

// Scenario: Legal moves at the start
#[test]
fn legal_moves_at_the_start() {
    assert_eq!(Board::new().legal_moves(), vec![0, 1, 2, 3, 4, 5]);
}

/// The position from the *Empty pits are not legal* scenario.
fn empty_pits_position() -> Board {
    Board::from_parts([0, 3, 0, 1, 0, 0], 0, [1, 1, 1, 1, 1, 1], 0, Player::South)
}

// Task 3.3: from_parts builds exactly what it's given
#[test]
fn from_parts_reads_back() {
    let board = empty_pits_position();
    assert_position(&board, [0, 3, 0, 1, 0, 0], 0, [1, 1, 1, 1, 1, 1], 0);
    assert_eq!(board.to_move(), Player::South);
}

// Scenario: Empty pits are not legal
#[test]
fn empty_pits_are_not_legal() {
    assert_eq!(empty_pits_position().legal_moves(), vec![1, 3]);
}

// Scenario: Pit number out of range
#[test]
fn pit_number_out_of_range() {
    let board = Board::new();
    assert_eq!(board.play(6), Err(MoveError::PitOutOfRange));
    assert_eq!(board.play(99), Err(MoveError::PitOutOfRange));
    assert_eq!(
        board,
        Board::new(),
        "a rejected move must not change the board"
    );
}

// Task 4.1: an empty pit is rejected (built with from_parts).
// The spec's own *Empty pit* scenario needs sowing, so it's added in section 5.
#[test]
fn empty_pit_is_rejected() {
    let board = empty_pits_position(); // South pit 0 is empty
    let before = board;
    assert_eq!(board.play(0), Err(MoveError::EmptyPit));
    assert_eq!(board, before, "a rejected move must not change the board");
}
