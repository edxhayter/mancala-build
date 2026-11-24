//! The bridge between the Rust game (`mancala-core`, `mancala-ai`) and the web page.
//! Everything JavaScript can call is marked `#[wasm_bindgen]`.

mod sow;

use mancala_ai::{
    Level, MoveLine, choose_move, explain_moves as explain, generate_puzzle as make_puzzle,
};
use mancala_core::{Board, Player, Rng, Status};
use wasm_bindgen::prelude::*;

/// This crate's version, e.g. "0.1.0". A first function to prove the
/// Rust → WASM → JavaScript pipeline works end to end.
#[wasm_bindgen]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// Player numbers used across the boundary: 0 = South, 1 = North.
fn player_from(n: u8) -> Result<Player, String> {
    match n {
        0 => Ok(Player::South),
        1 => Ok(Player::North),
        _ => Err(format!("player must be 0 (South) or 1 (North), got {n}")),
    }
}

fn player_number(player: Player) -> u8 {
    match player {
        Player::South => 0,
        Player::North => 1,
    }
}

fn six(pits: &[u8], whose: &str) -> Result<[u8; 6], String> {
    pits.try_into()
        .map_err(|_| format!("{whose} needs 6 pits, got {}", pits.len()))
}

/// Turns a Rust error into a JavaScript `Error`. Only called from the
/// `#[wasm_bindgen]` wrappers: `JsError` only works inside a JavaScript engine,
/// so native tests call the `try_*` versions instead.
fn js(message: String) -> JsError {
    JsError::new(&message)
}

/// A position, as JavaScript sees it. Opaque: read it through the methods.
/// Playing a move returns a new board and never changes this one.
#[wasm_bindgen]
#[derive(Clone, Copy, Debug)]
pub struct WasmBoard {
    board: Board,
}

impl Default for WasmBoard {
    fn default() -> Self {
        Self::new()
    }
}

#[wasm_bindgen]
impl WasmBoard {
    /// The starting position: 4 seeds in every pit, South to move.
    #[wasm_bindgen(constructor)]
    pub fn new() -> WasmBoard {
        WasmBoard {
            board: Board::new(),
        }
    }

    /// Any position. `toMove` is 0 (South) or 1 (North). Seed totals are not checked.
    #[wasm_bindgen(js_name = fromParts)]
    pub fn from_parts(
        south: &[u8],
        south_store: u8,
        north: &[u8],
        north_store: u8,
        to_move: u8,
    ) -> Result<WasmBoard, JsError> {
        Self::try_from_parts(south, south_store, north, north_store, to_move).map_err(js)
    }

    /// The seeds in a player's six pits, pit 1 first.
    pub fn pits(&self, player: u8) -> Result<Vec<u8>, JsError> {
        self.try_pits(player).map_err(js)
    }

    /// The seeds in a player's store.
    pub fn store(&self, player: u8) -> Result<u8, JsError> {
        self.try_store(player).map_err(js)
    }

    /// Whose turn it is: 0 = South, 1 = North.
    #[wasm_bindgen(js_name = toMove)]
    pub fn to_move(&self) -> u8 {
        player_number(self.board.to_move())
    }

    /// -1 = in progress, 0 = South won, 1 = North won, 2 = draw.
    pub fn status(&self) -> i8 {
        match self.board.status() {
            Status::InProgress => -1,
            Status::Finished {
                winner: Some(player),
            } => player_number(player) as i8,
            Status::Finished { winner: None } => 2,
        }
    }

    /// The pits (0-5) the player to move may play.
    #[wasm_bindgen(js_name = legalMoves)]
    pub fn legal_moves(&self) -> Vec<u8> {
        self.board
            .legal_moves()
            .into_iter()
            .map(|p| p as u8)
            .collect()
    }

    /// Plays a pit (0-5) for the player to move. Throws if the move is illegal.
    pub fn play(&self, pit: u8) -> Result<PlayResult, JsError> {
        self.try_play(pit).map_err(js)
    }
}

// The plain-Rust layer: everything the wrappers above call, testable natively.
impl WasmBoard {
    fn try_from_parts(
        south: &[u8],
        south_store: u8,
        north: &[u8],
        north_store: u8,
        to_move: u8,
    ) -> Result<WasmBoard, String> {
        let board = Board::from_parts(
            six(south, "South")?,
            south_store,
            six(north, "North")?,
            north_store,
            player_from(to_move)?,
        );
        Ok(WasmBoard { board })
    }

