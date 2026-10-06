import { describe, expect, it } from 'vitest';
import { carClass, newCar, type Car } from '../src/engine/driving';
import { seededRandom } from '../src/engine/rng';
import { buildCircuit, type Circuit } from '../src/f1/circuit';
import { LAYOUTS, SILVER_HEATH } from '../src/f1/layouts';
import { DIFFICULTIES, aiCraftFor, aiIncidentsFor, aiMistakesFor, aiPaceFor, handlingFor, paceRanks } from '../src/f1/difficulty';
import { STYLES, styleOf } from '../src/f1/drivers';
import { TEAMS } from '../src/f1/teams';
import { RACE_HANDLING, aiInput, lateralOffset, lineCornerSpeed, lineDecel, type AiDriver } from '../src/f1/racing';
import { SETTLE, newRace, order, racingIncident, running, stepRace, type Race, type RaceEvent } from '../src/f1/raceControl';

const f1 = carClass('f1');
const dt = 1 / 60;
const build = (layout = SILVER_HEATH) => buildCircuit(layout, { cornerSpeed: lineCornerSpeed(f1), decel: lineDecel(f1) });

/** The sample where the circuit's longest straight starts. */
function longestStraight(c: Circuit): number {
  const s = c.track.samples;
  let best = 0;
  let bestLen = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i].speed < f1.topSpeed - 1 || s[(i - 1 + s.length) % s.length].speed >= f1.topSpeed - 1) continue;
    let k = 0;
    while (s[(i + k) % s.length].speed >= f1.topSpeed - 1 && k < s.length) k++;
    if (k > bestLen) [best, bestLen] = [i, k];
  }
  return best;
}

/** Put `car` on the track `k` samples past `idx`, `lat` px to the right, at `v` px/s along it. */
function place(c: Circuit, car: Car, idx: number, k: number, lat: number, v: number): void {
  const s = c.track.samples[(idx + k) % c.track.samples.length];
  Object.assign(car, { x: s.x + Math.cos(s.dir) * lat, y: s.y + Math.sin(s.dir) * lat, heading: s.dir, vx: Math.sin(s.dir) * v, vy: -Math.cos(s.dir) * v });
}

/** Two AI cars on the long straight, past the lights and the settling, one `gap` samples behind the other. */
function duel(front: AiDriver, back: AiDriver, gap = 6): { race: Race; c: Circuit } {
  const c = build();
  const race = newRace(c.track, c.grid, RACE_HANDLING, 5, [
    { car: newCar(f1, c.slots[0].x, c.slots[0].y, c.slots[0].heading), ai: front },
    { car: newCar(f1, c.slots[1].x, c.slots[1].y, c.slots[1].heading), ai: back },
  ], 0, c.pit);
  while (race.phase !== 'racing') stepRace(race, dt);
  race.clock = SETTLE + 1;
  const at = longestStraight(c);
  place(c, race.entrants[0].car, at, gap + 4, front.lane, 250);
  place(c, race.entrants[1].car, at, 4, back.lane, 250);
  for (const e of race.entrants) e.progress = { ...e.progress, idx: (at + 4) % c.track.samples.length, lapStart: 0 };
  return { race, c };
}

describe('the grid and the racecraft by difficulty', () => {
  it('mixes the grid a little: every pace rank once, each car near its slot', () => {
    const ranks = paceRanks(10, seededRandom(3));
    expect([...ranks].sort((a, b) => a - b)).toEqual([...Array(10).keys()]);
    ranks.forEach((r, i) => expect(Math.abs(r - i)).toBeLessThanOrEqual(6));
    expect(paceRanks(10, seededRandom(3))).toEqual(ranks);
    // and over many grids, sometimes a quicker car behind a slower one
    expect(Array.from({ length: 20 }, (_, k) => paceRanks(10, seededRandom(k + 1))).some((r) => r.some((x, i) => i > 0 && x < r[i - 1]))).toBe(true);
  });
  it('gives more racecraft the harder the race, each driver a little either side', () => {
    const rng = seededRandom(9);
    const [easy, normal, hard] = DIFFICULTIES.map((d) => Array.from({ length: 30 }, () => aiCraftFor(d, rng)));
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b) / xs.length;
    expect(mean(easy)).toBeLessThan(mean(normal));
    expect(mean(normal)).toBeLessThan(mean(hard));
    for (const x of [...easy, ...hard]) expect(x).toBeGreaterThanOrEqual(0);
    for (const x of hard) expect(x).toBeLessThanOrEqual(1);
  });
});

