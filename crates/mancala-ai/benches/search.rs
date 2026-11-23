//! Timing the search at each level's depth. Run with `cargo bench -p mancala-ai`
//! (criterion's report also lands in target/criterion/report/index.html).

use std::hint::black_box;

use criterion::{Criterion, criterion_group, criterion_main};
use mancala_ai::{Level, search_scores};
use mancala_core::{Board, Rng};

/// The same fixed mid-game position as `examples/depth_table.rs`.
fn midgame() -> Board {
    let mut rng = Rng::new(7);
    let mut board = Board::new();
    for _ in 0..12 {
        let legal = board.legal_moves();
        board = board.play(legal[rng.below(legal.len())]).unwrap().0;
    }
    board
}

fn benchmarks(c: &mut Criterion) {
    let positions = [("start", Board::new()), ("midgame", midgame())];
    let mut group = c.benchmark_group("search_scores");
    group.sample_size(10); // hard takes ~0.25 s per search; 10 samples keeps runs short
    for level in [Level::Easy, Level::Medium, Level::Hard] {
        for (name, board) in &positions {
            let id = format!("{level:?} (depth {}) / {name}", level.depth());
            group.bench_function(&id, |b| {
                b.iter(|| search_scores(black_box(board), black_box(level.depth())))
            });
        }
    }
    group.finish();
}

criterion_group!(benches, benchmarks);
criterion_main!(benches);
