# Spec Delta

## Purpose

Lets people play Kalah in a web browser, with the rules from `kalah-rules` and the computer opponents from `ai-opponent`, on a board that shows each move as it happens.

## ADDED Requirements

### Requirement: Starting a game
The page SHALL let the player choose an opponent (the AI at easy, medium or hard; the random bot; or hotseat), their side against a computer opponent (South or North), and optionally a seed, then start a new game. When the page first opens, a game SHALL already be ready: the player as South against the AI at medium. Starting a new game SHALL be possible at any time and SHALL abandon the current one.

#### Scenario: Ready on first visit
- **WHEN** the page is opened
- **THEN** a new game is shown with the player as South against the AI at the medium level
- **AND** South is to move

#### Scenario: Choosing a different game
- **WHEN** the player chooses hotseat and starts a new game
- **THEN** a new game begins from the starting position in which both sides are played by clicking

#### Scenario: Computer moves first when the player is North
- **WHEN** the player chooses to play North against a computer opponent and starts a new game
- **THEN** the computer plays South's first move without the player doing anything

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

### Requirement: Computer opponents in the page
The AI and the random bot SHALL play their side by themselves, moving again after an extra turn, and SHALL never freeze the page: while the AI is thinking the page SHALL show that it is thinking and SHALL stay responsive (for example, a new game can still be started). Given the same seed, level and player moves, a computer opponent SHALL make the same moves. The seed in use SHALL be shown so a game can be replayed.

#### Scenario: The AI replies
- **GIVEN** a game against the AI with the player as South
- **WHEN** South plays a move that passes the turn
- **THEN** the page shows that the AI is thinking, then shows the AI's move being sown
- **AND** the player is asked to move again once the AI's turn is over

#### Scenario: The page stays responsive
- **GIVEN** the AI at the hard level is thinking
- **WHEN** the player starts a new game
- **THEN** the new game starts without waiting for the AI to finish, and the old game's AI move is never played on the new board

#### Scenario: Replaying with a seed
- **GIVEN** two games against the AI with the same seed and level
- **WHEN** the player makes the same moves in both
- **THEN** the AI makes the same moves in both

### Requirement: Move feedback and recap
After each move the page SHALL say what happened (an extra turn, seeds captured). Before a person is asked to move after the other side's turn, the page SHALL show a recap of that whole turn, as in `terminal-play`: each pit played (1–6) with its seed count, any extra turns and captures, and that side's store before and after.

#### Scenario: Recap of the computer's turn
- **GIVEN** a game against the AI with the player as South
- **WHEN** the AI's turn ends and it is South's move
- **THEN** the page shows a recap listing each pit the AI played and its store before and after

#### Scenario: Extra turn is reported
- **GIVEN** a new hotseat game
- **WHEN** South plays pit 3
- **THEN** the page says South gets another turn

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
