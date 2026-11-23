//! Whole games driven by scripted input, with no real terminal.
//! Each test feeds `run` some lines of "typing" and reads back everything it printed.

use mancala_cli::game::{Controller, GameConfig, GameEnd, Players, run};
use mancala_core::{Board, Player, Status};

/// Plays a game from `start`, typing `script`. Returns how it ended and all the output.
fn play(players: Players, seed: u64, start: Board, script: &str) -> (GameEnd, String) {
    let config = GameConfig {
        players,
        seed,
        start,
    };
    let mut output = Vec::new();
    let end = run(config, script.as_bytes(), &mut output).expect("writing to a Vec never fails");
    (end, String::from_utf8(output).expect("output is UTF-8"))
}

/// A hotseat game: both sides typed.
fn hotseat(start: Board, script: &str) -> (GameEnd, String) {
    play(Players::hotseat(), 0, start, script)
}

/// How many times `needle` appears in `text`.
fn count(text: &str, needle: &str) -> usize {
    text.matches(needle).count()
}

const SOUTH_PROMPT: &str = "South, choose a pit (1-6, or q to quit): ";
const NORTH_PROMPT: &str = "North, choose a pit (1-6, or q to quit): ";

// Scenario: A valid move is played
#[test]
fn a_valid_move_is_played() {
    let (end, out) = hotseat(Board::new(), "3\nq\n");
    // South's pit 3 emptied, and South asked again because of the extra turn.
    assert!(out.contains("     [ 4] [ 4] [ 0] [ 5] [ 5] [ 5]"), "{out}");
    assert_eq!(count(&out, SOUTH_PROMPT), 2, "{out}");
    assert_eq!(count(&out, NORTH_PROMPT), 0, "{out}");
    assert_eq!(end, GameEnd::Abandoned);
}

// Scenario: Surrounding spaces are ignored
#[test]
fn surrounding_spaces_are_ignored() {
    let (_, out) = hotseat(Board::new(), "  1  \nq\n");
    assert_eq!(
        count(&out, NORTH_PROMPT),
        1,
        "South's move was played: {out}"
    );
}

// Scenario: Not a number
#[test]
fn not_a_number() {
    let (_, out) = hotseat(Board::new(), "banana\nq\n");
    assert!(out.contains("That's not a pit number"), "{out}");
    assert_eq!(
        count(&out, SOUTH_PROMPT),
        2,
        "same player asked again: {out}"
    );
    assert_eq!(count(&out, NORTH_PROMPT), 0, "position unchanged: {out}");
}

// Scenario: Out of range
#[test]
fn out_of_range() {
    let (_, out) = hotseat(Board::new(), "7\n0\nq\n");
    assert_eq!(count(&out, "Pits are numbered 1 to 6."), 2, "{out}");
    assert_eq!(count(&out, SOUTH_PROMPT), 3, "{out}");
    assert_eq!(count(&out, NORTH_PROMPT), 0, "{out}");
}

// Scenario: Empty pit
#[test]
fn empty_pit() {
    let (_, out) = hotseat(Board::new(), "3\n3\nq\n");
    assert!(out.contains("That pit is empty"), "{out}");
    assert_eq!(count(&out, SOUTH_PROMPT), 3, "{out}");
}

// Scenario: Quit command
#[test]
fn quit_command() {
    let (end, out) = hotseat(Board::new(), "q\n");
    assert_eq!(end, GameEnd::Abandoned);
    assert!(out.contains("Game abandoned."), "{out}");
}

// Scenario: End of input
#[test]
fn end_of_input() {
    let (end, out) = hotseat(Board::new(), "");
    assert_eq!(end, GameEnd::Abandoned);
    assert!(out.contains("Game abandoned."), "{out}");
}

// Scenario: Extra turn is reported
#[test]
fn extra_turn_is_reported() {
    let (_, out) = hotseat(Board::new(), "3\nq\n");
    assert!(out.contains("South gets another turn."), "{out}");
}

// Scenario: Capture is reported
#[test]
fn capture_is_reported() {
    // The `South captures` position from kalah-rules.
    let start = Board::from_parts([1, 0, 0, 2, 0, 0], 0, [1, 1, 1, 1, 5, 1], 0, Player::South);
    let (_, out) = hotseat(start, "1\nq\n");
    assert!(out.contains("South captured 6 seeds."), "{out}");
}

