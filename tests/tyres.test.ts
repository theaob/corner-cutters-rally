import { describe, expect, it } from 'vitest';
import { carClass, newCar, type StepEvents } from '../src/engine/driving';
import { buildCircuit } from '../src/f1/circuit';
import { NORMAL, aiPaceFor, handlingFor } from '../src/f1/difficulty';
import { DUST_BOWL, LAYOUTS } from '../src/f1/layouts';
import { lineCornerSpeed, lineDecel } from '../src/f1/racing';
import { newRace, stepRace, type RaceEvent } from '../src/f1/raceControl';
import { TYRES, fitAt, freshTyres, isDry, stopNow, tyreFor, tyreGrip, tyreSpeed, wearPerLap, wearTyres, wrongTyreLoss } from '../src/f1/tyres';
import { choices, planText } from '../src/f1/strategy';
import { PIT } from '../src/f1/pits';

const f1 = carClass('f1');
const quiet: StepEvents = { damage: 0, skidding: false, wreckedNow: false, onRough: false, airborne: false, landed: 0 };

/** Wear a set for `seconds` on a car doing `speed` px/s, sliding `slide` px/s sideways. */
function drive(seconds: number, speed: number, slide = 0, rough = false) {
  const set = freshTyres();
  const car = newCar(f1, 0, 0); // facing north: forward is −y, sideways is x
  car.vy = -speed;
  car.vx = slide;
  for (let t = 0; t < seconds; t += 1 / 60) wearTyres(set, car, { ...quiet, onRough: rough }, 1 / 60);
  return { set, car };
}

describe('tyres', () => {
  it('lose grip and speed as they wear, sharply once over the cliff', () => {
    expect(tyreGrip(0)).toBe(1);
    expect(tyreSpeed(0)).toBe(1);
    const speedAt = [0, 0.35, 0.7, 0.85, 1].map(tyreSpeed);
    for (let i = 1; i < speedAt.length; i++) expect(speedAt[i]).toBeLessThan(speedAt[i - 1]);
    // the drop over the cliff's last 30% of wear is far more than over the first 70%
    expect(tyreSpeed(0.7) - tyreSpeed(1)).toBeGreaterThan(2 * (tyreSpeed(0) - tyreSpeed(0.7)));
    expect(tyreSpeed(1)).toBeCloseTo(0.8);
    expect(tyreGrip(1)).toBeLessThan(tyreGrip(0.7));
  });

  it('last about two laps at their best, driven cleanly flat out', () => {
    // a lap is about 25 s
    const { set, car } = drive(50, f1.topSpeed);
    expect(set.wear).toBeGreaterThan(0.4);
    expect(set.wear).toBeLessThan(TYRES.cliff);
    expect(car.speedScale).toBeCloseTo(tyreSpeed(set.wear));
    expect(car.tyreGrip).toBeCloseTo(tyreGrip(set.wear));
  });

  it('wear faster sliding, and on grass or gravel', () => {
    const clean = drive(10, 200).set.wear;
    expect(drive(10, 200, 150).set.wear).toBeGreaterThan(clean * 3);
    expect(drive(10, 200, 0, true).set.wear).toBeGreaterThan(clean);
  });

  it('measure their wear per lap once a set has done half a lap', () => {
    expect(wearPerLap({ compound: 'slick', wear: 0.1, driven: 1000 }, 8000)).toBe(TYRES.lapWear);
    expect(wearPerLap({ compound: 'slick', wear: 0.6, driven: 16000 }, 8000)).toBeCloseTo(0.3);
  });
});

describe('when to stop for tyres', () => {
  const plan = { lapTime: 25, perLap: 0.35, damage: 0, damageSlow: 0.3, stopTime: 1.2 };
  it('never in a 3-lap race on a clean car', () => {
    expect(stopNow({ ...plan, lapsLeft: 2, wear: 0.35 })).toBe(false);
    expect(stopNow({ ...plan, lapsLeft: 1, wear: 0.7 })).toBe(false);
  });

  it('once in a 5-lap race: not early, but once the tyres are near the cliff with laps to go', () => {
    expect(stopNow({ ...plan, lapsLeft: 4, wear: 0.35 })).toBe(false);
    expect(stopNow({ ...plan, lapsLeft: 3, wear: 0.8 })).toBe(true);
    // fresh tyres after the stop: no second stop
    expect(stopNow({ ...plan, lapsLeft: 2, wear: 0.35 })).toBe(false);
  });

  it('sooner for a driver who burns through them', () => {
    expect(stopNow({ ...plan, lapsLeft: 4, wear: 0.8, perLap: 0.8 })).toBe(true);
  });
});

