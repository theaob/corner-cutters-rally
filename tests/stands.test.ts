import { describe, expect, it } from 'vitest';
import { carClass } from '../src/engine/driving';
import { HALF_WIDTH, RUNOFF, buildCircuit } from '../src/f1/circuit';
import { LAYOUTS } from '../src/f1/layouts';
import { lineCornerSpeed, lineDecel } from '../src/f1/racing';
import { STAND, standsOf } from '../src/f1/stands';
import { seeOver } from '../src/f1/town3d';

const f1 = carClass('f1');

describe.each(LAYOUTS)('the grandstands at $name', (layout) => {
  const c = buildCircuit(layout, { cornerSpeed: lineCornerSpeed(f1), decel: lineDecel(f1) });
  const stands = standsOf(c);
  const reach = HALF_WIDTH + (layout.street?.runoff ?? RUNOFF);
  const fromTrack = (x: number, y: number) => Math.min(...c.track.samples.map((p) => Math.hypot(p.x - x, p.y - y)));

  it(layout.street ? 'line the main straight (the town is round the bends)' : 'line the main straight and the outside of the bends', () => {
    expect(stands.filter((s) => s.at === 'start')).toHaveLength(3);
    if (layout.street) expect(stands.filter((s) => s.at === 'bend')).toHaveLength(0);
    else expect(stands.filter((s) => s.at === 'bend').length).toBeGreaterThanOrEqual(5);
  });
  it('stand clear of the track and its run-off, every one of them, the main straight\'s too (another stretch can pass behind it)', () => {
    for (const s of stands) {
      const ax = { x: Math.sin(s.dir), y: -Math.cos(s.dir) };
      const ac = { x: Math.cos(s.dir), y: Math.sin(s.dir) };
      for (const u of [-0.5, 0, 0.5]) for (const v of [-0.5, 0, 0.5]) {
        const x = s.x + ax.x * u * s.len + ac.x * v * STAND.depth;
        const y = s.y + ax.y * u * s.len + ac.y * v * STAND.depth;
        expect(fromTrack(x, y)).toBeGreaterThan(reach);
      }
    }
  });
  it('stand clear of the pits and each other (by the bends)', () => {
    for (const s of stands.filter((x) => x.at === 'bend')) {
      expect(fromTrack(s.x, s.y)).toBeGreaterThan(reach + STAND.depth / 2);
      expect(c.pit.points.every((q) => Math.hypot(q.x - s.x, q.y - s.y) >= STAND.clearOfPits)).toBe(true);
      for (const o of stands) if (o !== s) expect(Math.hypot(o.x - s.x, o.y - s.y)).toBeGreaterThanOrEqual(STAND.apart);
    }
  });
  it('never hide the track from the camera, flags and all', () => {
    for (const s of stands.filter((x) => x.at === 'bend')) {
      const span = Math.abs(Math.sin(s.dir)) * s.len + Math.abs(Math.cos(s.dir)) * STAND.depth;
      const deep = Math.abs(Math.cos(s.dir)) * s.len + Math.abs(Math.sin(s.dir)) * STAND.depth;
      expect(seeOver(c, s.x, s.y, span, deep)).toBeGreaterThanOrEqual(STAND.flags);
    }
  });
});
