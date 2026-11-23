//! Command-line options, parsed by `clap`.

use clap::{Parser, ValueEnum};

/// Play Kalah in your terminal.
#[derive(Parser, Debug)]
#[command(name = "mancala", version)]
pub struct Cli {
    /// Who you play against.
    #[arg(long, value_enum, default_value_t = Opponent::Random)]
    pub opponent: Opponent,

    /// Which side you play against the bot (ignored for hotseat). South moves first.
    #[arg(long, value_enum, default_value_t = Side::South)]
    pub side: Side,

    /// Seed for the bot's random choices, to replay the same game.
    /// If you leave it out, one is picked and printed for you.
    #[arg(long)]
    pub seed: Option<u64>,
}

/// The kind of opponent.
#[derive(ValueEnum, Clone, Copy, PartialEq, Eq, Debug)]
pub enum Opponent {
    /// Another person at the same keyboard (hotseat).
    Human,
    /// A bot that plays random legal moves.
    Random,
}

/// A side of the board.
#[derive(ValueEnum, Clone, Copy, PartialEq, Eq, Debug)]
pub enum Side {
    /// South: moves first.
    South,
    /// North: moves second.
    North,
}

#[cfg(test)]
mod tests {
    use super::*;
    use clap::Parser;

    // Scenario: Defaults
    #[test]
    fn defaults() {
        let cli = Cli::try_parse_from(["mancala"]).unwrap();
        assert_eq!(cli.opponent, Opponent::Random);
        assert_eq!(cli.side, Side::South);
        assert_eq!(cli.seed, None);
    }

    // Scenario: Hotseat
    #[test]
    fn hotseat() {
        let cli = Cli::try_parse_from(["mancala", "--opponent", "human"]).unwrap();
        assert_eq!(cli.opponent, Opponent::Human);
    }

    // Scenario: Playing North against the bot
    #[test]
    fn playing_north_against_the_bot() {
        let cli = Cli::try_parse_from(["mancala", "--side", "north"]).unwrap();
        assert_eq!(cli.opponent, Opponent::Random);
        assert_eq!(cli.side, Side::North);
    }

    // Scenario: Invalid option value
    #[test]
    fn invalid_option_value() {
        let err = Cli::try_parse_from(["mancala", "--opponent", "wizard"])
            .expect_err("an unknown opponent must be rejected");
        let message = err.to_string();
        assert!(message.contains("human"), "{message}");
        assert!(message.contains("random"), "{message}");
    }

    #[test]
    fn seed_is_parsed() {
        let cli = Cli::try_parse_from(["mancala", "--seed", "42"]).unwrap();
        assert_eq!(cli.seed, Some(42));
    }
}
