//! A computer opponent for Kalah: minimax search with alpha-beta pruning.
//! Depends only on `mancala-core`, so the web UI can reuse it unchanged.

mod eval;
mod search;

pub use eval::{WIN, evaluate};
pub use search::{SearchResult, search_scores};
