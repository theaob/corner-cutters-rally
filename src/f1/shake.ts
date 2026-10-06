// The camera's shake, and the hit-stop of a big hit: the feel of an impact. A
// knock adds "trauma" (0…1, more for a harder hit, all of it for a wreck or a
// hard landing); the kerbs and the grass or gravel keep a little while you're on
// them, more at speed; it fades away by itself. The camera moves by the trauma
// squared (a knock barely stirs it, a crash throws it about), with smooth noise
// so it judders rather than jitters. A big hit also stops time for a moment
// (hit-stop): the race runs at a crawl for a few hundredths of a second, so the
// crash lands. Unit-tested; race.ts feeds it your car's frame,
// moves the camera by its offset and runs the race at its time scale.

import { save, saved } from '../engine/save';
import { motionReduced } from './access';

let enabled: boolean | undefined;
/** SCREEN SHAKE in the settings: on unless turned off (remembered); off to start with for a device asking for less motion. */
export function shakeOn(): boolean {
  const set = saved('settings', 'shake');
  enabled ??= typeof set === 'boolean' ? set : !motionReduced();
  return enabled;
}
export function setShake(on: boolean): void {
  enabled = on;
  save('settings', 'shake', on);
}

export const SHAKE = {
  /** trauma for each point of health lost at once, and the least a felt hit adds */
  perHealth: 0.035,
  hitFloor: 0.5,
  hitLeast: 0.15,
  /** trauma for a wreck */
  wreck: 1,
  /** downward px/s of a landing above which it shakes, and trauma per px/s past it */
  landing: 120,
  perLanding: 0.004,
  /** the trauma kept up while you're on the kerbs, or on grass or gravel, at top speed (less slower) */
  kerb: 0.22,
  rough: 0.3,
  /** px/s under which the ground doesn't shake */
  minSpeed: 40,
  /** trauma lost a second */
  decay: 1.6,
  /** px the camera moves at full trauma, and how fast the shake moves (Hz) */
  most: 6,
  speed: 18,
  /** a hit taking this much health at once (or a wreck) stops time for `hold` s, the race running at `crawl` × */
  bigHit: 8,
  hold: 0.07,
  crawl: 0.1,
};

export interface ShakeState {
  trauma: number;
  /** s of shake run (for its noise) */
  t: number;
  /** s of hit-stop left */
  hold: number;
}

export const newShake = (): ShakeState => ({ trauma: 0, t: 0, hold: 0 });

export interface ShakeFrame {
  dt: number;
  speed: number;
  topSpeed: number;
  /** health lost this frame */
  healthLost: number;
  wreckedNow: boolean;
  /** downward px/s on the frame it landed (0 otherwise) */
  landed: number;
  onRough: boolean;
  onKerb: boolean;
}

/** Move the shake on a frame: what happened adds trauma (and maybe a hit-stop), then it fades. */
export function stepShake(s: ShakeState, f: ShakeFrame): void {
  s.t += f.dt;
  s.hold = Math.max(0, s.hold - f.dt);
  s.trauma = Math.max(0, s.trauma - SHAKE.decay * f.dt);
  let add = 0;
  if (f.wreckedNow) add = SHAKE.wreck;
  else if (f.healthLost > SHAKE.hitFloor) add = Math.max(SHAKE.hitLeast, f.healthLost * SHAKE.perHealth);
  if (f.landed > SHAKE.landing) add = Math.max(add, (f.landed - SHAKE.landing) * SHAKE.perLanding);
  s.trauma = Math.min(1, s.trauma + add);
  if (f.wreckedNow || f.healthLost >= SHAKE.bigHit) s.hold = SHAKE.hold;
  // (the ground: a floor it doesn't fade below while you're on it, more the faster you go)
  if (f.speed > SHAKE.minSpeed) {
    const pace = Math.min(1, f.speed / f.topSpeed);
    const floor = f.onRough ? SHAKE.rough * pace : f.onKerb ? SHAKE.kerb * pace : 0;
    s.trauma = Math.max(s.trauma, floor);
  }
}

/** Smooth noise in −1…1 (a sum of sines at unrelated rates: no repeats you'd notice). */
const noise = (t: number, seed: number) => (Math.sin(t * 1.7 + seed) + Math.sin(t * 2.9 + seed * 3.1) * 0.6 + Math.sin(t * 4.3 + seed * 1.3) * 0.3) / 1.9;

/** px to move the camera across and up the screen now. */
export function shakeOffset(s: ShakeState): { x: number; y: number } {
  const k = s.trauma * s.trauma * SHAKE.most;
  const t = s.t * SHAKE.speed;
  return { x: k * noise(t, 1), y: k * noise(t, 7) };
}

/** How fast the race runs now: at a crawl through a hit-stop, else 1. */
export const timeScale = (s: ShakeState): number => (s.hold > 0 ? SHAKE.crawl : 1);

/** The rush of speed: streaks past the screen's edges and the camera pulling back a touch, from near top speed and in a tow. */
export const RUSH = {
  /** share of top speed it starts at (all of it at top speed) */
  from: 0.82,
  /** a full tow's rush (it needs a fair speed: from `towFrom` of top speed) */
  tow: 0.7,
  towFrom: 0.6,
  /** how much further the camera pulls back at full rush (×) */
  pullBack: 0.06,
};

/** How much rush there is (0…1) at `speed` px/s of `top`, `tow` (0…1) in a car's wake. */
export function rushOf(speed: number, top: number, tow = 0): number {
  const pace = speed / Math.max(1, top);
  const fast = Math.min(1, Math.max(0, (pace - RUSH.from) / (1 - RUSH.from)));
  const towed = pace >= RUSH.towFrom ? tow * RUSH.tow : 0;
  return Math.min(1, Math.max(fast, towed));
}
