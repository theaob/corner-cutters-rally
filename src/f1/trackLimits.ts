// Track limits: the marked corners (the kerbed bends), where a car that cuts
// across the inside, all four wheels past the edge, gains time it hasn't
// earned. Each cut is a strike: the first few are warnings, then every cut
// after costs seconds on the finish time. One strike per corner a car goes
// through, however far it cuts. Engine-free (race control runs it for every
// car, the AI's too).
//
// Against the clock (a qualifying lap, a Time Trial lap) the rule is the
// strict one: a lap with all four wheels past the white line anywhere, on
// either side (a cut, or running wide), is deleted (offTrack). In a race,
// running wide is its own penalty: the time it costs.

import { HALF_WIDTH, TIGHT } from './circuit';
import { lateralOffset, type Track } from './racing';

export const LIMITS = {
  /** px either side of a bend's tight part the corner reaches (turning in early, or straightening the exit) */
  reach: 48,
  /** cuts that are only warnings */
  warnings: 2,
  /** seconds added for each cut after the warnings */
  penalty: 5,
};

/** A marked corner: samples `from` to `to` (round the loop), and its inside (+1 = the right, a right-hander). */
export interface Corner {
  from: number;
  to: number;
  /** the sample where it's tightest */
  apex: number;
  side: -1 | 1;
}

/** A car's record with the stewards. */
export interface Limits {
  /** cuts so far */
  strikes: number;
  /** the corner it last cut (it's not struck again until it's through it) */
  corner?: number;
  /** all four wheels past the white line right now (an excursion counts once, until it's back on the track) */
  off?: boolean;
}

export const newLimits = (): Limits => ({ strikes: 0 });

/** Whether sample `i` is in `from`…`to` (which may wrap round the end of the loop). */
const inRange = (i: number, from: number, to: number) => (from <= to ? i >= from && i <= to : i >= from || i <= to);

/** The track's marked corners, in order round the lap: each run of tight samples turning the same way, and a little either side. */
export function markCorners(track: Track): Corner[] {
  const { samples, spacing } = track;
  const n = samples.length;
  const side = (i: number): -1 | 0 | 1 => {
    const c = samples[((i % n) + n) % n].curve;
    return Math.abs(c) < TIGHT ? 0 : c > 0 ? 1 : -1;
  };
  // start from a sample outside any bend, so no run is split across the end of the loop
  let start = 0;
  while (start < n && side(start) !== 0) start++;
  if (start === n) return [];
  const reach = Math.round(LIMITS.reach / spacing);
  const runs: Corner[] = [];
  for (let k = 1; k <= n; k++) {
    const s = side(start + k);
    if (s === 0 || s === side(start + k - 1)) continue;
    // a run turning the way of `s` starts at start + k
    let end = k;
    while (end + 1 <= n && side(start + end + 1) === s) end++;
    let apex = start + k;
    for (let j = k; j <= end; j++) if (Math.abs(samples[(start + j) % n].curve) > Math.abs(samples[apex % n].curve)) apex = start + j;
    const from = start + k - reach;
    const to = start + end + reach;
    // (a bend that tightens twice the same way, a double apex, is one corner)
    const last = runs[runs.length - 1];
    if (last && last.side === s && from <= last.to) {
      last.to = to;
      if (Math.abs(samples[apex % n].curve) > Math.abs(samples[last.apex % n].curve)) last.apex = apex;
    } else runs.push({ from, to, apex, side: s });
    k = end;
  }
  const wrap = (i: number) => ((i % n) + n) % n;
  return runs.map((r) => ({ from: wrap(r.from), to: wrap(r.to), apex: wrap(r.apex), side: r.side }));
}

/**
 * Which corner (an index into `corners`) a car at (x, y), nearest sample `idx`,
 * `width` px across, is cutting: all of it past the edge on a marked corner's
 * inside. Undefined if none.
 */
export function cutting(track: Track, corners: Corner[], idx: number, x: number, y: number, width: number): number | undefined {
  const lat = lateralOffset(track, idx, x, y);
  for (let c = 0; c < corners.length; c++) {
    const k = corners[c];
    if (inRange(idx, k.from, k.to) && lat * k.side > HALF_WIDTH + width / 2) return c;
  }
  return undefined;
}

/**
 * Judge a car this step: returns the strike if it has just cut a corner (with
 * the seconds it costs: 0 for a warning), and updates its record.
 */
export function judge(limits: Limits, track: Track, corners: Corner[], idx: number, x: number, y: number, width: number): { strike: number; seconds: number } | undefined {
  // through the corner it last cut: it can be struck there again next time round
  if (limits.corner !== undefined) {
    const k = corners[limits.corner];
    if (!k || !inRange(idx, k.from, k.to)) limits.corner = undefined;
  }
  const c = cutting(track, corners, idx, x, y, width);
  if (c === undefined || c === limits.corner) return undefined;
  limits.corner = c;
  limits.strikes++;
  return { strike: limits.strikes, seconds: limits.strikes > LIMITS.warnings ? LIMITS.penalty : 0 };
}

/** Whether a car at (x, y), nearest sample `idx`, `width` px across, has all four wheels past the white line, either side. */
export function wholeCarOff(track: Track, idx: number, x: number, y: number, width: number): boolean {
  return Math.abs(lateralOffset(track, idx, x, y)) > HALF_WIDTH + width / 2;
}

/**
 * Whether a car has just gone off the track this step, all four wheels past the white line either side (true once
 * per excursion: it's back on, a wheel inside the line, before it can count again). `excused`: off where it may be
 * (onto the pit entry road), which neither counts nor ends an excursion.
 */
export function offTrack(limits: Limits, track: Track, idx: number, x: number, y: number, width: number, excused = false): boolean {
  const off = wholeCarOff(track, idx, x, y, width);
  if (excused) return false;
  const went = off && !limits.off;
  limits.off = off;
  return went;
}
