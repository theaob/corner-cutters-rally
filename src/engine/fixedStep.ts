// A fixed-step clock: the simulation advances in steps of exactly 1/hz s,
// however long the frames take, so a race runs the same on a 30 fps phone, a
// 60 Hz laptop and a 120 Hz tablet (and the same as in the headless tests,
// which step at 1/60 s). Each frame adds its time and runs the whole steps
// that fit; what's left over (`alpha`, 0…1 of a step) is for drawing the
// cars between the last two steps, so a screen faster than the simulation
// still moves smoothly. A frame so slow it would need more than `maxSteps`
// drops the excess: the game slows down rather than stalling to catch up.

export interface FixedClock {
  /** seconds per step */
  readonly step: number;
  /** most steps one frame may run */
  readonly maxSteps: number;
  /** seconds carried over to the next frame (less than a step) */
  carry: number;
}

/** The simulation's rate: steps per second. */
export const SIM_HZ = 60;
export const SIM_DT = 1 / SIM_HZ;

export const fixedClock = (hz = SIM_HZ, maxSteps = 4): FixedClock => ({ step: 1 / hz, maxSteps, carry: 0 });

/** Add a frame of `dt` s: the steps to run now, and how far (0…1) the frame is into the next one. */
export function advance(clock: FixedClock, dt: number): { steps: number; alpha: number } {
  // (a hair of slack, so a frame of exactly one step doesn't miss it to rounding)
  const total = clock.carry + Math.max(0, dt);
  let steps = Math.floor(total / clock.step + 1e-9);
  let carry = total - steps * clock.step;
  if (steps > clock.maxSteps) {
    steps = clock.maxSteps;
    carry = 0;
  }
  clock.carry = Math.max(0, carry);
  return { steps, alpha: Math.min(1, clock.carry / clock.step) };
}

/** Forget time carried over (after a pause, or a restart). */
export function resetClock(clock: FixedClock): void {
  clock.carry = 0;
}

/** Where something moving from `a` to `b` is `t` (0…1) of the way; for an angle, the short way round. */
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const lerpAngle = (a: number, b: number, t: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
