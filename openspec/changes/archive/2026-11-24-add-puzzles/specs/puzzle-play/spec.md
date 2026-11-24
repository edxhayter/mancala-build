# Spec Delta

## Purpose

Lets people practise Kalah in the web page by solving puzzles one after another: find the best move in a position, with a few tries, the answer shown when they need it, and a count of how they're doing this visit.

## ADDED Requirements

### Requirement: Starting puzzles
Choosing Puzzles in the New game sheet and starting SHALL replace the current game with a puzzle, as defined by `puzzle-generation`, made from a fresh unseen seed. The header SHALL show "Puzzle · Find the best move" in place of the opponent. The board SHALL be drawn from the side of the player to move, who is named "You". While a puzzle is being prepared, the page SHALL say so and no pit SHALL be playable.

#### Scenario: Choosing puzzles
- **WHEN** the player chooses Puzzles in the New game sheet and starts
- **THEN** the header shows "Puzzle · Find the best move"
- **AND** a puzzle position is shown with the player to move along the bottom, labelled "You"
- **AND** the status line says "Find the best move" and shows "3 tries"

#### Scenario: Preparing a puzzle
- **WHEN** a puzzle has been asked for and is not ready yet
- **THEN** the status line says "Preparing a puzzle…"
- **AND** no pit can be played

### Requirement: Finding the answer
Choosing the answer pit while the puzzle is unsolved SHALL play that move with the sowing animation, mark the puzzle solved, say so on the status line, and leave no pit playable. Pits SHALL be chosen by clicking or from the keyboard, as in a game.

#### Scenario: The right move
- **GIVEN** a puzzle whose answer is pit 3 on screen
- **WHEN** the player clicks pit 3
- **THEN** the move is sown as in a game
- **AND** once it has landed the status line says "Solved!" with the move's caption (for example "You captured 5 seeds.")
- **AND** no pit can be played, and Next puzzle is offered

### Requirement: Wrong moves and tries
A puzzle SHALL allow 3 tries. A wrong pit SHALL NOT be played: the board stays as it is, the pit keeps a "wrong" mark for the rest of the puzzle and can't be chosen again, and the status line SHALL say "Not that one. Try again." with the tries left. After the third wrong pit, the answer SHALL be revealed.

#### Scenario: A wrong move
- **GIVEN** a puzzle whose answer is pit 3 on screen
- **WHEN** the player clicks pit 5
- **THEN** no seeds move
- **AND** pit 5 is marked wrong and can no longer be played
- **AND** the status line says "Not that one. Try again." and "2 tries left"

#### Scenario: Last try
- **GIVEN** a puzzle where the player has already chosen two wrong pits
- **THEN** the status line shows "1 try left"

#### Scenario: Out of tries
- **GIVEN** a puzzle where the player has already chosen two wrong pits
- **WHEN** the player chooses a third wrong pit
- **THEN** the answer is revealed, and the puzzle is not counted as solved

### Requirement: Showing the answer
While a puzzle is unsolved, Show the answer SHALL be available. Revealing the answer, whether asked for or after the third wrong pit, SHALL mark the answer pit with a glow, play its move with the sowing animation, and say "The best move was pit N." with the move's caption. Wrong marks SHALL stay visible. The puzzle SHALL then count as not solved, and no pit SHALL be playable.

#### Scenario: Asking for the answer
- **GIVEN** an unsolved puzzle whose answer is pit 2 on screen
- **WHEN** the player chooses Show the answer
- **THEN** pit 2 glows and its move is sown
- **AND** the status line says "The best move was pit 2."
- **AND** no pit can be played, and Next puzzle is offered

#### Scenario: Reveal follows the animation setting
- **GIVEN** the animation speed is instant, or the system asks for reduced motion
- **WHEN** the answer is revealed
- **THEN** the board shows the position after the answer straight away, with pit 2 still marked

### Requirement: Moving on
Next puzzle SHALL be available at any time while puzzles are shown, and SHALL replace the current puzzle with a new one from a fresh seed. A puzzle left before it was solved or revealed SHALL count as not solved. A puzzle answer arriving after the player has moved on or started a game SHALL be ignored.

#### Scenario: Skipping a puzzle
- **GIVEN** an unsolved puzzle
- **WHEN** the player chooses Next puzzle
- **THEN** a different puzzle is shown with 3 tries and no marks
- **AND** the skipped puzzle counts as played but not solved

#### Scenario: Leaving puzzles during preparation
- **GIVEN** a puzzle is being prepared
- **WHEN** the player starts a game against the computer
- **THEN** the game starts at once, and the puzzle, when it arrives, is not shown

### Requirement: The count for this visit
While puzzles are shown, the header SHALL show how many puzzles have been solved out of how many have been played this visit ("Solved 3 of 5"). A puzzle counts as played once it is solved, revealed or skipped, and as solved only if the answer was found within the 3 tries without Show the answer. The count SHALL last until the page is reloaded and SHALL NOT be saved.

#### Scenario: Counting
- **GIVEN** the player has solved one puzzle and revealed the answer to another
- **THEN** the header shows "Solved 1 of 2"

#### Scenario: A new visit starts from zero
- **WHEN** the page is reloaded and the player chooses Puzzles
- **THEN** the header shows "Solved 0 of 0"

### Requirement: The page stays responsive
Puzzles SHALL be prepared off the page's main thread, so the page keeps responding while a puzzle is being made, and the next puzzle SHALL be prepared in the background while the current one is shown.

#### Scenario: Usable while preparing
- **WHEN** a puzzle is being prepared
- **THEN** the New game and Settings controls still respond

#### Scenario: The next puzzle is ready
- **GIVEN** a puzzle has been shown long enough for the next one to be prepared
- **WHEN** the player chooses Next puzzle
- **THEN** the next puzzle is shown without "Preparing a puzzle…"
