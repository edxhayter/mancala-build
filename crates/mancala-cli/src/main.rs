use clap::Parser;
use mancala_cli::args::Cli;
use mancala_cli::render::BoardView;
use mancala_core::Board;

fn main() {
    // Parses the options, or prints help / an error and exits.
    let _cli = Cli::parse();

    // Placeholder until task 6.2: just draw a new board.
    println!("{}", BoardView(&Board::new()));
}
