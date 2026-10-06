import { describe, expect, it } from 'vitest';
import { carClass, newCar } from '../src/engine/driving';
import { SIM_DT, advance, fixedClock, lerpAngle, resetClock } from '../src/engine/fixedStep';
import { seededRandom } from '../src/engine/rng';
import { buildCircuit } from '../src/f1/circuit';
import { SILVER_HEATH } from '../src/f1/layouts';
import { RACE_HANDLING, lineCornerSpeed, lineDecel } from '../src/f1/racing';
import { newRace, stepRace, type Race } from '../src/f1/raceControl';
import { TEAMS, teamGrid } from '../src/f1/teams';

describe('the fixed-step clock', () => {
  it('runs whole steps for each frame, carrying the rest over', () => {
    const c = fixedClock(60);
    expect(advance(c, 1 / 30).steps).toBe(2);
    expect(advance(c, 1 / 60).steps).toBe(1);
    // a 120 Hz screen: a step every other frame, drawn halfway between on the ones without
    const a = advance(c, 1 / 120);
    const b = advance(c, 1 / 120);
    expect([a.steps, b.steps].sort()).toEqual([0, 1]);
    expect(a.steps === 0 ? a.alpha : b.alpha).toBeCloseTo(0.5, 5);
  });

  it('runs the same number of steps for the same time, whatever the frames', () => {
    for (const hz of [24, 30, 60, 90, 120, 144]) {
      const c = fixedClock(60);
      let steps = 0;
      for (let f = 0; f < hz * 10; f++) steps += advance(c, 1 / hz).steps;
      expect(Math.abs(steps - 600)).toBeLessThanOrEqual(1);
    }
  });

  it('drops the time a very slow frame would need past its limit, rather than stalling to catch up', () => {
    const c = fixedClock(60, 4);
    expect(advance(c, 1).steps).toBe(4);
    expect(c.carry).toBe(0);
    advance(c, 0.01);
    resetClock(c);
    expect(c.carry).toBe(0);
  });

  it('turns the short way round between two headings', () => {
    expect(lerpAngle(3.1, -3.1, 0.5)).toBeCloseTo(Math.PI, 2);
    expect(lerpAngle(0.2, 0.4, 0.5)).toBeCloseTo(0.3);
  });
});

describe('seeded random numbers', () => {
  it('give the same sequence for the same seed, and a different one for another', () => {
    const a = seededRandom(1234);
    const b = seededRandom(1234);
    const seqA = Array.from({ length: 50 }, a);
    expect(Array.from({ length: 50 }, b)).toEqual(seqA);
    expect(Array.from({ length: 50 }, seededRandom(1235))).not.toEqual(seqA);
    for (const x of seqA) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it('are spread evenly', () => {
    const r = seededRandom(7);
    const bins = new Array(10).fill(0);
    for (let i = 0; i < 10000; i++) bins[Math.floor(r() * 10)]++;
    for (const n of bins) expect(Math.abs(n - 1000)).toBeLessThan(120);
  });

  it('draw the same grid for the same race seed', () => {
    const grid = (seed: number) => teamGrid(TEAMS[0], 10, 5, seededRandom(seed)).map((t) => t.id);
    expect(grid(99)).toEqual(grid(99));
  });
});

const f1 = carClass('f1');
const c = buildCircuit(SILVER_HEATH, { cornerSpeed: lineCornerSpeed(f1), decel: lineDecel(f1) });

/** A race of 10 AI cars, the lights out after `wait` s. */
function race(wait = 0.6): Race {
  const field = c.slots.slice(0, 10).map((s, i) => ({ car: newCar(f1, s.x, s.y, s.heading), ai: { lane: ((i * 7) % 11) - 5, pace: 0.94 * (1 - (i / 10) * 0.05) }, box: i >> 1 }));
  return newRace(c.track, c.grid, RACE_HANDLING, 2, field, wait, c.pit);
}

/** Run `r` for `total` fixed steps, driven by frames at `hz` (± `jitter` of a frame, from a fixed sequence); the cars' state after. */
function runFrames(r: Race, total: number, hz: number, jitter = 0) {
  const clock = fixedClock();
  const wobble = seededRandom(hz);
  let steps = 0;
  while (steps < total) {
    const n = advance(clock, (1 / hz) * (1 + (wobble() * 2 - 1) * jitter)).steps;
    for (let k = 0; k < n && steps < total; k++, steps++) stepRace(r, SIM_DT);
  }
  return r.entrants.map((e) => [e.car.x, e.car.y, e.car.heading, e.progress.lap, e.progress.idx]);
}

describe('a race in fixed steps', () => {
  it('comes out exactly the same at any frame rate, steady or uneven', () => {
    // 30 s of racing (1800 steps): the start, the first lap, the pack sorting itself out
    const at60 = runFrames(race(), 1800, 60);
    for (const [hz, jitter] of [[30, 0], [144, 0], [60, 0.4], [90, 0.3], [24, 0.5]]) expect(runFrames(race(), 1800, hz, jitter)).toEqual(at60);
  }, 60_000);

  it('plays again exactly from the same start (the ground for ghosts and replays)', () => {
    expect(runFrames(race(0.9), 1200, 60)).toEqual(runFrames(race(0.9), 1200, 60));
  }, 60_000);

  it('where a step for each frame would not: the frame rate changed the race', () => {
    const byFrame = (hz: number) => {
      const r = race();
      for (let t = 0; t < 30; t += 1 / hz) stepRace(r, 1 / hz);
      return r.entrants.map((e) => [e.car.x, e.car.y]);
    };
    expect(byFrame(30)).not.toEqual(byFrame(60));
  }, 60_000);
});
