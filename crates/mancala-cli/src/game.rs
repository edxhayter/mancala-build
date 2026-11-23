//! The game loop and the messages players see.

use std::io::{self, BufRead, Write};

use mancala_core::{Board, MoveError, MoveOutcome, Player, Rng, Status};

use crate::input::{Command, InputError, parse_input};
use crate::render::{BoardView, player_name};

// ---------- Setting up a game ----------

/// Who chooses the moves for one side.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Controller {
    /// A person typing at the keyboard.
    Human,
    /// The computer, picking a random legal move. A stand-in until the real AI (change 3).
    RandomBot,
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

    /// A person playing `human`'s side against the random bot.
    pub fn against_bot(human: Player) -> Self {
        match human {
            Player::South => Players {
                south: Controller::Human,
                north: Controller::RandomBot,
            },
            Player::North => Players {
                south: Controller::RandomBot,
                north: Controller::Human,
            },
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
    let mut rng = Rng::new(config.seed);
    let mut turn_log = TurnLog::start(&board);

    loop {
        let finished = matches!(board.status(), Status::Finished { .. });

        // A turn is over when the player to move changes or the game ends.
        if finished || board.to_move() != turn_log.player {
            let last = config.players.controller(turn_log.player);
            let next_is_human = config.players.controller(board.to_move()) == Controller::Human;
            let show = if finished {
                last == Controller::RandomBot // the bot ended the game
            } else {
                next_is_human // a person is about to move after someone else's turn
            };
            if show && !turn_log.moves.is_empty() {
                writeln!(output)?;
                writeln!(output, "{}", turn_log.recap(&board))?;
            }
            turn_log = TurnLog::start(&board);
        }

        let viewer = viewer(&config.players, &board);
        writeln!(output)?;
        writeln!(
            output,
            "{}",
            BoardView {
                board: &board,
                viewer
            }
        )?;

        if finished {
            writeln!(output, "{}", describe_result(&board))?;
            return Ok(GameEnd::Finished(board.status()));
        }

        let mover = board.to_move();
        let turn = match config.players.controller(mover) {
            Controller::Human => human_turn(&board, &mut input, &mut output)?,
            Controller::RandomBot => bot_turn(&board, &mut rng, &mut output)?,
        };

        match turn {
            Turn::Played(pit, next, outcome) => {
                let seeds = board.pits(mover)[pit];
                turn_log
                    .moves
                    .push(describe_move(mover, pit, seeds, outcome));
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
    /// A legal move was played: the pit (0-5), the new position and what happened.
    Played(usize, Board, MoveOutcome),
    /// The player quit (or the input ran out).
    Quit,
}

/// Everything one player did in their current turn (several moves, with extra turns).
/// See design.md decision 10.
struct TurnLog {
    player: Player,
    store_before: u8,
    /// One line per move, from `describe_move`.
    moves: Vec<String>,
}

impl TurnLog {
    /// A fresh log for the player about to move.
    fn start(board: &Board) -> Self {
        TurnLog {
            player: board.to_move(),
            store_before: board.store(board.to_move()),
            moves: Vec::new(),
        }
    }

    /// The recap printed for the other player, e.g.
    ///
    /// ```text
    /// --- North's turn ---
    /// North played pit 4 (5 seeds): extra turn.
    /// North played pit 2 (5 seeds): captured 6.
    /// North's store: 0 -> 7
    /// ```
    fn recap(&self, board: &Board) -> String {
        let name = player_name(self.player);
        let store_after = board.store(self.player);
        format!(
            "--- {name}'s turn ---\n{}\n{name}'s store: {} -> {store_after}",
            self.moves.join("\n"),
            self.store_before
        )
    }
}

/// Whose side the board is drawn from (design.md decision 5).
fn viewer(players: &Players, board: &Board) -> Player {
    match (players.south, players.north) {
        // Hotseat: the player to move sees their own side; South once it's over.
        (Controller::Human, Controller::Human) => match board.status() {
            Status::InProgress => board.to_move(),
            Status::Finished { .. } => Player::South,
        },
        // Against the bot: always the human's side.
        (Controller::Human, _) => Player::South,
        (_, Controller::Human) => Player::North,
        // Bot against bot (only used in tests).
        _ => Player::South,
    }
}

/// The bot picks a random legal move and says which pit it chose.
fn bot_turn<W: Write>(board: &Board, rng: &mut Rng, output: &mut W) -> io::Result<Turn> {
    let legal = board.legal_moves();
    let pit = legal[rng.below(legal.len())];
    writeln!(
        output,
        "{} (bot) plays pit {}.",
        player_name(board.to_move()),
        pit + 1 // engine 0-5 back to the players' 1-6
    )?;
    let (next, outcome) = board
        .play(pit)
        .expect("a move from legal_moves() is always legal");
    Ok(Turn::Played(pit, next, outcome))
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
                Ok((next, outcome)) => return Ok(Turn::Played(pit, next, outcome)),
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

/// One line of a turn recap. `pit` is the engine's 0-5; `seeds` is how many it held.
pub fn describe_move(player: Player, pit: usize, seeds: u8, outcome: MoveOutcome) -> String {
    let name = player_name(player);
    let plural = if seeds == 1 { "seed" } else { "seeds" };
    let what = if outcome.captured > 0 {
        format!(": captured {}.", outcome.captured)
    } else if outcome.extra_turn {
        ": extra turn.".to_string()
    } else {
        ".".to_string()
    };
    format!("{name} played pit {} ({seeds} {plural}){what}", pit + 1)
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
    fn move_lines_for_the_recap() {
        let quiet = MoveOutcome {
            extra_turn: false,
            captured: 0,
        };
        let extra = MoveOutcome {
            extra_turn: true,
            captured: 0,
        };
        let capture = MoveOutcome {
            extra_turn: false,
            captured: 6,
        };
        assert_eq!(
            describe_move(Player::South, 0, 4, quiet),
            "South played pit 1 (4 seeds)."
        );
        assert_eq!(
            describe_move(Player::North, 3, 5, extra),
            "North played pit 4 (5 seeds): extra turn."
        );
        assert_eq!(
            describe_move(Player::North, 1, 5, capture),
            "North played pit 2 (5 seeds): captured 6."
        );
        assert_eq!(
            describe_move(Player::South, 5, 1, quiet),
            "South played pit 6 (1 seed)."
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
