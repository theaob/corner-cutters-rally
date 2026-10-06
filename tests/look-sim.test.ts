import { describe, expect, it } from 'vitest';
import { circleBlocked, moveCircle, type Grid } from '../src/engine/sim';

// 6x6 open room with a wall column at x = 3 (rows 0–3) and a solid border.
function room(): Grid {
  const w = 6;
  const h = 6;
  const solid = Array.from({ length: w * h }, (_, i) => {
    const x = i % w;
    const y = Math.floor(i / w);
    return x === 0 || y === 0 || x === w - 1 || y === h - 1 || (x === 3 && y <= 3);
  });
  return { width: w, height: h, tile: 16, solid };
}

describe('circle collision', () => {
  it('detects overlap with solid tiles and treats outside as solid', () => {
    const g = room();
    expect(circleBlocked(g, 24, 72, 4)).toBe(false);
    expect(circleBlocked(g, 45, 40, 4)).toBe(true); // touching the wall column
    expect(circleBlocked(g, -10, 40, 4)).toBe(true);
  });

  it('slides along a wall instead of stopping dead', () => {
    const r = moveCircle(room(), 30, 40, 20, 10, 4);
    expect(r.hitX).toBe(true);
    expect(r.hitY).toBe(false);
    expect(r.x).toBeLessThanOrEqual(44);
    expect(r.y).toBeCloseTo(50);
  });

  it('does not tunnel through a wall at high speed', () => {
    const r = moveCircle(room(), 30, 40, 200, 0, 4);
    expect(r.x).toBeLessThan(48);
  });
});
