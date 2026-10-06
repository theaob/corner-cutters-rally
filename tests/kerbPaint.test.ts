import { describe, expect, it } from 'vitest';
import { carClass } from '../src/engine/driving';
import { HALF_WIDTH, KERB, buildCircuit } from '../src/f1/circuit';
import { offsetLine, paintNormals } from '../src/f1/circuitScene';
import { LAYOUTS } from '../src/f1/layouts';
import { lineCornerSpeed, lineDecel } from '../src/f1/racing';

const f1 = carClass('f1');

describe('the lines and kerbs painted along the track', () => {
  // (Ardennes' kerbs folded back on themselves where its centreline turns sharply from one sample to the next)
  it.each(LAYOUTS.map((l) => [l.id, l] as const))('never fold back on themselves at %s', (_, layout) => {
    const c = buildCircuit(layout, { cornerSpeed: lineCornerSpeed(f1), decel: lineDecel(f1) });
    const s = c.track.samples;
    const normal = paintNormals(s);
    for (const side of [-1, 1]) {
      for (const off of [KERB.inner, KERB.outer, HALF_WIDTH - 2, HALF_WIDTH + 6]) {
        const line = offsetLine(s, normal, side * off);
        for (let i = 0; i + 1 < s.length; i++) {
          // (each step along the track's way round, never back against it)
          const forward = (line[i + 1].x - line[i].x) * normal[i + 1].y - (line[i + 1].y - line[i].y) * normal[i + 1].x;
          expect(forward).toBeGreaterThanOrEqual(-1e-9);
        }
      }
    }
  });
  it('follow the track: its normals smoothed only a little', () => {
    const c = buildCircuit(LAYOUTS.find((l) => l.id === 'ardennes')!, { cornerSpeed: lineCornerSpeed(f1), decel: lineDecel(f1) });
    const normal = paintNormals(c.track.samples);
    for (const [i, p] of c.track.samples.entries()) {
      expect(Math.hypot(normal[i].x, normal[i].y)).toBeCloseTo(1, 9);
      expect(normal[i].x * Math.cos(p.dir) + normal[i].y * Math.sin(p.dir)).toBeGreaterThan(Math.cos((20 * Math.PI) / 180));
    }
  });
});
