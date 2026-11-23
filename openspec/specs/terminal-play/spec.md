# terminal-play Specification

## Purpose

Lets people play Kalah in a terminal, against each other at one keyboard or against a simple computer opponent, using the rules defined in `kalah-rules`.

## Requirements

### Requirement: Choosing how to play
The `mancala` program SHALL accept options for the opponent (`human` for hotseat, or `random` for the random bot), the side the human plays against the bot (`south` or `north`), and a bot seed. With no options, the human SHALL play South against the random bot. Unknown options or invalid values SHALL print an error with usage help and exit with a non-zero status, without starting a game.

#### Scenario: Defaults
- **WHEN** `mancala` is run with no options
- **THEN** a game starts with the human as South and the random bot as North

#### Scenario: Hotseat
- **WHEN** `mancala --opponent human` is run
- **THEN** a game starts in which both South and North are entered at the keyboard

#### Scenario: Playing North against the bot
- **WHEN** `mancala --side north` is run
- **THEN** the bot plays South and so makes the first move
- **AND** the human is asked for North's moves

#### Scenario: Invalid option value
- **WHEN** `mancala --opponent wizard` is run
- **THEN** an error naming the allowed values (`human`, `random`) is printed
- **AND** the program exits with a non-zero status and no game starts

### Requirement: Board display
Before each move, the program SHALL show the whole position from one player's point of view (the *viewer*): the viewer's pits along the bottom, numbered 1–6 from left to right, with the viewer's store on the right; the opponent's pits along the top, numbered 6–1 from left to right so each is above the pit opposite it, with the opponent's store on the left; and which player is to move. Against the bot the viewer SHALL be the human's side. In hotseat the viewer SHALL be the player to move.

#### Scenario: Starting position
- **WHEN** a new game starts with the human as South
- **THEN** every pit shows 4 and both stores show 0
- **AND** North's pits are along the top, labelled 6 to 1 from left to right, and South's along the bottom, labelled 1 to 6 from left to right
- **AND** the display says South is to move

#### Scenario: Position after a move
- **GIVEN** a new game against the bot with the human as South
- **WHEN** South plays pit 1
- **THEN** the bottom row shows South's pits as `0 5 5 5 5 4` from pit 1 to pit 6, the top row shows North's all as 4, and both stores show 0
- **AND** the display says North is to move

#### Scenario: Playing North puts North at the bottom
- **WHEN** a game against the bot starts with `--side north`
- **THEN** North's pits are along the bottom, labelled 1 to 6 from left to right, with North's store on the right
- **AND** South's pits are along the top, labelled 6 to 1 from left to right, with South's store on the left

#### Scenario: Hotseat view follows the player to move
- **GIVEN** a new hotseat game
- **WHEN** South plays pit 1
- **THEN** the next board is shown from North's side: North's pits along the bottom, all showing 4
- **AND** the top row shows South's pits as `4 5 5 5 5 0` from left to right (pit 6 down to pit 1)

### Requirement: Entering a move
A human SHALL enter a move as a pit number from 1 to 6 on their own side, where pit 1 is pit 0 in `kalah-rules` and pit 6 is pit 5. The prompt SHALL name the player to move. Spaces around the number SHALL be ignored.

#### Scenario: A valid move is played
- **GIVEN** a new hotseat game
- **WHEN** South enters `3`
- **THEN** South's pit 3 (pit 2 in `kalah-rules`) is played
- **AND** South is asked to move again, because the move earned an extra turn

#### Scenario: Surrounding spaces are ignored
- **GIVEN** a new hotseat game
- **WHEN** South enters `  1  `
- **THEN** South's pit 1 is played

### Requirement: Invalid input is explained and asked again
When a human enters something that is not a legal move, the program SHALL say why, leave the position unchanged, and ask the same player again. The reasons SHALL distinguish: not a number, a number outside 1–6, and an empty pit.

#### Scenario: Not a number
- **WHEN** the player to move enters `banana`
- **THEN** the program says the input is not a pit number from 1 to 6
- **AND** the same player is asked again with the position unchanged

#### Scenario: Out of range
- **WHEN** the player to move enters `7`, or `0`
- **THEN** the program says pits are numbered 1 to 6
- **AND** the same player is asked again with the position unchanged

