// What the game keeps on the device (tunings, car edits, the chosen layout)
// lives in local storage under that game's own prefix: itch.io serves every
// HTML game from one origin, so games must not share keys. Each game sets its
// prefix once at boot, before anything reads storage.

let prefix = 'cc:';

/** Use this game's prefix (e.g. 'cc:') for every key from now on. */
export function useStore(gamePrefix: string): void {
  prefix = gamePrefix;
}

/** The storage key for `name` in the current game. */
export function storeKey(name: string): string {
  return prefix + name;
}
