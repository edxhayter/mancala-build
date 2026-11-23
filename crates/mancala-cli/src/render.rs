//! Drawing the board as text.

use std::fmt;

use mancala_core::{Board, Player, Status};

/// Spaces before each pit row, so the pits line up between the two stores.
const INDENT: &str = "     ";
/// Spaces between the two stores on the middle line.
const STORE_GAP: &str = "                               ";

/// A [`Board`] that can be printed for the terminal, e.g. `println!("{}", BoardView(&board))`.
///
/// It wraps `&Board` because of Rust's orphan rule: this crate owns neither
/// `Display` nor `Board`, so it can't write `impl Display for Board` directly.
pub struct BoardView<'a>(pub &'a Board);

impl fmt::Display for BoardView<'_> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let board = self.0;
        let north = board.pits(Player::North);
        let south = board.pits(Player::South);

        // North's row runs pit 6 -> 1, so each North pit sits directly above
        // the South pit opposite it.
        writeln!(f, "{INDENT}{}        North", labels([6, 5, 4, 3, 2, 1]))?;
        writeln!(f, "{INDENT}{}", pit_row(north.iter().rev()))?;
        writeln!(
            f,
            "{}{STORE_GAP}{}",
            cell(board.store(Player::North)),
            cell(board.store(Player::South))
        )?;
        writeln!(f, "{INDENT}{}", pit_row(south.iter()))?;
        writeln!(f, "{INDENT}{}        South", labels([1, 2, 3, 4, 5, 6]))?;

        match board.status() {
            Status::InProgress => write!(f, "{} to move", player_name(board.to_move())),
            Status::Finished { .. } => write!(f, "Game over"),
        }
    }
}

/// The name shown to players.
pub fn player_name(player: Player) -> &'static str {
    match player {
        Player::South => "South",
        Player::North => "North",
    }
}

/// One pit or store, e.g. `[ 4]` or `[48]`.
fn cell(seeds: u8) -> String {
    format!("[{seeds:>2}]")
}

/// Six cells separated by single spaces.
fn pit_row<'a>(seeds: impl Iterator<Item = &'a u8>) -> String {
    seeds.map(|&s| cell(s)).collect::<Vec<_>>().join(" ")
}

/// Pit numbers, each centred under its cell.
fn labels(numbers: [usize; 6]) -> String {
    numbers.map(|n| format!("{n:>3}")).join("  ")
}

#[cfg(test)]
mod tests {
    use super::*;
    use mancala_core::Board;

    // Scenario: Starting position
    #[test]
    fn starting_position() {
        // Built from lines: a `\` line continuation would strip the first line's indent.
        let expected = [
            "       6    5    4    3    2    1        North",
            "     [ 4] [ 4] [ 4] [ 4] [ 4] [ 4]",
            "[ 0]                               [ 0]",
            "     [ 4] [ 4] [ 4] [ 4] [ 4] [ 4]",
            "       1    2    3    4    5    6        South",
            "South to move",
        ]
        .join("\n");
        assert_eq!(BoardView(&Board::new()).to_string(), expected);
    }

    // Scenario: Position after a move
    #[test]
    fn position_after_a_move() {
        let (board, _) = Board::new().play(0).unwrap(); // South plays pit 1
        let text = BoardView(&board).to_string();
        let lines: Vec<&str> = text.lines().collect();
        assert_eq!(
            lines[1], "     [ 4] [ 4] [ 4] [ 4] [ 4] [ 4]",
            "North's pits"
        );
        assert_eq!(
            lines[2], "[ 0]                               [ 0]",
            "stores"
        );
        assert_eq!(
            lines[3], "     [ 0] [ 5] [ 5] [ 5] [ 5] [ 4]",
            "South's pits"
        );
        assert_eq!(lines[5], "North to move");
    }

    #[test]
    fn north_row_runs_from_pit_6_to_pit_1() {
        // North's pit 1 (engine pit 0) holds 9, so it must appear at the right-hand end.
        let board = Board::from_parts(
            [0; 6],
            0,
            [9, 0, 0, 0, 0, 0],
            0,
            mancala_core::Player::North,
        );
        let text = BoardView(&board).to_string();
        assert_eq!(
            text.lines().nth(1),
            Some("     [ 0] [ 0] [ 0] [ 0] [ 0] [ 9]")
        );
    }

    #[test]
    fn two_digit_stores_stay_aligned() {
        let board = Board::from_parts([0; 6], 48, [0; 6], 0, mancala_core::Player::South);
        let text = BoardView(&board).to_string();
        let stores = text.lines().nth(2).unwrap();
        assert_eq!(stores, "[ 0]                               [48]");
        assert_eq!(text.lines().last(), Some("Game over"));
    }
}
