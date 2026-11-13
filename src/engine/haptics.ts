// Vibration: in the Android app through Capacitor's Haptics plugin (in the iOS app a tap of a strength by length: impactFor), in a
// browser through the Vibration API (Android browsers; iOS Safari has none, so
// there it's silent). The player can turn it off; the choice is kept on the device.

import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
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

/**
 * How hard an iPhone taps for a buzz of `ms`: it can't buzz for a length of time (the plugin ignores the duration there),
 * so the length chooses the tap instead: the kerbs' and grass's short pulses light, a crash medium, a wreck heavy.
 */
export function impactFor(ms: number): ImpactStyle {
  return ms < 20 ? ImpactStyle.Light : ms < 100 ? ImpactStyle.Medium : ImpactStyle.Heavy;
}

/** Vibrate for `ms` milliseconds, if vibration is on and the device can. */
export function vibrate(ms: number): void {
  if (ms <= 0 || !vibrationOn()) return;
  const duration = Math.round(ms);
  try {
    if (Capacitor.getPlatform() === 'ios') void Haptics.impact({ style: impactFor(duration) }).catch(() => {});
    else if (Capacitor.isNativePlatform()) void Haptics.vibrate({ duration }).catch(() => {});
    else navigator.vibrate?.(duration);
  } catch {
    // not allowed here (some frames, before the first touch): no buzz
  }
}
