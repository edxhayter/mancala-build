//! Rule tests, one per scenario in openspec/.../specs/kalah-rules/spec.md.
//! These can only use the crate's public API, like any outside user.

use mancala_core::{Board, MoveError, MoveOutcome, Player};

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

/// Plays a move that the test expects to be legal, and returns the result.
fn play_ok(board: &Board, pit: usize) -> (Board, MoveOutcome) {
    board
        .play(pit)
        .unwrap_or_else(|e| panic!("pit {pit} should be legal, got {e:?}"))
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

// Scenario: Empty pit (the spec's version: South plays pit 2, then pit 2 again)
#[test]
fn empty_pit_after_extra_turn() {
    let (board, _) = play_ok(&Board::new(), 2); // extra turn, so South moves again
    let before = board;
    assert_eq!(board.play(2), Err(MoveError::EmptyPit));
    assert_eq!(board, before, "a rejected move must not change the board");
}

// ---------- Sowing (section 5) ----------

// Scenario: Simple sow from the start
#[test]
fn simple_sow_from_the_start() {
    let (board, _) = play_ok(&Board::new(), 0);
    assert_position(&board, [0, 5, 5, 5, 5, 4], 0, [4; 6], 0);
    assert_eq!(board.to_move(), Player::North);
}

// Scenario: Sowing crosses onto the opponent's side
#[test]
fn sowing_crosses_onto_the_opponents_side() {
    let (board, _) = play_ok(&Board::new(), 5);
    assert_position(&board, [4, 4, 4, 4, 4, 0], 1, [5, 5, 5, 4, 4, 4], 0);
    assert_eq!(board.to_move(), Player::North);
}

// Scenario: Opponent's store is skipped
#[test]
fn opponents_store_is_skipped() {
    let start = Board::from_parts([0, 0, 1, 0, 0, 10], 0, [0; 6], 0, Player::South);
    let (board, _) = play_ok(&start, 5);
    // North's store stays 0 even though sowing passed it.
    assert_position(&board, [1, 1, 2, 0, 0, 0], 1, [1; 6], 0);
}

// Scenario: North chooses a pit by its own numbering
#[test]
fn north_chooses_a_pit_by_its_own_numbering() {
    let (after_south, _) = play_ok(&Board::new(), 0); // now North to move
    let (board, _) = play_ok(&after_south, 2);
    assert_eq!(board.pits(Player::North)[2], 0, "North's pit 2 was emptied");
    assert_eq!(
        board.pits(Player::South),
        after_south.pits(Player::South),
        "South's side was not touched"
    );
}

// ---------- Extra turn (section 5) ----------

// Scenario: South earns an extra turn
#[test]
fn south_earns_an_extra_turn() {
    let (board, outcome) = play_ok(&Board::new(), 2);
    assert_position(&board, [4, 4, 0, 5, 5, 5], 1, [4; 6], 0);
    assert_eq!(board.to_move(), Player::South);
    assert!(outcome.extra_turn);
}

// Scenario: North earns an extra turn
#[test]
fn north_earns_an_extra_turn() {
    let (after_south, _) = play_ok(&Board::new(), 0);
    let (board, outcome) = play_ok(&after_south, 2);
    assert_eq!(board.pits(Player::North), [4, 4, 0, 5, 5, 5]);
    assert_eq!(board.store(Player::North), 1);
    assert_eq!(board.to_move(), Player::North);
    assert!(outcome.extra_turn);
}

// Scenario: No extra turn otherwise
#[test]
fn no_extra_turn_otherwise() {
    let (_, outcome) = play_ok(&Board::new(), 0);
    assert!(!outcome.extra_turn);
}

// ---------- Captures (section 6) ----------

// Scenario: South captures
#[test]
fn south_captures() {
    let start = Board::from_parts([1, 0, 0, 2, 0, 0], 0, [1, 1, 1, 1, 5, 1], 0, Player::South);
    let (board, outcome) = play_ok(&start, 0);
    assert_position(&board, [0, 0, 0, 2, 0, 0], 6, [1, 1, 1, 1, 0, 1], 0);
    assert_eq!(outcome.captured, 6);
    assert_eq!(board.to_move(), Player::North);
}

// Scenario: North captures
#[test]
fn north_captures() {
    let start = Board::from_parts([1, 1, 1, 1, 5, 1], 0, [1, 0, 0, 2, 0, 0], 0, Player::North);
    let (board, outcome) = play_ok(&start, 0);
    assert_position(&board, [1, 1, 1, 1, 0, 1], 0, [0, 0, 0, 2, 0, 0], 6);
    assert_eq!(outcome.captured, 6);
}

// Scenario: No capture when the opposite pit is empty
#[test]
fn no_capture_when_the_opposite_pit_is_empty() {
    let start = Board::from_parts([1, 0, 0, 2, 0, 0], 0, [1, 1, 1, 1, 0, 1], 0, Player::South);
    let (board, outcome) = play_ok(&start, 0);
    assert_position(&board, [0, 1, 0, 2, 0, 0], 0, [1, 1, 1, 1, 0, 1], 0);
    assert_eq!(outcome.captured, 0);
}

// Scenario: No capture on the opponent's side
#[test]
fn no_capture_on_the_opponents_side() {
    let start = Board::from_parts([0, 0, 1, 0, 0, 3], 0, [2, 0, 2, 2, 2, 2], 0, Player::South);
    let (board, outcome) = play_ok(&start, 5);
    assert_position(&board, [0, 0, 1, 0, 0, 0], 1, [3, 1, 2, 2, 2, 2], 0);
    assert_eq!(outcome.captured, 0);
}

// Scenario: No capture when landing in a non-empty own pit
#[test]
fn no_capture_when_landing_in_a_non_empty_own_pit() {
    let (_, outcome) = play_ok(&Board::new(), 0);
    assert_eq!(outcome.captured, 0);
}

// Scenario: A lap of 13 seeds returns to the starting pit
#[test]
fn a_lap_of_13_seeds_returns_to_the_starting_pit() {
    let start = Board::from_parts([13, 0, 0, 0, 0, 0], 0, [1; 6], 0, Player::South);
    let (board, outcome) = play_ok(&start, 0);
    assert_position(&board, [0, 1, 1, 1, 1, 1], 4, [2, 2, 2, 2, 2, 0], 0);
    assert_eq!(outcome.captured, 3);
    assert_eq!(board.to_move(), Player::North);
}
