import { describe, expect, it } from 'vitest';
import { carClass, newCar } from '../src/engine/driving';
import { buildCircuit } from '../src/f1/circuit';
import { SUZUKA } from '../src/f1/layouts';
import { lineCornerSpeed, lineDecel, newProgress, stepProgress, type RaceProgress } from '../src/f1/racing';

const f1 = carClass('f1');

describe('a shortcut across the infield', () => {
  // Suzuka's figure of eight: round the crossing its two halves run side by side, a strip of grass apart
  const c = buildCircuit(SUZUKA, { cornerSpeed: lineCornerSpeed(f1), decel: lineDecel(f1) });
  const { track } = c;
  const s = track.samples;
  const n = s.length;
  const car = newCar(f1, 0, 0);
  const at = (p: RaceProgress, i: number, time: number) => {
    const q = s[((i % n) + n) % n];
    Object.assign(car, { x: q.x, y: q.y, heading: q.dir, vx: 0, vy: 0 });
    return stepProgress(p, track, car, time, 3, 1 / 60);
  };
  // (a sample on the first half, and the nearest on the other, a long way on round the lap)
  const from = 530;
  let to = 0;
  for (let j = 0; j < n; j++) {
    const along = Math.min(Math.abs(j - from), n - Math.abs(j - from));
    if (along > 300 && (to === 0 || Math.hypot(s[j].x - s[from].x, s[j].y - s[from].y) < Math.hypot(s[to].x - s[from].x, s[to].y - s[from].y))) to = j;
  }

  it('is there to try: the other half of the lap a short hop across the grass', () => {
    expect(Math.hypot(s[to].x - s[from].x, s[to].y - s[from].y)).toBeLessThan(150);
    expect(Math.min(Math.abs(to - from), n - Math.abs(to - from))).toBeGreaterThan(300);
  });

  it("gains nothing: a car that cuts across is still where it left the track, and the lap doesn't count", () => {
    // on lap 1, driven round to the cut
    let p = at(newProgress(n - 5), n - 3, 0);
    p = at(p, 2, 1);
    for (let i = 2; i <= from; i += 4) p = at(p, i, 1 + i / 40);
    expect(p.sector).toBe(1);
    // across the grass, and on round the other half to the line
    p = at(p, to, 20);
    expect(Math.min(Math.abs(p.idx - from), n - Math.abs(p.idx - from))).toBeLessThanOrEqual(40);
    expect(p.sector).toBe(1);
    for (let i = to; i <= n + 2; i += 4) p = at(p, i, 21 + (i - to) / 40);
    expect(p.lap).toBe(0);
  });
});
