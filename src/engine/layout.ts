// Sizes the game screen: always landscape, the wide screen across a phone held sideways (or the window), with the
// deck laid over it as a HUD and the screen's two halves the controls while you drive (deck.ts). It is a fixed
// LANDSCAPE_GAME_HEIGHT game pixels tall and as wide as the window allows, up to MAX_LANDSCAPE_ASPECT (never narrower
// than GAME_WIDTH, on a phone still held upright; the page asks for it to be turned: src/app.ts). The HD-2D renderer
// draws the 3D scene at its own resolution and scales smoothly, so it doesn't need whole device pixels per game pixel.

/** The narrowest the screen gets, in game pixels. */
export const GAME_WIDTH = 195;
/** The screen's height in game pixels. */
export const LANDSCAPE_GAME_HEIGHT = 300;
/** The widest it gets: a long phone held sideways, edge to edge. */
export const MAX_LANDSCAPE_ASPECT = 22 / 9;

export interface ScreenFit {
  /** CSS pixels per game pixel. */
  scale: number;
  /** Game width in game pixels. */
  width: number;
  /** Game height in game pixels. */
  height: number;
}

/** The screen for a window `availWidth` × `availHeight` (CSS px): its height filled, its width up to the widest. */
export function fitLandscape(availWidth: number, availHeight: number): ScreenFit {
  const height = LANDSCAPE_GAME_HEIGHT;
  let scale = Math.max(availHeight, 1) / height;
  // a window narrower than the narrowest screen at that scale (a phone held upright): shrink to fit the width
  if (availWidth < GAME_WIDTH * scale) scale = Math.max(availWidth, 1) / GAME_WIDTH;
  const width = Math.max(GAME_WIDTH, Math.min(Math.floor(height * MAX_LANDSCAPE_ASPECT), Math.floor(availWidth / scale)));
  return { scale, width, height };
}

/**
 * Whether this is a touch screen: a coarse pointer, or a screen that takes touches at all (some Android WebViews, an
 * emulator's among them, report no coarse pointer on a touch screen).
 */
export function isTouchScreen(win: Pick<Window, 'matchMedia' | 'navigator'> = window): boolean {
  return (win.matchMedia?.('(any-pointer: coarse)').matches ?? false) || (win.navigator?.maxTouchPoints ?? 0) > 0;
}

export function measureFit(win: Window = window): ScreenFit {
  return fitLandscape(win.innerWidth, win.innerHeight);
}
