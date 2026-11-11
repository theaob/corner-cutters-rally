import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_HANDLING, angleDiff, carClass, newCar, speedOf, stepCar } from '../src/engine/driving';
import { POINT, POINT_PULL, pulledAim, roadAim, screenToMap, wayOf } from '../src/engine/drive/point';
import { POINT_DRAG, dragPoint } from '../src/engine/drive/touch';
import { keysIntent } from '../src/engine/drive/keys';
import { padIntent } from '../src/engine/drive/pad';
import { SLIDE } from '../src/engine/drive/driver';
import { driveSettings, setDriveSetting } from '../src/engine/drive/settings';
import { prompt } from '../src/f1/onboarding';
import { useSave, type SaveStore } from '../src/engine/save';
import { useStore } from '../src/engine/storage';
import { CC_SAVE } from '../src/f1/save';
import { AUTO_SPEED } from '../src/f1/style';
import type { Grid } from '../src/engine/sim';
import { Driver } from '../src/engine/drive/driver';
import { DRIVE_DEFAULTS, type DriveSettings } from '../src/engine/drive/settings';
import type { Intent } from '../src/engine/drive/intent';
import { buildCircuit } from '../src/f1/circuit';
import { NORMAL, handlingFor } from '../src/f1/difficulty';
import { referenceStage } from '../src/f1/rally';
import { lateralOffset, lineCornerSpeed, lineDecel, newProgress, stepProgress } from '../src/f1/racing';
import { stageById } from '../src/f1/stages';
import { autoSpeed, rallyCar, styleHandling } from '../src/f1/style';
import { seededRandom } from '../src/engine/rng';

/**
 * A player pointing their thumb in TOP-DOWN with CONTROL on POINT: what they see is `late` s old; they point at the
 * road `look` s ahead of the car, roughly (off by up to `wobble` radians, and only every `every` s), never braking.
 * `ways`: their aim snapped to that many ways round (8: the arrow keys).
 */
function pointer(stageId: string, o: { late?: number; look?: number; wobble?: number; every?: number; ways?: number; seed?: number; settings?: Partial<DriveSettings> } = {}) {
  const { late = 0.2, look = 0.5, wobble = 0.15, every = 0.12, ways = 0, seed = 1 } = o;
  const style = 'topdown';
  const cls = rallyCar(style);
  const H = styleHandling(handlingFor(NORMAL), style);
  const c = buildCircuit(stageById(stageId)!, { cornerSpeed: lineCornerSpeed(cls, H), decel: lineDecel(cls) });
  const { track, grid } = c;
  const n = track.samples.length;
  const reference = referenceStage(track, grid, H, 'dry', c.slots[0], cls).time;
  const safeAt = autoSpeed(track, cls, H);
  const rand = seededRandom(seed);
  let intent: Intent = { steer: 0, throttle: 0, brake: 0, handbrake: false };
  const driver = new Driver({ keys: () => intent, pad: () => undefined }, () => ({ ...DRIVE_DEFAULTS, gas: 'auto', ...o.settings }));
  const car = newCar(cls, c.slots[0].x, c.slots[0].y, c.slots[0].heading);
  let p = newProgress(Math.round((track.stage!.start - 24) / track.spacing));
  const seenAt: { x: number; y: number; v: number; idx: number }[] = [];
  const lag = Math.round(late * 60);
  let next = 0;
  let offRoad = 0;
  let t = 0;
  for (; t < 300 && p.idx * track.spacing < track.stage!.finish && !car.wrecked; t += 1 / 60) {
    seenAt.push({ x: car.x, y: car.y, v: speedOf(car), idx: p.idx });
    if (t >= next) {
      next = t + every;
      const now = seenAt[Math.max(0, seenAt.length - 1 - lag)];
      const aim = track.samples[Math.min(n - 1, now.idx + Math.round(Math.max(50, now.v * look) / track.spacing))];
      let way = Math.atan2(aim.x - car.x, -(aim.y - car.y)) + (rand() * 2 - 1) * wobble;
      if (ways) way = Math.round(way / ((2 * Math.PI) / ways)) * ((2 * Math.PI) / ways);
      intent = { steer: 0, throttle: 0, brake: 0, handbrake: false, point: { x: Math.sin(way), y: -Math.cos(way) } };
    }
    driver.sample();
    const at = p.idx;
    const ahead = Math.min(n - 1, at + 6 + Math.round((Math.max(0, speedOf(car)) * 0.35) / track.spacing));
    const road = { dir: track.samples[ahead].dir, lateral: lateralOffset(track, at, car.x, car.y), safe: safeAt(at) };
    const ev = stepCar(car, driver.step(car, 1 / 60, road), H, 1 / 60, grid);
    if (ev.onRough) offRoad += 1 / 60;
    p = stepProgress(p, track, car, t, 1, 1 / 60);
  }
  return { finished: p.idx * track.spacing >= track.stage!.finish, health: car.health / cls.health, time: t, reference, offRoad };
}

