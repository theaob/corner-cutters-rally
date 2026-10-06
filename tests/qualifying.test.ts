import { describe, expect, it } from 'vitest';
import { carClass, newCar } from '../src/engine/driving';
import { SIM_DT } from '../src/engine/fixedStep';
import { seededRandom } from '../src/engine/rng';
import { HALF_WIDTH, buildCircuit } from '../src/f1/circuit';
import { LAYOUTS } from '../src/f1/layouts';
import { RACE_HANDLING, lineCornerSpeed, lineDecel, newProgress, type RaceProgress } from '../src/f1/racing';
import { newRace, stepRace } from '../src/f1/raceControl';
import { QUALI, aiTimes, flyingStart, gridOrder, judgeLap, newQualiLap, newQualifying, referenceLap } from '../src/f1/qualifying';

const f1 = carClass('f1');
const build = (layout = LAYOUTS[0]) => buildCircuit(layout, { cornerSpeed: lineCornerSpeed(f1), decel: lineDecel(f1) });

describe.each(LAYOUTS)('qualifying at $name', (layout) => {
  const c = build(layout);
  it('times a flying lap from the line round to it', () => {
    const q = newQualifying(c.track, c.grid, RACE_HANDLING, 'dry');
    const me = q.entrants[0];
    expect(q.phase).toBe('racing');
    expect(me.progress.lapStart).toBeUndefined();
    // (driven round by the AI's line, as a player would)
    me.ai = { lane: 0, pace: 1 };
    for (let t = 0; t < 120 && !me.progress.lapTimes.length; t += SIM_DT) stepRace(q, SIM_DT);
    expect(me.progress.lapTimes.length).toBe(1);
    // timed from the line, not from the standing start: a flying lap
    expect(me.progress.lapTimes[0]).toBeLessThan(q.clock);
  });
  it('starts standing on a straight, a few seconds before the line (time to get your bearings)', () => {
    const q = newQualifying(c.track, c.grid, RACE_HANDLING, 'dry');
    const me = q.entrants[0];
    expect(Math.hypot(me.car.vx, me.car.vy)).toBe(0);
    expect(Math.abs(c.track.samples[me.progress.idx].curve)).toBeLessThan(1 / 500);
    // (flat out on the AI's line: the quickest anyone gets there)
    me.ai = { lane: 0, pace: 1 };
    for (let t = 0; t < 20 && me.progress.lapStart === undefined; t += SIM_DT) stepRace(q, SIM_DT);
    // (about four seconds at the least: where the straight before the line is shorter than the run-up, it starts there)
    expect(q.clock).toBeGreaterThan(3.9);
    expect(q.clock).toBeLessThan(7);
  });
  it("sets the AI's times off a reference lap, scaled by pace", () => {
    const ref = referenceLap(c.track, c.grid, RACE_HANDLING, 'dry');
    expect(ref).toBeGreaterThan(10);
    expect(ref).toBeLessThan(c.track.length / 150);
    // a slower driver's own lap is close to the reference over its pace
    const slow = newRace(c.track, c.grid, RACE_HANDLING, QUALI.laps, [{ car: newCar(f1, 0, 0, 0), ai: { lane: 0, pace: 0.88 } }], 0, undefined, 'dry');
    flyingStart(slow, 0);
    const p = () => slow.entrants[0].progress;
    for (let t = 0; t < 200 && !p().lapTimes.length; t += SIM_DT) stepRace(slow, SIM_DT);
    expect(Math.abs(p().lapTimes[0] / (ref / 0.88) - 1)).toBeLessThan(0.03);
    // and slower in the wet
    expect(referenceLap(c.track, c.grid, RACE_HANDLING, 'wet')).toBeGreaterThan(ref);
  }, 30_000);
});

describe('the grid from qualifying', () => {
  it('puts the quickest first, and anyone without a time at the back', () => {
    expect(gridOrder([31.2, undefined, 30.8, 31.0, undefined])).toEqual([2, 3, 0, 1, 4]);
  });
  it("spreads the AI's times a little either way of its pace, the same for the same seed", () => {
    const paces = [0.94, 0.93, undefined, 0.92];
    const times = aiTimes(paces, 30, seededRandom(4));
    expect(times[2]).toBeUndefined();
    paces.forEach((pace, i) => pace && expect(Math.abs(times[i]! / (30 / pace) - 1)).toBeLessThanOrEqual(QUALI.spread));
    expect(aiTimes(paces, 30, seededRandom(4))).toEqual(times);
  });
});

describe('your lap', () => {
  const at = (p: Partial<RaceProgress>): RaceProgress => ({ ...newProgress(0), ...p });
  it('counts a clean lap', () => {
    const q = newQualiLap();
    expect(judgeLap(q, at({ lapStart: 0 }), false)).toBeUndefined();
    expect(judgeLap(q, at({ lapStart: 31, lapTimes: [31] }), false)).toEqual({ time: 31 });
  });
  it('deletes a lap with a cut, and times the next afresh', () => {
    const q = newQualiLap();
    // a cut on the run-up doesn't count
    expect(judgeLap(q, at({}), true)).toBeUndefined();
    expect(judgeLap(q, at({ lapStart: 0 }), true)).toBe('deleted');
    expect(judgeLap(q, at({ lapStart: 0 }), true)).toBeUndefined();
    expect(judgeLap(q, at({ lapStart: 30, lapTimes: [30] }), false)).toBe('void');
    expect(judgeLap(q, at({ lapStart: 62, lapTimes: [30, 32] }), false)).toEqual({ time: 32 });
  });
  it('deletes a lap cut in the very step it crosses the line, and times the next one clean', () => {
    const q = newQualiLap();
    expect(judgeLap(q, at({ lapStart: 0 }), false)).toBeUndefined();
    expect(judgeLap(q, at({ lapStart: 30, lapTimes: [30] }), true)).toBe('deleted');
    expect(judgeLap(q, at({ lapStart: 61, lapTimes: [30, 31] }), false)).toEqual({ time: 31 });
  });
  it('running wide in the session (all four wheels past the white line, on the outside) goes off the track', () => {
    const c = build();
    const q = newQualifying(c.track, c.grid, RACE_HANDLING, 'dry');
    const me = q.entrants[0];
    const k = q.corners[0];
    const s = c.track.samples[k.apex];
    const lat = -k.side * (HALF_WIDTH + 20);
    Object.assign(me.car, { x: s.x + Math.cos(s.dir) * lat, y: s.y + Math.sin(s.dir) * lat, vx: 0, vy: 0 });
    me.progress = { ...me.progress, idx: k.apex, lapStart: 0 };
    expect(stepRace(q, SIM_DT).race.some((e) => e.kind === 'off-track')).toBe(true);
  });
  it('a cut in the session is judged by the track limits', () => {
    const c = build();
    const q = newQualifying(c.track, c.grid, RACE_HANDLING, 'dry');
    const me = q.entrants[0];
    const k = q.corners[0];
    const s = c.track.samples[k.apex];
    const lat = k.side * (HALF_WIDTH + 20);
    Object.assign(me.car, { x: s.x + Math.cos(s.dir) * lat, y: s.y + Math.sin(s.dir) * lat, vx: 0, vy: 0 });
    me.progress = { ...me.progress, idx: k.apex, lapStart: 0 };
    expect(stepRace(q, SIM_DT).race.some((e) => e.kind === 'track-limits')).toBe(true);
  });
});
