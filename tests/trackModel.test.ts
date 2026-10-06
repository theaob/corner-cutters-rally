import { describe, expect, it } from 'vitest';
import { LAYOUTS } from '../src/f1/layouts';
import { TRACK_MODEL, fitModel, heightColor, project, trackModel } from '../src/f1/trackModel';

describe('the circuit as a line in 3D', () => {
  it('follows each lap at the heights its elevation profile gives', () => {
    for (const layout of LAYOUTS) {
      const m = trackModel(layout);
      const profile = layout.elevation.map(([, h]) => h);
      expect(m.pts.length).toBeGreaterThan(100);
      // (the profile eases between its points, so the line's highest and lowest are the profile's)
      expect(m.hMin).toBeCloseTo(Math.min(...profile), 0);
      // (a bridge lifts the stretch over it, by up to its height)
      if (layout.bridge) {
        expect(m.hMax).toBeGreaterThan(Math.max(...profile));
        expect(m.hMax).toBeLessThanOrEqual(Math.max(...profile) + layout.bridge.height);
      } else expect(m.hMax).toBeCloseTo(Math.max(...profile), 0);
      expect(m.pts[0].h).toBeCloseTo(layout.elevation[0][1], 5);
    }
  });

  it('fits its drawing, hills and all, however far round it has turned', () => {
    for (const layout of LAYOUTS) {
      const m = trackModel(layout);
      const [w, h] = [224, 168];
      const view = fitModel(m, w, h);
      for (let yaw = 0; yaw < 2 * Math.PI; yaw += 0.2) {
        for (const p of m.pts) {
          for (const at of [p.h, m.hMin]) {
            const s = project(m, view, p, at, yaw);
            expect(s.x).toBeGreaterThanOrEqual(0);
            expect(s.x).toBeLessThanOrEqual(w);
            expect(s.y).toBeGreaterThanOrEqual(0);
            expect(s.y).toBeLessThanOrEqual(h);
          }
        }
      }
    }
  }, 30_000);

  it('draws a higher point higher up the screen than the ground under it, by more than it is', () => {
    const ardennes = trackModel(LAYOUTS.find((l) => l.id === 'ardennes')!);
    const view = fitModel(ardennes, 224, 168);
    const top = ardennes.pts.reduce((a, b) => (b.h > a.h ? b : a));
    const up = project(ardennes, view, top, ardennes.hMin, 0).y - project(ardennes, view, top, top.h, 0).y;
    const asItIs = (top.h - ardennes.hMin) * view.k * Math.cos((TRACK_MODEL.pitch * Math.PI) / 180);
    expect(up).toBeCloseTo(asItIs * TRACK_MODEL.rise, 5);
    expect(up).toBeGreaterThan(10);
  });

  it('colours the lowest point cool and the highest warm', () => {
    const m = trackModel(LAYOUTS[0]);
    expect(heightColor(m, m.hMin)).toEqual([...TRACK_MODEL.low]);
    expect(heightColor(m, m.hMax)).toEqual([...TRACK_MODEL.high]);
  });
});
