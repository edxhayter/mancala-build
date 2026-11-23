//! Whole games: the AI against the random bot, and against itself at other levels.
//! Every game uses fixed seeds, so the results are the same on every run.

use mancala_ai::{Level, choose_move};
use mancala_core::{Board, Player, Rng, Status};

/// Who plays a side in these test games.
#[derive(Clone, Copy, Debug)]
enum Agent {
    Random,
    Ai(Level),
}

/// Plays one game to the end and returns the winner (`None` for a draw).
/// Checks that every AI move is legal along the way.
fn play_game(south: Agent, north: Agent, seed: u64) -> Option<Player> {
    let mut rng = Rng::new(seed);
    let mut board = Board::new();

    while board.status() == Status::InProgress {
        let agent = match board.to_move() {
            Player::South => south,
            Player::North => north,
        };
        let legal = board.legal_moves();
        let pit = match agent {
            Agent::Random => legal[rng.below(legal.len())],
            Agent::Ai(level) => choose_move(&board, level, &mut rng),
        };
        assert!(
            legal.contains(&pit),
            "{agent:?} chose illegal pit {pit} in {board:?}"
        );
        board = board.play(pit).expect("checked legal above").0;
    }

    match board.status() {
        Status::Finished { winner } => winner,
        Status::InProgress => unreachable!("the loop only ends when the game does"),
    }
}

/// Plays `games` games between `a` and `b`, with each taking South in half of them.
/// Returns (wins for a, wins for b).
fn series(a: Agent, b: Agent, games: u64) -> (u32, u32) {
    let (mut a_wins, mut b_wins) = (0, 0);
    for seed in 0..games {
        let a_is_south = seed % 2 == 0;
        let (south, north) = if a_is_south { (a, b) } else { (b, a) };
        let a_side = if a_is_south {
            Player::South
        } else {
            Player::North
        };
        match play_game(south, north, seed) {
            Some(winner) if winner == a_side => a_wins += 1,
            Some(_) => b_wins += 1,
            None => {}
        }
    }
    (a_wins, b_wins)
}

// Scenario: Never plays an illegal move
#[test]
fn never_plays_an_illegal_move() {
    // `play_game` asserts legality on every move; these games just need to finish.
    // Hard is too slow for a debug build: `harder_beats_easier` (release, --ignored)
    // plays hard in every game and checks its moves the same way.
    for level in [Level::Easy, Level::Medium] {
        series(Agent::Ai(level), Agent::Random, 20);
    }
}

// Scenario: Medium is a real challenge
#[test]
fn medium_is_a_real_challenge() {
    let (ai, random) = series(Agent::Ai(Level::Medium), Agent::Random, 100);
    println!("medium vs random: {ai} wins, {random} losses");
    assert!(ai >= 90, "medium won only {ai} of 100 (lost {random})");
}

// Scenario: Harder beats easier
// Slow in a debug build: run with `cargo test --release -p mancala-ai -- --ignored`.
#[test]
#[ignore]
fn harder_beats_easier() {
    let (hard, easy) = series(Agent::Ai(Level::Hard), Agent::Ai(Level::Easy), 20);
    println!("hard vs easy: {hard} wins, {easy} losses");
    assert!(hard > easy, "hard won {hard}, easy won {easy}");
}
