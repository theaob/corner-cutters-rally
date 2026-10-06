import { describe, expect, it } from 'vitest';
import { DEFAULT_HANDLING, carClass, newCar, speedOf, stepCar } from '../src/engine/driving';
import type { Grid } from '../src/engine/sim';
import {
  aiInput,
  keysWheel,
  wheelInput,
  WHEEL_LOCK,
  playerInput,
  buildTrack,
  nearestSample,
  newProgress,
  smoothLoop,
  standings,
  stepProgress,
  type Pt,
  type RaceProgress,
} from '../src/f1/racing';

// a 600 × 400 px rectangle with rounded corners, driven clockwise on screen (right turns)
const RECT: Pt[] = [
  { x: 400, y: 200 },
  { x: 800, y: 200 },
  { x: 900, y: 300 },
  { x: 900, y: 500 },
  { x: 800, y: 600 },
  { x: 400, y: 600 },
  { x: 300, y: 500 },
  { x: 300, y: 300 },
];
const corner = (k: number) => Math.min(320, Math.sqrt(180 / Math.max(k, 1e-6)));
const track = buildTrack(RECT, 8, corner, 600);
const open: Grid = { width: 80, height: 60, tile: 16, solid: new Array(4800).fill(false) };

describe('track', () => {
  it('resamples a closed spline evenly', () => {
    const pts = smoothLoop(RECT, 8);
    for (let i = 1; i < pts.length; i++) expect(Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)).toBeCloseTo(8, 0);
    const last = pts[pts.length - 1];
    expect(Math.hypot(last.x - pts[0].x, last.y - pts[0].y)).toBeLessThan(12);
  });

  it('knows which way it bends and slows for the corners, braking into them', () => {
    const turns = track.samples.filter((p) => Math.abs(p.curve) > 0.005);
    expect(turns.length).toBeGreaterThan(0);
    expect(turns.every((p) => p.curve > 0)).toBe(true); // all right-handers
    const straight = track.samples[25]; // along the top straight
    const tightest = track.samples.reduce((a, b) => (b.speed < a.speed ? b : a));
    expect(tightest.speed).toBeLessThan(straight.speed);
    // the speed falls smoothly into a corner: never more than braking allows per sample
    const n = track.samples.length;
    for (let i = 0; i < n; i++) {
      const a = track.samples[i].speed;
      const b = track.samples[(i + 1) % n].speed;
      expect(a * a - b * b).toBeLessThanOrEqual(2 * 600 * 8 + 1e-6);
    }
  });

  it('finds the nearest sample, locally or from scratch', () => {
    const i = nearestSample(track, 905, 400);
    expect(Math.abs(track.samples[i].x - 900)).toBeLessThan(20);
    expect(nearestSample(track, 905, 400, i + 5)).toBe(i);
  });
});

describe('race progress', () => {
  const car = newCar(carClass('f1'), 0, 0);
  const n = track.samples.length;
  const at = (p: RaceProgress, i: number, time: number) => {
    const s = track.samples[i % n];
    Object.assign(car, { x: s.x, y: s.y, heading: s.dir, vx: 0, vy: 0 });
    return stepProgress(p, track, car, time, 2, 1 / 60);
  };
  const lap = (p: RaceProgress, t0: number) => {
    for (let i = 1; i <= n; i += 4) p = at(p, i, t0 + (i / n) * 30);
    return at(p, n + 2, t0 + 30);
  };

  it('starts the clock on the first crossing and counts a lap only through every sector', () => {
    let p = at(newProgress(n - 5), n - 3, 0);
    p = at(p, 2, 1);
    expect(p.lapStart).toBe(1);
    p = lap(p, 1);
    expect(p.lap).toBe(1);
    expect(p.lapTimes[0]).toBeCloseTo(30, 0);
    // cutting straight back to the line doesn't count
    let cut = at(p, n - 10, 40);
    cut = at(cut, 2, 41);
    expect(cut.lap).toBe(1);
  });

  it('finishes after the last lap and orders the field', () => {
    let a = at(newProgress(n - 5), 2, 0);
    a = lap(lap(a, 0), 30);
    expect(a.finished).toBeCloseTo(60, 0);
    // after the flag, the time stays put but the position still follows the car (for the cool-down lap)
    const after = at(a, 30, 70);
    expect(after.finished).toBe(a.finished);
    expect(after.idx).toBe(30);
    let b = at(newProgress(n - 5), 2, 0);
    b = lap(b, 0);
    b = at(b, 40, 35);
    let c = at(newProgress(n - 5), 2, 0);
    c = lap(c, 0);
    c = at(c, 80, 35);
    expect(standings([b, a, c], track)).toEqual([1, 2, 0]);
  });

  it('adds penalties at the flag and classifies retired cars last', () => {
    const base = newProgress(0);
    const fin = (finished: number, penalty = 0) => ({ ...base, lap: 2, finished, penalty });
    // 10 s ahead on the road, but 15 s of penalties
    expect(standings([fin(50, 15), fin(60), fin(55)], track)).toEqual([2, 1, 0]);
    // a car that retired on lap 2 trails one still running on lap 1; retired cars by how far they got
    const out = (lap: number) => ({ ...base, lap, lapStart: 0, retired: true });
    expect(standings([out(2), { ...base, lap: 1, lapStart: 0 }, out(1)], track)).toEqual([1, 0, 2]);
  });

  it('warns a car going the wrong way', () => {
    const s = track.samples[20];
    Object.assign(car, { x: s.x, y: s.y, heading: s.dir + Math.PI, vx: -Math.sin(s.dir) * 100, vy: Math.cos(s.dir) * 100 });
    let p = newProgress(20);
    for (let i = 0; i < 60; i++) p = stepProgress(p, track, car, i / 60, 3, 1 / 60);
    expect(p.wrongWay).toBeGreaterThan(0.9);
  });
});