describe('overtaking', () => {
  it('a clearly quicker car pulls out down the straight and passes, without touching', () => {
    const { race } = duel({ lane: 0, pace: 0.85, craft: 0.3 }, { lane: 0, pace: 1, craft: 0.6 });
    const [slow, quick] = race.entrants;
    let pulledOut = false;
    for (let t = 0; t < 8; t += dt) {
      stepRace(race, dt);
      if (quick.ai?.move?.kind === 'pass') pulledOut = true;
    }
    expect(pulledOut).toBe(true);
    expect(order(race)[0]).toBe(1);
    expect(slow.car.health).toBe(f1.health);
    expect(quick.car.health).toBe(f1.health);
  });

  it("doesn't go for a pass it can't finish: a car only a touch quicker stays behind", () => {
    const { race } = duel({ lane: 0, pace: 0.94, craft: 0.3 }, { lane: 0, pace: 0.945, craft: 0.6 }, 30);
    const quick = race.entrants[1];
    let passes = 0;
    for (let t = 0; t < 3; t += dt) {
      const before = quick.ai?.move?.kind;
      stepRace(race, dt);
      if (quick.ai?.move?.kind === 'pass' && before !== 'pass') passes++;
    }
    expect(passes).toBe(0);
  });

  it('holds position under the safety car orders', () => {
    const c = build();
    const car = newCar(f1, 0, 0);
    const i = longestStraight(c);
    place(c, car, i, 0, 0, 250);
    const ahead = newCar(f1, 0, 0);
    place(c, ahead, i, 5, 0, 150);
    const ai: AiDriver = { lane: 0, pace: 1, craft: 1 };
    aiInput(car, c.track, i, ai, [ahead], { noOvertaking: true, limit: 200 });
    expect(ai.move).toBeUndefined();
  });
});

describe('defending', () => {
  it('a car with racecraft covers the inside of the next bend from a quicker car behind; one without holds its line', () => {
    const lat = (craft: number) => {
      const { race, c } = duel({ lane: 0, pace: 0.9, craft }, { lane: 0, pace: 1, craft: 0.6 }, 5);
      const front = race.entrants[0];
      let most = 0;
      for (let t = 0; t < 1.5; t += dt) {
        stepRace(race, dt);
        most = Math.max(most, Math.abs(lateralOffset(c.track, front.progress.idx, front.car.x, front.car.y)));
      }
      return { most, move: front.ai?.move?.kind };
    };
    const strong = lat(0.95);
    const none = lat(0.2);
    expect(strong.most).toBeGreaterThan(none.most + 8);
    expect(none.move).toBeUndefined();
  });
});

describe('personalities', () => {
  it('give every driver a style: aggression and consistency in range', () => {
    for (const t of TEAMS) for (const code of t.drivers) expect(STYLES[styleOf(code).id]).toBeDefined();
    for (const st of Object.values(STYLES)) {
      expect(Math.abs(st.aggression)).toBeLessThanOrEqual(0.3);
      expect(Math.abs(st.consistency)).toBeLessThanOrEqual(1);
    }
    // the more consistent a style, the fewer its mistakes; the harder the race, the fewer too
    const [easy, normal, hard] = DIFFICULTIES;
    expect(aiMistakesFor(normal, STYLES.metronome.consistency)).toBeLessThan(aiMistakesFor(normal, STYLES.rookie.consistency));
    expect(aiMistakesFor(hard)).toBeLessThan(aiMistakesFor(normal));
    expect(aiMistakesFor(normal)).toBeLessThan(aiMistakesFor(easy));
    // and an aggressive one races with more racecraft
    expect(aiCraftFor(normal, () => 0.5, STYLES.charger.aggression)).toBeGreaterThan(aiCraftFor(normal, () => 0.5, STYLES.metronome.aggression));
  });
});

