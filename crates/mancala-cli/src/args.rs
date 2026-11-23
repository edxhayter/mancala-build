//! Command-line options, parsed by `clap`.

use clap::{Parser, ValueEnum};
use mancala_core::Player;

/// Play Kalah in your terminal.
#[derive(Parser, Debug)]
#[command(name = "mancala", version)]
pub struct Cli {
    /// Who you play against.
    #[arg(long, value_enum, default_value_t = Opponent::Random)]
    pub opponent: Opponent,

    /// How strong the AI plays (only used with `--opponent ai`).
    #[arg(long, value_enum, default_value_t = Level::Medium)]
    pub level: Level,

    /// Which side you play against the computer (ignored for hotseat). South moves first.
    #[arg(long, value_enum, default_value_t = Side::South)]
    pub side: Side,

    /// Seed for the computer's random choices, to replay the same game.
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
    /// The AI: looks ahead to find good moves (see `--level`).
    Ai,
}

/// The AI's strength.
#[derive(ValueEnum, Clone, Copy, PartialEq, Eq, Debug)]
pub enum Level {
    /// Looks 2 moves ahead.
    Easy,
    /// Looks 6 moves ahead.
    Medium,
    /// Looks 12 moves ahead.
    Hard,
}

impl Level {
    /// The AI crate's level for this option. They're separate types so that
    /// `mancala-ai` never depends on clap.
    pub fn ai_level(self) -> mancala_ai::Level {
        match self {
            Level::Easy => mancala_ai::Level::Easy,
            Level::Medium => mancala_ai::Level::Medium,
            Level::Hard => mancala_ai::Level::Hard,
        }
    }
}

/// A side of the board.
#[derive(ValueEnum, Clone, Copy, PartialEq, Eq, Debug)]
pub enum Side {
    /// South: moves first.
    South,
    /// North: moves second.
    North,
}

impl Side {
    /// The engine's player for this side.
    pub fn player(self) -> Player {
        match self {
            Side::South => Player::South,
            Side::North => Player::North,
        }
    }
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
        assert!(message.contains("ai"), "{message}");
    }

    // Scenario: Playing the AI
    #[test]
    fn playing_the_ai() {
        let cli = Cli::try_parse_from(["mancala", "--opponent", "ai"]).unwrap();
        assert_eq!(cli.opponent, Opponent::Ai);
        assert_eq!(cli.side, Side::South);
        assert_eq!(cli.level, Level::Medium);
        assert_eq!(cli.level.ai_level(), mancala_ai::Level::Medium);
    }

    // Scenario: Choosing the AI's level
    #[test]
    fn choosing_the_ais_level() {
        let cli = Cli::try_parse_from(["mancala", "--opponent", "ai", "--level", "hard"]).unwrap();
        assert_eq!(cli.level, Level::Hard);
        assert_eq!(cli.level.ai_level(), mancala_ai::Level::Hard);
    }

    // Scenario: Invalid level
    #[test]
    fn invalid_level() {
        let err = Cli::try_parse_from(["mancala", "--opponent", "ai", "--level", "impossible"])
            .expect_err("an unknown level must be rejected");
        let message = err.to_string();
        for level in ["easy", "medium", "hard"] {
            assert!(message.contains(level), "{message}");
        }
    }

    #[test]
    fn seed_is_parsed() {
        let cli = Cli::try_parse_from(["mancala", "--seed", "42"]).unwrap();
        assert_eq!(cli.seed, Some(42));
    }
}
