# Spec Delta

## ADDED Requirements

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