/** A lap (the second, once past the start's settling) of one car alone, making mistake `kind` into every braking bend (or none): its time, the mistakes, and the damage. */
function lapWith(layout: (typeof LAYOUTS)[number], kind: 'none' | 'late' | 'wide') {
  const c = build(layout);
  const ai: AiDriver = { lane: 0, pace: 0.94, mistakes: kind === 'none' ? 0 : 1, rng: () => (kind === 'late' ? 0.1 : 0.9) };
  const race = newRace(c.track, c.grid, RACE_HANDLING, 5, [{ car: newCar(f1, c.slots[0].x, c.slots[0].y, c.slots[0].heading), ai }], 0, c.pit);
  while (race.phase !== 'racing') stepRace(race, dt);
  race.clock = SETTLE + 1;
  const e = race.entrants[0];
  while (e.progress.lap < 1) stepRace(race, dt);
  const t0 = race.clock;
  const events: RaceEvent[] = [];
  while (e.progress.lap < 2) events.push(...stepRace(race, dt).race);
  return { time: race.clock - t0, mistakes: events.filter((x) => x.kind === 'mistake').length, damage: f1.health - e.car.health };
}

// (not on dirt: its line has no braking bend, the cars lifting and sliding through every one instead)
describe.each(LAYOUTS.filter((l) => !l.dirt))('mistakes at $name', (layout) => {
  const clean = lapWith(layout, 'none');
  it.each(['late', 'wide'] as const)('%s: costs time at each braking bend (a few tenths), and nothing worse', (kind) => {
    const lap = lapWith(layout, kind);
    expect(lap.mistakes).toBeGreaterThan(0);
    const each = (lap.time - clean.time) / lap.mistakes;
    expect(each).toBeGreaterThan(0.15);
    expect(each).toBeLessThan(1);
    expect(lap.damage).toBe(0);
  });
});

describe('mistakes in a race', () => {
  const run = () => {
    const c = build();
    const field = c.slots.slice(0, 6).map((s, i) => ({ car: newCar(f1, s.x, s.y, s.heading), ai: { lane: 0, pace: 0.9 - i * 0.005, mistakes: 0.3, rng: seededRandom(100 + i) }, box: i >> 1 }));
    const race = newRace(c.track, c.grid, RACE_HANDLING, 2, field, 0.5, c.pit);
    const events: { t: number; who: number; what: string }[] = [];
    for (let t = 0; t < 70; t += dt) for (const e of stepRace(race, dt).race) if (e.kind === 'mistake') events.push({ t: race.clock, who: e.who, what: e.what });
    return events;
  };
  it('are none while the pack settles, and the same every time from the same dice', () => {
    const a = run();
    expect(a.length).toBeGreaterThan(0);
    expect(a.every((e) => e.t >= SETTLE)).toBe(true);
    expect(run()).toEqual(a);
  }, 30_000);
});

describe('a defence', () => {
  it('is over once the car it covers from has dropped back', () => {
    const { race } = duel({ lane: 0, pace: 0.9, craft: 0.95 }, { lane: 0, pace: 1, craft: 0.6 }, 5);
    const [front, back] = race.entrants;
    let defended = false;
    for (let t = 0; t < 1 && !defended; t += dt) {
      stepRace(race, dt);
      defended = front.ai?.move?.kind === 'defend';
    }
    expect(defended).toBe(true);
    // the attacker falls away (a big lift): the cover is dropped
    back.ai!.pace = 0.3;
    for (let t = 0; t < 4; t += dt) stepRace(race, dt);
    expect(front.ai?.move).toBeUndefined();
  });
});

