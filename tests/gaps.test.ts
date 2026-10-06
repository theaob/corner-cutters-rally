import { describe, expect, it } from 'vitest';
import { GAP_EVERY, gapBetween, newGapTimer, raceDistance, stepGaps } from '../src/f1/gaps';
import { newProgress, type RaceProgress, type Track } from '../src/f1/racing';

const n = 1000;
const track = { samples: new Array(n).fill(null), spacing: 8, length: n * 8 } as unknown as Track;
/** A racer at `dist` samples into the race. */
const at = (dist: number): RaceProgress => ({ ...newProgress(0), lap: Math.floor(dist / n), idx: dist % n, lapStart: 0 });

describe('gaps', () => {
  it('count distance into the race, negative on the grid', () => {
    expect(raceDistance({ ...newProgress(990) }, n)).toBe(-10);
    expect(raceDistance(at(2500), n)).toBe(2500);
  });

  it('time two cars at the same points: the one behind is behind by the time between them', () => {
    const g = newGapTimer(2);
    // both at 100 samples a second; car 1 follows 150 samples (1.5 s) behind
    for (let t = 0; t <= 20; t += 0.01) stepGaps(g, [at(Math.floor(t * 100)), at(Math.max(0, Math.floor((t - 1.5) * 100)))], track, t);
    expect(gapBetween(g, 0, 1)).toBeCloseTo(1.5, 1);
  });

  it('measure a lapped car a lap and more behind', () => {
    const g = newGapTimer(2);
    // car 0 at 100 samples/s, car 1 at 50: after 30 s car 0 is 3 laps in, car 1 one and a half
    for (let t = 0; t <= 30; t += 0.01) stepGaps(g, [at(Math.floor(t * 100)), at(Math.floor(t * 50))], track, t);
    // at car 1's last point (1500 samples) car 0 was there at 15 s; car 1 at 30 s
    expect(gapBetween(g, 0, 1)).toBeCloseTo(15, 0);
  });

  it('knows no gap before both cars have passed a timing point', () => {
    const g = newGapTimer(2);
    stepGaps(g, [at(GAP_EVERY * 2), { ...newProgress(990) }], track, 1);
    expect(gapBetween(g, 0, 1)).toBeUndefined();
  });
});
