# ai-opponent Specification

## Purpose

Defines how the computer opponent chooses its moves: always legally, at a chosen strength, in a way that can be replayed exactly, and well enough to be a real challenge.

## Requirements

### Requirement: Legal moves on either side
The AI SHALL choose only legal moves for the player to move, as defined by `kalah-rules`, and SHALL be able to play either South or North. It SHALL NOT be asked to move in a finished game.

#### Scenario: Never plays an illegal move
- **WHEN** the AI plays complete games against the random bot from both sides, at every level, with many different seeds
- **THEN** every move it chooses is in the list of legal moves for that position
- **AND** every game reaches a finished status

### Requirement: Strength levels
The AI SHALL offer three levels, easy, medium and hard, each looking a fixed number of moves ahead, with harder levels looking further. Over a series of games, a harder level SHALL win more often than it loses against an easier one.

#### Scenario: Harder beats easier
- **WHEN** hard plays a series of seeded games against easy, taking each side in half of them
- **THEN** hard wins more games than easy does

#### Scenario: Medium is a real challenge
- **WHEN** medium plays 100 seeded games against the random bot, taking each side in half of them
- **THEN** medium wins at least 90 of them

### Requirement: Sees immediate tactics
At every level, the AI SHALL prefer a move that wins the game outright, and a capture that leaves it clearly better off than any alternative, over moves that don't.

#### Scenario: Takes the big capture
- **GIVEN** the `South captures` position from `kalah-rules` (South to move, playing pit 1 captures 6 seeds), with the AI as South at the easy level
- **WHEN** the AI chooses a move
- **THEN** it plays pit 1

#### Scenario: Plays the winning move
- **GIVEN** a position where one move ends the game with the AI winning and every other move ends with the AI losing or drawing
- **WHEN** the AI chooses a move at any level
- **THEN** it plays the winning move

### Requirement: Repeatable choice among equal moves
When several moves score equally well, the AI SHALL choose one of them at random using a seed, and SHALL NOT choose a move that scores worse. Given the same position, level and seed, it SHALL choose the same move.

#### Scenario: Same seed, same move
- **GIVEN** a position, a level and a seed
- **WHEN** the AI chooses a move twice with fresh generators from that same seed
- **THEN** it chooses the same move both times

#### Scenario: Only best moves are chosen
- **GIVEN** a position in which more than one move has the best score
- **WHEN** the AI chooses a move with many different seeds
- **THEN** every choice is one of the best-scoring moves
- **AND** more than one of them is chosen across the seeds

### Requirement: Line of best play
For any position in progress and any search depth, the AI SHALL be able to report, for every legal move, the move's score (the same score it uses to choose moves) and a line of best play: the move itself followed by the moves both sides would make next, as it expects them. Replaying the line SHALL be legal, SHALL be no longer than the depth, and SHALL end in a position whose evaluation for the original mover equals the move's score.

#### Scenario: Lines agree with the scores
- **WHEN** lines are reported for many random positions at depths 1 to 6
- **THEN** each legal move appears once, with the same score as the AI's move scores for that position and depth

#### Scenario: A line proves its score
- **WHEN** a move's line is replayed from the position
- **THEN** every move in it is legal when played
- **AND** the line has at most `depth` moves, and stops early only when the game ends
- **AND** the evaluation of the final position, for the player who was to move at the start, equals the move's score

#### Scenario: Lines for a winning and a losing move
- **GIVEN** the `Plays the winning move` position (South to move: pit 5 on screen captures North's last 5 seeds and wins; pit 1 on screen loses with best play), searched 12 moves deep
- **WHEN** the lines are reported
- **THEN** the line for pit 5 is that one move, ending with South winning the game
- **AND** the line for pit 1 continues with North's replies and ends with North winning the game
