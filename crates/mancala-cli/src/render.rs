//! Drawing the board as text.

use std::fmt;

use mancala_core::{Board, Player, Status};

/// Spaces before each pit row, so the pits line up between the two stores.
const INDENT: &str = "     ";
/// Spaces between the two stores on the middle line.
const STORE_GAP: &str = "                               ";

/// A [`Board`] drawn from one player's side, ready to print:
/// `println!("{}", BoardView { board: &board, viewer: Player::South })`.
///
/// The viewer's pits run along the bottom, numbered 1-6 from left to right
/// towards the viewer's store on the right. The opponent's pits run along the
/// top, numbered 6-1, so each sits above the pit opposite it.
///
/// This is a separate type (rather than `impl Display for Board`) because of
/// Rust's orphan rule: this crate owns neither `Display` nor `Board`.
pub struct BoardView<'a> {
    /// The position to draw.
    pub board: &'a Board,
    /// Whose side is at the bottom.
    pub viewer: Player,
}

impl fmt::Display for BoardView<'_> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let board = self.board;
        let me = self.viewer;
        let them = me.opponent();

        // Top: the opponent's pits, 6 -> 1, each above the pit opposite it.
        writeln!(
            f,
            "{INDENT}{}        {}",
            labels([6, 5, 4, 3, 2, 1]),
            player_name(them)
        )?;
        writeln!(f, "{INDENT}{}", pit_row(board.pits(them).iter().rev()))?;
        // Middle: the opponent's store on the left, the viewer's on the right.
        writeln!(
            f,
            "{}{STORE_GAP}{}",
            cell(board.store(them)),
            cell(board.store(me))
        )?;
        // Bottom: the viewer's pits, 1 -> 6, heading towards their store.
        writeln!(f, "{INDENT}{}", pit_row(board.pits(me).iter()))?;
        writeln!(
            f,
            "{INDENT}{}        {}",
            labels([1, 2, 3, 4, 5, 6]),
            player_name(me)
        )?;

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

    /// Renders `board` as seen by `viewer`.
    fn show(board: &Board, viewer: Player) -> String {
        BoardView { board, viewer }.to_string()
    }

    /// Line `n` (0-based) of `text`.
    fn line(text: &str, n: usize) -> &str {
        text.lines()
            .nth(n)
            .unwrap_or_else(|| panic!("no line {n} in:\n{text}"))
    }

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
        assert_eq!(show(&Board::new(), Player::South), expected);
    }

    // Scenario: Position after a move
    #[test]
    fn position_after_a_move() {
        let (board, _) = Board::new().play(0).unwrap(); // South plays pit 1
        let text = show(&board, Player::South);
        assert_eq!(
            line(&text, 1),
            "     [ 4] [ 4] [ 4] [ 4] [ 4] [ 4]",
            "North on top"
        );
        assert_eq!(
            line(&text, 2),
            "[ 0]                               [ 0]",
            "stores"
        );
        assert_eq!(
            line(&text, 3),
            "     [ 0] [ 5] [ 5] [ 5] [ 5] [ 4]",
            "South at the bottom"
        );
        assert_eq!(line(&text, 5), "North to move");
    }

    // Scenario: Playing North puts North at the bottom
    #[test]
    fn playing_north_puts_north_at_the_bottom() {
        // Distinct numbers so we can see which pit and store ends up where.
        let board = Board::from_parts(
            [1, 2, 3, 4, 5, 6],
            10,
            [7, 8, 9, 0, 1, 2],
            20,
            Player::North,
        );
        let text = show(&board, Player::North);
        let expected = [
            "       6    5    4    3    2    1        South",
            "     [ 6] [ 5] [ 4] [ 3] [ 2] [ 1]",
            "[10]                               [20]",
            "     [ 7] [ 8] [ 9] [ 0] [ 1] [ 2]",
            "       1    2    3    4    5    6        North",
            "North to move",
        ]
        .join("\n");
        assert_eq!(text, expected);
    }

    // Scenario: Hotseat view follows the player to move
    #[test]
    fn hotseat_view_follows_the_player_to_move() {
        let (board, _) = Board::new().play(0).unwrap(); // South plays pit 1; North to move
        let text = show(&board, board.to_move());
        assert_eq!(
            line(&text, 1),
            "     [ 4] [ 5] [ 5] [ 5] [ 5] [ 0]",
            "South on top, pit 6 to 1"
        );
        assert_eq!(
            line(&text, 3),
            "     [ 4] [ 4] [ 4] [ 4] [ 4] [ 4]",
            "North at the bottom"
        );
        assert!(line(&text, 4).ends_with("North"));
    }

    #[test]
    fn top_row_runs_from_pit_6_to_pit_1() {
        // North's pit 1 (engine pit 0) holds 9, so from South's view it's at the right-hand end.
        let board = Board::from_parts([0; 6], 0, [9, 0, 0, 0, 0, 0], 0, Player::North);
        let text = show(&board, Player::South);
        assert_eq!(line(&text, 1), "     [ 0] [ 0] [ 0] [ 0] [ 0] [ 9]");
    }

    #[test]
    fn two_digit_stores_stay_aligned() {
        let board = Board::from_parts([0; 6], 48, [0; 6], 0, Player::South);
        let text = show(&board, Player::South);
        assert_eq!(line(&text, 2), "[ 0]                               [48]");
        assert_eq!(text.lines().last(), Some("Game over"));
    }
}
