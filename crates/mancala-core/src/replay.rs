//! Replaying a whole game from its list of moves (kalah-rules: Replaying a game).
//!
//! Online play uses this to check a game handed over by the other browser:
//! either every move is legal and we get the position, or we learn exactly
//! which move was wrong and why.

use crate::{Board, MoveError};
use std::fmt;

/// Why a list of moves couldn't be replayed: the first move that failed.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct ReplayError {
    /// Where the bad move is in the list, counting from 0.
    pub index: usize,
    /// Why that move was rejected.
    pub error: MoveError,
}

impl fmt::Display for ReplayError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        // People count moves from 1, programs from 0, so say both.
        write!(
            f,
            "move {} (place {}): {}",
            self.index + 1,
            self.index,
            self.error
        )
    }
}

impl std::error::Error for ReplayError {
    /// The underlying cause, so error reporters can print the chain.
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        Some(&self.error)
    }
}

impl Board {
    /// Plays `moves` in order from the starting position and returns the final
    /// position, or the first move that can't be played. Never returns a
    /// half-replayed board.
    ///
    /// The same thing as a fold, for comparison (task 1.2 tried both):
    ///
    /// ```text
    /// moves.iter().enumerate().try_fold(Board::new(), |board, (index, &pit)| {
    ///     board.play(pit).map(|(next, _)| next).map_err(|error| ReplayError { index, error })
    /// })
    /// ```
    ///
    /// `try_fold` stops at the first `Err`, just like `?` in the loop. The loop
    /// is kept because each step reads on its own line.
    pub fn replay(moves: &[usize]) -> Result<Board, ReplayError> {
        let mut board = Board::new();
        for (index, &pit) in moves.iter().enumerate() {
            // `map_err` wraps the MoveError with its place in the list, and `?`
            // returns early with it. `board` is only replaced on success.
            let (next, _outcome) = board
                .play(pit)
                .map_err(|error| ReplayError { index, error })?;
            board = next;
        }
        Ok(board)
    }
}
