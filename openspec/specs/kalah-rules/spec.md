# kalah-rules Specification

## Purpose

Defines the rules of standard Kalah as the trainer's engine enforces them: the starting position, how moves are made, extra turns, captures, the end of the game and scoring. Every game mode relies on these rules.

## Requirements

### Requirement: Board layout and numbering
The board SHALL have two players, South (who moves first) and North, each with six pits numbered 0 to 5 in their own sowing order (pit 5 next to their own store) and one store. Sowing order SHALL be South pits 0-5, South store, North pits 0-5, North store, and then round again. South pit *i* SHALL be opposite North pit *5 - i*. In this spec, positions are written `South [p0..p5] store S / North [p0..p5] store N`.

#### Scenario: Opposite pits
- **WHEN** the pit opposite South's pit 1 is found
- **THEN** it is North's pit 4
- **AND** the pit opposite North's pit 0 is South's pit 5

### Requirement: Starting position
A new game SHALL start with 4 seeds in each of the twelve pits, both stores empty, South to move and the game in progress.

#### Scenario: New game
- **WHEN** a new game is created
- **THEN** the position is `South [4,4,4,4,4,4] store 0 / North [4,4,4,4,4,4] store 0`
- **AND** South is to move
- **AND** the game status is in progress

### Requirement: Position is observable
The engine SHALL expose, for any position, the seed count in each pit and store of both players, which player is to move, and the game status, without letting callers change the position directly.

#### Scenario: Reading a position
- **WHEN** a caller asks for North's pits, North's store and the player to move of a new game
- **THEN** it receives `[4,4,4,4,4,4]`, `0` and South

### Requirement: Moves are chosen by pit number
A move SHALL be given as a pit number from 0 to 5 on the side of the player to move. The same numbering SHALL work for both players.

#### Scenario: North chooses a pit by its own numbering
- **GIVEN** North is to move
- **WHEN** North plays pit 2
- **THEN** the seeds are taken from North's pit 2, not South's

### Requirement: Legal moves can be listed
The engine SHALL list the legal moves for the player to move: every pit on their side that holds at least one seed, in ascending order. When the game is over, the list SHALL be empty.

#### Scenario: Legal moves at the start
- **WHEN** legal moves are listed for a new game
- **THEN** the list is `[0,1,2,3,4,5]`

#### Scenario: Empty pits are not legal
- **GIVEN** `South [0,3,0,1,0,0] store 0 / North [1,1,1,1,1,1] store 0`, South to move
- **WHEN** legal moves are listed
- **THEN** the list is `[1,3]`

### Requirement: Sowing
Playing a pit SHALL remove all its seeds and drop them one at a time into the following pits and stores in sowing order. The mover's own store is included and the opponent's store is skipped.

#### Scenario: Simple sow from the start
- **GIVEN** a new game
- **WHEN** South plays pit 0
- **THEN** the position is `South [0,5,5,5,5,4] store 0 / North [4,4,4,4,4,4] store 0`
- **AND** North is to move

#### Scenario: Sowing crosses onto the opponent's side
- **GIVEN** a new game
- **WHEN** South plays pit 5
- **THEN** the position is `South [4,4,4,4,4,0] store 1 / North [5,5,5,4,4,4] store 0`
- **AND** North is to move

#### Scenario: Opponent's store is skipped
- **GIVEN** `South [0,0,1,0,0,10] store 0 / North [0,0,0,0,0,0] store 0`, South to move
- **WHEN** South plays pit 5
- **THEN** the position is `South [1,1,2,0,0,0] store 1 / North [1,1,1,1,1,1] store 0`
- **AND** North's store received no seed, even though sowing passed it

#### Scenario: A lap of 13 seeds returns to the starting pit
- **GIVEN** `South [13,0,0,0,0,0] store 0 / North [1,1,1,1,1,1] store 0`, South to move
- **WHEN** South plays pit 0
- **THEN** the last seed lands in South's pit 0, which was emptied at the start of the move, and so triggers a capture
- **AND** the position is `South [0,1,1,1,1,1] store 4 / North [2,2,2,2,2,0] store 0`
- **AND** the move reports 3 seeds captured
- **AND** North is to move

### Requirement: Extra turn
When the last seed of a move lands in the mover's own store, the same player SHALL move again, unless the move ends the game.

#### Scenario: South earns an extra turn
- **GIVEN** a new game
- **WHEN** South plays pit 2
- **THEN** the position is `South [4,4,0,5,5,5] store 1 / North [4,4,4,4,4,4] store 0`
- **AND** South is to move again
- **AND** the move reports an extra turn

#### Scenario: North earns an extra turn
- **GIVEN** a new game where South has played pit 0
- **WHEN** North plays pit 2
- **THEN** North's side is `[4,4,0,5,5,5]` and North's store is 1
- **AND** North is to move again
- **AND** the move reports an extra turn

#### Scenario: No extra turn otherwise
- **GIVEN** a new game
- **WHEN** South plays pit 0
- **THEN** the move reports no extra turn

### Requirement: Capture
When the last seed lands in an empty pit on the mover's own side and the opposite pit holds at least one seed, that last seed and all seeds in the opposite pit SHALL move to the mover's store. The move SHALL report the total number of seeds moved in this way.

