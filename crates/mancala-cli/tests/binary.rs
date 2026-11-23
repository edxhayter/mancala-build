//! Runs the real `mancala` program as a separate process, the way a person would,
//! to check things only `main` controls: exit statuses and the startup seed message.

use std::io::Write;
use std::process::{Command, Output, Stdio};

/// Runs `mancala` with `args`, types `stdin`, and waits for it to finish.
fn mancala(args: &[&str], stdin: &str) -> Output {
    let mut child = Command::new(env!("CARGO_BIN_EXE_mancala"))
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("the mancala binary should start");

    // Type the input, then close stdin (dropping it) so the program sees end of input.
    // Ignore write errors: a program that exits early (bad options) never reads it.
    let mut child_stdin = child.stdin.take().expect("stdin was piped");
    let _ = child_stdin.write_all(stdin.as_bytes());
    drop(child_stdin);

    child
        .wait_with_output()
        .expect("the mancala binary should finish")
}

fn text(bytes: &[u8]) -> String {
    String::from_utf8_lossy(bytes).into_owned()
}

// Scenario: Invalid option value
#[test]
fn invalid_option_value_exits_with_an_error() {
    let out = mancala(&["--opponent", "wizard"], "");
    let stderr = text(&out.stderr);
    assert!(!out.status.success(), "should fail: {out:?}");
    assert!(
        stderr.contains("human") && stderr.contains("random"),
        "{stderr}"
    );
    assert!(
        !text(&out.stdout).contains("to move"),
        "no game should start"
    );
}

// Scenario: Defaults
#[test]
fn defaults_start_a_game_against_the_bot_as_south() {
    let out = mancala(&["--seed", "1"], "q\n");
    let stdout = text(&out.stdout);
    assert!(
        stdout.contains("South, choose a pit"),
        "the human plays South: {stdout}"
    );
}

// Scenario: Quit command (exit status)
#[test]
fn quitting_exits_successfully() {
    let out = mancala(&["--opponent", "human"], "q\n");
    assert!(out.status.success(), "{out:?}");
    assert!(text(&out.stdout).contains("Game abandoned."));
}

// Scenario: End of input (exit status)
#[test]
fn end_of_input_exits_successfully() {
    let out = mancala(&["--opponent", "human"], "");
    assert!(out.status.success(), "{out:?}");
    assert!(text(&out.stdout).contains("Game abandoned."));
}

// Scenario: Seed is shown when not given
#[test]
fn seed_is_shown_when_not_given() {
    let out = mancala(&[], "q\n");
    assert!(
        text(&out.stdout).contains("Bot seed: "),
        "{}",
        text(&out.stdout)
    );
}

#[test]
fn hotseat_has_no_seed_to_show() {
    let out = mancala(&["--opponent", "human"], "q\n");
    assert!(!text(&out.stdout).contains("Bot seed"));
}