    fn try_pits(&self, player: u8) -> Result<Vec<u8>, String> {
        Ok(self.board.pits(player_from(player)?).to_vec())
    }

    fn try_store(&self, player: u8) -> Result<u8, String> {
        Ok(self.board.store(player_from(player)?))
    }

    fn try_play(&self, pit: u8) -> Result<PlayResult, String> {
        let pit = pit as usize;
        let (next, outcome) = self.board.play(pit).map_err(|e| format!("{e:?}"))?;
        // play() succeeded, so the pit is in range and the path is valid.
        let path = sow::sow_path(&self.board, pit)
            .iter()
            .map(|slot| slot.code())
            .collect();
        Ok(PlayResult {
            board: next,
            extra_turn: outcome.extra_turn,
            captured: outcome.captured,
            path,
        })
    }
}

/// What a move did: the new board, plus what the page needs to show it.
#[wasm_bindgen]
#[derive(Clone, Debug)]
pub struct PlayResult {
    board: Board,
    extra_turn: bool,
    captured: u8,
    path: Vec<u8>,
}

#[wasm_bindgen]
impl PlayResult {
    /// The position after the move (including any capture and the final sweep).
    pub fn board(&self) -> WasmBoard {
        WasmBoard { board: self.board }
    }

    /// True if the mover moves again.
    #[wasm_bindgen(js_name = extraTurn)]
    pub fn extra_turn(&self) -> bool {
        self.extra_turn
    }

    /// Seeds moved into the mover's store by a capture (0 if none).
    pub fn captured(&self) -> u8 {
        self.captured
    }

    /// Every slot the move sowed into, in order, one byte per seed:
    /// `player * 7 + place`, where place 0-5 is a pit and 6 is the store.
    pub fn path(&self) -> Vec<u8> {
        self.path.clone()
    }
}

/// The AI, with its own seeded random generator for breaking ties.
/// Keep one per game so the same seed always gives the same moves.
#[wasm_bindgen]
pub struct Ai {
    rng: Rng,
}

#[wasm_bindgen]
impl Ai {
    /// A new AI. The seed is a u32 so JavaScript can pass a plain number.
    #[wasm_bindgen(constructor)]
    pub fn new(seed: u32) -> Ai {
        Ai {
            rng: Rng::new(u64::from(seed)),
        }
    }

    /// The AI's move (a pit, 0-5) for the player to move.
    /// `level`: 0 = easy, 1 = medium, 2 = hard. Throws if the game is over.
    pub fn choose(&mut self, board: &WasmBoard, level: u8) -> Result<u8, JsError> {
        self.try_choose(board, level).map_err(js)
    }
}

impl Ai {
    fn try_choose(&mut self, board: &WasmBoard, level: u8) -> Result<u8, String> {
        let level = match level {
            0 => Level::Easy,
            1 => Level::Medium,
            2 => Level::Hard,
            _ => return Err(format!("level must be 0, 1 or 2, got {level}")),
        };
        if board.board.legal_moves().is_empty() {
            return Err("there is no move to choose: the game is over".to_string());
        }
        Ok(choose_move(&board.board, level, &mut self.rng) as u8)
    }
}

/// A puzzle: a position and its one clearly best move (design.md decision 5).
#[wasm_bindgen]
#[derive(Clone, Copy, Debug)]
pub struct WasmPuzzle {
    board: Board,
    answer: u8,
}

#[wasm_bindgen]
impl WasmPuzzle {
    pub fn board(&self) -> WasmBoard {
        WasmBoard { board: self.board }
    }

    /// The best pit (0-5) for the player to move.
    pub fn answer(&self) -> u8 {
        self.answer
    }
}

/// The puzzle for `seed`; the same seed always gives the same puzzle. The seed
/// is a `u32` because a JavaScript number holds one exactly.
#[wasm_bindgen(js_name = generatePuzzle)]
pub fn generate_puzzle(seed: u32) -> WasmPuzzle {
    let puzzle = make_puzzle(u64::from(seed));
    WasmPuzzle {
        board: puzzle.board,
        answer: puzzle.answer as u8,
    }
}