const memory = (): SaveStore => {
  const items = new Map<string, string>();
  return { getItem: (k) => items.get(k) ?? null, setItem: (k, v) => void items.set(k, v), removeItem: (k) => void items.delete(k) };
};
beforeEach(() => {
  useStore('cc:');
  useSave(CC_SAVE, memory());
});

const close = (a: number, b: number, eps = 1e-6) => Math.abs(angleDiff(a, b)) < eps;

describe('CONTROL', () => {
  it('is POINT to begin with in TOP-DOWN; SIM always steers with the wheel', () => {
    expect(driveSettings().control).toBe('point');
    setDriveSetting('control', 'wheel');
    expect(driveSettings().control).toBe('wheel');
    setDriveSetting('control', 'point');
    setDriveSetting('style', 'sim');
    expect(driveSettings().control).toBe('wheel');
  });
});

describe('pointing on the screen', () => {
  it('up the screen is north, whichever way the car faces; the pitch and a turned camera are taken out', () => {
    expect(close(wayOf(0, -1), 0)).toBe(true);
    expect(close(wayOf(1, 0), Math.PI / 2)).toBe(true);
    const m = screenToMap(0, -1);
    expect(close(wayOf(m.x, m.y), 0)).toBe(true);
    // (the ground's north-south squashed on the screen: a diagonal drag is steeper on the map)
    const d = screenToMap(1, -1, 0, 0.5);
    expect(wayOf(d.x, d.y)).toBeLessThan(Math.PI / 4);
    // (a camera looking east: up the screen is east)
    const e = screenToMap(0, -1, Math.PI / 2);
    expect(close(wayOf(e.x, e.y), Math.PI / 2)).toBe(true);
  });

  it('a thumb points once past a little wobble, any way, and the ring follows it past its reach', () => {
    const a = { x: 100, y: 100 };
    expect(dragPoint(a, 104, 103).point).toBeUndefined();
    const p = dragPoint(a, 100, 70).point!;
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(-1);
    const far = dragPoint(a, 100 + POINT_DRAG.reach + 30, 100);
    expect(far.anchor.x).toBeCloseTo(130);
    // (back the other way answers at once: from the moved middle)
    expect(dragPoint(far.anchor, 120, 100).point!.x).toBeCloseTo(-1);
  });

  it('the keys point (two together the way between), Space brakes; the stick points', () => {
    expect(keysIntent(new Set(['ArrowUp']), true).point).toEqual({ x: 0, y: -1 });
    expect(keysIntent(new Set(['ArrowDown', 'KeyD']), true).point).toEqual({ x: 1, y: 1 });
    expect(keysIntent(new Set(['ArrowDown']), true).brake).toBe(0);
    expect(keysIntent(new Set(['Space']), true).brake).toBe(1);
    expect(keysIntent(new Set(['ArrowDown']), false).brake).toBe(1);
    const pad = { axes: [0.7, -0.7], buttons: [] };
    expect(padIntent(pad).point).toEqual({ x: 0.7, y: -0.7 });
    expect(padIntent({ axes: [0.05, 0], buttons: [] }).point).toBeUndefined();
  });
});

describe('the road pulls your aim', () => {
  const road = { dir: 0.3, lateral: 0 };
  it('onto it, pointed roughly down it; not at all pointed well off it, or with ASSIST off', () => {
    expect(close(pulledAim(0.3 + 0.2, road, 'strong'), 0.3)).toBe(true);
    // (further off, partly)
    const partly = pulledAim(0.3 + POINT.snap * 0.75, road, 'strong');
    expect(partly).toBeLessThan(0.3 + POINT.snap * 0.75);
    expect(partly).toBeGreaterThan(0.3);
    const light = pulledAim(0.3 + 0.2, road, 'light');
    expect(light).toBeLessThan(0.5);
    expect(light).toBeGreaterThan(0.3);
    expect(pulledAim(0.3 + POINT.snap + 0.1, road, 'strong')).toBeCloseTo(0.3 + POINT.snap + 0.1);
    expect(pulledAim(0.5, road, 'off')).toBe(0.5);
    expect(POINT_PULL.off).toBe(0);
  });

  it('back toward its middle', () => {
    // (right of the middle: aimed left of the road's way, no more than acrossMost)
    expect(roadAim({ dir: 0, lateral: 20 })).toBeLessThan(0);
    expect(roadAim({ dir: 0, lateral: 1000 })).toBeCloseTo(-POINT.acrossMost);
    expect(roadAim({ dir: 0, lateral: -20 })).toBeGreaterThan(0);
  });
});

