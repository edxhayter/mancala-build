//! The game loop and the messages players see.

use std::io::{self, BufRead, Write};

use mancala_core::{Board, MoveError, MoveOutcome, Player, Status};

use crate::input::{Command, InputError, parse_input};
use crate::render::{BoardView, player_name};

// ---------- Setting up a game ----------

/// Who chooses the moves for one side.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Controller {
    /// A person typing at the keyboard.
    Human,
}

/// The controller for each side.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct Players {
    pub south: Controller,
    pub north: Controller,
}

impl Players {
    /// Two people sharing one keyboard.
    pub fn hotseat() -> Self {
        Players {
            south: Controller::Human,
            north: Controller::Human,
        }
    }

    /// The controller for `player`'s side.
    pub fn controller(&self, player: Player) -> Controller {
        match player {
            Player::South => self.south,
            Player::North => self.north,
        }
    }
}

/// Everything needed to start a game.
pub struct GameConfig {
    pub players: Players,
    /// Seed for the bot's random choices.
    pub seed: u64,
    /// The starting position: `Board::new()` from the command line, anything in tests.
    pub start: Board,
}

/// How a game ended.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum GameEnd {
    /// Played to the end. Holds the final status (winner or draw).
    Finished(Status),
    /// A player quit, or the input ran out.
    Abandoned,
}

// ---------- The loop ----------

/// Plays one game, reading moves from `input` and writing everything to `output`.
///
/// `main` passes the real keyboard and screen; tests pass a byte string and a `Vec<u8>`.
pub fn run<R: BufRead, W: Write>(
    config: GameConfig,
    mut input: R,
    mut output: W,
) -> io::Result<GameEnd> {
    let mut board = config.start;

    loop {
        let viewer = viewer(&board);
        writeln!(output)?;
        writeln!(
            output,
            "{}",
            BoardView {
                board: &board,
                viewer
            }
        )?;

        if let Status::Finished { .. } = board.status() {
            writeln!(output, "{}", describe_result(&board))?;
            return Ok(GameEnd::Finished(board.status()));
        }

        let mover = board.to_move();
        let turn = match config.players.controller(mover) {
            Controller::Human => human_turn(&board, &mut input, &mut output)?,
        };

        match turn {
            Turn::Played(next, outcome) => {
                board = next;
                if let Some(message) = describe_outcome(mover, outcome) {
                    writeln!(output, "{message}")?;
                }
            }
            Turn::Quit => {
                writeln!(output, "Game abandoned.")?;
                return Ok(GameEnd::Abandoned);
            }
        }
    }
}

/// The result of asking a player for a move.
enum Turn {
    /// A legal move was played: the new position and what happened.
    Played(Board, MoveOutcome),
    /// The player quit (or the input ran out).
    Quit,
}

/// Whose side the board is drawn from. Hotseat: the player to move sees their
/// own side at the bottom, and South once the game is over.
fn viewer(board: &Board) -> Player {
    match board.status() {
        Status::InProgress => board.to_move(),
        Status::Finished { .. } => Player::South,
    }
}

/// Asks the person to move until they enter a legal move or quit.
fn human_turn<R: BufRead, W: Write>(
    board: &Board,
    input: &mut R,
    output: &mut W,
) -> io::Result<Turn> {
    let name = player_name(board.to_move());
    let mut line = String::new();

    loop {
        write!(output, "{name}, choose a pit (1-6, or q to quit): ")?;
        output.flush()?; // without this the prompt might not appear before we wait

        line.clear(); // read_line appends, so empty the buffer first
        if input.read_line(&mut line)? == 0 {
            writeln!(output)?; // end of input (e.g. Ctrl-D): finish the prompt line
            return Ok(Turn::Quit);
        }

        match parse_input(&line) {
            Ok(Command::Quit) => return Ok(Turn::Quit),
            Ok(Command::Move(pit)) => match board.play(pit) {
                Ok((next, outcome)) => return Ok(Turn::Played(next, outcome)),
                Err(error) => writeln!(output, "{}", move_error_message(error))?,
            },
            Err(error) => writeln!(output, "{}", input_error_message(error))?,
        }
    }
}

// ---------- Messages ----------
// All player-facing text is built here, so the loop and the tests share the same wording.

/// Why a line of input wasn't a move.
pub fn input_error_message(error: InputError) -> &'static str {
    match error {
        InputError::NotANumber => {
            "That's not a pit number. Type a number from 1 to 6, or q to quit."
        }
        InputError::OutOfRange => "Pits are numbered 1 to 6.",
    }
}

/// Why the engine rejected a move.
pub fn move_error_message(error: MoveError) -> &'static str {
    match error {
        MoveError::EmptyPit => "That pit is empty. Choose a pit with seeds in it.",
        MoveError::PitOutOfRange => "Pits are numbered 1 to 6.",
        MoveError::GameOver => "The game is already over.",
    }
}

/// What happened on a move worth mentioning, if anything.
pub fn describe_outcome(player: Player, outcome: MoveOutcome) -> Option<String> {
    let name = player_name(player);
    let mut parts = Vec::new();
    if outcome.captured > 0 {
        parts.push(format!("{name} captured {} seeds.", outcome.captured));
    }
    if outcome.extra_turn {
        parts.push(format!("{name} gets another turn."));
    }
    if parts.is_empty() {
        None
    } else {
        Some(parts.join(" "))
    }
}

/// The scores and the result, for a finished game.
pub fn describe_result(board: &Board) -> String {
    let south = board.store(Player::South);
    let north = board.store(Player::North);
    let result = match board.status() {
        Status::InProgress => "The game is still in progress.".to_string(),
        Status::Finished {
            winner: Some(player),
        } => format!("{} wins!", player_name(player)),
        Status::Finished { winner: None } => "It's a draw.".to_string(),
    };
    format!("Final score: South {south}, North {north}. {result}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn input_errors_explain_the_problem() {
        assert!(input_error_message(InputError::NotANumber).contains("1 to 6"));
        assert!(input_error_message(InputError::OutOfRange).contains("1 to 6"));
    }

    #[test]
    fn empty_pit_message() {
        assert!(move_error_message(MoveError::EmptyPit).contains("empty"));
    }

    #[test]
    fn quiet_move_has_nothing_to_report() {
        let outcome = MoveOutcome {
            extra_turn: false,
            captured: 0,
        };
        assert_eq!(describe_outcome(Player::South, outcome), None);
    }

    #[test]
    fn extra_turn_is_described() {
        let outcome = MoveOutcome {
            extra_turn: true,
            captured: 0,
        };
        assert_eq!(
            describe_outcome(Player::North, outcome).as_deref(),
            Some("North gets another turn.")
        );
    }

    #[test]
    fn capture_is_described() {
        let outcome = MoveOutcome {
            extra_turn: false,
            captured: 6,
        };
        assert_eq!(
            describe_outcome(Player::South, outcome).as_deref(),
            Some("South captured 6 seeds.")
        );
    }

    #[test]
    fn results() {
        let finished =
            |south, north| Board::from_parts([0; 6], south, [0; 6], north, Player::South);
        assert_eq!(
            describe_result(&finished(26, 22)),
            "Final score: South 26, North 22. South wins!"
        );
        assert_eq!(
            describe_result(&finished(11, 37)),
            "Final score: South 11, North 37. North wins!"
        );
        assert_eq!(
            describe_result(&finished(24, 24)),
            "Final score: South 24, North 24. It's a draw."
        );
    }
}
