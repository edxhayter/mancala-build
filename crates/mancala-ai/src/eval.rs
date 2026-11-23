//! How good a position is, from one player's point of view.

use mancala_core::{Board, Player, Status};

/// Bonus for a won game (penalty for a lost one). Far more than any store lead
/// (at most 48), so a certain win always beats being "ahead on seeds".
pub const WIN: i32 = 1000;

/// Scores `board` for `me`: positive is good for `me`, negative is good for the opponent.
///
/// Seeds in a store never leave it, so the store difference is a solid, cheap
/// estimate. A finished game adds `WIN` (or `-WIN`) on top; a draw is 0.
pub fn evaluate(board: &Board, me: Player) -> i32 {
    // Convert to i32 *before* subtracting: u8 can't go below zero.
    let lead = i32::from(board.store(me)) - i32::from(board.store(me.opponent()));

    match board.status() {
        Status::InProgress => lead,
        Status::Finished { winner: None } => 0,
        Status::Finished {
            winner: Some(winner),
        } if winner == me => WIN + lead,
        Status::Finished { winner: Some(_) } => -WIN + lead,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use mancala_core::{Board, Player};

    #[test]
    fn start_position_is_even() {
        assert_eq!(evaluate(&Board::new(), Player::South), 0);
        assert_eq!(evaluate(&Board::new(), Player::North), 0);
    }

    #[test]
    fn store_lead_is_the_score_from_each_side() {
        let board = Board::from_parts([4; 6], 5, [4; 6], 2, Player::South);
        assert_eq!(evaluate(&board, Player::South), 3);
        assert_eq!(evaluate(&board, Player::North), -3);
    }

    #[test]
    fn a_finished_game_outweighs_any_lead() {
        let won = Board::from_parts([0; 6], 26, [0; 6], 22, Player::South);
        assert!(evaluate(&won, Player::South) > WIN);
        assert!(evaluate(&won, Player::North) < -WIN);
    }

    #[test]
    fn a_draw_is_zero() {
        let draw = Board::from_parts([0; 6], 24, [0; 6], 24, Player::South);
        assert_eq!(evaluate(&draw, Player::South), 0);
    }
}
