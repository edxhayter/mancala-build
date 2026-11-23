//! Search benchmarks (filled in by task 5.2). Run with `cargo bench -p mancala-ai`.

use criterion::{Criterion, criterion_group, criterion_main};

fn benchmarks(_c: &mut Criterion) {}

criterion_group!(benches, benchmarks);
criterion_main!(benches);
