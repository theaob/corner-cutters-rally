import { describe, expect, it } from 'vitest';
import { carClass } from '../src/engine/driving';
import { HALF_WIDTH, RUNOFF, buildCircuit } from '../src/f1/circuit';
import { inLake, lakesOf } from '../src/f1/lakes';
import { LAYOUTS, TWIN_LAKES } from '../src/f1/layouts';
import { lineCornerSpeed, lineDecel } from '../src/f1/racing';
import { standsOf } from '../src/f1/stands';

const f1 = carClass('f1');

describe('the lakes at Twin Lakes', () => {
  const c = buildCircuit(TWIN_LAKES, { cornerSpeed: lineCornerSpeed(f1), decel: lineDecel(f1) });
  const lakes = lakesOf(c);

  it('are its two, and only there', () => {
    expect(lakes).toHaveLength(2);
    expect(LAYOUTS.filter((l) => l.lakes?.length)).toEqual([TWIN_LAKES]);
  });

  it('lie clear of the track, its run-off and barriers, and the pit lane (right behind the barriers, where you see them)', () => {
    for (const p of c.track.samples) expect(inLake(lakes, p.x, p.y, HALF_WIDTH + RUNOFF + 24)).toBe(false);
    for (const q of c.pit.points) expect(inLake(lakes, q.x, q.y, 100)).toBe(false);
  });

  it('keep the grandstands out of the water', () => {
    for (const s of standsOf(c)) expect(inLake(lakes, s.x, s.y, 20)).toBe(false);
  });

  it('come up close behind the barriers, in sight as you drive by', () => {
    for (const l of lakes) {
      let nearest = Infinity;
      for (const p of l) for (const q of c.track.samples) nearest = Math.min(nearest, Math.hypot(p.x - q.x, p.y - q.y));
      expect(nearest).toBeLessThan(HALF_WIDTH + RUNOFF + 60);
    }
  });

  it('are big: a lake, not a pond', () => {
    for (const l of lakes) {
      const xs = l.map((p) => p.x);
      const ys = l.map((p) => p.y);
      expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(500);
      expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(300);
    }
  });
});