/// One move's explanation: its score and line of best play (add-move-explainer
/// design.md decision 4).
#[wasm_bindgen]
#[derive(Clone, Debug)]
pub struct WasmMoveLine {
    line: MoveLine,
}

#[wasm_bindgen]
impl WasmMoveLine {
    pub fn pit(&self) -> u8 {
        self.line.pit as u8
    }

    pub fn score(&self) -> i32 {
        self.line.score
    }

    /// The move, then the moves both sides make next in the AI's best play.
    pub fn line(&self) -> Vec<u8> {
        self.line.line.iter().map(|&pit| pit as u8).collect()
    }
}

/// Every legal move for the player to move, best first, looking 12 moves ahead.
#[wasm_bindgen(js_name = explainMoves)]
pub fn explain_moves(board: &WasmBoard) -> Result<Vec<WasmMoveLine>, JsError> {
    try_explain(board).map_err(js)
}

fn try_explain(board: &WasmBoard) -> Result<Vec<WasmMoveLine>, String> {
    if board.board.legal_moves().is_empty() {
        return Err("there is nothing to explain: the game is over".to_string());
    }
    Ok(explain(&board.board)
        .into_iter()
        .map(|line| WasmMoveLine { line })
        .collect())
}

/// Replays a game's moves (each 0-5, the mover's own numbering) from the
/// starting position. Throws naming the first bad move and why (add-online-play).
#[wasm_bindgen(js_name = replayMoves)]
pub fn replay_moves(moves: &[u8]) -> Result<WasmBoard, JsError> {
    try_replay(moves).map_err(js)
}

