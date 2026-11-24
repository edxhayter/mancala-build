# Spec Delta

## Purpose

Lets two people play Kalah together from different browsers: both type the same room name to meet in a room, and they play a game of `kalah-rules`, with moves checked in both browsers, recovery from dropped connections, rematches, and rooms that close once they've stood without two players for a while.

## ADDED Requirements

### Requirement: Entering a room by name
Choosing Online in the New game sheet SHALL ask for the player's name and a room name, and SHALL then enter that room. If nobody is in the room, the player SHALL wait there for someone to join. If one person is waiting there, the player SHALL join them. Before entering a room, the page SHALL say that anyone who types the same room name can join, and that playing online connects the two browsers directly, so each can see the other's network address.

#### Scenario: Opening a new room
- **WHEN** Ed chooses Online, enters the name "Ed" and the room "friday rematch", and enters
- **THEN** Ed's page shows the room name, "Waiting for someone to join", and a Copy link action
- **AND** no pit can be played

#### Scenario: Joining by typing the name
- **GIVEN** Ed is waiting in the room "friday rematch"
- **WHEN** Sam chooses Online, enters the name "Sam" and the room "Friday Rematch", and enters
- **THEN** Sam joins Ed's room, and a game starts

### Requirement: Room names
A room name SHALL be 3 to 30 characters of letters, digits, spaces and hyphens. Two names SHALL lead to the same room when they match ignoring case, leading and trailing spaces, and repeated spaces. Both players SHALL see the room name on the waiting screen and while playing, always as plain text.

#### Scenario: Names that lead to the same room
- **WHEN** the room names "Friday Rematch", "friday rematch" and "  friday   REMATCH " are entered
- **THEN** they all lead to the same room

#### Scenario: Names that aren't allowed
- **WHEN** the player enters a room name of 2 characters, more than 30 characters, or one containing other symbols such as "<" or "/"
- **THEN** they cannot enter, and the page says what a room name may contain

### Requirement: Sharing a room by link
While in a room, the page SHALL offer a link that leads to it, as a convenience. Opening the link SHALL open the Online choice with the room name filled in, and SHALL still ask for the player's name before entering.

#### Scenario: Opening a shared link
- **GIVEN** Ed is waiting in "friday rematch" and has copied the link
- **WHEN** Sam opens the link
- **THEN** Sam sees the Online choice with "friday rematch" filled in, enters the name "Sam", and joins Ed's room

### Requirement: Who plays first
When the second player enters, a game SHALL start. In a room's first game, the player who was in the room first SHALL play South and move first. If both entered at the same moment, both pages SHALL agree on one of them.

#### Scenario: A friend joins
- **GIVEN** Ed is waiting in a room
- **WHEN** Sam enters the same room
- **THEN** both pages show a new game with Ed as South and Sam as North
- **AND** Ed's page says "Your turn" and Sam's page says "Ed's turn"

#### Scenario: Entering at the same moment
- **GIVEN** an empty room
- **WHEN** Ed and Sam enter it at the same moment, before either sees the other
- **THEN** both pages agree on which of them plays South

### Requirement: Two players per room
A room SHALL hold exactly two players. Anyone else who enters its name SHALL be told that the room is in use, and SHALL NOT see or affect the game. That includes when one player has lost connection, unless the newcomer uses that player's name, in which case they SHALL take over that player's place, side and game.

#### Scenario: A third person enters the room
- **GIVEN** Ed and Sam are playing in "friday rematch"
- **WHEN** a third person enters "friday rematch"
- **THEN** their page says the room is in use and suggests choosing another name
- **AND** Ed's and Sam's game is unchanged

#### Scenario: Taking over a seat that was left behind
- **GIVEN** Sam closed the tab during a game with Ed, and Ed's page is waiting for Sam
- **WHEN** Sam enters "friday rematch" again in a new tab with the name "Sam"
- **THEN** Sam plays on as North from the same position

#### Scenario: A stranger can't take a seat
- **GIVEN** Sam has lost connection during a game with Ed
- **WHEN** someone enters "friday rematch" with the name "Alex"
- **THEN** their page says the room is in use, and Ed's page is still waiting for Sam

### Requirement: Rooms close when not full
A room SHALL close once it has had fewer than two players connected for 10 minutes in a row. The player still in it SHALL be told it has closed and offered a new game. Entering the same room name afterwards SHALL start a new, empty room. A player returning after their room closed SHALL find a new room, not the old game.

#### Scenario: Nobody comes
- **GIVEN** Ed has been waiting alone in "friday rematch"
- **WHEN** 10 minutes pass and nobody joins
- **THEN** Ed's page says the room closed because nobody joined, and offers a new game
- **AND** someone entering "friday rematch" afterwards finds an empty room

#### Scenario: The other player doesn't come back
- **GIVEN** Sam lost connection during a game with Ed
- **WHEN** 10 minutes pass without Sam reconnecting
- **THEN** Ed's page says the room closed because Sam didn't come back, and offers a new game
- **AND** if Sam enters "friday rematch" later, Sam finds a new, empty room

#### Scenario: Back in time
- **GIVEN** Sam lost connection during a game with Ed
- **WHEN** Sam reconnects after 9 minutes
- **THEN** the game carries on, and the 10 minutes start again only the next time someone is missing

### Requirement: Names
A name SHALL be 1 to 20 characters after leading and trailing spaces are removed, and SHALL be remembered on the device for next time. The page SHALL use the players' names in the header, in whose turn it is, and in move captions, and SHALL show names only as plain text.

#### Scenario: Names in the game
- **GIVEN** Ed and Sam are playing, and it is Sam's turn
- **WHEN** Sam plays a move that captures 6 seeds
- **THEN** both pages caption it "Sam plays pit N and captures 6 seeds.", where N is the pit as numbered on Sam's side
- **AND** the header shows "Ed vs Sam"

