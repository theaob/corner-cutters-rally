import { describe, expect, it } from 'vitest';
import { carClass, newCar, speedOf, stepCar, type Car } from '../src/engine/driving';
import type { Grid } from '../src/engine/sim';
import { buildCircuit } from '../src/f1/circuit';
import { SILVER_HEATH } from '../src/f1/layouts';
import { RACE_HANDLING, lineCornerSpeed, lineDecel } from '../src/f1/racing';
import { newRace, running, stepRace } from '../src/f1/raceControl';
import { SLIPSTREAM, stepTow, towBoost, towFrom, wake } from '../src/f1/slipstream';

const f1 = carClass('f1');
const dt = 1 / 60;

/** A car at (x, y) heading north (up the screen) at `v` px/s. */
function moving(x: number, y: number, v = 280, heading = 0): Car {
  const c = newCar(f1, x, y, heading);
  c.vx = Math.sin(heading) * v;
  c.vy = -Math.cos(heading) * v;
  return c;
}

describe('the wake', () => {
  const ahead = moving(0, 0);
  it('is strongest right behind a car, fading with distance and gone past its range', () => {
    expect(wake(moving(0, 40), ahead)).toBeCloseTo(1);
    const mid = wake(moving(0, 100), ahead);
    expect(mid).toBeGreaterThan(0.3);
    expect(mid).toBeLessThan(1);
    expect(wake(moving(0, SLIPSTREAM.range + 5), ahead)).toBe(0);
  });
  it('fades off to either side, and is gone a car width and more off its line', () => {
    expect(wake(moving(16, 150), ahead)).toBeLessThan(wake(moving(0, 150), ahead));
    expect(wake(moving(10, 100), ahead)).toBeGreaterThan(0);
    expect(wake(moving(-24, 120), ahead)).toBe(0);
  });
  it('spreads wider right behind a car, so a car pulling out to pass keeps some tow till alongside', () => {
    expect(wake(moving(0, 40), ahead)).toBeCloseTo(1);
    expect(wake(moving(24, 40), ahead)).toBeGreaterThan(0.3);
    expect(wake(moving(24, 40), ahead)).toBeLessThan(1);
    expect(wake(moving(34, 40), ahead)).toBe(0);
  });
  it('is nothing for a car ahead, at low speed, heading another way, or wrecked', () => {
    expect(wake(moving(0, -60), ahead)).toBe(0);
    expect(wake(moving(0, 60, 100), ahead)).toBe(0);
    expect(wake(moving(0, 60, 280, Math.PI / 2), ahead)).toBe(0);
    const wreck = moving(0, 0);
    wreck.wrecked = true;
    expect(wake(moving(0, 60), wreck)).toBe(0);
    expect(towFrom(ahead, [ahead])).toBe(0);
  });
  it('builds over half a second and fades faster', () => {
    let tow = 0;
    for (let t = 0; t < 0.25; t += dt) tow = stepTow(tow, 1, dt);
    expect(tow).toBeGreaterThan(0.4);
    expect(tow).toBeLessThan(0.6);
    for (let t = 0; t < 0.3; t += dt) tow = stepTow(tow, 0, dt);
    expect(tow).toBe(0);
  });
  it('adds a few per cent of top speed at full tow', () => {
    expect(towBoost(0)).toBe(1);
    expect(towBoost(1)).toBeCloseTo(1 + SLIPSTREAM.gain);
  });
});

/** Two cars flat out up an open straight, one `gap` px behind the other; the gap after `seconds`, and the follower's best speed. */
function chase(gap: number, seconds: number, slipstream: boolean): { gap: number; top: number } {
  const w = 60;
  const h = 4000;
  const grid: Grid = { width: w, height: h, tile: 16, solid: new Array(w * h).fill(false) };
  const lead = moving(480, 60000);
  const follow = moving(480, 60000 + gap);
  let tow = 0;
  let top = 0;
  for (let t = 0; t < seconds; t += dt) {
    for (const c of [lead, follow]) stepCar(c, { steer: { x: 0, y: -1 }, handbrake: false }, RACE_HANDLING, dt, grid);
    tow = stepTow(tow, slipstream ? towFrom(follow, [lead]) : 0, dt);
    follow.speedScale = towBoost(tow);
    top = Math.max(top, speedOf(follow));
    // alongside: it has caught it
    if (follow.y - lead.y < 32) break;
  }
  return { gap: follow.y - lead.y, top };
}

describe('down a straight', () => {
  it('a car in the wake closes on the one ahead, faster than its top speed alone; out of it, the gap holds', () => {
    const towed = chase(80, 8, true);
    const alone = chase(80, 8, false);
    expect(alone.gap).toBeGreaterThan(75);
    expect(towed.gap).toBeLessThan(40);
    expect(towed.top).toBeGreaterThan(alone.top + 5);
  });
});

describe('slipstream in a race', () => {
  const layout = SILVER_HEATH;
  it('tows cars on the straights, and the racing stays clean', () => {
    const c = buildCircuit(layout, { cornerSpeed: lineCornerSpeed(f1), decel: lineDecel(f1) });
    const field = c.slots.slice(0, 10).map((s, i) => ({ car: newCar(f1, s.x, s.y, s.heading), ai: { lane: ((i * 7) % 11) - 5, pace: 0.94 * (1 - (i / 10) * 0.05) }, box: i >> 1 }));
    const race = newRace(c.track, c.grid, RACE_HANDLING, 3, field, 0.5, c.pit);
    let towed = 0;
    let steps = 0;
    for (let t = 0; t < 240 && !race.entrants.every((e) => e.progress.finished !== undefined || e.progress.retired); t += dt) {
      stepRace(race, dt);
      if (race.phase !== 'racing') continue;
      steps++;
      towed += race.entrants.filter((e) => e.tow > 0.5).length;
    }
    // on average at least one car in a good tow a fair share of the time
    expect(towed / steps).toBeGreaterThan(0.3);
    expect(race.entrants.every((e) => running(e) && !e.car.wrecked && e.progress.finished !== undefined)).toBe(true);
  }, 60_000);
});
