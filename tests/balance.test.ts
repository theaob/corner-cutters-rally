// The game's balance, headless: a reference player (src/f1/referencePlayer.ts), driving through a
// player's own inputs, against the AI on every circuit at every difficulty. Its clean flying lap
// sets the ladder: on HARD the quickest AI drives a very good lap, on NORMAL a good one, and on EASY
// even the quickest AI is slower than a steady player; the touch stick and the wheel are about as quick
// as each other. Its races (5 laps from mid-grid against a field as in the game, pit stops and all)
// check the ends of the ladder: a good player wins on EASY by seconds, and a steady one doesn't on HARD.

import { describe, expect, it } from 'vitest';
import { carClass, newCar } from '../src/engine/driving';
import { SIM_DT } from '../src/engine/fixedStep';
import { seededRandom } from '../src/engine/rng';
import { buildCircuit, type Circuit } from '../src/f1/circuit';
import { LAYOUTS } from '../src/f1/layouts';
import { DIFFICULTIES, aiCraftFor, aiMistakesFor, aiPaceFor, handlingFor, paceRanks, type Difficulty, type DifficultyId } from '../src/f1/difficulty';
import { styleOf } from '../src/f1/drivers';
import { TEAMS } from '../src/f1/teams';
import { lineCornerSpeed, lineDecel } from '../src/f1/racing';
import { newRace, order, stepRace } from '../src/f1/raceControl';
import { newQualifying, referenceLap } from '../src/f1/qualifying';
import { referenceDriver, referenceInput, type ReferencePlayer } from '../src/f1/referencePlayer';

const f1 = carClass('f1');
const byId = (id: DifficultyId) => DIFFICULTIES.find((d) => d.id === id)!;
const build = (layout: (typeof LAYOUTS)[0], d: Difficulty) => buildCircuit(layout, { cornerSpeed: lineCornerSpeed(f1, handlingFor(d)), decel: lineDecel(f1) });

/** The reference player's flying lap (s), with the cuts and damage it took on it. */
function flyingLap(c: Circuit, d: Difficulty, player: ReferencePlayer) {
  const q = newQualifying(c.track, c.grid, handlingFor(d), 'dry');
  const me = q.entrants[0];
  let cuts = 0;
  for (let t = 0; t < 120 && !me.progress.lapTimes.length; t += SIM_DT) {
    cuts += stepRace(q, SIM_DT, (e) => referenceInput(e.car, c.track, e.progress.idx, player)).race.filter((e) => e.kind === 'track-limits').length;
  }
  return { time: me.progress.lapTimes[0], cuts, damage: me.car.cls.health - me.car.health };
}

/** The reference player's race: 5 laps from grid slot `you` (mid-grid: 6th of 10) against a field drawn as the game draws one. Its place and its gap to the winner (or its lead). */
function race(c: Circuit, d: Difficulty, player: ReferencePlayer, seed: number, you = 5) {
  const rng = seededRandom(seed * 101);
  const ranks = paceRanks(10, rng);
  const codes = TEAMS.slice(0, 5).flatMap((t) => t.drivers);
  const field = c.slots.slice(0, 10).map((s, i) => {
    const style = styleOf(codes[i]);
    return {
      car: newCar(f1, s.x, s.y, s.heading), box: i >> 1,
      ai: i === you ? undefined : { lane: ((i * 7) % 11) - 5, pace: aiPaceFor(d, ranks[i], 10), craft: aiCraftFor(d, rng, style.aggression), mistakes: aiMistakesFor(d, style.consistency), rng: seededRandom(Math.floor(rng() * 4294967296)) },
    };
  });
  const r = newRace(c.track, c.grid, handlingFor(d), 5, field, 0.5, c.pit);
  for (let t = 0; t < 400 && !r.entrants.every((e) => e.progress.finished !== undefined || e.progress.retired); t += SIM_DT) stepRace(r, SIM_DT, (e) => referenceDriver(r, e, player));
  const ranked = order(r);
  const time = (i: number) => r.entrants[i].progress.finished! + r.entrants[i].progress.penalty;
  const place = ranked.indexOf(you) + 1;
  return { place, finished: r.entrants[you].progress.finished !== undefined, gap: time(you) - time(ranked[place === 1 ? 1 : 0]) };
}

const good = { device: 'touch', skill: 0.95 } as const;
const steady = { device: 'touch', skill: 0.9 } as const;
const veryGood = { device: 'touch', skill: 1 } as const;

describe.each(LAYOUTS)('the balance at $name: a flying lap', (layout) => {
  const c = build(layout, byId('normal'));
  const ai = referenceLap(c.track, c.grid, handlingFor(byId('normal')), 'dry');
  /** the quickest AI car's lap at difficulty `id` (the pace of the car at the front of the pace order) */
  const quickest = (id: DifficultyId) => ai / aiPaceFor(byId(id), 0, 10);
  const laps = Object.fromEntries([veryGood, good, steady].map((p) => [p.skill, flyingLap(c, byId('normal'), p)]));

  it('is clean: no cuts, no damage', () => {
    for (const lap of Object.values(laps)) expect(lap).toMatchObject({ cuts: 0, damage: 0 });
  });
  it('HARD: the quickest AI drives a very good lap (within 2%)', () => {
    expect(Math.abs(quickest('hard') / laps[1].time - 1)).toBeLessThan(0.02);
  });
  it('NORMAL: the quickest AI drives a good lap (within 2%)', () => {
    expect(Math.abs(quickest('normal') / laps[0.95].time - 1)).toBeLessThan(0.02);
  });
  it('EASY: even the quickest AI is slower than a steady player', () => {
    expect(quickest('easy')).toBeGreaterThan(laps[0.9].time);
  });
  it('the touch stick and the wheel are about as quick (within 3%)', () => {
    for (const p of [veryGood, good, steady]) {
      const wheel = flyingLap(c, byId('normal'), { device: 'wheel', skill: p.skill });
      expect(wheel).toMatchObject({ cuts: 0, damage: 0 });
      expect(Math.abs(wheel.time / laps[p.skill].time - 1)).toBeLessThan(0.03);
    }
  });
});

describe.each(LAYOUTS)('the balance at $name: a race from mid-grid', (layout) => {
  it('EASY: a good player wins, by 3 s or more', () => {
    const c = build(layout, byId('easy'));
    for (const seed of [1, 2]) expect(race(c, byId('easy'), good, seed)).toMatchObject({ place: 1, finished: true, gap: expect.toSatisfy((g: number) => g <= -3) });
  }, 60_000);
  it("HARD: a steady player doesn't make the podium", () => {
    const c = build(layout, byId('hard'));
    for (const seed of [1, 2]) expect(race(c, byId('hard'), steady, seed).place).toBeGreaterThan(3);
  }, 60_000);
  // (on the streets, where there's hardly a place to pass, from pole: as after a good qualifying lap)
  it(layout.street ? 'HARD: a very good player on pole stays at the front (top four)' : 'HARD: a very good player can race at the front (top four)', () => {
    const c = build(layout, byId('hard'));
    // (over eight races, not one: a race's luck can cost a place, and with the field on different strategies a lap-one
    // knock can cost a stop the others don't make; the middle of them in the top four, and at least half of them there)
    const places = [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => race(c, byId('hard'), veryGood, seed, layout.street ? 0 : 5).place).sort((a, b) => a - b);
    expect((places[3] + places[4]) / 2).toBeLessThanOrEqual(4);
    expect(places.filter((p) => p <= 4).length).toBeGreaterThanOrEqual(4);
  }, 240_000);
});
