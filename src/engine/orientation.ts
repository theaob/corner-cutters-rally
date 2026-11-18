// The Android app's orientation: landscape for SPLIT (deck.ts driveScheme), portrait for STICK. The manifest starts
// it in landscape (SPLIT is the default); this turns it when the player picks the other. On the web the page goes the
// way the phone is held (a browser only locks it in full screen), so nothing is done there.

import { Capacitor } from '@capacitor/core';
import { ScreenOrientation } from '@capacitor/screen-orientation';

export type Orientation = 'landscape' | 'portrait';

let locked: Orientation | undefined;

/** Turn the app to `o` (either way up), once per change; a refusal is left alone (the game still lays itself out). */
export async function lockOrientation(o: Orientation): Promise<void> {
  if (!Capacitor.isNativePlatform() || locked === o) return;
  locked = o;
  try {
    await ScreenOrientation.lock({ orientation: o });
  } catch {
    // (an older WebView, or a device that won't: the layout fits whichever way it's held)
  }
}
