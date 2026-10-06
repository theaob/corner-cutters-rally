// Vibration: in the Android app through Capacitor's Haptics plugin, in a
// browser through the Vibration API (Android browsers; iOS Safari has none, so
// there it's silent). The player can turn it off; the choice is kept on the device.

import { Capacitor } from '@capacitor/core';
import { Haptics } from '@capacitor/haptics';
import { save, saved } from './save';

let enabled: boolean | undefined;

/** Whether vibration is on (it is unless the player turned it off). */
export function vibrationOn(): boolean {
  enabled ??= saved('settings', 'vibration') !== false;
  return enabled;
}

/** Turn vibration on or off, and remember it. */
export function setVibration(on: boolean): void {
  enabled = on;
  save('settings', 'vibration', on);
}

/** Vibrate for `ms` milliseconds, if vibration is on and the device can. */
export function vibrate(ms: number): void {
  if (ms <= 0 || !vibrationOn()) return;
  const duration = Math.round(ms);
  try {
    if (Capacitor.isNativePlatform()) void Haptics.vibrate({ duration }).catch(() => {});
    else navigator.vibrate?.(duration);
  } catch {
    // not allowed here (some frames, before the first touch): no buzz
  }
}
