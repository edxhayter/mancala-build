//! How much work each search depth (1-14) takes: positions searched and time.
//! Run in release mode (debug is far slower and misleading):
//!
//!     cargo run --release -p mancala-ai --example depth_table

use std::time::Instant;

use mancala_ai::search_scores;
use mancala_core::{Board, Rng};

/// A fixed mid-game position: 12 seeded random moves from the start.
/// The benchmarks use the same one.
fn midgame() -> Board {
    let mut rng = Rng::new(7);
    let mut board = Board::new();
    for _ in 0..12 {
        let legal = board.legal_moves();
        board = board.play(legal[rng.below(legal.len())]).unwrap().0;
    }
    board
}

fn main() {
    for (name, board) in [("start", Board::new()), ("midgame", midgame())] {
        println!("{name}: {board:?}");
        println!("{:>5} {:>12} {:>10}", "depth", "positions", "time (ms)");
        for depth in 1..=14 {
            let started = Instant::now();
            let result = search_scores(&board, depth);
            let ms = started.elapsed().as_secs_f64() * 1000.0;
            println!("{depth:>5} {:>12} {ms:>10.2}", result.nodes);
        }
        println!();
    }
}
