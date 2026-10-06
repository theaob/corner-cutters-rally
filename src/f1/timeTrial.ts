// Time Trial: flying laps on your own, against your best. Each lap is recorded
// as it's driven (where the car is, 20 times a second, and its split at each
// sector), and your best lap on a circuit (in each weather) is kept on the
// device as a ghost: a see-through car that drives it again beside you from the
// line, the live gap to it, and the splits to beat. A lap with a cut across a
// marked corner is deleted (qualifying's rule) and can't be a best. Engine-free.

import { save, saved } from '../engine/save';
import type { Car } from '../engine/driving';

/** Ghost frames a second. */
export const GHOST_HZ = 20;
/** numbers per frame: x, y, heading, nearest sample */
const STRIDE = 4;

/** A lap as driven: its time, its split at the end of each sector but the last, and its frames from the line. */
export interface Ghost {
  time: number;
  splits: number[];
  /** frame k (at k / hz s into the lap) is x, y, heading, idx at [k * 4 …] */
  frames: number[];
  /** frames a second (GHOST_HZ unless said: a Daily Challenge run sent to the board has fewer) */
  hz?: number;
}

/** A lap being recorded. */
export interface LapRecorder {
  splits: number[];
  frames: number[];
}

export const newRecorder = (): LapRecorder => ({ splits: [], frames: [] });

/** Record the car at `t` s into the lap (a frame whenever one is due, `hz` a second), at nearest sample `idx`. */
export function recordFrame(r: LapRecorder, t: number, car: Car, idx: number, hz = GHOST_HZ): void {
  // (a frame per 1/20 s: the sim steps at 60 Hz, so every third step; a step late is caught up on the next)
  while (r.frames.length / STRIDE <= t * hz + 1e-6) {
    r.frames.push(Math.round(car.x * 10) / 10, Math.round(car.y * 10) / 10, Math.round(car.heading * 1000) / 1000, idx);
  }
}

/** The lap recorded, as a ghost, `time` s long. */
export const toGhost = (r: LapRecorder, time: number): Ghost => ({ time, splits: [...r.splits], frames: [...r.frames] });

/** Where the ghost is `t` s into its lap (between its frames); undefined once its lap is over, or before it starts. */
export function ghostPose(g: Ghost, t: number): { x: number; y: number; heading: number } | undefined {
  const count = g.frames.length / STRIDE;
  const at = t * (g.hz ?? GHOST_HZ);
  if (t < 0 || t > g.time || count < 2) return undefined;
  const k = Math.min(count - 2, Math.floor(at));
  const f = Math.min(1, at - k);
  const a = k * STRIDE;
  const b = a + STRIDE;
  let turn = g.frames[b + 2] - g.frames[a + 2];
  turn = Math.atan2(Math.sin(turn), Math.cos(turn));
  return {
    x: g.frames[a] + (g.frames[b] - g.frames[a]) * f,
    y: g.frames[a + 1] + (g.frames[b + 1] - g.frames[a + 1]) * f,
    heading: g.frames[a + 2] + turn * f,
  };
}

/**
 * When the ghost reached sample `idx` (s into its lap), for the live gap to it;
 * undefined if it never did (or `idx` is behind the line, on the run-up).
 * `n`: samples round the lap.
 */
export function ghostTimeAt(g: Ghost, idx: number, n: number): number | undefined {
  const count = g.frames.length / STRIDE;
  // (the lap starts at the line, sample 0: a sample far round the loop from there is before it)
  if (idx > n * 0.95) return undefined;
  for (let k = 1; k < count; k++) {
    const i = g.frames[k * STRIDE + 3];
    if (i < idx || i > n * 0.95) continue;
    const prev = g.frames[(k - 1) * STRIDE + 3];
    const f = i === prev ? 0 : Math.max(0, Math.min(1, (idx - prev) / (i - prev)));
    return (k - 1 + f) / (g.hz ?? GHOST_HZ);
  }
  return undefined;
}

/** How a split (or a lap) compares: 'record' (quicker than your best ever), 'better' (than the ghost you're chasing), or 'worse'. */
export type SplitMark = 'record' | 'better' | 'worse';

/** A split of `t` s at sector `k` against the ghost's (and against your record's, if that's a different lap). */
export function markSplit(t: number, k: number, ghost?: Ghost, record?: Ghost): { delta?: number; mark: SplitMark } {
  const theirs = ghost?.splits[k];
  const best = record?.splits[k];
  const delta = theirs === undefined ? undefined : t - theirs;
  if (best === undefined || t < best) return { delta, mark: 'record' };
  return { delta, mark: delta !== undefined && delta < 0 ? 'better' : 'worse' };
}

/** A ghost from the save, if it's a sound one. */
export function parseGhost(v: unknown): Ghost | undefined {
  const g = v as Partial<Ghost> | null;
  if (!g || typeof g !== 'object' || typeof g.time !== 'number' || !(g.time > 0) || !Array.isArray(g.splits) || !Array.isArray(g.frames)) return undefined;
  if (g.frames.length < STRIDE * 2 || g.frames.length % STRIDE || !g.frames.every((x) => typeof x === 'number' && Number.isFinite(x))) return undefined;
  if (!g.splits.every((x) => typeof x === 'number' && Number.isFinite(x))) return undefined;
  if (g.hz !== undefined && !(typeof g.hz === 'number' && g.hz > 0 && g.hz <= 60)) return undefined;
  return { time: g.time, splits: g.splits, frames: g.frames, ...(g.hz !== undefined ? { hz: g.hz } : {}) };
}

/** Your best Time Trial lap on circuit `id` (the records' id: circuit and weather), kept on the device. */
export const loadGhost = (id: string): Ghost | undefined => parseGhost(saved('ghosts', id));
export const saveGhost = (id: string, g: Ghost): void => save('ghosts', id, g);
