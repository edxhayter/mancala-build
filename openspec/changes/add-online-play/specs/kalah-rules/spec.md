# Spec Delta

## ADDED Requirements

### Requirement: Replaying a game
Given a list of pit numbers, the engine SHALL replay them in order from the starting position and return the final position. If any move cannot be played, it SHALL instead report the first such move: its place in the list (counting from 0) and why it was rejected, as for a single move. It SHALL NOT return a position in that case.

#### Scenario: A legal game
- **WHEN** the moves 2, 5, 0 are replayed
- **THEN** the result is the same position as playing pit 2, then pit 5, then pit 0 one at a time from a new game

#### Scenario: No moves
- **WHEN** an empty list is replayed
- **THEN** the result is the starting position

#### Scenario: An illegal move in the list
- **WHEN** moves are replayed in which the third move (place 2) is an empty pit
- **THEN** the result reports place 2 and an empty pit, and no position

#### Scenario: A move after the end
- **GIVEN** a list of moves that ends the game, followed by one more move
- **WHEN** it is replayed
- **THEN** the result reports the extra move's place, and that the game is already over