describe('a 5-lap race on tyres', () => {
  // (each car on its strategy: strategy.ts; the field split between plans close to the quickest)
  it.each(LAYOUTS.filter((l) => !l.dirt))('at $name: each car makes the stops its strategy planned, the field split where more than one strategy is close, teammates queuing at their box, and everyone finishes', (layout) => {
    const c = buildCircuit(layout, { cornerSpeed: lineCornerSpeed(f1), decel: lineDecel(f1) });
    const field = c.slots.slice(0, 10).map((s, i) => ({ car: newCar(f1, s.x, s.y, s.heading), ai: { lane: ((i * 7) % 11) - 5, pace: aiPaceFor(NORMAL, i, 10) }, box: i >> 1 }));
    const race = newRace(c.track, c.grid, handlingFor(NORMAL), 5, field, 0.5, c.pit);
    const planned = race.entrants.map((e) => e.plan!.plan.stints.length - 1);
    const strategies = new Set(race.entrants.map((e) => planText(e.plan!.plan)));
    const events: RaceEvent[] = [];
    for (let t = 0; t < 400 && !race.entrants.every((e) => e.progress.finished !== undefined || e.progress.retired); t += 1 / 60) events.push(...stepRace(race, 1 / 60).race);
    expect(events.filter((e) => e.kind === 'wreck' || e.kind === 'safety-car')).toEqual([]);
    expect(race.entrants.map((e) => e.stops)).toEqual(planned);
    // (split wherever more than one plan is close to the quickest: on an easy circuit for tyres, like the streets, it may be one)
    const close = choices({ laps: 5, lapTime: race.practice!.lapTime, perLap: race.practice!.perLap, stopCost: PIT.stop + TYRES.laneCost }).length;
    expect(strategies.size).toBeLessThanOrEqual(close);
    if (close > 1) expect(strategies.size).toBeGreaterThan(1);
    expect(race.entrants.every((e) => e.progress.finished !== undefined && e.progress.lapTimes.length === 5)).toBe(true);
  }, 60_000);
  it('on dirt (Dust Bowl): every car on off-road tyres, whatever the weather, no strategy to it, and everyone finishes', () => {
    const c = buildCircuit(DUST_BOWL, { cornerSpeed: lineCornerSpeed(f1), decel: lineDecel(f1) });
    for (const weather of ['dry', 'wet'] as const) {
      const field = c.slots.slice(0, 10).map((s, i) => ({ car: newCar(f1, s.x, s.y, s.heading), ai: { lane: ((i * 7) % 11) - 5, pace: aiPaceFor(NORMAL, i, 10) }, box: i >> 1, start: 'hard' as const }));
      const race = newRace(c.track, c.grid, handlingFor(NORMAL), 5, field, 0.5, c.pit, weather);
      expect(race.entrants.every((e) => e.tyres.compound === 'dirt' && !e.plan)).toBe(true);
      const events: RaceEvent[] = [];
      for (let t = 0; t < 400 && !race.entrants.every((e) => e.progress.finished !== undefined || e.progress.retired); t += 1 / 60) events.push(...stepRace(race, 1 / 60).race);
      expect(events.filter((e) => e.kind === 'wreck' || e.kind === 'safety-car')).toEqual([]);
      // (a stop, if any, for a fresh set of the same)
      expect(race.entrants.every((e) => e.tyres.compound === 'dirt')).toBe(true);
      expect(race.entrants.every((e) => e.progress.finished !== undefined && e.progress.lapTimes.length === 5)).toBe(true);
    }
  }, 60_000);
});

describe('off-road tyres', () => {
  it('are the only tyres on dirt, in any weather; the loose earth gives less grip than tarmac, and mud less still', () => {
    for (const w of ['dry', 'damp', 'wet'] as const) {
      expect(tyreFor(w, true)).toBe('dirt');
      expect(tyreFor(w)).not.toBe('dirt');
      expect(wrongTyreLoss('dirt', w)).toBe(0);
    }
    expect(fitAt('dirt', 'dry').grip).toBeLessThan(fitAt('slick', 'dry').grip * 0.85);
    // (and sliding's no harm to them: they last longer than HARDS on tarmac)
    expect(fitAt('dirt', 'dry').wear).toBeLessThan(fitAt('hard', 'dry').wear);
    expect(fitAt('dirt', 'wet').grip).toBeLessThan(fitAt('dirt', 'damp').grip);
    expect(fitAt('dirt', 'damp').grip).toBeLessThan(fitAt('dirt', 'dry').grip);
    expect(isDry('dirt')).toBe(false);
  });
});
