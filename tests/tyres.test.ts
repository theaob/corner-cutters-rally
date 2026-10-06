import { describe, expect, it } from 'vitest';
import { carClass, newCar, type StepEvents } from '../src/engine/driving';
import { buildCircuit } from '../src/f1/circuit';
import { NORMAL, aiPaceFor, handlingFor } from '../src/f1/difficulty';
import { lineCornerSpeed, lineDecel } from '../src/f1/racing';
import { DIRT_KNOCKS, newRace, stepRace, type RaceEvent } from '../src/f1/raceControl';
import { SHAKEDOWN, stageById } from '../src/f1/stages';
import { TYRES, fitAt, freshTyres, isDry, tyreFor, tyreGrip, tyreSpeed, wearTyres, wrongTyreLoss } from '../src/f1/tyres';
import type { WeatherId } from '../src/f1/weather';

const f1 = carClass('f1');
const quiet: StepEvents = { damage: 0, skidding: false, wreckedNow: false, onRough: false, airborne: false, landed: 0, impact: 0, scrape: 0, rolledNow: false, rolling: false };

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

  it('last about 50 s at their best, driven cleanly flat out', () => {
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
});

describe('a stage on tyres', () => {
  const run = (id: string, weather: WeatherId) => {
    const c = buildCircuit(stageById(id)!, { cornerSpeed: lineCornerSpeed(f1), decel: lineDecel(f1) });
    const s = c.slots[0];
    const race = newRace(c.track, c.grid, handlingFor(NORMAL), 1, [{ car: newCar(f1, s.x, s.y, s.heading), ai: { lane: 0, pace: aiPaceFor(NORMAL, 0, 1) } }], 0.5, weather);
    const start = race.entrants[0].tyres.compound;
    const events: RaceEvent[] = [];
    let wearAtHalf = 0;
    const { start: line, finish } = race.track.stage!;
    const at = () => race.entrants[0].progress.idx * race.track.spacing;
    for (let t = 0; t < 200 && at() < finish; t += 1 / 60) {
      events.push(...stepRace(race, 1 / 60).race);
      if (!wearAtHalf && at() > (line + finish) / 2) wearAtHalf = race.entrants[0].tyres.wear;
    }
    return { race, start, events, wearAtHalf, finished: at() >= finish };
  };

  it('on tarmac (Vineyards): the car starts on slicks, they wear down the stage and grip less as they do, and it reaches the finish clean', () => {
    const { race, start, events, wearAtHalf, finished } = run('ss-vineyards', 'dry');
    expect(start).toBe('slick');
    expect(finished).toBe(true);
    expect(events.filter((e) => e.kind === 'wreck' || e.kind === 'crash')).toEqual([]);
    const { tyres, car } = race.entrants[0];
    expect(tyres.compound).toBe('slick');
    expect(wearAtHalf).toBeGreaterThan(0.1);
    expect(tyres.wear).toBeGreaterThan(wearAtHalf);
    expect(car.tyreGrip).toBeCloseTo(tyreGrip(tyres.wear));
    expect(car.speedScale).toBeCloseTo(tyreSpeed(tyres.wear));
  }, 60_000);

  it('on dirt (the shakedown): the car on off-road tyres whatever the weather, knocks taking twice the impact to hurt, and it reaches the finish clean', () => {
    for (const weather of ['dry', 'wet'] as const) {
      const { race, start, events, finished } = run(SHAKEDOWN, weather);
      expect(start).toBe('dirt');
      expect(race.handling.crashThreshold).toBe(handlingFor(NORMAL).crashThreshold * DIRT_KNOCKS);
      expect(finished).toBe(true);
      expect(events.filter((e) => e.kind === 'wreck' || e.kind === 'crash')).toEqual([]);
      const { tyres, car } = race.entrants[0];
      expect(tyres.compound).toBe('dirt');
      expect(car.tyreGrip).toBeCloseTo(tyreGrip(tyres.wear) * fitAt('dirt', weather).grip);
    }
  }, 60_000);

  it('on tarmac, knocks hurt as they always do', () => {
    const c = buildCircuit(stageById('ss-vineyards')!, { cornerSpeed: lineCornerSpeed(f1), decel: lineDecel(f1) });
    const s = c.slots[0];
    const race = newRace(c.track, c.grid, handlingFor(NORMAL), 1, [{ car: newCar(f1, s.x, s.y, s.heading) }]);
    expect(race.handling.crashThreshold).toBe(handlingFor(NORMAL).crashThreshold);
  }, 30_000);
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
