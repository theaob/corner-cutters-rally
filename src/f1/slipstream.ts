// Slipstream: a car close behind another at speed drives in its wake, where
// the air it has to push through is already moving, so it can go faster: a
// higher top speed, and quicker to reach it. The tow builds over half a second
// in the wake and fades over half a second after leaving it, so pulling out to pass carries
// the extra speed alongside for a moment: the slingshot. It's strongest right
// behind the car ahead and fades with distance (gone by `range`) and off to
// either side (gone by `width`), and only counts at speed, both cars heading
// the same way. Every car gets it, the AI's too. Engine-free and unit-tested.

import { speedOf, type Car } from '../engine/driving';

export const SLIPSTREAM = {
  /** px behind a car its wake reaches; full strength within `near` */
  range: 170,
  near: 45,
  /** px either side of its line the wake is felt; full within `core`. Right behind it (within `near`) it spreads wider, to
   * `nearWidth` and `nearCore`: pulling out to pass keeps the tow till alongside, the slingshot */
  width: 18,
  core: 6,
  nearWidth: 32,
  nearCore: 16,
  /** px/s both cars must be doing for any tow */
  minSpeed: 150,
  /** the share of top speed a full tow adds */
  gain: 0.06,
  /** per second: how fast the tow builds in the wake, and fades out of it */
  build: 2,
  fade: 2,
};

/** How strongly (0…1) `car` is in `ahead`'s wake. */
export function wake(car: Car, ahead: Car): number {
  if (car === ahead || car.wrecked || ahead.wrecked || car.airborne) return 0;
  if (speedOf(car) < SLIPSTREAM.minSpeed || speedOf(ahead) < SLIPSTREAM.minSpeed) return 0;
  // in the car ahead's frame: how far behind it, and how far off its line
  const fx = Math.sin(ahead.heading);
  const fy = -Math.cos(ahead.heading);
  const dx = car.x - ahead.x;
  const dy = car.y - ahead.y;
  const behind = -(dx * fx + dy * fy);
  const off = Math.abs(dx * fy - dy * fx);
  // (wider close behind: from `near`, narrowing to its width by `range`)
  const S = SLIPSTREAM;
  const far = Math.min(1, Math.max(0, (behind - S.near) / (S.range - S.near)));
  const width = S.nearWidth + (S.width - S.nearWidth) * far;
  const core = S.nearCore + (S.core - S.nearCore) * far;
  if (behind <= 0 || behind >= S.range || off >= width) return 0;
  // heading the same way (within about 25°)
  if (Math.cos(car.heading - ahead.heading) < 0.9) return 0;
  const along = 1 - far;
  const across = 1 - Math.max(0, off - core) / (width - core);
  return Math.max(0, along) * Math.max(0, across);
}

/** The strongest wake `car` is in among `others`. */
export const towFrom = (car: Car, others: Car[]) => others.reduce((best, o) => Math.max(best, wake(car, o)), 0);

/** The tow after `dt` s with `target` wake: building toward it in one, fading out of one. */
export function stepTow(tow: number, target: number, dt: number): number {
  return target > tow ? Math.min(target, tow + SLIPSTREAM.build * dt) : Math.max(target, tow - SLIPSTREAM.fade * dt);
}

/** The top speed share a tow adds (× the car's other speed factors). */
export const towBoost = (tow: number) => 1 + SLIPSTREAM.gain * tow;