// Scenario: Hotseat view follows the player to move
#[test]
fn hotseat_view_follows_the_player_to_move() {
    let (_, out) = hotseat(Board::new(), "1\nq\n");
    // First board from South's side, the next from North's (labels line ends with the viewer).
    let south_view = "       1    2    3    4    5    6        South";
    let north_view = "       1    2    3    4    5    6        North";
    assert!(out.find(south_view) < out.find(north_view), "{out}");
    // From North's side, South's pits are on top: pit 6 down to pit 1.
    assert!(out.contains("     [ 4] [ 5] [ 5] [ 5] [ 5] [ 0]"), "{out}");
}

// Scenario: A finished game
#[test]
fn a_finished_game() {
    // South's last seed goes into their store: 26 to 22.
    let start = Board::from_parts([0, 0, 0, 0, 0, 1], 25, [0; 6], 22, Player::South);
    let (end, out) = hotseat(start, "6\n");
    assert_eq!(
        end,
        GameEnd::Finished(Status::Finished {
            winner: Some(Player::South)
        })
    );
    assert!(
        out.contains("Final score: South 26, North 22. South wins!"),
        "{out}"
    );
    assert!(out.contains("Game over"), "final position shown: {out}");
    assert!(
        !out.contains("another turn"),
        "a game-ending move gives no extra turn: {out}"
    );
    assert_eq!(
        count(&out, SOUTH_PROMPT),
        1,
        "no more moves asked for: {out}"
    );
}

// Scenario: A drawn game
#[test]
fn a_drawn_game() {
    let start = Board::from_parts([0, 0, 0, 0, 0, 1], 23, [0; 6], 24, Player::South);
    let (end, out) = hotseat(start, "6\n");
    assert_eq!(end, GameEnd::Finished(Status::Finished { winner: None }));
    assert!(out.contains("It's a draw."), "{out}");
}

// ---------- The random bot (task 5.4) ----------

/// The pit-label line under the bottom row; it ends with the viewer's name.
const SOUTH_AT_BOTTOM: &str = "       1    2    3    4    5    6        South";
const NORTH_AT_BOTTOM: &str = "       1    2    3    4    5    6        North";

// Scenario: Bot replies to a move
#[test]
fn bot_replies_to_a_move() {
    let (end, out) = play(
        Players::against_bot(Player::South),
        1,
        Board::new(),
        "1\nq\n",
    );
    assert!(out.contains("North (bot) plays pit "), "{out}");
    assert_eq!(
        count(&out, SOUTH_PROMPT),
        2,
        "South asked again after the bot: {out}"
    );
    assert_eq!(
        count(&out, NORTH_PROMPT),
        0,
        "nobody types for North: {out}"
    );
    assert_eq!(end, GameEnd::Abandoned);
}

// Scenario: Playing North puts North at the bottom
#[test]
fn playing_north_puts_north_at_the_bottom() {
    let (_, out) = play(Players::against_bot(Player::North), 1, Board::new(), "q\n");
    assert!(
        out.contains("South (bot) plays pit "),
        "the bot moves first: {out}"
    );
    assert!(out.contains(NORTH_AT_BOTTOM), "{out}");
    assert!(
        !out.contains(SOUTH_AT_BOTTOM),
        "never shown from South's side: {out}"
    );
    assert_eq!(count(&out, NORTH_PROMPT), 1, "{out}");
}

// Scenario: Repeatable with a seed
#[test]
fn repeatable_with_a_seed() {
    let script = "1\n2\n3\n4\n5\n6\n1\n2\n3\nq\n";
    let first = play(
        Players::against_bot(Player::South),
        42,
        Board::new(),
        script,
    );
    let second = play(
        Players::against_bot(Player::South),
        42,
        Board::new(),
        script,
    );
    assert_eq!(
        first, second,
        "same seed and same moves must give the same game"
    );
}

#[test]
fn bot_against_bot_always_finishes() {
    // Both sides random, no input at all: shows the bot only plays legal moves
    // (an illegal one would panic) and that games end.
    let bots = Players {
        south: Controller::RandomBot,
        north: Controller::RandomBot,
    };
    for seed in 0..50 {
        let (end, out) = play(bots, seed, Board::new(), "");
        assert!(
            matches!(end, GameEnd::Finished(_)),
            "seed {seed}: {end:?}\n{out}"
        );
        assert!(out.contains("Final score"), "seed {seed}:\n{out}");
    }
}