describe('AI driver', () => {
  it('drives an F1 car round the track, braking for the corners, staying near the line', () => {
    const start = track.samples[0];
    const car = newCar(carClass('f1'), start.x, start.y, start.dir);
    let p = newProgress(0);
    let worst = 0;
    let braked = false;
    for (let t = 0; t < 12; t += 1 / 60) {
      const input = aiInput(car, track, p.idx, { lane: 0, pace: 1 });
      braked ||= input.brake === true;
      stepCar(car, input, DEFAULT_HANDLING, 1 / 60, open);
      p = stepProgress(p, track, car, t, 5, 1 / 60);
      const s = track.samples[p.idx];
      worst = Math.max(worst, Math.hypot(car.x - s.x, car.y - s.y));
    }
    // made it all the way round (the first crossing of the line starts the clock)
    expect(p.lapStart).toBeDefined();
    expect(braked).toBe(true);
    expect(worst).toBeLessThan(40);
    expect(speedOf(car)).toBeGreaterThan(50);
  });

  it("holds the speed of a car close ahead in its lane instead of running into it", () => {
    // along the top straight, heading east at 250 px/s
    const i = track.samples.findIndex((p) => p.x > 500);
    const s = track.samples[i];
    const car = newCar(carClass('f1'), s.x, s.y, s.dir);
    car.vx = 250;
    const slowAt = (dx: number, dy: number) => {
      const o = newCar(carClass('f1'), s.x + dx, s.y + dy, s.dir);
      o.vx = 100;
      return o;
    };
    const free = aiInput(car, track, i, { lane: 0, pace: 1 });
    expect(free.brake).toBe(false);
    // right on its tail: brakes toward its speed
    const behind = aiInput(car, track, i, { lane: 0, pace: 1 }, [slowAt(40, 0)]);
    expect(behind.brake).toBe(true);
    expect(Math.hypot(behind.steer!.x, behind.steer!.y)).toBeCloseTo(100 / carClass('f1').topSpeed, 2);
    // far ahead, or a lane over: no need
    expect(aiInput(car, track, i, { lane: 0, pace: 1 }, [slowAt(400, 0)]).brake).toBe(false);
    expect(aiInput(car, track, i, { lane: 0, pace: 1 }, [slowAt(40, 30)]).brake).toBe(false);
    // no overtaking (safety car): it stays in line behind; a wreck it steers round even so
    const queued = aiInput(car, track, i, { lane: 0, pace: 1 }, [slowAt(40, 0)], { noOvertaking: true });
    expect(queued.brake).toBe(true);
    const wreck = slowAt(40, 0);
    Object.assign(wreck, { vx: 0, wrecked: true });
    const round = aiInput(car, track, i, { lane: 0, pace: 1 }, [wreck], { noOvertaking: true });
    expect(round.brake).toBe(false);
    // it aims off the line to one side (a lane over), not straight at the wreck
    const straight = aiInput(car, track, i, { lane: 0, pace: 1 }, [], { noOvertaking: true });
    expect(Math.abs(round.steer!.y - straight.steer!.y)).toBeGreaterThan(0.05);
  });
});

describe('the player\'s controls', () => {
  it('point the car where the stick points, how far it\'s pushed is the throttle, and B drifts', () => {
    expect(playerInput({ stick: { x: 0.3, y: -0.4 }, a: true, b: false })).toEqual({ steer: { x: 0.3, y: -0.4 }, handbrake: false });
    expect(playerInput({ stick: { x: 0, y: 0 }, a: false, b: true })).toEqual({ steer: undefined, handbrake: true });
  });
});


describe('driving with keys or a gamepad', () => {
  const car = newCar(carClass('f1'), 0, 0); // facing north, stopped
  it('steers the car itself: a key at full lock, a stick gentler near the centre', () => {
    expect(wheelInput(keysWheel({ up: true, down: false, left: false, right: true }, false), car).wheel).toEqual({ turn: WHEEL_LOCK, gas: 1, reverse: false });
    const half = wheelInput({ turn: 0.5, gas: 0, brake: 0, drift: false }, car).wheel!.turn;
    expect(half).toBeLessThan(WHEEL_LOCK * 0.5);
    expect(half).toBeGreaterThan(0);
  });

  it('brakes while rolling forwards, reverses once stopped, and drifts', () => {
    const moving = newCar(carClass('f1'), 0, 0);
    moving.vy = -150;
    const down = keysWheel({ up: false, down: true, left: false, right: false }, true);
    const braking = wheelInput(down, moving);
    expect(braking.brake).toBe(true);
    expect(braking.handbrake).toBe(true);
    expect(wheelInput(down, car).wheel?.reverse).toBe(true);
  });
});
