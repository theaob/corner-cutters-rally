// The menu's backdrop as a still, so the menu never opens on black: the live
// race behind it takes a few seconds to load (and longer on a slow phone), so a
// picture of it is up from the menu's first frame, and the race fades in over
// it. The picture is the last one the live backdrop took on this device (kept
// in its own key: it's a cache, not part of the save), or, before there is one,
// the one shipped with the game. A device asking for reduced motion (or without
// WebGL) never gets the live race, so it keeps the still.

import { YOUTUBE, hostStore } from '../../engine/host';

/** where the device's own still is kept */
export const STILL_KEY = 'cc:menu-still';
/** the still shipped with the game (Crescent Park), for a device that hasn't had a live backdrop yet */
export const SHIPPED_STILL = 'menu-still.jpg';
/** the still's JPEG quality: it's dimmed under the menu, so a soft one does */
export const STILL_QUALITY = 0.7;

/** The device's still, or the shipped one. */
export function stillSource(): string {
  try {
    const kept = hostStore()?.getItem(STILL_KEY);
    if (kept?.startsWith('data:image/')) return kept;
  } catch {
    // (no storage: the shipped one)
  }
  return SHIPPED_STILL;
}

/** Keep `canvas` (just drawn) as the device's still, for the next time the menu opens. */
export function keepStill(canvas: HTMLCanvasElement): void {
  try {
    const image = canvas.toDataURL('image/jpeg', STILL_QUALITY);
    // (not in the YouTube build's save: it's a cache, and the save goes to YouTube)
    if (YOUTUBE) return;
    if (image.startsWith('data:image/jpeg')) hostStore()?.setItem(STILL_KEY, image);
  } catch {
    // (no storage, or full: the one before stays)
  }
}

/** Put the still behind `host`'s contents. Gives back the element (to take away once the live race is over it). */
export function showStill(host: HTMLElement): HTMLImageElement {
  const still = document.createElement('img');
  still.className = 'live-backdrop menu-still on';
  still.alt = '';
  still.setAttribute('aria-hidden', 'true');
  still.decoding = 'async';
  // (a kept still that won't load, the shipped one in its place)
  still.addEventListener('error', () => {
    if (!still.src.endsWith(SHIPPED_STILL)) still.src = SHIPPED_STILL;
  }, { once: true });
  still.src = stillSource();
  host.prepend(still);
  return still;
}
