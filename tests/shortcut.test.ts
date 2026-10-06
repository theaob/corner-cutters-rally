import { describe, expect, it } from 'vitest';
import { carClass, newCar } from '../src/engine/driving';
import { buildCircuit } from '../src/f1/circuit';
import { lineCornerSpeed, lineDecel, newProgress, stepProgress, type RaceProgress } from '../src/f1/racing';
import { ROAD, stageById } from '../src/f1/stages';

const f1 = carClass('f1');

describe('a shortcut across to another stretch of the stage', () => {
  // Fox Hollow, tight and technical: its road winds back on itself, a stretch far further on only a hop away
  const c = buildCircuit(stageById('ss-fox-hollow')!, { cornerSpeed: lineCornerSpeed(f1), decel: lineDecel(f1) });
  const { track } = c;
  const s = track.samples;
  const n = s.length;
  const car = newCar(f1, 0, 0);
  const at = (p: RaceProgress, i: number, time: number) => {
    const q = s[Math.max(0, Math.min(n - 1, i))];
    Object.assign(car, { x: q.x, y: q.y, heading: q.dir, vx: 0, vy: 0 });
    return stepProgress(p, track, car, time, 1, 1 / 60);
  };
  // (the two samples, a long way apart along the road, nearest each other across the scenery)
  const far = Math.ceil((2 * ROAD.near) / track.spacing);
  const gap = (i: number, j: number) => Math.hypot(s[j].x - s[i].x, s[j].y - s[i].y);
  let from = 0;
  let to = n - 1;
  for (let i = 0; i + far < n; i += 2) {
    for (let j = i + far; j < n; j += 2) if (gap(i, j) < gap(from, to)) [from, to] = [i, j];
  }

  it('is there to try: a stretch far further down the road, a short hop across the scenery', () => {
    expect(gap(from, to)).toBeLessThan(2 * ROAD.apart);
    expect((to - from) * track.spacing).toBeGreaterThan(2 * ROAD.near);
  });

  it("gains nothing: a car that cuts across is still where it left the road, however far it drives on from there", () => {
    let p = at(newProgress(0), 0, 0);
    // driven down the road to the cut
    for (let i = 0; i <= from; i += 4) p = at(p, i, i / 40);
    expect(Math.abs(p.idx - from)).toBeLessThanOrEqual(4);
    // across, and on down the road from the far stretch
    p = at(p, to, 20);
    expect(Math.abs(p.idx - from)).toBeLessThanOrEqual(40);
    for (let i = to; i <= to + 200; i += 4) p = at(p, i, 21 + (i - to) / 40);
    expect(p.idx).toBeLessThanOrEqual(from + 40);
  });
});
