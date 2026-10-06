import { describe, expect, it } from 'vitest';
import { carClass } from '../src/engine/driving';
import { HALF_WIDTH, KERB, buildCircuit } from '../src/f1/circuit';
import { offsetLine, paintNormals } from '../src/f1/circuitScene';
import { STAGE_SPECS, stageById } from '../src/f1/stages';
import { lineCornerSpeed, lineDecel } from '../src/f1/racing';

const f1 = carClass('f1');
const build = (id: string) => buildCircuit(stageById(id)!, { cornerSpeed: lineCornerSpeed(f1), decel: lineDecel(f1) });
/** The tarmac stages: the only ones with white lines and kerbs painted on (dirt has its berms instead). */
const TARMAC = STAGE_SPECS.filter((s) => s.surface === 'tarmac').map((s) => s.id);

/** Samples at each end of the road left out of the normals' checks: as many as a normal is averaged over either side. */
const ENDS = 4;

describe('the lines and kerbs painted along the road', () => {
  // (the kerbs once folded back on themselves where the centreline turned sharply from one sample to the next)
  it.each(TARMAC)('never fold back on themselves on %s', (id) => {
    const s = build(id).track.samples;
    const normal = paintNormals(s);
    for (const side of [-1, 1]) {
      for (const off of [KERB.inner, KERB.outer, HALF_WIDTH - 2, HALF_WIDTH + 6]) {
        const line = offsetLine(s, normal, side * off);
        for (let i = 0; i + 1 < s.length; i++) {
          // (each step along the road's way, never back against it)
          const forward = (line[i + 1].x - line[i].x) * normal[i + 1].y - (line[i + 1].y - line[i].y) * normal[i + 1].x;
          expect(forward).toBeGreaterThanOrEqual(-1e-9);
        }
      }
    }
  }, 30_000);

  it('follow the road: its normals smoothed only a little', () => {
    const { samples } = build('ss-castle-hill').track;
    const normal = paintNormals(samples);
    for (const [i, p] of samples.entries()) {
      expect(Math.hypot(normal[i].x, normal[i].y)).toBeCloseTo(1, 9);
      // (along the road; its very ends left out)
      if (i < ENDS || i >= samples.length - ENDS) continue;
      expect(normal[i].x * Math.cos(p.dir) + normal[i].y * Math.sin(p.dir)).toBeGreaterThan(Math.cos((20 * Math.PI) / 180));
    }
  }, 30_000);
});
