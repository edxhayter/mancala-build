//! The rules of Kalah: board, moves and game end. Depends only on `std`.

mod board;
mod rng;

pub use board::{Board, MoveError, MoveOutcome, Player, Status};
pub use rng::Rng;
