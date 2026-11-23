use std::io;
use std::process::ExitCode;
use std::time::{SystemTime, UNIX_EPOCH};

use clap::Parser;
use mancala_cli::args::{Cli, Opponent};
use mancala_cli::game::{GameConfig, Players, run};
use mancala_core::Board;

fn main() -> ExitCode {
    // Parses the options, or prints help / an error and exits with status 2.
    let cli = Cli::parse();

    let players = match cli.opponent {
        Opponent::Human => Players::hotseat(),
        Opponent::Random => Players::against_bot(cli.side.player()),
    };

    let seed = match cli.seed {
        Some(seed) => seed,
        None => {
            let seed = seed_from_clock();
            if cli.opponent == Opponent::Random {
                println!("Bot seed: {seed} (replay this game with --seed {seed})");
            }
            seed
        }
    };

    let config = GameConfig {
        players,
        seed,
        start: Board::new(),
    };

    // The real keyboard and screen. Tests pass other readers and writers to `run`.
    match run(config, io::stdin().lock(), io::stdout().lock()) {
        Ok(_) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("mancala: {error}");
            ExitCode::FAILURE
        }
    }
}

/// A different seed on every run: the clock's nanoseconds since 1970.
fn seed_from_clock() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_nanos() as u64)
        .unwrap_or(0)
}
