// The driving settings, remembered: GAS (MANUAL: a pedal; AUTO: always on), STEERING (how quick and how far the wheel
// turns), ASSIST (a hand on the wheel that knows the road) and SIDES (which thumb steers on a touch screen).

import { save, saved } from '../save';
import { ASSIST_LEVELS, type AssistLevel } from './assist';
import { STEER_FEELS, type SteerFeel } from './steering';

export type GasMode = 'manual' | 'auto';
export const GAS_MODES: GasMode[] = ['manual', 'auto'];
export type SteerSide = 'left' | 'right';
export const STEER_SIDES: SteerSide[] = ['left', 'right'];

export interface DriveSettings {
  gas: GasMode;
  feel: SteerFeel;
  assist: AssistLevel;
  side: SteerSide;
}
export const DRIVE_DEFAULTS: DriveSettings = { gas: 'manual', feel: 'normal', assist: 'light', side: 'left' };

const KEYS: Record<keyof DriveSettings, string> = { gas: 'driveGas', feel: 'driveSteering', assist: 'driveAssist', side: 'driveSide' };
const ALLOWED: { [K in keyof DriveSettings]: readonly DriveSettings[K][] } = { gas: GAS_MODES, feel: STEER_FEELS, assist: ASSIST_LEVELS, side: STEER_SIDES };

/** The driving settings as saved (each one its default until it's changed). */
export function driveSettings(): DriveSettings {
  const read = <K extends keyof DriveSettings>(k: K): DriveSettings[K] => {
    const v = saved('settings', KEYS[k]);
    return (ALLOWED[k] as readonly unknown[]).includes(v) ? (v as DriveSettings[K]) : DRIVE_DEFAULTS[k];
  };
  return { gas: read('gas'), feel: read('feel'), assist: read('assist'), side: read('side') };
}

/** Change one driving setting, and remember it. */
export function setDriveSetting<K extends keyof DriveSettings>(k: K, v: DriveSettings[K]): void {
  save('settings', KEYS[k], v);
}
