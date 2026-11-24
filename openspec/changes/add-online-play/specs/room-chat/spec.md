# Spec Delta

## Purpose

Lets the two players in an online room, as defined by `online-play`, send each other short text messages while they play. Messages go only to the other player and last only as long as the tab.

## ADDED Requirements

### Requirement: Sending messages
In an online room, a chat panel SHALL let a player type a message of up to 300 characters and send it with a Send button or the Enter key. Sending SHALL be possible only while the other player is connected. A message that is empty or only spaces SHALL NOT be sent. Sent messages SHALL appear in both players' chats, in the order they were sent, each with its sender's name.

#### Scenario: Chatting
- **GIVEN** Ed and Sam are in a room, both connected
- **WHEN** Ed sends "good luck" and then Sam sends "you too"
- **THEN** both chats show "Ed: good luck" followed by "Sam: you too"

#### Scenario: Empty messages and long messages
- **WHEN** the player tries to send a message of only spaces
- **THEN** nothing is sent
- **AND** the message box accepts no more than 300 characters

#### Scenario: Nobody to talk to
- **GIVEN** the other player has lost connection, or has not joined yet
- **THEN** Send is unavailable, and the chat says the other player isn't connected

### Requirement: Messages as plain text
Messages and names SHALL be shown exactly as typed, as plain text: never as formatting, links or page markup. A message from the other browser that is longer than 300 characters or not text SHALL be ignored.

#### Scenario: Markup is shown as typed
- **WHEN** Sam sends `<b>hi</b> https://example.com`
- **THEN** Ed's chat shows those exact characters, with no bold text and no link

#### Scenario: A bad message is ignored
- **WHEN** a chat message of 1,000 characters arrives from the other browser
- **THEN** it is not shown

### Requirement: Unread badge
While the chat panel is closed, the page SHALL count messages that arrive from the other player and SHALL show the count on the control that opens the chat, and SHALL announce each new message to screen readers. Opening the chat SHALL clear the count. The player's own messages SHALL NOT be counted.

#### Scenario: Messages while the chat is closed
- **GIVEN** Ed's chat panel is closed
- **WHEN** Sam sends two messages
- **THEN** Ed's chat control shows 2
- **WHEN** Ed opens the chat
- **THEN** both messages are shown, and the count is gone

#### Scenario: Messages while the chat is open
- **GIVEN** Ed's chat panel is open
- **WHEN** Sam sends a message
- **THEN** it is shown, and no count appears

### Requirement: Chat lasts as long as the tab
The chat SHALL last for the whole room, across rematches, refreshes and reconnections. It SHALL NOT be stored anywhere except the players' own tabs, and SHALL be gone once the player leaves the room or closes the tab. Messages SHALL be sent only to the other player in the room.

#### Scenario: Chat after leaving
- **GIVEN** Ed and Sam have chatted in a room
- **WHEN** Ed leaves the room and later starts a new online game
- **THEN** Ed's new room's chat is empty

### Requirement: Chat on a phone
On a phone held sideways, the chat SHALL open over the board, leaving the board's state unchanged, and SHALL close again with one tap, so that the board is never hidden behind a closed chat.

#### Scenario: Opening the chat on a phone
- **GIVEN** an online game on a phone held sideways
- **WHEN** the player opens the chat, reads it, and closes it
- **THEN** the board is shown again exactly as it was, and its pits can be played as before
