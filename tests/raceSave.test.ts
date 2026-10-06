import { beforeEach, describe, expect, it } from 'vitest';
import { carClass, newCar } from '../src/engine/driving';
import { seededRandom } from '../src/engine/rng';
import { useSave, type SaveStore } from '../src/engine/save';
import { buildCircuit } from '../src/f1/circuit';
import { NORMAL, handlingFor } from '../src/f1/difficulty';
import { LAYOUTS } from '../src/f1/layouts';
import { lineCornerSpeed, lineDecel } from '../src/f1/racing';
import { newRace, stepRace } from '../src/f1/raceControl';
import { RACE_SAVE_MAX_AGE, dropKeptRace, keepRace, keptLap, keptRace, restoreRace, snapshotRace, type KeptRace } from '../src/f1/raceSave';
import { CC_SAVE } from '../src/f1/save';

const f1 = carClass('f1');
const layout = LAYOUTS.find((l) => l.id === 'twin-lakes')!;
const c = buildCircuit(layout, { cornerSpeed: lineCornerSpeed(f1), decel: lineDecel(f1) });

/** A 3-lap race at Twin Lakes, the same field each time (seed 5): ten AI cars, one of them "you" (no AI). */
const build = () => {
  const field = c.slots.slice(0, 10).map((s, i) => ({
    car: newCar(f1, s.x, s.y, s.heading), box: i >> 1,
    ai: i === 4 ? undefined : { lane: ((i * 7) % 11) - 5, pace: 0.95, mistakes: 0.02, rng: seededRandom(5 + i) },
  }));
  return newRace(c.track, c.grid, handlingFor(NORMAL), 3, field, 0.5, c.pit);
};
/** "You": driven by the AI's line too (so the race runs on its own) */
const run = (race: ReturnType<typeof build>, seconds: number) => {
  for (let t = 0; t < seconds && !race.entrants.every((e) => e.progress.finished !== undefined || e.progress.retired); t += 1 / 60) stepRace(race, 1 / 60);
};

describe('a race kept to come back to', () => {
  beforeEach(() => {
    const items = new Map<string, string>();
    const store: SaveStore = { getItem: (k) => items.get(k) ?? null, setItem: (k, v) => void items.set(k, v), removeItem: (k) => void items.delete(k) };
    useSave(CC_SAVE, store);
  });

  it('comes back as it was: every car where it was, on its lap, with its tyres, damage and strategy', () => {
    const race = build();
    race.entrants[4].ai = { lane: 0, pace: 0.95 };
    run(race, 40);
    race.entrants[2].car.health -= 7;
    const kept = JSON.parse(JSON.stringify(snapshotRace(race)));
    const back = build();
    back.entrants[4].ai = { lane: 0, pace: 0.95 };
    expect(restoreRace(back, kept, 5)).toBe(true);
    expect(back.clock).toBe(race.clock);
    expect(back.phase).toBe('racing');
    back.entrants.forEach((e, k) => {
      const was = race.entrants[k];
      expect({ x: e.car.x, y: e.car.y, heading: e.car.heading, vx: e.car.vx, health: e.car.health }).toEqual({ x: was.car.x, y: was.car.y, heading: was.car.heading, vx: was.car.vx, health: was.car.health });
      expect(e.progress).toEqual(was.progress);
      expect(e.tyres).toEqual(was.tyres);
      expect(e.plan).toEqual(was.plan);
      expect(e.stops).toBe(was.stops);
      // (its class back: an F1 car's)
      expect(e.car.cls).toBe(f1);
    });
    expect(back.holdBehind.every((s) => s instanceof Set)).toBe(true);
  });

  it('runs on to the flag from there: every car finishes all its laps', () => {
    const race = build();
    race.entrants[4].ai = { lane: 0, pace: 0.95 };
    run(race, 30);
    const back = build();
    back.entrants[4].ai = { lane: 0, pace: 0.95 };
    restoreRace(back, JSON.parse(JSON.stringify(snapshotRace(race))), 5);
    run(back, 400);
    expect(back.entrants.every((e) => e.progress.finished !== undefined && e.progress.lapTimes.length === 3)).toBe(true);
    // (the AI's dice rolled afresh: each still has them)
    expect(back.entrants.filter((e) => e.ai?.mistakes).every((e) => typeof e.ai!.rng === 'function')).toBe(true);
  });

  it("won't go over another race: a different field or length", () => {
    const race = build();
    const kept = snapshotRace(race);
    const shorter = { ...kept, laps: 5 };
    expect(restoreRace(build(), shorter, 5)).toBe(false);
    const fewer = { ...kept, entrants: kept.entrants.slice(1) };
    expect(restoreRace(build(), fewer, 5)).toBe(false);
  });

  it('is kept on the device, read back as it was, and thrown away; one too old or of another version is forgotten', () => {
    const race = build();
    run(race, 20);
    const k: KeptRace = {
      v: 1, at: Date.now(), circuit: layout.id, name: layout.name, mode: 'race', setup: { team: 'prima', seat: 0, difficulty: 'normal', weather: 'dry', laps: 3 },
      seed: 5, lapsSaved: 0, you: 4, state: snapshotRace(race),
    };
    keepRace(k);
    expect(keptRace()?.state.clock).toBe(race.clock);
    expect(keptLap(keptRace()!)).toBe(`LAP ${race.entrants[4].progress.lap + 1}/3`);
    expect(keptRace(Date.now() + RACE_SAVE_MAX_AGE + 1)).toBeUndefined();
    keepRace({ ...k, v: 99 });
    expect(keptRace()).toBeUndefined();
    keepRace(k);
    dropKeptRace();
    expect(keptRace()).toBeUndefined();
  });
});
