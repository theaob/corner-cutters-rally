import { describe, expect, it } from 'vitest';
import { carClass } from '../src/engine/driving';
import { HALF_WIDTH, buildCircuit } from '../src/f1/circuit';
import { LAYOUTS } from '../src/f1/layouts';
import { MARINA, cruiseAt, marinaOf } from '../src/f1/marina';
import { lineCornerSpeed, lineDecel } from '../src/f1/racing';
import { inView, inside, seaOf } from '../src/f1/town3d';

const f1 = carClass('f1');
const harbour = LAYOUTS.find((l) => l.id === 'harbour')!;
const c = buildCircuit(harbour, { cornerSpeed: lineCornerSpeed(f1), decel: lineDecel(f1) });
const sea = seaOf(c)!;
const m = marinaOf(c);
const samples = c.track.samples;
const fromTrack = (x: number, y: number) => Math.min(...samples.map((p) => Math.hypot(p.x - x, p.y - y)));
const keep = HALF_WIDTH + harbour.street!.runoff;

describe("the Harbour's marina", () => {
  it('has its pontoons, wholly in the sea and clear of the track', () => {
    expect(m.piers.length).toBe(MARINA.piers);
    for (const p of m.piers) {
      for (let a = 10; a <= p.length; a += 10) {
        expect(inside(sea, p.x + p.dx * a, p.y + p.dy * a)).toBe(true);
        expect(fromTrack(p.x + p.dx * a, p.y + p.dy * a)).toBeGreaterThan(keep);
      }
    }
  });

  it('is in the picture as you drive by: the inner half of each pontoon, by the quay, with the boats either side', () => {
    const half = MARINA.length / 2;
    const reach = (MARINA.stern + MARINA.boat[1]) * 2;
    for (const p of m.piers) {
      const w = Math.abs(p.dx) * half + Math.abs(p.dy) * reach;
      const d = Math.abs(p.dy) * half + Math.abs(p.dx) * reach;
      expect(inView(samples, p.x + (p.dx * half) / 2, p.y + (p.dy * half) / 2, w, d)).toBeGreaterThan(0.35);
    }
  });

  it('has boats to scale with the cars (an F1 car is 30 px, 5.5 m): yachts 10–15 m, bigger ones going round', () => {
    for (const b of m.berths) expect(b.length).toBeGreaterThanOrEqual(55);
    for (const cr of m.cruises) expect(cr.length).toBeGreaterThanOrEqual(70);
  });

  it('has no two moored boats overlapping', () => {
    // (each a box its length by a third of it, its bow pointing out from the pontoon: side by side along it)
    for (const a of m.berths) for (const b of m.berths) {
      if (a === b) continue;
      const along = Math.abs((b.x - a.x) * Math.cos(a.heading) + (b.y - a.y) * Math.sin(a.heading));
      const out = Math.abs((b.x - a.x) * Math.sin(a.heading) - (b.y - a.y) * Math.cos(a.heading));
      expect(along >= (a.length + b.length) * 0.16 || out >= (a.length + b.length) / 2).toBe(true);
    }
  });

  it('has boats moored along both sides of each pontoon, in the sea', () => {
    expect(m.berths.length).toBeGreaterThan(MARINA.piers * 6);
    for (const b of m.berths) expect(inside(sea, b.x, b.y)).toBe(true);
  });

  it('has boats going round out on the water, all the way round in the sea and clear of the track', () => {
    expect(m.cruises.length).toBe(MARINA.cruisers);
    for (const cr of m.cruises) {
      for (let t = 0; t < cr.period; t += cr.period / 24) {
        const p = cruiseAt(cr, t);
        expect(inside(sea, p.x, p.y)).toBe(true);
        expect(fromTrack(p.x, p.y)).toBeGreaterThan(keep);
      }
    }
  });

  it('is only at the seaside', () => {
    const park = buildCircuit(LAYOUTS[0], { cornerSpeed: lineCornerSpeed(f1), decel: lineDecel(f1) });
    expect(marinaOf(park)).toEqual({ piers: [], berths: [], cruises: [] });
  });
});
