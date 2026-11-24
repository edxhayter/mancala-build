# Spec Delta

## MODIFIED Requirements

### Requirement: Starting a game
The page SHALL offer a New game choice of Computer (the AI at easy, medium or hard), Two players taking turns on this device, Online against a friend in another browser (as defined by `online-play`), or Puzzles (as defined by `puzzle-play`), and, against the computer, whether the player moves first or second. On first opening, a game SHALL be ready with the player moving first against the AI at medium. A new game SHALL be possible at any time and SHALL abandon the current one.

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
- **THEN** no mode is listed as coming later, and every mode can be selected

#### Scenario: Online can be chosen
- **WHEN** the New game choices are shown
- **THEN** Online can be selected, and choosing it hides the computer level and move-order choices and asks for the player's name and a room name

#### Scenario: Puzzles can be chosen
- **WHEN** the New game choices are shown
- **THEN** Puzzles can be selected, and choosing it hides the computer level and move-order choices
