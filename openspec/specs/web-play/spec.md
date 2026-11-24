# web-play Specification

## Purpose

Lets people play Kalah in a web browser, with the rules from `kalah-rules` and the computer opponents from `ai-opponent`, on a board that shows each move as it happens.

## Requirements

### Requirement: Starting a game
The page SHALL offer a New game choice of Computer (the AI at easy, medium or hard), Two players taking turns on this device, or Puzzles (as defined by `puzzle-play`), and, against the computer, whether the player moves first or second. Online play SHALL be listed as coming later and SHALL NOT be selectable. On first opening, a game SHALL be ready with the player moving first against the AI at medium. A new game SHALL be possible at any time and SHALL abandon the current one.

#### Scenario: Ready on first visit
- **WHEN** the page is opened
- **THEN** a new game is shown with the player as South, moving first, against the AI at the medium level
- **AND** South is to move

#### Scenario: Choosing a different game
- **WHEN** the player chooses Two players and starts a new game
- **THEN** a new game begins from the starting position in which both sides are played by clicking (hotseat)

#### Scenario: Computer moves first when the player moves second
- **WHEN** the player chooses to move second against the computer and starts a new game
- **THEN** the computer plays South's first move without the player doing anything, and the player plays North

#### Scenario: Modes that are not available yet
- **WHEN** the New game choices are shown
- **THEN** Online is listed as coming later
- **AND** it cannot be selected

#### Scenario: Puzzles can be chosen
- **WHEN** the New game choices are shown
- **THEN** Puzzles can be selected, and choosing it hides the computer level and move-order choices

### Requirement: Board from the viewer's side
The board SHALL show all twelve pits and both stores with their seed counts, from one player's side as in `terminal-play`: the viewer's pits along the bottom numbered 1–6 left to right with their store on the right, and the opponent's pits along the top, each above the pit opposite it. Against a computer the viewer SHALL be the player. In hotseat it SHALL be the player to move. The page SHALL say whose turn it is.

#### Scenario: Starting position
- **WHEN** a new game against a computer starts with the player as South
- **THEN** South's pits are along the bottom labelled 1 to 6, each showing 4, with South's store on the right showing 0
- **AND** North's pits are along the top, each showing 4, with North's store on the left
- **AND** the page says it is South's turn

#### Scenario: Playing North
- **WHEN** a game against a computer starts with the player as North
- **THEN** North's pits are along the bottom labelled 1 to 6, with North's store on the right

#### Scenario: Hotseat turns to the player to move
- **GIVEN** a new hotseat game
- **WHEN** South plays a move that passes the turn to North
- **THEN** once the move has finished, the board is shown from North's side

### Requirement: Seeds drawn and counted
Each pit and store SHALL show its seeds drawn individually, as well as the number of seeds. The two stores SHALL sit at the ends of the board, with the viewer's store on the right.

#### Scenario: Seeds in the starting position
- **WHEN** a new game starts
- **THEN** each of the twelve pits shows four individual seeds and the number 4
- **AND** both stores are empty and show 0

#### Scenario: Seeds stay put between moves
- **GIVEN** a position on screen
- **WHEN** the page redraws it without any move being played
- **THEN** every seed is drawn in the same place as before

### Requirement: Making a move
When it is a person's turn, they SHALL play by clicking (or tapping, or selecting with the keyboard) one of their own pits that holds seeds. Empty pits, the opponent's pits and the stores SHALL NOT be playable. No pit SHALL be playable while a move is being shown, while the computer is thinking, or once the game is over.

#### Scenario: Playing a pit
- **GIVEN** a new game with the player as South, and South to move
- **WHEN** the player clicks their pit 3
- **THEN** South's pit 3 is played, and the board ends in the position `kalah-rules` gives for that move

#### Scenario: Empty and opposing pits can't be played
- **GIVEN** it is South's turn and South's pit 3 is empty
- **THEN** South's pit 3 and all of North's pits cannot be played
- **AND** clicking them changes nothing

#### Scenario: Keyboard play
- **WHEN** the player moves keyboard focus to one of their playable pits and presses Enter or Space
- **THEN** that pit is played

### Requirement: Sowing animation
After every move by anyone, the page SHALL show the sowing one seed at a time: the chosen pit empties, and a seed is added to each following pit or store in sowing order, skipping the opponent's store. A capture and the end-of-game sweep SHALL then be shown moving seeds into the stores. When the animation ends, the board SHALL match the position from `kalah-rules`. If the player's system asks for reduced motion, moves SHALL appear at once without animation.