describe('the driver, pointing', () => {
  const grid = { cols: 0, rows: 0, tiles: [] } as unknown as Grid;
  const make = (point?: { x: number; y: number }, brake = 0) => {
    let i: Intent = { steer: 0, throttle: 0, brake, handbrake: false, ...(point && { point }) };
    const d = new Driver({ keys: () => i, pad: () => undefined }, () => ({ ...DRIVE_DEFAULTS, gas: 'auto', assist: 'off' }));
    return { d, set: (n: Intent) => (i = n) };
  };
  const cls = carClass('f1');

  it('steers for the way you point on the map, even facing down the screen', () => {
    const { d } = make({ x: 1, y: 0 });
    d.sample();
    // (facing south, pointing east: the car's right is west, but it turns east)
    const car = newCar(cls, 0, 0, Math.PI);
    car.vy = 150;
    const input = d.step(car, 1 / 60);
    expect(input.steer!.x).toBeCloseTo(1);
    expect(input.steer!.y).toBeCloseTo(0);
    for (let k = 0; k < 90; k++) stepCar(car, d.step(car, 1 / 60), DEFAULT_HANDLING, 1 / 60, grid);
    expect(Math.abs(angleDiff(car.heading, Math.PI / 2))).toBeLessThan(0.1);
  });

  it('let go, holds its course', () => {
    const { d } = make();
    d.sample();
    const car = newCar(cls, 0, 0, 1);
    car.vx = Math.sin(1) * 100;
    car.vy = -Math.cos(1) * 100;
    const input = d.step(car, 1 / 60, { dir: 0, lateral: 0 });
    expect(close(wayOf(input.steer!.x, input.steer!.y), 1)).toBe(true);
  });

  it('slows for the road ahead on its own: the gas up to what it allows, the brakes over it', () => {
    const { d } = make({ x: 0, y: -1 });
    d.sample();
    const car = newCar(cls, 0, 0, 0);
    car.vy = -100;
    expect(d.step(car, 1 / 60, { dir: 0, lateral: 0, safe: 150 })).toMatchObject({ limit: 150, brake: false });
    expect(d.step(car, 1 / 60, { dir: 0, lateral: 0, safe: 80 }).brake).toBe(true);
  });

  it('braking aimed well off where it points slides it; braking aimed ahead just brakes', () => {
    const car = newCar(cls, 0, 0, 0);
    car.vy = -cls.topSpeed * (SLIDE.from + 0.2);
    const hard = make({ x: 1, y: 0 }, 1);
    hard.d.sample();
    expect(hard.d.step(car, 1 / 60)).toMatchObject({ handbrake: true, brake: false });
    const ahead = make({ x: 0, y: -1 }, 1);
    ahead.d.sample();
    expect(ahead.d.step(car, 1 / 60)).toMatchObject({ handbrake: false, brake: true });
  });
});

describe("POINT's own speed", () => {
  const style = 'topdown';
  const cls = rallyCar(style);
  const H = styleHandling(handlingFor(NORMAL), style);
  const c = buildCircuit(stageById('ss-mountain-col')!, { cornerSpeed: lineCornerSpeed(cls, H), decel: lineDecel(cls) });
  const { track } = c;
  const safe = autoSpeed(track, cls, H);
  it('is flat out down a straight, slower ahead of a bend and slowest in it, never over the racing line there', () => {
    const all = track.samples.map((_, k) => safe(k));
    expect(Math.max(...all)).toBeCloseTo(cls.topSpeed);
    const tight = all.indexOf(Math.min(...all));
    expect(all[tight]).toBeLessThan(cls.topSpeed * 0.97);
    // (braking for it: quicker further back)
    expect(all[tight - 10]).toBeGreaterThan(all[tight]);
    expect(all[tight - 10]).toBeLessThanOrEqual(all[tight] + Math.sqrt(2 * (cls.topSpeed / cls.brakeTime) * AUTO_SPEED.brake * 10 * track.spacing) + 1);
    // (worn tyres, slower)
    expect(safe(tight, 0.8)).toBeLessThan(all[tight]);
  });
});

describe('the controls lap, pointing', () => {
  it('says to drag the way to go, and that the car slows for bends', () => {
    expect(prompt('go', 'touch', 'auto', 'topdown', 'point')).toContain('DRAG THE WAY');
    expect(prompt('bend', 'touch', 'auto', 'topdown', 'point')).toContain('SLOWS FOR BENDS');
    expect(prompt('bend', 'keys', 'auto', 'topdown', 'point')).toContain('SPACE');
    // (WHEEL: as it was)
    expect(prompt('bend', 'touch', 'auto', 'topdown', 'wheel')).toContain('BRAKE AND STEER HARD');
  });
});

describe('POINT on a stage', () => {
  // a careful player, one on the arrow keys (eight ways), a sloppy late one, one with ASSIST off
  const players = [
    ['careful', {}],
    ['on the keys', { ways: 8 }],
    ['sloppy and late', { wobble: 0.35, late: 0.3, every: 0.2 }],
    ['with ASSIST off', { settings: { assist: 'off' as const } }],
  ] as const;
  for (const id of ['ss-shakedown', 'ss-pine-ridge', 'ss-castle-hill', 'ss-mountain-col', 'ss-fox-hollow', 'ss-glacier-road']) {
    it(`${id}: any player pointing at the road gets to the finish unhurt without ever braking, near the rivals`, () => {
      for (const [who, cfg] of players) {
        const r = pointer(id, cfg);
        expect(r.finished, who).toBe(true);
        expect(r.health, who).toBeGreaterThan(0.95);
        // (NORMAL's rivals are about 9% off the reference: a careful player beats them)
        expect(r.time, who).toBeLessThan(r.reference * (who === 'careful' ? 1.08 : 1.25));
      }
    }, 120_000);
  }
});
