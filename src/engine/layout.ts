// Sizes the game screen.
//
// The screen is always GAME_WIDTH game pixels wide and fills the column's width
// edge to edge (the HD-2D renderer draws the 3D scene at its own resolution and
// scales smoothly, so it doesn't need whole device pixels per game pixel). On a
// phone it fills the column's height too, top to bottom, and the control deck
// floats over its lower part with no panel behind it (fitHandheld). Only on a
// screen too short for MIN at full width does the game narrow, leaving side
// borders. (fitScreen is the older fit, the screen above a deck of its own.)
//
// In the desktop layout (the player switches to it; it's never automatic) the
// screen fills the window instead: a fixed DESKTOP_GAME_HEIGHT tall, as wide as the window
// allows up to 16:9 (never narrower than the phone's GAME_WIDTH), and the
// deck becomes a HUD over it. Phones keep the portrait layout above.

export const GAME_WIDTH = 195;
export const MIN_GAME_HEIGHT = 216;
export const MAX_GAME_HEIGHT = 300;
/** Smallest deck (status strip + thumbstick/buttons + Start/Select) that stays comfortable. */
export const MIN_DECK_HEIGHT = 220;
/** Widest the handheld column gets on tablets/desktop. */
export const MAX_APP_WIDTH = 430;

/** Desktop: the game's height in game pixels (the phone's tallest), and the widest it gets. */
export const DESKTOP_GAME_HEIGHT = MAX_GAME_HEIGHT;
export const MAX_DESKTOP_ASPECT = 16 / 9;

export interface ScreenFit {
  /** CSS pixels per game pixel. */
  scale: number;
  /** Game width in game pixels (GAME_WIDTH on a phone, wider on a desktop). */
  width: number;
  /** Game height in game pixels. */
  height: number;
  /** the desktop layout: a wide screen with the HUD over it and no touch deck */
  desktop: boolean;
}

/** Tallest the phone's screen gets (game pixels): a tall phone, or a tablet held upright. */
export const MAX_HANDHELD_HEIGHT = 540;

/** The phone: the screen fills the column, edge to edge and top to bottom (the deck is laid over it). */
export function fitHandheld(availWidth: number, availHeight: number): ScreenFit {
  let scale = availWidth / GAME_WIDTH;
  if (availHeight / scale < MIN_GAME_HEIGHT) scale = Math.max(availHeight, 1) / MIN_GAME_HEIGHT;
  // (rounded up: no sliver of the page left showing under it)
  const height = Math.max(MIN_GAME_HEIGHT, Math.min(MAX_HANDHELD_HEIGHT, Math.ceil(availHeight / scale)));
  return { scale, width: GAME_WIDTH, height, desktop: false };
}

export function fitScreen(availWidth: number, availHeight: number): ScreenFit {
  let scale = availWidth / GAME_WIDTH;
  // too short to show the minimum height at full width: shrink to fit it
  if (availHeight / scale < MIN_GAME_HEIGHT) scale = Math.max(availHeight, 1) / MIN_GAME_HEIGHT;
  const height = Math.max(MIN_GAME_HEIGHT, Math.min(MAX_GAME_HEIGHT, Math.floor(availHeight / scale)));
  return { scale, width: GAME_WIDTH, height, desktop: false };
}

/** The desktop screen: fills the window's height, and its width up to 16:9. */
export function fitDesktop(availWidth: number, availHeight: number): ScreenFit {
  const height = DESKTOP_GAME_HEIGHT;
  let scale = Math.max(availHeight, 1) / height;
  // a window narrower than the phone's screen at that scale: shrink to fit the width
  if (availWidth < GAME_WIDTH * scale) scale = Math.max(availWidth, 1) / GAME_WIDTH;
  const width = Math.max(GAME_WIDTH, Math.min(Math.floor(height * MAX_DESKTOP_ASPECT), Math.floor(availWidth / scale)));
  return { scale, width, height, desktop: true };
}

export type LayoutMode = 'handheld' | 'desktop';

/**
 * The layout to start in: always the handheld one, unless the player switched
 * to desktop (their choice is saved) or the address forces it (?desktop or
 * ?mobile, for testing). It never switches by itself.
 */
export function startLayout(search: string, saved: string | null): LayoutMode {
  const params = new URLSearchParams(search);
  if (params.has('desktop')) return 'desktop';
  if (params.has('mobile')) return 'handheld';
  return saved === 'desktop' ? 'desktop' : 'handheld';
}

/** Offer the switch only with a mouse or trackpad: the desktop layout has no touch deck. */
export function canSwitchLayout(win: Window = window): boolean {
  return win.matchMedia?.('(any-hover: hover) and (any-pointer: fine)').matches ?? false;
}

export function measureFit(mode: LayoutMode, win: Window = window): ScreenFit {
  if (mode === 'desktop') return fitDesktop(win.innerWidth, win.innerHeight);
  const width = Math.min(win.innerWidth, MAX_APP_WIDTH);
  return fitHandheld(width, win.innerHeight);
}
