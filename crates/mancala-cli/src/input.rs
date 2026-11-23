//! Turning a line the player typed into a command.

/// What the player asked for.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Command {
    /// Play this pit, in the engine's numbering (0..=5).
    Move(usize),
    /// Stop the game.
    Quit,
}

/// Why a line couldn't be understood.
///
/// An empty pit is not checked here. The engine reports that when the move is played.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum InputError {
    /// Not a whole number (and not a quit command).
    NotANumber,
    /// A whole number, but not 1 to 6.
    OutOfRange,
}

/// Parses one line of input. Players type pits 1-6; the result uses the
/// engine's 0-5, so the conversion happens in this one place only.
pub fn parse_input(line: &str) -> Result<Command, InputError> {
    let text = line.trim();

    if text == "q" || text == "quit" {
        return Ok(Command::Quit);
    }

    // i64 rather than usize, so "-1" counts as a number that's out of range.
    let number: i64 = text.parse().map_err(|_| InputError::NotANumber)?;

    match number {
        1..=6 => Ok(Command::Move(number as usize - 1)),
        _ => Err(InputError::OutOfRange),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_pit_number_becomes_an_engine_move() {
        // Players type 1-6; the engine numbers pits 0-5.
        assert_eq!(parse_input("1"), Ok(Command::Move(0)));
        assert_eq!(parse_input("3"), Ok(Command::Move(2)));
        assert_eq!(parse_input("6"), Ok(Command::Move(5)));
    }

    // Scenario: Surrounding spaces are ignored
    #[test]
    fn surrounding_spaces_are_ignored() {
        assert_eq!(parse_input("  1  "), Ok(Command::Move(0)));
        assert_eq!(parse_input("4\n"), Ok(Command::Move(3)));
    }

    // Scenario: Not a number
    #[test]
    fn not_a_number() {
        assert_eq!(parse_input("banana"), Err(InputError::NotANumber));
        assert_eq!(parse_input("2.5"), Err(InputError::NotANumber));
        assert_eq!(parse_input(""), Err(InputError::NotANumber));
    }

    // Scenario: Out of range
    #[test]
    fn out_of_range() {
        assert_eq!(parse_input("0"), Err(InputError::OutOfRange));
        assert_eq!(parse_input("7"), Err(InputError::OutOfRange));
        assert_eq!(parse_input("-1"), Err(InputError::OutOfRange));
    }

    // Scenario: Quit command
    #[test]
    fn quit_command() {
        assert_eq!(parse_input("q"), Ok(Command::Quit));
        assert_eq!(parse_input("quit"), Ok(Command::Quit));
        assert_eq!(parse_input(" q \n"), Ok(Command::Quit));
    }
}
