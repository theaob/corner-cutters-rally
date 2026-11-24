// The Android app's orientation: always landscape (the game is played sideways, the screen's halves the controls).
// MainActivity turns phones sideways as the app starts (the manifest asks for no orientation, which Play warns about on
// large screens), and the app locks it here too. On the web the page goes the way the phone is held; an upright phone gets a note (src/app.ts).

import { Capacitor } from '@capacitor/core';
import { ScreenOrientation } from '@capacitor/screen-orientation';

/** Turn the app sideways (either way round); a refusal is left alone (the page asks to be turned instead). */
export async function lockLandscape(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await ScreenOrientation.lock({ orientation: 'landscape' });
  } catch {
    // (an older WebView, or a device that won't)
  }
}
