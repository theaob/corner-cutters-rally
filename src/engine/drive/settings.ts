// The driving settings, remembered: STYLE (TOP-DOWN: a high view of the road ahead, the gas always on, a slower car and a
// forgiving roadside; SIM: the low chase view and the rest as set below), GAS (MANUAL: a pedal; AUTO: always on),
// STEERING (how quick and how far the wheel turns), ASSIST (a hand on the wheel that knows the road) and SIDES (which
// thumb steers on a touch screen) and, in TOP-DOWN, CONTROL (POINT: point the way to go, the car slowing for bends on
// its own; WHEEL: drag across to turn the wheel, and brake for the bends yourself).

import { save, saved } from '../save';
import { ASSIST_LEVELS, type AssistLevel } from './assist';
import { STEER_FEELS, type SteerFeel } from './steering';

export type DriveStyle = 'topdown' | 'sim';
export const DRIVE_STYLES: DriveStyle[] = ['topdown', 'sim'];
export type GasMode = 'manual' | 'auto';
export const GAS_MODES: GasMode[] = ['manual', 'auto'];
export type SteerSide = 'left' | 'right';
export type Control = 'point' | 'wheel';
export const CONTROLS: Control[] = ['point', 'wheel'];
export const STEER_SIDES: SteerSide[] = ['left', 'right'];

export interface DriveSettings {
  style: DriveStyle;
  gas: GasMode;
  feel: SteerFeel;
  assist: AssistLevel;
  side: SteerSide;
  /** TOP-DOWN's steering (SIM's is always the wheel) */
  control: Control;
}
export const DRIVE_DEFAULTS: DriveSettings = { style: 'topdown', gas: 'manual', feel: 'normal', assist: 'light', side: 'left', control: 'point' };

const KEYS: Record<keyof DriveSettings, string> = { style: 'driveStyle', gas: 'driveGas', feel: 'driveSteering', assist: 'driveAssist', side: 'driveSide', control: 'driveControl' };
const ALLOWED: { [K in keyof DriveSettings]: readonly DriveSettings[K][] } = { style: DRIVE_STYLES, gas: GAS_MODES, feel: STEER_FEELS, assist: ASSIST_LEVELS, side: STEER_SIDES, control: CONTROLS };

/** The driving settings as they drive: as saved, but TOP-DOWN's gas is always on, and SIM steers with the wheel. */
export function driveSettings(): DriveSettings {
  const s = savedDriveSettings();
  return s.style === 'topdown' ? { ...s, gas: 'auto' } : { ...s, control: 'wheel' };
}

/** The driving settings as saved (each one its default until it's changed), for the settings rows. */
export function savedDriveSettings(): DriveSettings {
  const read = <K extends keyof DriveSettings>(k: K): DriveSettings[K] => {
    const v = saved('settings', KEYS[k]);
    return (ALLOWED[k] as readonly unknown[]).includes(v) ? (v as DriveSettings[K]) : DRIVE_DEFAULTS[k];
  };
  return { style: read('style'), gas: read('gas'), feel: read('feel'), assist: read('assist'), side: read('side'), control: read('control') };
}

/** Change one driving setting, and remember it. */
export function setDriveSetting<K extends keyof DriveSettings>(k: K, v: DriveSettings[K]): void {
  save('settings', KEYS[k], v);
}