#### Scenario: South captures
- **GIVEN** `South [1,0,0,2,0,0] store 0 / North [1,1,1,1,5,1] store 0`, South to move
- **WHEN** South plays pit 0
- **THEN** the position is `South [0,0,0,2,0,0] store 6 / North [1,1,1,1,0,1] store 0`
- **AND** the move reports 6 seeds captured
- **AND** North is to move

#### Scenario: North captures
- **GIVEN** `South [1,1,1,1,5,1] store 0 / North [1,0,0,2,0,0] store 0`, North to move
- **WHEN** North plays pit 0
- **THEN** the position is `South [1,1,1,1,0,1] store 0 / North [0,0,0,2,0,0] store 6`
- **AND** the move reports 6 seeds captured

#### Scenario: No capture when the opposite pit is empty
- **GIVEN** `South [1,0,0,2,0,0] store 0 / North [1,1,1,1,0,1] store 0`, South to move
- **WHEN** South plays pit 0
- **THEN** the position is `South [0,1,0,2,0,0] store 0 / North [1,1,1,1,0,1] store 0`
- **AND** the move reports 0 seeds captured

#### Scenario: No capture on the opponent's side
- **GIVEN** `South [0,0,1,0,0,3] store 0 / North [2,0,2,2,2,2] store 0`, South to move
- **WHEN** South plays pit 5
- **THEN** the last seed lands in North's empty pit 1 and nothing is captured
- **AND** the position is `South [0,0,1,0,0,0] store 1 / North [3,1,2,2,2,2] store 0`

#### Scenario: No capture when landing in a non-empty own pit
- **GIVEN** a new game
- **WHEN** South plays pit 0
- **THEN** the last seed lands in South's pit 4, which already held seeds, and the move reports 0 seeds captured

### Requirement: Illegal moves are rejected
A move SHALL be rejected with a specific error, and the position left unchanged, when the pit number is outside 0 to 5, the chosen pit is empty, or the game is already over.

#### Scenario: Pit number out of range
- **GIVEN** a new game
- **WHEN** South plays pit 6
- **THEN** the move is rejected as out of range

#### Scenario: Empty pit
- **GIVEN** a new game where South has played pit 2 (and so has an extra turn)
- **WHEN** South plays pit 2 again
- **THEN** the move is rejected because the pit is empty
- **AND** the position is unchanged

#### Scenario: Game already over
- **GIVEN** a finished game
- **WHEN** any pit is played
- **THEN** the move is rejected because the game is over

### Requirement: Game end and final sweep
After any move, if either player's six pits are all empty, the game SHALL end. Every seed left in a player's pits SHALL go to that same player's store. A game-ending move SHALL NOT grant an extra turn.

#### Scenario: Mover empties their own side
- **GIVEN** `South [0,0,0,0,0,2] store 10 / North [0,1,0,0,0,3] store 10`, South to move
- **WHEN** South plays pit 5
- **THEN** the game is over
- **AND** the position is `South [0,0,0,0,0,0] store 11 / North [0,0,0,0,0,0] store 15`

#### Scenario: Mover empties the opponent's side by capturing
- **GIVEN** `South [1,0,0,3,0,0] store 0 / North [0,0,0,0,4,0] store 0`, South to move
- **WHEN** South plays pit 0
- **THEN** the game is over
- **AND** the position is `South [0,0,0,0,0,0] store 8 / North [0,0,0,0,0,0] store 0`

#### Scenario: Game-ending move into own store gives no extra turn
- **GIVEN** `South [0,0,0,0,0,1] store 5 / North [0,0,2,0,0,0] store 4`, South to move
- **WHEN** South plays pit 5
- **THEN** the game is over
- **AND** the move reports no extra turn
- **AND** the position is `South [0,0,0,0,0,0] store 6 / North [0,0,0,0,0,0] store 6`

### Requirement: Game status and result
The game status SHALL be in progress until the game ends. Then it SHALL be finished, with the winner being the player whose store holds more seeds, or a draw if the stores are equal.

#### Scenario: In progress
- **WHEN** the status of a new game is checked
- **THEN** it is in progress

#### Scenario: North wins
- **GIVEN** the finished position `South store 11 / North store 15`
- **THEN** the status is finished with North as the winner

#### Scenario: South wins
- **GIVEN** the finished position `South store 8 / North store 0`
- **THEN** the status is finished with South as the winner

#### Scenario: Draw
- **GIVEN** the finished position `South store 6 / North store 6`
- **THEN** the status is finished as a draw

### Requirement: Seeds are conserved
No move SHALL create or destroy seeds. In any game played from the starting position, the pits and stores together SHALL always hold 48 seeds, and when the game ends all 48 SHALL be in the two stores.

#### Scenario: Conservation over random games
- **WHEN** thousands of games are played from the start with randomly chosen legal moves, using a fixed seed so runs are repeatable
- **THEN** after every move the total number of seeds is 48
- **AND** every game reaches a finished status
- **AND** at the end every pit is empty

### Requirement: Playing a move does not alter the original position
Playing a move SHALL produce a new position and leave the position it was played from unchanged, so callers can explore several moves from the same position.

#### Scenario: Exploring two moves from one position
- **GIVEN** a new game
- **WHEN** pit 0 is played, and then pit 5 is played from the same original position
- **THEN** both results match the matching single-move scenarios above
- **AND** the original position still equals a new game