#### Scenario: A name is required
- **WHEN** the player leaves the name empty or only spaces
- **THEN** they cannot enter a room

### Requirement: Your side and your turn
Each player SHALL see the board from their own side. A player SHALL be able to play a pit only on their own turn, while nothing is animating. The other player's moves SHALL be sown with the animation, following the speed setting and reduced motion, as soon as they arrive.

#### Scenario: Waiting for the other player
- **GIVEN** an online game where it is Sam's turn
- **THEN** Ed's page shows the board from Ed's side, says it is Sam's turn, and none of Ed's pits can be played
- **WHEN** Sam plays a move
- **THEN** Ed's page sows it, and then it is the turn of whoever is to move next

### Requirement: Moves are checked in both browsers
Each browser SHALL apply a move from the other player only if it is that player's turn, the move is legal by `kalah-rules`, and it follows directly on the moves already played. Any other move SHALL be ignored, leaving the game unchanged. The two pages SHALL always show the same position once all moves have arrived.

#### Scenario: An out-of-turn move is ignored
- **GIVEN** an online game where it is Ed's turn
- **WHEN** a move for Sam arrives from Sam's browser
- **THEN** Ed's page ignores it and still shows Ed to move

#### Scenario: An illegal move is ignored
- **GIVEN** an online game where it is Sam's turn, and Sam's pit 2 is empty
- **WHEN** a move of that empty pit arrives from Sam's browser
- **THEN** Ed's page ignores it, and the position is unchanged

### Requirement: Waiting for someone who doesn't arrive
While the page waits for another player, it SHALL keep showing the room name. If nobody has joined after 30 seconds, it SHALL add that some networks block direct connections, so that if someone has already entered the same room name, trying another network (such as mobile data) may help.

#### Scenario: A slow join
- **GIVEN** Ed entered an empty room 30 seconds ago and nobody has joined
- **THEN** Ed's page still shows the room name, and adds the note about networks that block direct connections

### Requirement: A dropped connection
When the other player's connection is lost, the page SHALL say that they have lost connection and that it is waiting for them (until the room closes, as in *Rooms close when not full*), and no pit SHALL be playable. When they come back, the game SHALL carry on from the same position with the same player to move.

#### Scenario: The other player drops and returns
- **GIVEN** an online game between Ed and Sam, with Ed to move
- **WHEN** Sam's connection is lost
- **THEN** Ed's page says Sam has lost connection and is waiting, and Ed cannot play
- **WHEN** Sam reconnects
- **THEN** both pages show the same position as before, with Ed to move

### Requirement: Rejoining after a refresh
Refreshing an online game's tab, or losing the connection and getting it back, before the room closes, SHALL rejoin the same room as the same player, with the same name, side, game and chat, without asking for the name again.

#### Scenario: Refreshing mid-game
- **GIVEN** an online game after several moves, with Sam to move
- **WHEN** Sam refreshes the page
- **THEN** Sam is back in the room as North, with the same position and Sam to move
- **AND** the chat so far is still shown

### Requirement: Rematch
When an online game ends, each player SHALL be offered Rematch. Once one player has chosen it, the other SHALL be told and offered to accept. When both have chosen it, a new game SHALL start in the same room with sides swapped, so the player who moved second last game moves first. The chat SHALL carry on.

#### Scenario: Playing again with sides swapped
- **GIVEN** Ed (South) and Sam (North) have just finished a game
- **WHEN** Ed chooses Rematch
- **THEN** Sam's page says Ed wants a rematch, and Ed's page says it is waiting for Sam
- **WHEN** Sam chooses Rematch
- **THEN** a new game starts with Sam as South, moving first, and Ed as North
- **AND** the earlier chat messages are still shown

### Requirement: Match score
A room SHALL keep a match score: how many games each player has won in it, counting every finished game, including the one just finished. A draw SHALL count as a win for neither. When wins are level, whoever has the larger total seed difference SHALL lead. That total is each game's final store difference, added up across the room's games. Both players SHALL see the score once a game has finished. It SHALL last as long as the room does, and a new room SHALL start at 0–0.

#### Scenario: The score after a game
- **GIVEN** Ed and Sam's first game in a room ends with Ed on 30 and Sam on 18
- **THEN** both pages show the match score Ed 1 – 0 Sam

#### Scenario: Level wins, broken by seeds
- **GIVEN** Ed won one game by 12 seeds, and Sam won one game by 5 seeds
- **THEN** the score is Ed 1 – 1 Sam, and the page says Ed leads by 7 seeds

#### Scenario: A draw counts for neither
- **GIVEN** Ed won the first game by 4 seeds, and the second game was a draw
- **THEN** the score is Ed 1 – 0 Sam

#### Scenario: All level
- **GIVEN** each player won one game by 6 seeds
- **THEN** the score is Ed 1 – 1 Sam, and the page says the match is level

#### Scenario: The score lasts as long as the room
- **GIVEN** Ed leads Sam 2 – 1 in a room
- **WHEN** Sam refreshes the page, or they play a rematch
- **THEN** the score is still Ed 2 – 1 Sam
- **WHEN** Ed later enters a new room
- **THEN** that room's score starts at 0 – 0

### Requirement: Leaving a room
Starting any other kind of game from the New game sheet SHALL leave the room. The other player SHALL be told that the player has left, SHALL no longer be able to play in that room, and SHALL be offered a new game.

#### Scenario: Ed leaves
- **GIVEN** an online game between Ed and Sam
- **WHEN** Ed starts a game against the computer
- **THEN** Sam's page says Ed has left the room, no pit can be played, and a new game is offered
