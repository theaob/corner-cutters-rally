// Which build this is, as the stats and the problem reports say it: the Android app, the iOS app, or the web (itch.io).

import { Capacitor } from '@capacitor/core';

export type Platform = 'web' | 'android' | 'ios';

/** The platform of the page now. */
export function platformName(): Platform {
  if (!Capacitor.isNativePlatform()) return 'web';
  return Capacitor.getPlatform() === 'ios' ? 'ios' : 'android';
}
