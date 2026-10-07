// How your controls drive the car, in the settings, remembered.
//
// TOUCH, on a touch screen, picks the deck:
// - PEDALS: a steering slider under one thumb, GAS and BRAKE under the other, and DRIFT above them.
// - STICK: one floating stick as a wheel: across steers, up is the gas, down the brake; DRIFT beside it.
// - ARCADE: the gas is always on; the slider steers, BRAKE slows, DRIFT drifts.
// - TAP: the gas is always on; hold the left or right half of the screen to steer that way, both to brake.
// - TILT: the gas is always on; tilt the phone like a wheel to steer (the slider shows it, and steers if held);
//   BRAKE and DRIFT as in ARCADE.
// - POINT: the stick points at the spot on the screen you want to drive to, and how far it's pushed is the throttle.
//
// DRIVING, for keys and gamepads: STEER (up or the right trigger is the gas, down or the left trigger the brake, left
// and right turn the wheel) or POINT (the arrows or the left stick point where to go, as POINT on touch).

import { save, saved } from '../engine/save';
import type { Device } from './onboarding';

export type DriveStyle = 'steer' | 'point';
export const DRIVE_STYLES: DriveStyle[] = ['steer', 'point'];

export type TouchScheme = 'pedals' | 'stick' | 'arcade' | 'tap' | 'tilt' | 'point';
export const TOUCH_SCHEMES: TouchScheme[] = ['pedals', 'stick', 'arcade', 'tap', 'tilt', 'point'];

/** What each touch scheme is, in a few words (the settings row's line under it). */
export const TOUCH_ABOUT: Record<TouchScheme, string> = {
  pedals: 'slider steers · gas, brake, drift',
  stick: 'one stick: across steers, up gas',
  arcade: 'gas always on · slider steers',
  tap: 'gas always on · hold a side to steer',
  tilt: 'gas always on · tilt the phone',
  point: 'the stick points where to drive',
};

/** The schemes whose gas is always on (you only steer, brake and drift). */
export const autoThrottle = (s: TouchScheme): boolean => s === 'arcade' || s === 'tap' || s === 'tilt';
/** The schemes with a DRIFT button (TAP's two halves are steering and braking: nothing left to drift with). */
export const touchDrifts = (s: TouchScheme): boolean => s !== 'tap';

let style: DriveStyle | undefined;
let scheme: TouchScheme | undefined;

/** DRIVING (keys and gamepads). An older save's AUTO is STEER: it's how keys and pads drove under it. */
export function driveStyle(): DriveStyle {
  if (!style) style = saved('settings', 'driving') === 'point' ? 'point' : 'steer';
  return style;
}
export function setDriveStyle(s: DriveStyle): void {
  style = s;
  save('settings', 'driving', s);
}

/** TOUCH (the touch deck). Before it was a setting of its own, DRIVING's POINT pointed on touch too: kept as POINT. */
export function touchScheme(): TouchScheme {
  if (!scheme) {
    const s = saved('settings', 'touch');
    scheme = TOUCH_SCHEMES.includes(s as TouchScheme) ? (s as TouchScheme) : saved('settings', 'driving') === 'point' ? 'point' : 'pedals';
  }
  return scheme;
}
export function setTouchScheme(s: TouchScheme): void {
  scheme = s;
  save('settings', 'touch', s);
}

/** How `device` drives: its touch scheme on a touch screen, else DRIVING's STEER or POINT. */
export type How = DriveStyle | TouchScheme;
export const howOn = (device: Device, s: DriveStyle = driveStyle(), t: TouchScheme = touchScheme()): How => (device === 'touch' ? t : s);

/** Whether `device` points the way to go (else it steers the car). */
export const pointsOn = (device: Device, s: DriveStyle = driveStyle(), t: TouchScheme = touchScheme()): boolean => howOn(device, s, t) === 'point';

/** Forget what was read from the save (tests). */
export function resetDriveStyle(): void {
  style = undefined;
  scheme = undefined;
}
