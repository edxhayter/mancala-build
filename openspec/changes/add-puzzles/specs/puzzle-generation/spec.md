# Spec Delta

## Purpose

Defines what a puzzle is: a Kalah position, reached by legal play, in which one move is clearly better than every other, judged by the AI's deepest search. Puzzles are made from a seed, so there is an endless supply and any one can be made again exactly.

## ADDED Requirements

### Requirement: A puzzle is a real position with moves to choose from
A puzzle SHALL be a position reached by legal play from the starting position, as defined by `kalah-rules`, with the game still in progress, at least 4 moves into the game, and at least two legal moves for the player to move. Either player may be the one to move.

#### Scenario: Puzzles come from real games
- **WHEN** puzzles are made from many different seeds
- **THEN** each puzzle's position holds 48 seeds in total, the game is in progress, and the player to move has at least two legal moves
- **AND** the position can be reached from the starting position by a sequence of legal moves of length at least 4

### Requirement: One clearly best move
Each puzzle SHALL have exactly one answer: the legal move whose score, searched at the hard level's depth (12 moves), beats every other legal move's score by at least 2. Scores are from the mover's side, as defined by `ai-opponent` (store lead, with a win or loss far outweighing any lead).

#### Scenario: The answer is clearly best
- **WHEN** puzzles are made from many different seeds
- **THEN** for each one, searching every legal move 12 moves deep scores the answer at least 2 higher than any other legal move

#### Scenario: A position with a tie for best is not a puzzle
- **GIVEN** a position where two legal moves share the best score at depth 12
- **WHEN** it is checked as a possible puzzle
- **THEN** it is rejected

#### Scenario: A position where the best move is only slightly better is not a puzzle
- **GIVEN** a position where the best move scores exactly 1 more than the next best at depth 12
- **WHEN** it is checked as a possible puzzle
- **THEN** it is rejected

### Requirement: Endless and repeatable
Puzzles SHALL be made from a seed (a whole number from 0 to 4,294,967,295), every seed SHALL produce a puzzle, and the same seed SHALL always produce the same puzzle and answer. Different seeds SHALL produce a variety of positions and answers.

#### Scenario: Same seed, same puzzle
- **WHEN** a puzzle is made twice from the same seed
- **THEN** both have the same position, the same player to move and the same answer

#### Scenario: Every seed gives a puzzle
- **WHEN** puzzles are made from 200 different seeds
- **THEN** every one produces a puzzle

#### Scenario: Puzzles vary
- **WHEN** puzzles are made from 200 different seeds
- **THEN** most positions are different from each other
- **AND** the answers cover at least four different pits, and both South and North are to move in some of them
