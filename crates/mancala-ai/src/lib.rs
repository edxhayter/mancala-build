//! A computer opponent for Kalah: minimax search with alpha-beta pruning.
//! Depends only on `mancala-core`, so the web UI can reuse it unchanged.

mod choose;
mod eval;
mod explain;
mod puzzle;
mod search;

pub use choose::{Level, choose_move};
pub use eval::{WIN, evaluate};
pub use explain::{EXPLAIN_DEPTH, explain_moves};
pub use puzzle::{
    Generated, MARGIN, MAX_MOVES, MIN_MOVES, PUZZLE_DEPTH, Puzzle, clear_best_move,
    generate_puzzle, generate_puzzle_traced,
};
pub use search::{MoveLine, SearchResult, search_lines, search_scores};
