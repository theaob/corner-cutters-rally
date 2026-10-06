import { describe, expect, it } from 'vitest';
import { carClass } from '../src/engine/driving';
import { HALF_WIDTH, buildCircuit } from '../src/f1/circuit';
import { GOPHER, GopherRun } from '../src/f1/gopher';
import { LAYOUTS, TWIN_LAKES } from '../src/f1/layouts';
import { lateralOffset, lineCornerSpeed, lineDecel, nearestSample } from '../src/f1/racing';

const f1 = carClass('f1');
const c = buildCircuit(TWIN_LAKES, { cornerSpeed: lineCornerSpeed(f1), decel: lineDecel(f1) });
const focus = c.track.samples[200];
const far = { x: -99999, y: -99999, vx: 0, vy: 0 };
/** how far across the track (px from its centreline) a point is */
const across = (p: { x: number; y: number }) => lateralOffset(c.track, nearestSample(c.track, p.x, p.y), p.x, p.y);
/** on until it sets off across (at most `limit` s) */
const untilOut = (g: GopherRun, cars = [far], limit = 60) => {
  for (let t = 0; t < limit && !g.crossing; t += 1 / 60) g.step(1 / 60, cars, focus);
};

describe('the gopher', () => {
  it('lives at Twin Lakes, and only there', () => {
    expect(TWIN_LAKES.gophers).toBe(true);
    for (const l of LAYOUTS) if (l !== TWIN_LAKES) expect(l.gophers).toBeFalsy();
  });

  it('waits in its hole a while, then pops up up the road from the camera, from a hole just off one side of the track to one just off the other', () => {
    const g = new GopherRun(c.track);
    g.step(1, [far], focus);
    expect(g.crossing).toBeUndefined();
    expect(g.pose()).toBeUndefined();
    untilOut(g);
    const x = g.crossing!;
    expect(x).toBeDefined();
    for (const h of [x.from, x.to]) {
      const along = c.track.samples[nearestSample(c.track, h.x, h.y)].s - focus.s;
      expect(along).toBeGreaterThan(GOPHER.ahead.from - 30);
      expect(along).toBeLessThan(GOPHER.ahead.to + 30);
      expect(Math.abs(across(h))).toBeGreaterThan(HALF_WIDTH);
    }
    // (wherever round the lap: both in the grass, never on another stretch of the track running by)
    for (const s of c.track.samples.filter((_, i) => i % 7 === 0)) {
      const g = new GopherRun(c.track, s.x | 0);
      for (let t = 0; t < 60 && !g.crossing; t += 1 / 4) g.step(1 / 4, [far], s);
      if (g.crossing) for (const h of [g.crossing.from, g.crossing.to]) expect(Math.abs(across(h))).toBeGreaterThan(HALF_WIDTH + GOPHER.holeOut / 2);
    }
    // (one either side)
    expect(Math.sign(across(x.from))).toBe(-Math.sign(across(x.to)));
    // popping up out of the hole: not up at first, then all the way
    expect(g.pose()!.up).toBeLessThan(0.2);
    for (let t = 0; t < GOPHER.peek * 0.6; t += 1 / 60) g.step(1 / 60, [far], focus);
    expect(g.pose()!.up).toBe(1);
  });

  it('scurries all the way across and ducks into the far hole; then waits again', () => {
    const g = new GopherRun(c.track);
    untilOut(g);
    const to = g.crossing!.to;
    let seen = 0;
    for (let t = 0; t < 20 && g.crossing; t += 1 / 60) {
      g.step(1 / 60, [far], focus);
      const p = g.pose();
      if (p?.running) seen++;
      if (p) expect(Math.abs(across(p))).toBeLessThan(HALF_WIDTH + GOPHER.holeOut + 20);
    }
    expect(seen).toBeGreaterThan(30);
    expect(g.crossing).toBeUndefined();
    expect(g.crossings).toBe(1);
    expect(g.bolts).toBe(0);
    expect(to).toBeDefined();
    g.step(1, [far], focus);
    expect(g.crossing).toBeUndefined();
    untilOut(g);
    expect(g.crossing).toBeDefined();
  });

  it('only sets off with no car near; with cars all the way up the road ahead, it stays in its hole', () => {
    const i0 = c.track.samples.indexOf(focus);
    const ahead = c.track.samples.slice(i0, i0 + 200).filter((p) => p.s - focus.s <= GOPHER.ahead.to + 40);
    const cars = ahead.filter((_, i) => i % 20 === 0).map((p) => ({ x: p.x, y: p.y, vx: 0, vy: 0 }));
    const g = new GopherRun(c.track);
    untilOut(g, cars, 60);
    expect(g.crossing).toBeUndefined();
    // and with a car up the road, never sets off from beside it: farther on
    const g2 = new GopherRun(c.track);
    const by = c.track.samples.find((p) => p.s - focus.s >= GOPHER.ahead.from)!;
    const car = { x: by.x, y: by.y, vx: 0, vy: 0 };
    untilOut(g2, [car]);
    const x = g2.crossing!;
    expect(Math.hypot((x.from.x + x.to.x) / 2 - car.x, (x.from.y + x.to.y) / 2 - car.y)).toBeGreaterThan(GOPHER.clear - 30);
  });

  it('caught on the track by a car, bolts for the nearer hole, three times as fast', () => {
    const g = new GopherRun(c.track);
    untilOut(g);
    // across a quarter of the way
    while (g.crossing!.phase !== 'run' || g.crossing!.done < 0.25) g.step(1 / 60, [far], focus);
    const at = g.pose()!;
    const before = g.crossing!.done;
    g.step(1 / 60, [{ x: at.x + 60, y: at.y, vx: -200, vy: 0 }], focus);
    expect(g.crossing!.phase).toBe('bolt');
    expect(g.crossing!.back).toBe(true);
    expect(g.bolts).toBe(1);
    const length = Math.hypot(g.crossing!.to.x - g.crossing!.from.x, g.crossing!.to.y - g.crossing!.from.y);
    expect(before - g.crossing!.done).toBeCloseTo((GOPHER.speed * GOPHER.bolt) / 60 / length, 5);
    for (let t = 0; t < 5 && g.crossing; t += 1 / 60) g.step(1 / 60, [far], focus);
    expect(g.crossing).toBeUndefined();
  });

  it('a car coming as it peeks out sends it back down its hole', () => {
    const g = new GopherRun(c.track);
    untilOut(g);
    const at = g.pose()!;
    g.step(1 / 60, [{ x: at.x, y: at.y + 50, vx: 0, vy: 0 }], focus);
    expect(g.crossing).toBeUndefined();
    expect(g.pose()).toBeUndefined();
    expect(g.crossings).toBe(0);
  });
});
