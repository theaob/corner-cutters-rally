// DRIVING in the settings: how your controls drive the car, on any device.
// POINT: the car goes where you point (the touch stick, the arrow keys as eight
// ways, a gamepad's left stick), pushed further for more speed. STEER: you
// drive the car itself (up or the right trigger is the gas, down or the left
// trigger the brake, left and right turn the wheel; on a touch screen a
// steering slider and GAS and BRAKE pedals in place of the stick). AUTO: each device its own way (the touch stick points,
// keys and a gamepad steer). Remembered.

import { save, saved } from '../engine/save';
import type { Device } from './onboarding';

export type DriveStyle = 'auto' | 'point' | 'steer';
export const DRIVE_STYLES: DriveStyle[] = ['auto', 'point', 'steer'];

let style: DriveStyle | undefined;
export function driveStyle(): DriveStyle {
  if (!style) {
    const s = saved('settings', 'driving');
    style = DRIVE_STYLES.includes(s as DriveStyle) ? (s as DriveStyle) : 'auto';
  }
  return style;
}
export function setDriveStyle(s: DriveStyle): void {
  style = s;
  save('settings', 'driving', s);
}

/** Whether `device` points the way to go under `s` (else it steers the car). */
export const pointsOn = (device: Device, s: DriveStyle = driveStyle()): boolean => (s === 'auto' ? device === 'touch' : s === 'point');