#### Scenario: Seeds travel pit to pit
- **GIVEN** a new game with the player as South
- **WHEN** South plays pit 1
- **THEN** South's pit 1 is shown emptying, then South's pits 2, 3, 4 and 5 each gain one seed, one after another
- **AND** the final board shows South's pits as 0 5 5 5 5 4

#### Scenario: The opponent's store is skipped
- **GIVEN** the `kalah-rules` position where sowing passes the opponent's store
- **WHEN** that move is shown
- **THEN** no seed is ever shown entering the opponent's store

#### Scenario: A capture is shown
- **GIVEN** the `kalah-rules` `South captures` position, with South to move
- **WHEN** South plays pit 1
- **THEN** after the sowing, the capturing seed and the seeds in the opposite pit are shown moving into South's store

#### Scenario: Reduced motion
- **GIVEN** the player's system is set to reduce motion
- **WHEN** any move is played
- **THEN** the board changes straight to the new position

### Requirement: Animation speed
The player SHALL be able to choose the animation speed: slow, normal or instant. Instant SHALL show each move's result at once. The chosen speed SHALL be remembered the next time the page is opened in the same browser.

#### Scenario: Choosing the speed
- **GIVEN** the animation speed is set to instant
- **WHEN** any move is played
- **THEN** the board changes straight to the new position
- **AND** when the speed is then set to slow, each seed of the next move takes visibly longer to arrive than at normal speed

#### Scenario: Speed is remembered
- **GIVEN** the player has chosen slow
- **WHEN** the page is closed and opened again in the same browser
- **THEN** the speed is still slow

### Requirement: The AI in the page
The AI SHALL play its side by itself, moving again after an extra turn, and SHALL never freeze the page: while it is thinking the page SHALL show that it is thinking and SHALL stay responsive (for example, a new game can still be started). How it breaks ties between equally good moves SHALL be seeded per game, and the seed SHALL NOT be shown to the player.

#### Scenario: The AI replies
- **GIVEN** a game against the AI with the player moving first
- **WHEN** South plays a move that passes the turn
- **THEN** the page shows that the AI is thinking, then shows the AI's move being sown
- **AND** the player is asked to move again once the AI's turn is over

#### Scenario: The page stays responsive
- **GIVEN** the AI at the hard level is thinking
- **WHEN** the player starts a new game
- **THEN** the new game starts without waiting for the AI to finish, and the old game's AI move is never played on the new board

### Requirement: Move announcements
After each move, the page SHALL announce an extra turn, or a capture with the number of seeds, in a short caption beside the turn indicator, and SHALL announce the same text to assistive technology. It SHALL NOT show a turn-by-turn recap: the sowing animation shows what happened.

#### Scenario: Extra turn is reported
- **GIVEN** a new hotseat game
- **WHEN** South plays pit 3
- **THEN** a short caption says South gets another turn, and the same text is announced to screen readers

#### Scenario: A capture is reported
- **GIVEN** the `kalah-rules` `South captures` position, with South to move
- **WHEN** South plays pit 1
- **THEN** a short caption says South captured 6 seeds

#### Scenario: No recap
- **GIVEN** a game against the AI
- **WHEN** the AI's turn ends with several moves
- **THEN** no list of the AI's moves is shown; the player sees them through the sowing animation

### Requirement: Playing on a phone
On a phone-sized screen held upright, the page SHALL ask the player to turn the phone sideways instead of showing the board. Held sideways, it SHALL show the whole board from the viewer's side, as on a larger screen, with every playable pit large enough to tap comfortably.

#### Scenario: Phone held upright
- **WHEN** the page is opened on a phone held upright
- **THEN** it shows a message asking the player to turn the phone sideways, and no playable board

#### Scenario: Phone held sideways
- **WHEN** the phone is turned sideways
- **THEN** the full board appears from the viewer's side with the game exactly where it was

### Requirement: End of game
When the game ends, the page SHALL show the final position, both scores, and the result (who won, or a draw), SHALL stop accepting moves, and SHALL offer to start a new game.

#### Scenario: A finished game
- **WHEN** a game ends with South on 26 and North on 22
- **THEN** the page shows the scores and that South won
- **AND** no pit can be played
- **AND** a new game can be started

### Requirement: Published site
The site SHALL be built from the repository and published to GitHub Pages automatically whenever `main` changes, and only if the Rust and web tests pass. The published page SHALL work with no server code: everything, including the AI, runs in the browser.

#### Scenario: A push to main publishes the site
- **WHEN** a change is merged into `main` and all tests pass
- **THEN** the GitHub Actions workflow builds the WebAssembly and the web app and deploys them to the repository's GitHub Pages site

#### Scenario: Failing tests block publishing
- **WHEN** a push to `main` has a failing Rust or web test
- **THEN** the workflow fails and the previously published site stays as it was