#### Scenario: Empty pit
- **GIVEN** South has played pit 3 and has an extra turn
- **WHEN** South enters `3` again
- **THEN** the program says that pit is empty
- **AND** South is asked again with the position unchanged

### Requirement: Quitting
A human SHALL be able to stop the game at any prompt by entering `q` or `quit`. Reaching the end of input SHALL do the same. Quitting SHALL print that the game was abandoned and exit with a success status.

#### Scenario: Quit command
- **WHEN** the player to move enters `q`
- **THEN** the program prints that the game was abandoned and exits with a success status

#### Scenario: End of input
- **WHEN** input ends (for example Ctrl-D) while the program is waiting for a move
- **THEN** the program prints that the game was abandoned and exits with a success status

### Requirement: Random bot opponent
The random bot SHALL play only legal moves, choosing each uniformly enough at random from the legal moves, and SHALL announce each move by pit number (1–6). When the bot earns an extra turn it SHALL move again. Given the same seed and the same human moves, the bot SHALL make the same moves. When no seed is given, the program SHALL choose one and print it so the game can be replayed.

#### Scenario: Bot replies to a move
- **GIVEN** a game against the bot with the human as South
- **WHEN** South plays a move that does not earn an extra turn
- **THEN** the bot plays a legal North move and the program prints which pit it played
- **AND** South is asked for their next move, unless the bot earned an extra turn or the game ended

#### Scenario: Repeatable with a seed
- **GIVEN** two games run with `--seed 42`
- **WHEN** the human enters the same moves in both
- **THEN** the bot makes the same moves in both games

#### Scenario: Seed is shown when not given
- **WHEN** a game against the bot starts without `--seed`
- **THEN** the program prints the seed it chose

### Requirement: Move feedback
After every move, by a human or the bot, the program SHALL report an extra turn when one was earned, and the number of seeds captured when a capture happened.

#### Scenario: Extra turn is reported
- **GIVEN** a new hotseat game
- **WHEN** South enters `3`
- **THEN** the program reports that South gets another turn

#### Scenario: Capture is reported
- **GIVEN** a position where South playing pit 1 captures 6 seeds (the `South captures` scenario in `kalah-rules`)
- **WHEN** South enters `1`
- **THEN** the program reports that South captured 6 seeds

### Requirement: Recap of the opponent's turn
Before a human is asked to move, if the other player has moved since that human last moved, the program SHALL print a recap of the other player's whole turn: each pit played (1–6) and how many seeds it held, any extra turn or capture, and that player's store before and after the turn. When the game ends on the bot's turn, the recap SHALL be shown before the result. A human SHALL NOT be shown a recap of their own turn.

#### Scenario: Recap after the bot's turn
- **GIVEN** a game against the bot with the human as South
- **WHEN** South plays a move that ends South's turn, and the bot then takes its turn
- **THEN** before South is asked to move again, a recap lists every pit the bot played with its seed count
- **AND** the recap shows North's store before and after the bot's turn

#### Scenario: Recap covers a whole turn with extra turns
- **GIVEN** a new hotseat game
- **WHEN** South plays pit 3 (earning an extra turn) and then pit 1
- **THEN** before North is asked to move, the recap lists South playing pit 3 with 4 seeds and an extra turn, then pit 1 with 4 seeds
- **AND** it shows South's store going from 0 to 1

#### Scenario: No recap of your own turn against the bot
- **GIVEN** a game against the bot with the human as South
- **WHEN** South plays a move that ends South's turn
- **THEN** no recap of South's own moves is printed

#### Scenario: Recap when the bot ends the game
- **GIVEN** a game against the bot in which the bot's next move ends the game
- **WHEN** the bot plays that move
- **THEN** the recap of the bot's turn is printed before the final scores and result

### Requirement: End of game
When the game ends, the program SHALL show the final position, both players' scores (their store totals), and the result: the winner, or a draw. The final position SHALL be shown from the human's side against the bot, and from South's side in hotseat. The program SHALL then exit with a success status without asking for another move.

#### Scenario: A finished game
- **GIVEN** a game in progress
- **WHEN** a move ends the game with South on 26 and North on 22
- **THEN** the final position is shown
- **AND** the program prints the scores and that South wins
- **AND** the program exits with a success status

#### Scenario: A drawn game
- **WHEN** a game ends with both stores on 24
- **THEN** the program prints that the game is a draw
