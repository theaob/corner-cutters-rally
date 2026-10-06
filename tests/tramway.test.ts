import { describe, expect, it } from 'vitest';
import { carClass } from '../src/engine/driving';
import { groundAt } from '../src/engine/sim';
import { HALF_WIDTH, RUNOFF, buildCircuit } from '../src/f1/circuit';
import { GLACIER_PASS, LAYOUTS } from '../src/f1/layouts';
import { lineCornerSpeed, lineDecel } from '../src/f1/racing';
import { TRAMWAY, cabinsAt, ropeAt, tramwayOf } from '../src/f1/tramway';

const f1 = carClass('f1');
const c = buildCircuit(GLACIER_PASS, { cornerSpeed: lineCornerSpeed(f1), decel: lineDecel(f1) });
const t = tramwayOf(c)!;
/** px from a point to the track's centreline, at the nearest */
const fromTrack = (x: number, y: number) => Math.min(...c.track.samples.map((p) => Math.hypot(p.x - x, p.y - y)));

describe('the aerial tramway', () => {
  it('runs at Glacier Pass, and only there: from the valley floor up the mountain', () => {
    expect(t).toBeDefined();
    for (const l of LAYOUTS) if (l !== GLACIER_PASS) expect(l.tramway).toBeUndefined();
    expect(t.to.h - t.from.h).toBeGreaterThan(120);
    expect(t.supports.length).toBe(TRAMWAY.towers + 2);
  });

  it('is clear of the track: its stations past the barriers, and its line never over the lap', () => {
    for (const s of [t.from, t.to]) expect(fromTrack(s.x, s.y)).toBeGreaterThan(HALF_WIDTH + RUNOFF + Math.hypot(TRAMWAY.house.along, TRAMWAY.house.across) / 2);
    for (let f = 0; f <= 1; f += 0.01) {
      for (const side of [-1, 1]) {
        const r = ropeAt(t, f, side);
        expect(fromTrack(r.x, r.y)).toBeGreaterThan(HALF_WIDTH + RUNOFF);
      }
    }
  });

  it('keeps its ropes well above the ground all the way, sagging between their supports, and resting on them', () => {
    for (let f = 0; f <= 1; f += 0.002) {
      for (const side of [-1, 1]) {
        const r = ropeAt(t, f, side);
        expect(r.z - groundAt(c.grid, r.x, r.y).h).toBeGreaterThanOrEqual(TRAMWAY.clearance);
      }
    }
    // (on each support; below the straight line between two of them mid-span)
    const spans = t.supports.length - 1;
    t.supports.forEach((p, k) => expect(ropeAt(t, k / spans).z).toBeCloseTo(p.z, 5));
    for (let k = 0; k < spans; k++) expect(ropeAt(t, (k + 0.5) / spans).z).toBeLessThan((t.supports[k].z + t.supports[k + 1].z) / 2 - 5);
    // (the ropes a gauge apart)
    const a = ropeAt(t, 0.3, -1);
    const b = ropeAt(t, 0.3, 1);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(TRAMWAY.gauge, 5);
  });

  it('hauls its two cabins together: one up as the other comes down, passing mid-way, each waiting at its station', () => {
    const leg = TRAMWAY.travel + TRAMWAY.dwell;
    for (let time = 0; time < 4 * leg; time += 0.25) {
      const [a, b] = cabinsAt(time);
      expect(a + b).toBeCloseTo(1, 9);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(1);
    }
    expect(cabinsAt(0)).toEqual([0, 1]);
    expect(cabinsAt(TRAMWAY.travel / 2)[0]).toBeCloseTo(0.5, 9);
    // (at the top, it waits there, then comes back down)
    expect(cabinsAt(TRAMWAY.travel)[0]).toBe(1);
    expect(cabinsAt(TRAMWAY.travel + TRAMWAY.dwell - 0.01)[0]).toBe(1);
    expect(cabinsAt(leg + TRAMWAY.travel / 2)[0]).toBeCloseTo(0.5, 9);
    expect(cabinsAt(2 * leg - 0.01)[0]).toBe(0);
    // (easing away and in: slow at either end, quickest mid-way)
    const speed = (time: number) => Math.abs(cabinsAt(time + 0.01)[0] - cabinsAt(time)[0]);
    expect(speed(0.2)).toBeLessThan(speed(TRAMWAY.travel / 2) / 5);
  });
});
