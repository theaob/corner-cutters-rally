// The phone's back button (in the Android app; a browser's own back button
// goes through the page's history instead). Each screen says what back does
// there by pushing a handler (the latest first): back from a race pauses it, from
// a menu's inner screen goes up to the one before, and so on. With nothing to
// go back to (the menu's first screen) it asks first: PRESS BACK AGAIN TO EXIT,
// and a second press within EXIT_WINDOW leaves the app.

import { Capacitor } from '@capacitor/core';

/** s a second press has to leave the app after the first's warning */
export const EXIT_WINDOW = 2;

/** A screen's back: true if it went back somewhere (false: nothing to go back to here). */
export type BackHandler = () => boolean;

const handlers: BackHandler[] = [];

/** While a screen is up: what back does there. Returns a function that takes it off again. */
export function onBack(h: BackHandler): () => void {
  handlers.push(h);
  return () => {
    const i = handlers.lastIndexOf(h);
    if (i >= 0) handlers.splice(i, 1);
  };
}

/** The last time back found nothing to go back to (s, the clock's), for the second press. */
let warnedAt = -Infinity;

/** Back pressed at `now` (s): handled by the latest screen; or else warned, or (a second press soon after) exit. */
export function pressBack(now: number, warn: () => void, exit: () => void): 'handled' | 'warned' | 'exit' {
  for (let i = handlers.length - 1; i >= 0; i--) if (handlers[i]()) return 'handled';
  if (now - warnedAt <= EXIT_WINDOW) {
    warnedAt = -Infinity;
    exit();
    return 'exit';
  }
  warnedAt = now;
  warn();
  return 'warned';
}

/** Forget every handler and the last warning (for tests). */
export function resetBack(): void {
  handlers.length = 0;
  warnedAt = -Infinity;
}

/** Listen for the phone's back button, in the app (a browser has its own). `warn` says PRESS BACK AGAIN TO EXIT. */
export async function listenForBack(warn: () => void): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const { App } = await import('@capacitor/app');
  await App.addListener('backButton', () => {
    pressBack(performance.now() / 1000, warn, () => void App.exitApp());
  });
}
