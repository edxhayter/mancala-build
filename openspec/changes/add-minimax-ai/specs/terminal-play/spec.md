# Spec Delta

## MODIFIED Requirements

### Requirement: Choosing how to play
The `mancala` program SHALL accept options for the opponent (`human` for hotseat, `random` for the random bot, or `ai` for the AI opponent), the AI's level (`easy`, `medium` or `hard`, default `medium`), the side the human plays against a computer opponent (`south` or `north`), and a seed. With no options, the human SHALL play South against the random bot. Unknown options or invalid values SHALL print an error with usage help and exit with a non-zero status, without starting a game.

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

#### Scenario: Playing the AI
- **WHEN** `mancala --opponent ai` is run
- **THEN** a game starts with the human as South and the AI at the medium level as North

#### Scenario: Choosing the AI's level
- **WHEN** `mancala --opponent ai --level hard` is run
- **THEN** the AI plays at the hard level

#### Scenario: Invalid option value
- **WHEN** `mancala --opponent wizard` is run
- **THEN** an error naming the allowed values (`human`, `random`, `ai`) is printed
- **AND** the program exits with a non-zero status and no game starts

#### Scenario: Invalid level
- **WHEN** `mancala --opponent ai --level impossible` is run
- **THEN** an error naming the allowed levels (`easy`, `medium`, `hard`) is printed
- **AND** the program exits with a non-zero status and no game starts

## ADDED Requirements

### Requirement: AI opponent in the terminal
Everything this spec says about "the bot" (the side the human plays, the board view, announcing each move by pit number, moving again after an extra turn, the turn recap, and choosing and printing a seed) SHALL apply equally to the AI opponent. Its move announcements SHALL say it is the AI and name its level. The `--level` option SHALL have no effect unless the opponent is `ai`.

#### Scenario: The AI announces its moves
- **GIVEN** a game against the AI at the hard level with the human as South
- **WHEN** the AI takes its turn
- **THEN** each move is announced with North's name, that it is the AI at the hard level, and the pit played (1–6)

#### Scenario: Recap of the AI's turn
- **GIVEN** a game against the AI with the human as South
- **WHEN** the AI's turn ends and South is about to move
- **THEN** a recap of the AI's whole turn is printed before South is asked to move

#### Scenario: Replaying a game against the AI
- **GIVEN** two games against the AI run with `--seed 42` and the same level
- **WHEN** the human enters the same moves in both
- **THEN** the AI makes the same moves in both games
