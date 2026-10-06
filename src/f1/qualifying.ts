// Qualifying: one flying lap, on your own, sets your place on the grid. You
// start standing on the straight before the line, with a few seconds to get
// going (and your bearings) before it; the lap is timed from the line back
// round to it. Track limits delete the lap: all four wheels past the white
// line anywhere, a cut or running wide (even in the step it crosses the line);
// the next one is timed afresh. The AI's times come from a reference lap (one AI
// car on the racing line, alone, on this track in this weather) scaled by each
// driver's pace, with a little spread either way, as its good and its scrappy
// laps. The grid is everyone in order of their times; no time starts at the
// back. Engine-free, like the race rules.

import { carClass, newCar, type HandlingParams } from '../engine/driving';
import { SIM_DT } from '../engine/fixedStep';
import type { Grid } from '../engine/sim';
import { newRace, stepRace, type Race } from './raceControl';
import { newProgress, type RaceProgress, type Track } from './racing';
import type { WeatherId } from './weather';

export const QUALI = {
  /** px before the line a session starts, standing: about 5 s of driving to the line (on a straight on every circuit) */
  runUp: 1200,
  /** an AI time's spread either way, as a share of it */
  spread: 0.008,
  /** laps of the session at most (it's over with your first good one) */
  laps: 99,
};

/** Put entrant `i` on the run-up to a flying lap: `QUALI.runUp` px before the line (or where the straight before it starts, if that's nearer), standing; the session under way. */
export function flyingStart(race: Race, i: number): void {
  const { track } = race;
  const n = track.samples.length;
  // (on the straight: where the run-up would start in the bend before it, a little further on)
  let idx = n - Math.round(QUALI.runUp / track.spacing);
  while (idx < n - 1 && Math.abs(track.samples[idx].curve) >= 1 / 500) idx++;
  const s = track.samples[idx];
  const e = race.entrants[i];
  Object.assign(e.car, { x: s.x, y: s.y, heading: s.dir, vx: 0, vy: 0 });
  e.progress = newProgress(idx);
  race.phase = 'racing';
  race.clock = 0;
}

/** A session on your own: just you (no pit stops), on the run-up to a flying lap. */
export function newQualifying(track: Track, grid: Grid, handling: HandlingParams, weather: WeatherId, car = newCar(carClass('f1'), 0, 0, 0)): Race {
  const race = newRace(track, grid, handling, QUALI.laps, [{ car }], 0, undefined, weather);
  flyingStart(race, 0);
  return race;
}

/** The reference lap (s): one AI car, flat out on the racing line on its own, a flying lap. */
export function referenceLap(track: Track, grid: Grid, handling: HandlingParams, weather: WeatherId): number {
  const race = newRace(track, grid, handling, QUALI.laps, [{ car: newCar(carClass('f1'), 0, 0, 0), ai: { lane: 0, pace: 1 } }], 0, undefined, weather);
  flyingStart(race, 0);
  const p = () => race.entrants[0].progress;
  for (let t = 0; t < 300 && !p().lapTimes.length; t += SIM_DT) stepRace(race, SIM_DT);
  return p().lapTimes[0] ?? track.length / 250;
}

/** Each AI driver's time from its pace (undefined for you: yours is driven), off the reference lap, spread by `rng`. */
export const aiTimes = (paces: (number | undefined)[], reference: number, rng: () => number): (number | undefined)[] =>
  paces.map((pace) => (pace === undefined ? undefined : (reference / pace) * (1 + (rng() * 2 - 1) * QUALI.spread)));

/** The grid: drivers (indexes into `times`) in order of their times, quickest first; no time at the back, in the order they came. */
export function gridOrder(times: (number | undefined)[]): number[] {
  return times
    .map((time, i) => ({ time: time ?? Infinity, i }))
    .sort((a, b) => a.time - b.time || a.i - b.i)
    .map((d) => d.i);
}

/** Your session so far: laps completed, and whether the lap you're on has been deleted. */
export interface QualiLap {
  laps: number;
  deleted: boolean;
}

export const newQualiLap = (): QualiLap => ({ laps: 0, deleted: false });

/**
 * Judge your session this step (`cut`: you broke track limits, all four wheels
 * past the white line): 'deleted' the moment a timed lap is cut, 'void' as a
 * deleted lap ends (the next one is timed afresh), your time as a good one ends.
 */
export function judgeLap(q: QualiLap, p: RaceProgress, cut: boolean): 'deleted' | 'void' | { time: number } | undefined {
  if (p.lapTimes.length > q.laps) {
    q.laps = p.lapTimes.length;
    const time = p.lapTimes[p.lapTimes.length - 1];
    if (q.deleted) {
      q.deleted = false;
      return 'void';
    }
    // (a cut in the very step it crosses the line was on the way to it: that lap is deleted, the next one starts clean)
    if (cut) return 'deleted';
    return { time };
  }
  // (a cut on the run-up, before the timed lap, doesn't count)
  if (cut && p.lapStart !== undefined && !q.deleted) {
    q.deleted = true;
    return 'deleted';
  }
  return undefined;
}
