// The replays: every car on the track (and the safety car) is recorded through
// the race, 20 times a second, the last 15 seconds kept. A few seconds after
// you take the flag the race holds and the 10 seconds up to just past your
// finish play again, slowing as you cross the line; and a moment after a big
// crash, the seconds round it, slowing through the impact (CRASH_REPLAY).
// Engine-free.

/** A car's state as it shows: whole, smoking, burning or wrecked (as the driving rules' condition). */
export type ReplayCondition = 'ok' | 'smoking' | 'burning' | 'wrecked';
const CONDITIONS: ReplayCondition[] = ['ok', 'smoking', 'burning', 'wrecked'];

/** Where a car is: on the ground (x, y), its height, its heading; and, recorded, its state then (so a replay shows it whole before the crash that set it alight). */
export interface Pose {
  x: number;
  y: number;
  z: number;
  heading: number;
  condition?: ReplayCondition;
}

export const REPLAY = {
  /** frames a second, and seconds kept */
  hz: 20,
  keep: 15,
  /** seconds replayed, ending this long after your finish */
  length: 10,
  after: 1.5,
  /** seconds after your finish (the flag, live) that the replay starts */
  startAt: 3.5,
  /** within this many seconds of the line, it plays at this speed */
  slowWithin: 1,
  slow: 0.4,
};

/** numbers per car per frame: x, y, z, heading, whether it's on the track (1) or not (0), and its condition (CONDITIONS' index) */
const STRIDE = 6;

export interface ReplayRecorder {
  /** cars recorded (each frame has them all, in order) */
  cars: number;
  /** race time of the first frame kept */
  start: number;
  frames: Float32Array[];
}

export const newReplay = (cars: number): ReplayRecorder => ({ cars, start: 0, frames: [] });

/** Record the cars at race time `t` (a frame whenever one is due; a car undefined isn't on the track). */
export function recordReplay(r: ReplayRecorder, t: number, cars: (Pose | undefined)[]): void {
  if (!r.frames.length) r.start = t;
  while (r.start + r.frames.length / REPLAY.hz <= t + 1e-6) {
    const f = new Float32Array(r.cars * STRIDE);
    cars.forEach((c, i) => {
      if (c) f.set([c.x, c.y, c.z, c.heading, 1, Math.max(0, CONDITIONS.indexOf(c.condition ?? 'ok'))], i * STRIDE);
    });
    r.frames.push(f);
  }
  // (only the last few seconds are kept)
  const over = r.frames.length - REPLAY.keep * REPLAY.hz;
  if (over > 0) {
    r.frames.splice(0, over);
    r.start += over / REPLAY.hz;
  }
}

/** Where car `i` was at race time `t` (between frames); undefined if it wasn't on the track, or `t` wasn't recorded. */
export function replayPose(r: ReplayRecorder, i: number, t: number): Pose | undefined {
  const at = (t - r.start) * REPLAY.hz;
  if (at < 0 || at > r.frames.length - 1 || !r.frames.length) return undefined;
  const k = Math.min(r.frames.length - 2, Math.floor(at));
  if (k < 0) return undefined;
  const f = at - k;
  const a = r.frames[k];
  const b = r.frames[k + 1];
  const o = i * STRIDE;
  if (!a[o + 4] || !b[o + 4]) return undefined;
  const turn = Math.atan2(Math.sin(b[o + 3] - a[o + 3]), Math.cos(b[o + 3] - a[o + 3]));
  // (its condition the nearer frame's: it changes at once, as it did)
  const condition = CONDITIONS[(f < 0.5 ? a : b)[o + 5]] ?? 'ok';
  return { x: a[o] + (b[o] - a[o]) * f, y: a[o + 1] + (b[o + 1] - a[o + 1]) * f, z: a[o + 2] + (b[o + 2] - a[o + 2]) * f, heading: a[o + 3] + turn * f, condition };
}

/** The race times a replay of your finish at `finish` runs between, within what's recorded. */
export function replayWindow(r: ReplayRecorder, finish: number): { from: number; to: number } {
  const end = r.start + (r.frames.length - 1) / REPLAY.hz;
  const to = Math.min(end, finish + REPLAY.after);
  return { from: Math.max(r.start, to - REPLAY.length), to };
}

/** How fast the replay plays at race time `t` (slow through the finish at `finish`). */
export const replaySpeed = (t: number, finish: number) => (Math.abs(t - finish) <= REPLAY.slowWithin ? REPLAY.slow : 1);

/**
 * The replay of a big crash: a moment after it (seen live first), the race holds and the seconds round it play
 * again, slowing through the impact, on the crashed car; then the race goes on from where it held. For your own
 * big crash, or an AI car's wreck within sight of yours; in a race, not after your flag; none within `gap` s of the
 * last.
 */
export const CRASH_REPLAY = {
  /** s after the crash that its replay starts, and s replayed before and after it */
  delay: 1.5,
  before: 2.5,
  after: 1.5,
  /** within this many seconds of the impact it plays at this speed (and elsewhere at `speed`) */
  slowWithin: 0.6,
  slow: 0.3,
  speed: 0.8,
  /** px within which an AI car's wreck is in sight of yours */
  near: 400,
  /** s at least between crash replays */
  gap: 20,
};

/** Whether a crash earns a replay: yours and big (a wreck, or a hit as big as `bigHit` of the car), or an AI car's wreck within sight of yours; none too soon after the last. */
export function wantsCrashReplay(c: { mine: boolean; wrecked: boolean; hit: number; bigHit: number; distance: number; now: number; last: number }): boolean {
  if (c.now - c.last < CRASH_REPLAY.gap) return false;
  return c.mine ? c.wrecked || c.hit >= c.bigHit : c.wrecked && c.distance <= CRASH_REPLAY.near;
}

/** The race times a crash at `at` replays between, within what's recorded. */
export function crashWindow(r: ReplayRecorder, at: number): { from: number; to: number } {
  const end = r.start + (r.frames.length - 1) / REPLAY.hz;
  return { from: Math.max(r.start, at - CRASH_REPLAY.before), to: Math.min(end, at + CRASH_REPLAY.after) };
}

/** How fast a crash replay plays at race time `t` (slow through the impact at `at`). */
export const crashSpeed = (t: number, at: number) => (Math.abs(t - at) <= CRASH_REPLAY.slowWithin ? CRASH_REPLAY.slow : CRASH_REPLAY.speed);
