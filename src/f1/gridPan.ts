// The grid pan before a race: the camera glides down the starting grid from
// pole to the last car, a moment on each, naming them as it passes; then the
// start lights. Where the camera is at each moment is worked out here. GRID
// WALK in the settings can skip it every time (straight to the lights).

import { save, saved } from '../engine/save';
import type { Pt } from './racing';

let walk: boolean | undefined;
/** GRID WALK in the settings: the pan before each race, on unless turned off (remembered). */
export function gridWalkOn(): boolean {
  walk ??= saved('settings', 'gridWalk') !== false;
  return walk;
}
export function setGridWalk(on: boolean): void {
  walk = on;
  save('settings', 'gridWalk', on);
}

export const GRID_PAN = {
  /** seconds on pole before moving off, a car's worth of time between slots, and a moment on the last */
  hold: 1,
  perCar: 0.55,
  end: 0.6,
  /** how much closer the camera comes than in the race */
  zoom: 1.6,
};

/** Seconds a pan down a grid of `cars` takes. */
export const panLength = (cars: number) => GRID_PAN.hold + Math.max(0, cars - 1) * GRID_PAN.perCar + GRID_PAN.end;

/** Where the pan is `t` s in, along `slots` (pole first): the point to look at, and the car it's on (the nearest). */
export function panAt(slots: Pt[], t: number): { x: number; y: number; car: number } {
  const last = slots.length - 1;
  // eased between slots, so it settles on each car
  const along = Math.max(0, Math.min(last, (t - GRID_PAN.hold) / GRID_PAN.perCar));
  const k = Math.min(last, Math.floor(along));
  const f = along - k;
  const e = f * f * (3 - 2 * f);
  const a = slots[k];
  const b = slots[Math.min(last, k + 1)];
  return { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e, car: Math.round(along) };
}
