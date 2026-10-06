import { describe, expect, it } from 'vitest';
import { carClass } from '../src/engine/driving';
import { buildCircuit } from '../src/f1/circuit';
import { GLACIER_PASS, LAYOUTS } from '../src/f1/layouts';
import { lateralOffset, lineCornerSpeed, lineDecel, nearestSample } from '../src/f1/racing';
import { YETI, YetiRun, yetiAvoids } from '../src/f1/yeti';

const f1 = carClass('f1');
const c = buildCircuit(GLACIER_PASS, { cornerSpeed: lineCornerSpeed(f1), decel: lineDecel(f1) });
const { samples } = c.track;
const n = samples.length;
const avoid = yetiAvoids(c);
const spacing = samples[1].s - samples[0].s;
/** px from the track's centreline (to its nearest stretch) */
const across = (p: { x: number; y: number }) => Math.abs(lateralOffset(c.track, nearestSample(c.track, p.x, p.y), p.x, p.y));
/** a car driving the lap at `speed` px/s from sample `from`: where it is `t` s on */
const driving = (from: number, speed: number) => (t: number) => samples[Math.floor(from + (speed * t) / spacing) % n];
/** on, the camera on a car standing at `at`, until the yeti's out (at most `limit` s) */
const untilOut = (y: YetiRun, at: { x: number; y: number }, limit = 60) => {
  for (let t = 0; t < limit && !y.pose; t += 1 / 30) y.step(1 / 30, at);
};

describe('the yeti', () => {
  it('lives at Glacier Pass, and only there', () => {
    expect(GLACIER_PASS.yeti).toBe(true);
    for (const l of LAYOUTS) if (l !== GLACIER_PASS) expect(l.yeti).toBeFalsy();
  });

  it('now and then lies in wait beside the track up the road from the camera, out on the run-off, on its side nearer the camera', () => {
    const y = new YetiRun(c.track, avoid);
    const car = samples[100];
    y.step(1, car);
    expect(y.pose).toBeUndefined();
    untilOut(y, car);
    const p = y.pose!;
    expect(p.phase).toBe('wait');
    expect(across(p)).toBeGreaterThanOrEqual(y.keep - 1);
    const along = (samples[nearestSample(c.track, p.x, p.y)].s - car.s + c.track.length) % c.track.length;
    expect(along).toBeGreaterThan(YETI.ahead.from - 60);
    expect(along).toBeLessThan(YETI.ahead.to + 60);
    // (wherever round the lap: never on another stretch of it)
    let out = 0;
    for (let i = 0; i < n; i += 9) {
      const w = new YetiRun(c.track, avoid, i + 1);
      untilOut(w, samples[i], 40);
      if (!w.pose) continue;
      expect(across(w.pose)).toBeGreaterThanOrEqual(w.keep - 1);
      // (never by the pits or a grandstand; on the camera's side, the south, of a stretch running east or west)
      for (const a of avoid) expect(Math.hypot(a.x - w.pose.x, a.y - w.pose.y)).toBeGreaterThanOrEqual(a.r);
      const q = samples[nearestSample(c.track, w.pose.x, w.pose.y)];
      if (Math.abs(Math.sin(q.dir)) > 0.3) expect(w.pose.y).toBeGreaterThan(q.y);
      out++;
    }
    expect(out).toBeGreaterThan(n / 9 / 2);
  });

  it('roars as the car comes by, then gives chase beside the track, never setting foot on it', () => {
    const y = new YetiRun(c.track, avoid);
    untilOut(y, samples[100]);
    // a car coming up the road, slowly enough it keeps up (as in a bend)
    const car = driving(100, 150);
    let roared = false;
    let chased = 0;
    for (let t = 0; t < 8; t += 1 / 30) {
      y.step(1 / 30, car(t));
      const p = y.pose;
      if (!p) break;
      if (p.phase === 'roar') roared = true;
      if (p.phase === 'chase') {
        chased++;
        expect(across(p)).toBeGreaterThanOrEqual(y.keep - 1.5);
      }
    }
    expect(roared).toBe(true);
    expect(y.chases).toBe(1);
    expect(chased).toBeGreaterThan(30);
    // (and keeping up: close beside the car)
    const p = y.pose!;
    const k = car(8);
    expect(Math.hypot(p.x - k.x, p.y - k.y)).toBeLessThan(y.keep + 80);
  });

  it('is no match for a car at full speed: left behind, it gives up and lopes off into the snow, then waits for next time', () => {
    const y = new YetiRun(c.track, avoid);
    untilOut(y, samples[100]);
    const car = driving(100, 520);
    let left = false;
    let t = 0;
    for (; t < 30 && y.pose; t += 1 / 30) {
      y.step(1 / 30, car(t));
      if (y.pose?.phase === 'leave') {
        left = true;
        // (off away from the track)
        expect(across(y.pose)).toBeGreaterThanOrEqual(y.keep - 1.5);
      }
    }
    expect(left).toBe(true);
    expect(y.pose).toBeUndefined();
    expect(y.chases).toBe(1);
    // (and some while later, out again)
    untilOut(y, car(t), YETI.wait + YETI.waitMore + 5);
    expect(y.pose).toBeDefined();
  });

  it("gives up waiting for a car that doesn't come", () => {
    const y = new YetiRun(c.track, avoid);
    const at = samples[100];
    untilOut(y, at);
    // (the car gone: far off the other way)
    for (let t = 0; t < YETI.patience + 1; t += 1 / 30) y.step(1 / 30, samples[(100 + Math.floor(n / 2)) % n]);
    expect(y.pose).toBeUndefined();
    expect(y.chases).toBe(0);
  });
});
