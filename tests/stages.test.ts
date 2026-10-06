import { describe, expect, it } from 'vitest';
import { carClass } from '../src/engine/driving';
import { HALF_WIDTH, RUNOFF, buildCircuit } from '../src/f1/circuit';
import { layoutById } from '../src/f1/layouts';
import { lineCornerSpeed, lineDecel, smoothLoop, stageSplits } from '../src/f1/racing';
import { RALLIES } from '../src/f1/rally';
import { ROAD, STAGE_SPECS, buildStage, growRoad, stageById } from '../src/f1/stages';

const f1 = carClass('f1');
const build = (id: string) => buildCircuit(stageById(id)!, { cornerSpeed: lineCornerSpeed(f1), decel: lineDecel(f1) });

describe('an open road', () => {
  it('runs from its first point to its last, never back round to the first', () => {
    const pts = smoothLoop([{ x: 0, y: 0 }, { x: 500, y: 0 }, { x: 1000, y: 200 }], 8, true);
    expect(pts[0]).toEqual({ x: 0, y: 0 });
    const last = pts[pts.length - 1];
    expect(Math.hypot(last.x - 1000, last.y - 200)).toBeLessThan(8);
    // (no stretch from the last point back to the first)
    pts.forEach((p, i) => i && expect(Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y)).toBeLessThan(8.5));
  });
});

describe.each(STAGE_SPECS)('the $name stage', (spec) => {
  const c = build(spec.id);
  const { track } = c;
  it('is a long road with two ends: a start line near one, the flying finish near the other', () => {
    expect(track.open).toBe(true);
    const { start, finish } = track.stage!;
    expect(finish - start).toBeGreaterThanOrEqual(spec.length);
    expect(track.length - finish).toBeGreaterThan(ROAD.runout - 50);
    const a = track.samples[0];
    const b = track.samples[track.samples.length - 1];
    // (its two ends nowhere near each other: not a loop)
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(2 * (HALF_WIDTH + RUNOFF));
  });
  it('never crosses or runs alongside itself', () => {
    const n = track.samples.length;
    const near = ROAD.near / track.spacing;
    for (let i = 0; i < n; i += 6) {
      for (let j = i + near; j < n; j += 3) {
        const p = track.samples[i];
        const q = track.samples[j];
        expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeGreaterThan(2 * (HALF_WIDTH + RUNOFF));
      }
    }
  });
  it('fits a map the game can draw', () => {
    expect(c.width * 16).toBeLessThanOrEqual(4800);
    expect(c.height * 16).toBeLessThanOrEqual(4800);
  });
  it('starts its car on the road behind the start line, facing along it', () => {
    const slot = c.slots[0];
    const s = track.samples[Math.round((track.stage!.start - 24) / track.spacing)];
    expect(Math.hypot(slot.x - s.x, slot.y - s.y)).toBeLessThan(20);
    expect(slot.heading).toBeCloseTo(s.dir);
  });
  it('splits it in three between the start and the finish', () => {
    const [a, b] = stageSplits(track);
    const { start, finish } = track.stage!;
    expect(a - start).toBeCloseTo((finish - start) / 3);
    expect(b - a).toBeCloseTo((finish - start) / 3);
  });
  it('puts its jumps on the stage, clear of its start and finish', () => {
    for (const j of stageById(spec.id)!.jumps ?? []) {
      expect(j.at).toBeGreaterThan(track.stage!.start);
      expect(j.at).toBeLessThan(track.stage!.finish);
    }
  });
});

describe('the stages', () => {
  it('are the same road from the same seed', () => {
    expect(growRoad(STAGE_SPECS[0])).toEqual(growRoad(STAGE_SPECS[0]));
    expect(buildStage(STAGE_SPECS[2]).points).toEqual(buildStage(STAGE_SPECS[2]).points);
  });
  it('are every rally stage, each found by its id', () => {
    for (const r of RALLIES) for (const s of r.stages) expect(layoutById(s.layout)?.stage, s.layout).toBeDefined();
    expect(new Set(STAGE_SPECS.map((s) => s.id)).size).toBe(STAGE_SPECS.length);
  });
});
