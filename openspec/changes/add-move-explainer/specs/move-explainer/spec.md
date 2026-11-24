# Spec Delta

## Purpose

Explains moves in the web page: how every legal move turns out when both sides play their best, and the line of play behind each result. Used after a puzzle ends and, on request, on the player's turn against the computer.

## ADDED Requirements

### Requirement: Every move's result in words
The explainer SHALL list every legal pit for the player to move, best first. Each pit SHALL show its number as on screen, what the move does at once (an extra turn, a capture of N seeds, or nothing), and its result after best play, searched 12 moves deep, from the mover's side: "you win the game", "you lose the game", "a draw", "level", "you're N seeds ahead" or "you're N seeds behind". Every pit with the best score SHALL be starred.

#### Scenario: Best first, in words
- **GIVEN** a position where pit 3 on screen gives an extra turn and leads to being 4 seeds ahead, and pit 6 leads to losing the game
- **WHEN** the explainer is shown
- **THEN** pit 3 is listed before pit 6, starred, with "extra turn" and "you're 4 seeds ahead"
- **AND** pit 6 shows "you lose the game"

#### Scenario: Equal best moves
- **GIVEN** a position where two pits share the best score
- **WHEN** the explainer is shown
- **THEN** both are starred

### Requirement: Replaying a line
Each listed pit SHALL offer Show why. Show why SHALL close the list and replay that pit's line of best play on the board, as defined by `ai-opponent`, from the position being explained. The board SHALL stay drawn from the explained player's side. Each move SHALL be sown with the animation (following the speed setting and reduced motion) and captioned with who played which pit (as numbered on screen for that player) and what happened.

#### Scenario: Stepping through a line
- **GIVEN** the explainer for a position, and a pit whose line is 3 moves long
- **WHEN** the player chooses Show why for that pit
- **THEN** the first move is sown and captioned, for example "You play pit 5."
- **AND** Next move sows the second move, captioned for example "Opponent plays pit 2 and captures 6 seeds."
- **AND** after the last move, the result in words is shown again and Next move is no longer offered

#### Scenario: Back from a replay
- **WHEN** the player chooses Back during a replay
- **THEN** the board shows the explained position again, and the list of pits is shown

### Requirement: Explaining a finished puzzle
Once a puzzle, as defined by `puzzle-play`, is solved or revealed, a Why? action SHALL open the explainer for the puzzle's position. It SHALL NOT be offered while the puzzle is being solved. The explanation SHALL be ready when the puzzle ends, without a wait. Closing the explainer SHALL return to the finished puzzle as it was, and Next puzzle SHALL still work.

#### Scenario: Why after solving
- **GIVEN** a puzzle that has just been solved
- **WHEN** the player chooses Why?
- **THEN** the explainer lists the puzzle's pits, with the answer starred and first

#### Scenario: No explanation while solving
- **GIVEN** a puzzle with tries left
- **THEN** Why? is not offered, including after a wrong pit

### Requirement: Analyzing a game against the computer
In a game against the computer, on the player's turn, an Analyze action SHALL open the explainer for the current position. While the analysis is being worked out, the page SHALL say "Analyzing…" and keep responding. Analyzing SHALL NOT change the game: closing the explainer SHALL return to the same position with the same player to move.

#### Scenario: Analyze on your turn
- **GIVEN** a game against the computer, with the player to move
- **WHEN** the player chooses Analyze
- **THEN** "Analyzing…" is shown, then the explainer lists the player's legal pits with the best starred
- **AND** closing it shows the same position, with the player still to move and no move played

### Requirement: When analysis is offered
Analyze SHALL be offered only in a game against the computer, on the player's turn, while nothing is animating and the game is in progress. An analysis that arrives after a new game has started, or after the position has changed, SHALL be ignored.

#### Scenario: Not on the computer's turn
- **GIVEN** a game against the computer, while the computer is thinking or a move is animating
- **THEN** Analyze is not offered

#### Scenario: Not in two-player games
- **GIVEN** a two-player game
- **THEN** Analyze is not offered

#### Scenario: A late analysis is ignored
- **GIVEN** an analysis has been asked for and has not arrived
- **WHEN** the player starts a new game
- **THEN** the new game starts at once, and the analysis, when it arrives, is not shown
