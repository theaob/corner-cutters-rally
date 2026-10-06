// Time gaps between cars, as timing loops measure them: the race clock is
// noted as each car passes each timing point round the lap (every `every`
// track samples), and the gap between two cars is the difference in their
// times at the last point both have passed. Engine-free and unit-tested.

import type { RaceProgress, Track } from './racing';

/** Track samples between timing points (8 px apart: 20 samples is 160 px). */
export const GAP_EVERY = 20;
/** Timing points kept per car (enough for more than a lap's gap). */
const KEEP = 200;

export interface GapTimer {
  /** per car: race time at each timing point passed, by the point's number counted from the start */
  passed: Map<number, number>[];
  /** per car: the last timing point passed */
  last: number[];
}

export const newGapTimer = (cars: number): GapTimer => ({ passed: Array.from({ length: cars }, () => new Map()), last: new Array(cars).fill(-Infinity) });

/** A car's distance into the race, in track samples (behind the line on the grid is negative). */
export const raceDistance = (p: RaceProgress, n: number) => (p.lapStart === undefined ? p.idx - n : p.lap * n + p.idx);

/** Note the timing points each car has passed by race time `clock`. */
export function stepGaps(g: GapTimer, racers: RaceProgress[], track: Track, clock: number): void {
  const n = track.samples.length;
  racers.forEach((p, i) => {
    if (p.retired) return;
    const point = Math.floor(raceDistance(p, n) / GAP_EVERY);
    if (point <= g.last[i]) return;
    // (a car can pass more than one point in a step at the start: each gets this time)
    const from = Number.isFinite(g.last[i]) ? g.last[i] + 1 : point;
    for (let k = from; k <= point; k++) g.passed[i].set(k, clock);
    g.last[i] = point;
    while (g.passed[i].size > KEEP) g.passed[i].delete(g.passed[i].keys().next().value!);
  });
}

/** Seconds car `behind` is behind car `ahead`, at the last timing point both have passed (undefined if none yet). */
export function gapBetween(g: GapTimer, ahead: number, behind: number): number | undefined {
  const point = Math.min(g.last[ahead], g.last[behind]);
  const a = g.passed[ahead].get(point);
  const b = g.passed[behind].get(point);
  return a === undefined || b === undefined ? undefined : b - a;
}
