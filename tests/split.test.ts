import { describe, expect, it } from 'vitest';
import { angleDiff, newCar, speedOf, stepCar, type Car } from '../src/engine/driving';
import { buildCircuit } from '../src/f1/circuit';
import { NORMAL, handlingFor } from '../src/f1/difficulty';
import { lineCornerSpeed, lineDecel, newProgress, splitWheel, stepProgress, wheelInput, WHEEL_LOCK, type Halves, type Track } from '../src/f1/racing';
import { SHAKEDOWN, stageById } from '../src/f1/stages';
import { rallyCar, styleHandling } from '../src/f1/style';
import { splitHalves } from '../src/engine/deck';
import type { Grid } from '../src/engine/sim';

const car0 = rallyCar();
const HANDLING = styleHandling(handlingFor(NORMAL));
const open: Grid = { width: 400, height: 400, tile: 16, solid: new Array(160000).fill(false) };
const forward = (c: Car) => c.vx * Math.sin(c.heading) - c.vy * Math.cos(c.heading);

describe('SPLIT (the screen in two halves)', () => {
  it('steers to the half held, gas always on; both halves brake, then reverse once stopped', () => {
    const car = newCar(car0, 0, 0, 0);
    expect(wheelInput(splitWheel({ left: false, right: false }), car).wheel).toEqual({ turn: 0, gas: 1, reverse: false });
    expect(wheelInput(splitWheel({ left: true, right: false }), car).wheel?.turn).toBeCloseTo(-WHEEL_LOCK);
    expect(wheelInput(splitWheel({ left: false, right: true }), car).wheel?.turn).toBeCloseTo(WHEEL_LOCK);
    // stopped: both is reverse
    expect(wheelInput(splitWheel({ left: true, right: true }), car).wheel?.reverse).toBe(true);
    // at speed: both brakes
    car.vy = -300;
    const moving = wheelInput(splitWheel({ left: true, right: true }), car);
    expect(moving.brake).toBe(true);
    expect(moving.wheel?.reverse).toBe(false);
  });

  it('holding both brings the car to a stop, then backs it up; letting go drives it forwards again', () => {
    const car = newCar(car0, 3200, 5000, 0);
    const both: Halves = { left: true, right: true };
    for (let t = 0; t < 3; t += 1 / 60) stepCar(car, wheelInput(splitWheel({ left: false, right: false }), car), HANDLING, 1 / 60, open);
    expect(forward(car)).toBeGreaterThan(150);
    let stoppedAt = -1;
    for (let t = 0; t < 6; t += 1 / 60) {
      stepCar(car, wheelInput(splitWheel(both), car), HANDLING, 1 / 60, open);
      if (stoppedAt < 0 && forward(car) < 5) stoppedAt = t;
    }
    expect(stoppedAt).toBeGreaterThan(0);
    expect(stoppedAt).toBeLessThan(3);
    expect(forward(car)).toBeLessThan(-20);
    for (let t = 0; t < 3; t += 1 / 60) stepCar(car, wheelInput(splitWheel({ left: false, right: false }), car), HANDLING, 1 / 60, open);
    expect(forward(car)).toBeGreaterThan(50);
  });

  it('reads each finger by the half it is on, and a finger that slides across moves with it', () => {
    expect(splitHalves([10], 0, 800)).toEqual({ left: true, right: false });
    expect(splitHalves([700], 0, 800)).toEqual({ left: false, right: true });
    expect(splitHalves([100, 600], 0, 800)).toEqual({ left: true, right: true });
    expect(splitHalves([], 0, 800)).toEqual({ left: false, right: false });
    expect(splitHalves([450], 100, 700)).toEqual({ left: false, right: true });
  });

  const startIdx = (track: Track) => Math.round((track.stage!.start - 24) / track.spacing);
  const finished = (track: Track, idx: number) => idx * track.spacing >= track.stage!.finish;
  it.each([SHAKEDOWN, 'ss-castle-hill', 'ss-pine-ridge'])('lets a player on the two halves alone drive %s to the finish', (id) => {
    const circuit = buildCircuit(stageById(id)!, { cornerSpeed: lineCornerSpeed(car0), decel: lineDecel(car0) });
    const { track, grid } = circuit;
    const n = track.samples.length;
    const start = circuit.slots[0];
    const car = newCar(car0, start.x, start.y, start.heading);
    let p = newProgress(startIdx(track));
    let t = 0;
    let braking = 0;
    for (; t < 400 && !finished(track, p.idx); t += 1 / 60) {
      // a simple player: hold the half the road bends to (a point a little ahead), both when it bends hard at speed
      const ahead = track.samples[Math.min(n - 1, p.idx + 8)];
      const off = angleDiff(Math.atan2(ahead.x - car.x, -(ahead.y - car.y)), car.heading);
      const brake = Math.abs(off) > 0.7 && speedOf(car) > 140;
      if (brake) braking += 1 / 60;
      const h = brake ? { left: true, right: true } : { left: off < -0.05, right: off > 0.05 };
      stepCar(car, wheelInput(splitWheel(h), car), HANDLING, 1 / 60, grid);
      p = stepProgress(p, track, car, t, 1, 1 / 60);
    }
    expect(finished(track, p.idx)).toBe(true);
    expect(car.health).toBeGreaterThan(0);
    if (process.env.DEBUG_SPLIT) console.log(id, t.toFixed(1), 's, braking', braking.toFixed(1), 's, health', car.health.toFixed(0));
  }, 60_000);
});
