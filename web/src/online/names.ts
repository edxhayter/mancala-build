// The player's name for online play, remembered on this device
// (spec: Names). Wrapped like the speed setting: storage can throw.

const KEY = 'mancala.name';

export function loadPlayerName(): string {
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

export function savePlayerName(name: string): void {
  try {
    localStorage.setItem(KEY, name);
  } catch {
    // not remembered, but still used for this room
  }
}
