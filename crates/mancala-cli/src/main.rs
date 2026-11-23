use clap::Parser;
use mancala_cli::args::Cli;

fn main() {
    // Parses the options, or prints help / an error and exits.
    let cli = Cli::parse();
    println!("mancala: coming soon ({cli:?})");
}