fn try_replay(moves: &[u8]) -> Result<WasmBoard, String> {
    // JavaScript sends bytes; the rules count pits with `usize`.
    let pits: Vec<usize> = moves.iter().map(|&pit| usize::from(pit)).collect();
    Board::replay(&pits)
        .map(|board| WasmBoard { board })
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_matches_cargo_toml() {
        assert_eq!(version(), "0.1.0");
    }

    #[test]
    fn players_and_status_as_numbers() {
        assert_eq!(player_from(0), Ok(Player::South));
        assert_eq!(player_from(1), Ok(Player::North));
        assert!(player_from(2).is_err());

        let board = WasmBoard::new();
        assert_eq!(board.to_move(), 0);
        assert_eq!(board.status(), -1, "in progress");

        let finished = |s, n| WasmBoard::try_from_parts(&[0; 6], s, &[0; 6], n, 0).unwrap();
        assert_eq!(finished(26, 22).status(), 0, "South won");
        assert_eq!(finished(10, 38).status(), 1, "North won");
        assert_eq!(finished(24, 24).status(), 2, "draw");
    }

    #[test]
    fn from_parts_round_trips() {
        let board =
            WasmBoard::try_from_parts(&[1, 6, 2, 6, 6, 5], 1, &[4, 4, 0, 5, 0, 6], 2, 1).unwrap();
        assert_eq!(board.try_pits(0).unwrap(), vec![1, 6, 2, 6, 6, 5]);
        assert_eq!(board.try_pits(1).unwrap(), vec![4, 4, 0, 5, 0, 6]);
        assert_eq!(board.try_store(0).unwrap(), 1);
        assert_eq!(board.try_store(1).unwrap(), 2);
        assert_eq!(board.to_move(), 1);
        assert_eq!(board.legal_moves(), vec![0, 1, 3, 5]);
    }

    #[test]
    fn from_parts_rejects_bad_input() {
        assert!(
            WasmBoard::try_from_parts(&[4; 5], 0, &[4; 6], 0, 0).is_err(),
            "5 pits"
        );
        assert!(
            WasmBoard::try_from_parts(&[4; 6], 0, &[4; 6], 0, 7).is_err(),
            "player 7"
        );
        assert!(WasmBoard::new().try_pits(3).is_err());
    }

    #[test]
    fn play_returns_the_new_board_and_the_path() {
        let start = WasmBoard::new();
        let result = start.try_play(0).unwrap();
        assert_eq!(result.board().try_pits(0).unwrap(), vec![0, 5, 5, 5, 5, 4]);
        assert_eq!(result.path(), vec![1, 2, 3, 4]);
        assert!(!result.extra_turn());
        assert_eq!(result.captured(), 0);
        assert_eq!(
            start.try_pits(0).unwrap(),
            vec![4; 6],
            "the original is unchanged"
        );
    }

    #[test]
    fn play_reports_extra_turns_and_captures() {
        let extra = WasmBoard::new().try_play(2).unwrap();
        assert!(extra.extra_turn());
        assert_eq!(
            extra.path(),
            vec![3, 4, 5, 6],
            "ends in South's store (code 6)"
        );

        let capture = WasmBoard::try_from_parts(&[1, 0, 0, 2, 0, 0], 0, &[1, 1, 1, 1, 5, 1], 0, 0)
            .unwrap()
            .try_play(0)
            .unwrap();
        assert_eq!(capture.captured(), 6);
    }

    #[test]
    fn illegal_moves_are_errors() {
        let board = WasmBoard::new();
        assert!(board.try_play(6).is_err(), "out of range");
        let after_extra = board.try_play(2).unwrap().board();
        assert!(after_extra.try_play(2).is_err(), "empty pit");
        let over = WasmBoard::try_from_parts(&[0; 6], 24, &[0; 6], 24, 0).unwrap();
        assert!(over.try_play(0).is_err(), "game over");
    }

    #[test]
    fn ai_is_repeatable_from_a_seed() {
        let play_out = |seed: u32| {
            let mut ai = Ai::new(seed);
            let mut rng = Rng::new(9);
            let mut board = WasmBoard::new();
            let mut moves = Vec::new();
            while board.status() == -1 {
                let pit = if board.to_move() == 0 {
                    ai.try_choose(&board, 1).unwrap() // medium
                } else {
                    let legal = board.legal_moves();
                    legal[rng.below(legal.len())]
                };
                assert!(board.legal_moves().contains(&pit));
                moves.push(pit);
                board = board.try_play(pit).unwrap().board();
            }
            moves
        };
        assert_eq!(play_out(42), play_out(42));
    }

    #[test]
    fn ai_rejects_bad_requests() {
        let mut ai = Ai::new(1);
        assert!(ai.try_choose(&WasmBoard::new(), 3).is_err(), "level 3");
        let over = WasmBoard::try_from_parts(&[0; 6], 24, &[0; 6], 24, 0).unwrap();
        assert!(ai.try_choose(&over, 0).is_err(), "game over");
    }

    #[test]
    fn puzzles_match_the_ai_crate() {
        for seed in [0u32, 7, 2026] {
            let wasm = generate_puzzle(seed);
            let native = make_puzzle(u64::from(seed));
            assert_eq!(wasm.board().board, native.board, "seed {seed}");
            assert_eq!(usize::from(wasm.answer()), native.answer, "seed {seed}");
            assert!(
                wasm.board().legal_moves().contains(&wasm.answer()),
                "seed {seed}"
            );
        }
    }

    #[test]
    fn explanations_match_the_ai_crate() {
        for board in [Board::new(), make_puzzle(3).board] {
            let wasm = try_explain(&WasmBoard { board }).unwrap();
            let native = explain(&board);
            assert_eq!(wasm.len(), native.len());
            for (w, n) in wasm.iter().zip(&native) {
                assert_eq!(usize::from(w.pit()), n.pit);
                assert_eq!(w.score(), n.score);
                assert_eq!(
                    w.line().iter().map(|&p| usize::from(p)).collect::<Vec<_>>(),
                    n.line
                );
            }
        }
    }

    #[test]
    fn a_finished_game_cannot_be_explained() {
        let finished = WasmBoard::try_from_parts(&[0; 6], 30, &[0; 6], 18, 0).unwrap();
        assert!(try_explain(&finished).is_err());
    }

    #[test]
    fn replay_matches_the_core() {
        let moves = [2u8, 5, 0, 1];
        let native = Board::replay(&[2, 5, 0, 1]).unwrap();
        assert_eq!(try_replay(&moves).unwrap().board, native);
        assert_eq!(try_replay(&[]).unwrap().board, Board::new());
    }

    #[test]
    fn a_bad_replay_names_the_move_and_the_reason() {
        let error = try_replay(&[0, 0, 0]).unwrap_err();
        assert_eq!(error, "move 3 (place 2): that pit is empty");
        assert!(
            try_replay(&[7])
                .unwrap_err()
                .contains("pits are numbered 0 to 5")
        );
    }
}
