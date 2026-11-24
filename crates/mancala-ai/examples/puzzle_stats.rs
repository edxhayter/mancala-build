//! How puzzle generation behaves, to choose its constants (design.md decision 4).
//!
//! Run with: cargo run --release -p mancala-ai --example puzzle_stats

use std::cmp::Reverse;
use std::time::Instant;

use mancala_ai::{
    MARGIN, MAX_MOVES, MIN_MOVES, PUZZLE_DEPTH, generate_puzzle_traced, search_scores,
};
use mancala_core::{Board, Player, Rng, Status};

const PUZZLES: u64 = 200;
const SAMPLE_POSITIONS: usize = 400;

fn main() {
    println!(
        "MIN_MOVES {MIN_MOVES}, MAX_MOVES {MAX_MOVES}, MARGIN {MARGIN}, depth {PUZZLE_DEPTH}\n"
    );

    // 1. Generate puzzles: candidates tried, time taken, where the answers fall.
    let mut times = Vec::new();
    let mut candidates = Vec::new();
    let mut by_pit = [0; 6];
    let mut south_to_move = 0;
    let mut lengths = Vec::new();
    let mut samples = Vec::new();
    for seed in 0..PUZZLES {
        let start = Instant::now();
        let generated = generate_puzzle_traced(seed);
        times.push(start.elapsed().as_secs_f64());
        candidates.push(generated.candidates);
        lengths.push(generated.moves.len());
        by_pit[generated.puzzle.answer] += 1;
        if generated.puzzle.board.to_move() == Player::South {
            south_to_move += 1;
        }
        if seed < 10 {
            samples.push(generated);
        }
    }
    let mean = |xs: &[f64]| xs.iter().sum::<f64>() / xs.len() as f64;
    let worst = times.iter().cloned().fold(0.0, f64::max);
    let cands: Vec<f64> = candidates.iter().map(|&c| f64::from(c)).collect();
    let lens: Vec<f64> = lengths.iter().map(|&l| l as f64).collect();
    println!("{PUZZLES} puzzles");
    println!(
        "  time per puzzle   mean {:>6.3} s   worst {:>6.3} s",
        mean(&times),
        worst
    );
    println!(
        "  candidates        mean {:>6.2}     worst {:>6}",
        mean(&cands),
        candidates.iter().max().unwrap()
    );
    println!("  moves into game   mean {:>6.1}", mean(&lens));
    println!("  answer by pit     {by_pit:?}");
    println!("  South to move     {south_to_move} of {PUZZLES}\n");

    // 2. How many random positions each margin would accept.
    let mut rng = Rng::new(99);
    let mut gaps = Vec::new();
    while gaps.len() < SAMPLE_POSITIONS {
        let length = MIN_MOVES + rng.below(MAX_MOVES - MIN_MOVES + 1);
        let mut board = Board::new();
        for _ in 0..length {
            let legal = board.legal_moves();
            if legal.is_empty() {
                break;
            }
            board = board.play(legal[rng.below(legal.len())]).unwrap().0;
        }
        if board.status() != Status::InProgress || board.legal_moves().len() < 2 {
            continue;
        }
        let mut scores: Vec<i32> = search_scores(&board, PUZZLE_DEPTH)
            .scores
            .iter()
            .map(|&(_, s)| s)
            .collect();
        scores.sort_by_key(|&s| Reverse(s));
        gaps.push(scores[0] - scores[1]);
    }
    println!("{SAMPLE_POSITIONS} random positions: share each margin would accept");
    for margin in 1..=4 {
        let kept = gaps.iter().filter(|&&g| g >= margin).count();
        println!(
            "  margin {margin}   {:>5.1}%",
            100.0 * kept as f64 / SAMPLE_POSITIONS as f64
        );
    }

    // 3. A few puzzles to look at.
    println!("\nSample puzzles (the mover's pits along the bottom, pit 1 on the left)");
    for (seed, generated) in samples.iter().enumerate() {
        let b = generated.puzzle.board;
        let me = b.to_move();
        let them = me.opponent();
        let mut top = b.pits(them);
        top.reverse();
        let scores = search_scores(&b, PUZZLE_DEPTH).scores;
        println!(
            "\nseed {seed}: {me:?} to move after {} moves, answer pit {}   scores {:?}",
            generated.moves.len(),
            generated.puzzle.answer + 1,
            scores.iter().map(|&(p, s)| (p + 1, s)).collect::<Vec<_>>()
        );
        println!("       {top:>2?}");
        println!(
            "  [{:>2}]                        [{:>2}]",
            b.store(them),
            b.store(me)
        );
        println!("       {:>2?}", b.pits(me));
    }
}