describe.each(LAYOUTS)('races at $name with mixed grids', (layout) => {
  it.each(DIFFICULTIES)('$name: the quicker cars race their way forward, and with no incidents (aiIncidentsFor) nobody wrecks', (d) => {
    const c = build(layout);
    let gained = 0;
    for (const seed of [1, 2]) {
      const rng = seededRandom(seed * 101);
      const ranks = paceRanks(10, rng);
      // (the drivers of the first five teams, with their styles and their mistakes, as in the game)
      const codes = TEAMS.slice(0, 5).flatMap((t) => t.drivers);
      const field = c.slots.slice(0, 10).map((s, i) => {
        const style = styleOf(codes[i]);
        return {
          car: newCar(f1, s.x, s.y, s.heading), box: i >> 1,
          ai: { lane: ((i * 7) % 11) - 5, pace: aiPaceFor(d, ranks[i], 10), craft: aiCraftFor(d, rng, style.aggression), mistakes: aiMistakesFor(d, style.consistency), rng: seededRandom(Math.floor(rng() * 4294967296)) },
        };
      });
      const race = newRace(c.track, c.grid, handlingFor(d), 3, field, 0.5, c.pit);
      const kinds: string[] = [];
      let start: number[] = [];
      for (let t = 0; t < 300 && !race.entrants.every((e) => e.progress.finished !== undefined); t += dt) {
        kinds.push(...stepRace(race, dt).race.map((e) => e.kind));
        if (race.clock < SETTLE) start = order(race);
      }
      // (and it keeps inside the track limits)
      expect(kinds.filter((k) => k === 'wreck' || k === 'safety-car' || k === 'track-limits')).toEqual([]);
      expect(race.entrants.every((e) => running(e) && e.progress.finished !== undefined)).toBe(true);
      order(race).forEach((i, p) => (gained += Math.max(0, start.indexOf(i) - p)));
    }
    // (from after the start's settling: overtakes, not the first-lap shuffle; on EASY nobody defends, so there are always some)
    if (d.id === 'easy') expect(gained).toBeGreaterThan(0);
  }, 60_000);
});

describe('racing incidents', () => {
  it('are likelier for a more aggressive driver, and on an easier difficulty', () => {
    const [easy, normal, hard] = DIFFICULTIES;
    expect(aiIncidentsFor(normal, 0.2)).toBeGreaterThan(aiIncidentsFor(normal, 0));
    expect(aiIncidentsFor(normal, -0.1)).toBeLessThan(aiIncidentsFor(normal, 0));
    expect(aiIncidentsFor(easy)).toBeGreaterThan(aiIncidentsFor(normal));
    expect(aiIncidentsFor(normal)).toBeGreaterThan(aiIncidentsFor(hard));
    expect(aiIncidentsFor(normal, -1)).toBeGreaterThan(0);
  });

  it('are a dive at the AI car ahead into a bend that ends in a crash, never at your car', () => {
    const c = build();
    // (every chance taken, to see plenty; the player's car in the middle of the grid)
    const field = c.slots.slice(0, 8).map((s, i) => ({
      car: newCar(f1, s.x, s.y, s.heading), box: i >> 1,
      ai: i === 3 ? undefined : { lane: ((i * 7) % 11) - 5, pace: 0.93 - i * 0.004, craft: 0.6, incidents: 1, rng: seededRandom(7 + i) },
    }));
    const you = field[3].car;
    const race = newRace(c.track, c.grid, RACE_HANDLING, 3, field, 0.5, c.pit);
    let dives = 0;
    let crashes = 0;
    for (let t = 0; t < 120; t += dt) {
      const was = race.entrants.map((e) => e.ai?.lunge);
      // (you: on the racing line at a steady pace, as a player might be)
      const events = stepRace(race, dt, (e) => aiInput(e.car, race.track, e.progress.idx, { lane: 0, pace: 0.9 }, race.entrants.filter((o) => o !== e).map((o) => o.car))).race;
      crashes += events.filter((e) => e.kind === 'crash' && e.who !== 3).length;
      race.entrants.forEach((e, i) => {
        if (e.ai?.lunge && !was[i]) {
          dives++;
          expect(e.ai.lunge.car).not.toBe(you);
        }
      });
    }
    expect(dives).toBeGreaterThan(2);
    expect(crashes).toBeGreaterThan(0);
  }, 60_000);

  it('hit both cars hard and spin the one hit round', () => {
    const diver = newCar(f1, 0, 40, 0);
    const hit = newCar(f1, 3, 0, 0);
    Object.assign(diver, { vy: -260 });
    Object.assign(hit, { vy: -140 });
    racingIncident(diver, hit, 120, RACE_HANDLING);
    expect(diver.health).toBeLessThan(diver.cls.health * 0.6);
    expect(hit.health).toBeLessThan(diver.health);
    expect(Math.abs(hit.heading)).toBeGreaterThan(1.5);
    expect(Math.hypot(hit.vx, hit.vy)).toBeLessThan(80);
  });
});
