// Where the game runs: a web page or the Android app, or YouTube Playables (the
// build with VITE_STORE=youtube). Everything the game asks of its host goes
// through here, so the YouTube build keeps Playables' rules: saves only through
// the Playables SDK (kept in the player's YouTube account, never the browser's
// storage), pausing only when YouTube says so (never the page's visibility),
// and the sound off while YouTube has it off. On the web and in the app it's
// the browser's storage and the page's visibility, as ever.
//
// The SDK (`ytgame`, loaded by the YouTube build's index.html before the game)
// is reached only through here; outside YouTube (the YouTube build previewed
// in a browser) it's missing, and the game runs on with its save in memory.

/** The YouTube Playables build. */
export const YOUTUBE: boolean = import.meta.env.VITE_STORE === 'youtube';

/** The storage the save is kept in, as far as the game uses it. */
export interface HostStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** The Playables SDK, as far as the game uses it (developers.google.com/youtube/gaming/playables/reference/sdk). */
interface YtGame {
  game: {
    firstFrameReady(): void;
    gameReady(): void;
    loadData(): Promise<string>;
    saveData(data: string): Promise<void>;
  };
  system: {
    onPause(cb: () => void): void;
    onResume(cb: () => void): void;
    isAudioEnabled(): boolean;
    onAudioEnabledChange(cb: (enabled: boolean) => void): void;
  };
}
const sdk = (): YtGame | undefined => (YOUTUBE ? (globalThis as { ytgame?: YtGame }).ytgame : undefined);

// ---------------------------------------------------------------- the save

/** ms after a change before the YouTube save goes (changes in a burst go together) */
export const CLOUD_SAVE_MS = 1500;

/**
 * The YouTube build's storage: the keys in memory, loaded from the player's YouTube save when the game starts, and
 * the lot sent back a moment after each change (and at once when YouTube pauses the game).
 */
export class CloudStore implements HostStore {
  private readonly items = new Map<string, string>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(private readonly send: (data: string) => void, private readonly wait = CLOUD_SAVE_MS) {}
  /** Take the keys from a YouTube save (as `serialise` made it); a save that isn't one is ignored. */
  load(data: string | null | undefined): void {
    if (!data) return;
    try {
      const kept = JSON.parse(data) as unknown;
      if (!kept || typeof kept !== 'object') return;
      for (const [k, v] of Object.entries(kept as Record<string, unknown>)) if (typeof v === 'string') this.items.set(k, v);
    } catch {
      // (not a save of ours: start afresh)
    }
  }
  serialise(): string {
    return JSON.stringify(Object.fromEntries(this.items));
  }
  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    if (this.items.get(key) === value) return;
    this.items.set(key, value);
    this.later();
  }
  removeItem(key: string): void {
    if (this.items.delete(key)) this.later();
  }
  /** Send it now (if there's anything waiting). */
  flush(): void {
    if (this.timer === undefined) return;
    clearTimeout(this.timer);
    this.timer = undefined;
    this.send(this.serialise());
  }
  private later(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.send(this.serialise());
    }, this.wait);
  }
}

let cloud: CloudStore | undefined;

/** The storage the game keeps things in: the browser's, or the YouTube build's save; undefined without either. */
export const hostStore: () => HostStore | undefined = YOUTUBE
  ? () => cloud
  : () => {
      try {
        return globalThis.localStorage ?? undefined;
      } catch {
        // (storage turned off)
        return undefined;
      }
    };

/**
 * Get the host ready before the game starts: in the YouTube build, the player's save loaded from YouTube (so the
 * game starts on it) and YouTube's pause, resume and sound hooked up. Elsewhere, nothing to wait for.
 */
export async function prepareHost(): Promise<void> {
  if (!YOUTUBE) return;
  const yt = sdk();
  cloud = new CloudStore((data) => void yt?.game.saveData(data).catch(() => {}));
  if (!yt) return;
  try {
    cloud.load(await yt.game.loadData());
  } catch {
    // (no save yet, or YouTube couldn't give it: start afresh)
  }
  yt.system.onPause(() => {
    cloud?.flush();
    setHidden(true);
  });
  yt.system.onResume(() => setHidden(false));
  try {
    soundOn = yt.system.isAudioEnabled();
  } catch {
    soundOn = true;
  }
  yt.system.onAudioEnabledChange((on) => {
    soundOn = on;
    for (const cb of soundWatchers) cb(on);
  });
}

// ---------------------------------------------------------------- hidden or showing

let hidden = false;
const hiddenWatchers = new Set<(hidden: boolean) => void>();
const setHidden = (h: boolean) => {
  if (h === hidden) return;
  hidden = h;
  for (const cb of hiddenWatchers) cb(h);
};
let watchingPage = false;

/** Whether the game's out of sight now (another tab, the app in the background, or YouTube's paused it). */
export function gameHidden(): boolean {
  watchPage();
  return hidden;
}

/** Call `cb` as the game goes out of sight (true) and comes back (false). Gives back a function that stops it. */
export function onHidden(cb: (hidden: boolean) => void): () => void {
  watchPage();
  hiddenWatchers.add(cb);
  return () => hiddenWatchers.delete(cb);
}

/** (the web and the app: the page's visibility; none of it in the YouTube build, where only YouTube pauses the game) */
const watchPage: () => void = YOUTUBE
  ? () => {}
  : () => {
      if (watchingPage || typeof document === 'undefined') return;
      watchingPage = true;
      hidden = document.visibilityState === 'hidden';
      document.addEventListener('visibilitychange', () => setHidden(document.visibilityState === 'hidden'));
      // (the Android app: Capacitor's pause and resume, the app put away or covered, a Play Games or billing sheet
      // over it, which the page's visibility doesn't always say)
      document.addEventListener('pause', () => setHidden(true));
      document.addEventListener('resume', () => setHidden(document.visibilityState === 'hidden'));
    };

// ---------------------------------------------------------------- sound

let soundOn = true;
const soundWatchers = new Set<(on: boolean) => void>();
/** Whether the host lets the game make sound (YouTube's own sound switch; always elsewhere). */
export const hostSound = (): boolean => soundOn;
/** Call `cb` when the host turns the sound on or off. */
export function onHostSound(cb: (on: boolean) => void): void {
  soundWatchers.add(cb);
}

// ---------------------------------------------------------------- the game's progress, to YouTube

/** The first frame's drawn (YouTube takes its loading screen down). */
export function firstFrameReady(): void {
  try {
    sdk()?.game.firstFrameReady();
  } catch {
    // (outside YouTube: nothing to tell)
  }
}

/** The game can be played (YouTube starts counting the player's time in it). */
export function gameReady(): void {
  try {
    sdk()?.game.gameReady();
  } catch {
    // (outside YouTube: nothing to tell)
  }
}
