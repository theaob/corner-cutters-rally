// Blue flags: a car about to be lapped is shown the blue flag and lets the
// leader through. A car is about to be lapped when one at least most of a lap
// ahead of it in the race is close behind it on the track. Under blue flags an
// AI driver moves off the line, lifts a touch on the straight and doesn't
// defend (racing.ts); the player is told (race.ts). Not under the safety car
// or the virtual one, in the pit lane, or after the flag. Engine-free and
// unit-tested.

import type { RaceProgress } from './racing';

export const BLUE = {
  /** px behind on the track within which a lapping car brings out the blue flag, and (a little further) keeps it out */
  range: 140,
  keep: 200,
  /** samples of the lap (a share) the lapping car must be ahead in the race: most of a lap */
  ahead: 0.6,
};

/** How far round the race a car is, in samples (on the grid, before its first crossing: behind the line). */
export const raceDistance = (p: RaceProgress, n: number) => (p.lapStart === undefined ? p.idx - n : p.lap * n + p.idx);

/**
 * For each car, the car lapping it that's close behind (its index), or undefined: `racers` the cars' progress,
 * `eligible` whether each is racing on the track (not in the pits, wrecked, retired or finished), `was` last step's
 * (a flag already out is kept a little longer), `n` the track's samples and `spacing` the px between them.
 */
export function blueFlags(racers: RaceProgress[], eligible: boolean[], was: (number | undefined)[], n: number, spacing: number): (number | undefined)[] {
  return racers.map((p, i) => {
    if (!eligible[i]) return undefined;
    let best: { j: number; d: number } | undefined;
    racers.forEach((q, j) => {
      if (j === i || !eligible[j]) return;
      if (raceDistance(q, n) - raceDistance(p, n) < BLUE.ahead * n) return;
      // px the lapping car is behind on the track
      const d = ((((p.idx - q.idx) % n) + n) % n) * spacing;
      if (d > (was[i] === j ? BLUE.keep : BLUE.range)) return;
      if (!best || d < best.d) best = { j, d };
    });
    return best?.j;
  });
}
