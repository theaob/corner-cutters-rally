import { describe, expect, it } from 'vitest';
import { applyDamage, carClass, newCar, speedOf } from '../src/engine/driving';
import { HALF_WIDTH, TILE, buildCircuit, type Circuit } from '../src/f1/circuit';
import { LAYOUTS, SILVER_HEATH, type CircuitLayout } from '../src/f1/layouts';
import { GARAGE_ACROSS, PIT, PIT_LANE_MIN, PIT_STRAIGHT_MIN, entersPit, inLimitZone, stopTime, wantsPit } from '../src/f1/pits';
import { freshTyres } from '../src/f1/tyres';
import { RACE_HANDLING, lineCornerSpeed, lineDecel, nearestSample } from '../src/f1/racing';
import { newRace, order, running, skipToParked, stepRace, type Race, type RaceEvent } from '../src/f1/raceControl';

const f1 = carClass('f1');
const dt = 1 / 60;
const build = (layout: CircuitLayout) => buildCircuit(layout, { cornerSpeed: lineCornerSpeed(f1), decel: lineDecel(f1) });
const cellAt = (c: Circuit, x: number, y: number) => c.cells[Math.floor(y / TILE) * c.width + Math.floor(x / TILE)];

/** A full grid of 10 AI cars, boxes by pairs; `player` makes one of them the player's. */
function raceOn(layout: CircuitLayout, laps = 3, player?: number): Race {
  const c = build(layout);
  const field = c.slots.slice(0, 10).map((s, i) => ({
    car: newCar(f1, s.x, s.y, s.heading),
    ai: i === player ? undefined : { lane: ((i * 7) % 11) - 5, pace: 0.94 * (1 - (i / 10) * 0.05) },
    box: i >> 1,
  }));
  return newRace(c.track, c.grid, RACE_HANDLING, laps, field, 0.5, c.pit);
}

const over = (race: Race) => race.entrants.every((e) => e.progress.finished !== undefined || e.progress.retired);

describe.each(LAYOUTS)('$name pit lane', (layout) => {
  const c = build(layout);
  const { pit, track } = c;

  it('leaves the track and rejoins it, out behind a pit wall in between', () => {
    expect(pit.points[0].off).toBeLessThan(HALF_WIDTH);
    expect(pit.points[pit.points.length - 1].off).toBeLessThan(HALF_WIDTH);
    expect(Math.max(...pit.points.map((p) => p.off))).toBeCloseTo(PIT.offset);
    expect(c.cells).toContain('pit');
    expect(c.cells).toContain('pitwall');
  });

  it('lies on the main straight, entry road to exit road, the straight long enough for the shortest lane', () => {
    const n = track.samples.length;
    const straight = (i: number) => Math.abs(track.samples[((i % n) + n) % n].curve) < 1 / 700;
    let a = 0;
    while (straight(a - 1) && a > -n) a--;
    let b = 0;
    while (straight(b + 1) && b < n) b++;
    expect((b - a) * track.spacing).toBeGreaterThanOrEqual(PIT_STRAIGHT_MIN);
    expect(layout.pit.to - layout.pit.from).toBeGreaterThanOrEqual(PIT_LANE_MIN);
    for (const p of pit.points) expect(straight(p.idx)).toBe(true);
  });

  it('is clear of the rest of the circuit: each point of it is beside its own stretch of track', () => {
    const n = track.samples.length;
    for (const p of pit.points) {
      const i = nearestSample(track, p.x, p.y);
      expect(Math.min((i - p.idx + n) % n, (p.idx - i + n) % n)).toBeLessThan(20);
    }
  });

  it('has room to drive down the fast lane and stop in every box', () => {
    for (const p of pit.points) {
      if (p.off < PIT.offset - 1) continue;
      for (const across of [PIT.fastLane - 7, PIT.fastLane + 7, PIT.boxLane - 7, PIT.boxLane + 7]) {
        expect(cellAt(c, p.x + Math.cos(p.dir) * across * pit.side, p.y + Math.sin(p.dir) * across * pit.side)).toBe('pit');
      }
    }
    expect(pit.boxes).toHaveLength(PIT.boxes);
    for (const b of pit.boxes) expect(pit.points.find((p) => p.s >= b)!.off).toBeCloseTo(PIT.offset);
  });

  it('keeps the starting grid on the track', () => {
    for (const s of c.slots) expect(cellAt(c, s.x, s.y)).toBe('track');
  });
});

describe('the pit entry', () => {
  const c = build(SILVER_HEATH);
  const { pit, track } = c;
  const at = (k: number, lateral: number) => {
    const idx = (pit.entry + k) % track.samples.length;
    const s = track.samples[idx];
    return { car: newCar(f1, s.x + Math.cos(s.dir) * lateral, s.y + Math.sin(s.dir) * lateral, s.dir), idx };
  };

  it('commits a car that leaves the track on the pit side inside the pit zone', () => {
    const { car, idx } = at(8, 60 * pit.side);
    expect(entersPit(pit, track, car, idx)).toBe(true);
  });

  it('lets a car on the track, or off it on the other side, or away from the pits, carry on', () => {
    for (const [k, lateral] of [[8, 30 * pit.side], [8, -60 * pit.side], [-40, 60 * pit.side]]) {
      const { car, idx } = at(k, lateral);
      expect(entersPit(pit, track, car, idx)).toBe(false);
    }
  });
});

describe('when to stop', () => {
  const car = newCar(f1, 0, 0);
  it('never for a healthy car, or with no laps left', () => {
    expect(wantsPit(car, freshTyres(), 5, 25, RACE_HANDLING.damageSlow, 8000)).toBe(false);
    car.health = car.cls.health * 0.4;
    expect(wantsPit(car, freshTyres(), 0.6, 25, RACE_HANDLING.damageSlow, 8000)).toBe(false);
  });
  it('for a badly damaged car with laps to go, when the repair saves more than the stop costs', () => {
    car.health = car.cls.health * 0.4;
    expect(wantsPit(car, freshTyres(), 2, 25, RACE_HANDLING.damageSlow, 8000)).toBe(true);
    car.health = car.cls.health * 0.85;
    expect(wantsPit(car, freshTyres(), 2, 25, RACE_HANDLING.damageSlow, 8000)).toBe(false);
  });
  it('takes longer the more there is to repair', () => {
    car.health = car.cls.health;
    expect(stopTime(car)).toBeCloseTo(PIT.stop);
    car.health = car.cls.health / 2;
    expect(stopTime(car)).toBeCloseTo(PIT.stop + PIT.repair / 2);
  });
});

describe.each(LAYOUTS)('a pit stop at $name', (layout) => {
  it('repairs a damaged AI car: in on the limiter (between the speed-limit lines; no faster than the road speed on the way in), stopped in its box, out again, and it still finishes', () => {
    const race = raceOn(layout, 3);
    // (the stops each car's strategy plans: strategy.ts)
    const planned = race.entrants.map((e) => (e.plan ? e.plan.plan.stints.length - 1 : 0));
    const events: RaceEvent[] = [];
    let victim = -1;
    let fastestInLane = 0;
    let fastestOnRoads = 0;
    for (let t = 0; t < 240 && !over(race); t += dt) {
      if (victim < 0 && race.phase === 'racing' && race.clock > 6) {
        victim = order(race)[3];
        race.entrants[victim].car.health = f1.health * 0.35;
      }
      events.push(...stepRace(race, dt).race);
      const stop = victim >= 0 ? race.entrants[victim].pit : undefined;
      if (stop) {
        const v = speedOf(race.entrants[victim].car);
        const s = race.pit!.points[stop.at].s;
        if (stop.phase !== 'in' && inLimitZone(race.pit!, s)) fastestInLane = Math.max(fastestInLane, v);
        // (on the entry road, once off the track)
        if (stop.phase === 'in' && s < race.pit!.limitFrom && race.pit!.points[stop.at].off > PIT.onTrack + 40) fastestOnRoads = Math.max(fastestOnRoads, v);
      }
    }
    const mine = events.filter((e) => 'who' in e && e.who === victim).map((e) => e.kind);
    expect(mine.slice(0, 4)).toEqual(['pit-in', 'pit-stop', 'pit-repaired', 'pit-out']);
    const e = race.entrants[victim];
    // (repaired, then on with its strategy, planned afresh from there)
    expect(e.stops).toBeGreaterThanOrEqual(1);
    expect(e.car.health).toBe(f1.health);
    expect(fastestInLane).toBeLessThanOrEqual(PIT.limit + 5);
    expect(fastestOnRoads).toBeLessThanOrEqual(PIT.road + 5);
    expect(e.progress.finished).toBeDefined();
    expect(e.progress.lapTimes).toHaveLength(3);
    // nobody else stopped but as their strategies planned, and no one was hurt
    race.entrants.forEach((x, k) => k !== victim && expect(x.stops).toBe(planned[k]));
    expect(race.entrants.every((x) => running(x) && !x.car.wrecked)).toBe(true);
  }, 30_000);
});

describe('the player in the pits', () => {
  it('is taken through once committed: stopped, repaired, and handed back at the exit', () => {
    const c = build(SILVER_HEATH);
    const race = raceOn(SILVER_HEATH, 3, 0);
    const me = race.entrants[0];
    // race until lap 1 is under way, then put the player's damaged car in the pit entry at speed
    while (race.phase !== 'racing' || race.clock < 3) stepRace(race, dt, () => ({ handbrake: false }));
    const idx = (c.pit.entry + 6) % c.track.samples.length;
    const s = c.track.samples[idx];
    Object.assign(me.car, { x: s.x + Math.cos(s.dir) * 58 * c.pit.side, y: s.y + Math.sin(s.dir) * 58 * c.pit.side, heading: s.dir, vx: Math.sin(s.dir) * 200, vy: -Math.cos(s.dir) * 200 });
    me.progress = { ...me.progress, idx };
    applyDamage(me.car, f1.health * 0.5, RACE_HANDLING);
    const kinds: string[] = [];
    // the player holds full throttle straight on: the car drives itself all the same
    for (let t = 0; t < 20 && !kinds.includes('pit-out'); t += dt) {
      for (const e of stepRace(race, dt, () => ({ steer: { x: 1, y: 0 }, handbrake: false })).race) if ('who' in e && e.who === 0) kinds.push(e.kind);
    }
    // (repaired, its torn-off parts fitted back, before it pulls away from the box)
    expect(kinds).toEqual(['pit-in', 'pit-stop', 'pit-repaired', 'pit-out']);
    expect(me.car.health).toBe(f1.health);
    // back on the track, beside the exit
    const at = nearestSample(c.track, me.car.x, me.car.y);
    expect(Math.abs(at - c.pit.exit)).toBeLessThan(4);
  });
});

describe('the pits under the safety car', () => {
  it('lets the field pass a car that stops, without a penalty', () => {
    const race = raceOn(SILVER_HEATH, 3);
    const events: RaceEvent[] = [];
    let crashed = false;
    for (let t = 0; t < 240 && !over(race); t += dt) {
      if (!crashed && race.phase === 'racing' && race.clock > 10) {
        crashed = true;
        const ranked = order(race);
        applyDamage(race.entrants[ranked[6]].car, 1000, RACE_HANDLING);
        race.entrants[ranked[2]].car.health = f1.health * 0.35;
      }
      events.push(...stepRace(race, dt).race);
    }
    const kinds = events.map((e) => e.kind);
    expect(kinds).toContain('safety-car');
    expect(kinds).toContain('pit-stop');
    expect(kinds).not.toContain('penalty');
  }, 30_000);
});

describe.each(LAYOUTS)('after the race at $name', (layout) => {
  it('parks everyone in front of their garages, with no one hurt', () => {
    const c = build(layout);
    const race = raceOn(layout, 3);
    const planned = race.entrants.map((e) => (e.plan ? e.plan.plan.stints.length - 1 : 0));
    const parked = () => race.entrants.every((e) => e.progress.retired || e.inLap?.parked);
    let t = 0;
    for (; t < 400 && !parked(); t += dt) stepRace(race, dt);
    expect(parked()).toBe(true);
    const ranked = order(race);
    ranked.forEach((i) => {
      const e = race.entrants[i];
      expect(e.car.wrecked).toBe(false);
      expect(speedOf(e.car)).toBeLessThan(5);
      // pushed back into its team's garage, facing out, beside its teammate (the winner too: no parking on the straight)
      expect(e.inLap!.to).toBe('garage');
      expect(e.pit?.phase).toBe('garage');
      const q = c.pit.points.find((p) => p.s >= c.pit.boxes[e.box])!;
      const g = { x: q.x + Math.cos(q.dir) * GARAGE_ACROSS * c.pit.side, y: q.y + Math.sin(q.dir) * GARAGE_ACROSS * c.pit.side };
      expect(Math.hypot(e.car.x - g.x, e.car.y - g.y)).toBeLessThan(12);
      const mate = race.entrants.find((o) => o !== e && o.box === e.box && o.inLap?.to === 'garage');
      if (mate) expect(Math.hypot(e.car.x - mate.car.x, e.car.y - mate.car.y)).toBeGreaterThan(16);
    });
    // it stays that way
    for (let k = 0; k < 120; k++) stepRace(race, dt);
    expect(race.entrants.every((e) => speedOf(e.car) < 5 && !e.car.wrecked)).toBe(true);
    // nobody stopped for tyres on the way in: only the stops their strategies planned
    expect(race.entrants.map((e) => e.stops)).toEqual(planned);
  }, 60_000);
});

describe.each(LAYOUTS)('skipping to the ceremony at $name', (layout) => {
  it('finishes everyone at their pace and puts them in their garages, where they stay', () => {
    const race = raceOn(layout, 3);
    while (race.phase !== 'racing' || race.clock < 20) stepRace(race, dt);
    const before = order(race);
    const top = skipToParked(race);
    const ranked = order(race);
    expect(top).toEqual(ranked.slice(0, 3));
    // nobody had finished: the order stands (at the pace each has shown, nearly)
    expect(ranked.slice(0, 3).every((i) => before.slice(0, 5).includes(i))).toBe(true);
    for (const e of race.entrants) {
      expect(e.progress.finished).toBeGreaterThan(race.clock);
      expect(e.inLap?.parked).toBe(true);
    }
    // a couple of seconds on, all still in place
    const at = race.entrants.map((e) => ({ x: e.car.x, y: e.car.y }));
    for (let k = 0; k < 120; k++) stepRace(race, dt);
    race.entrants.forEach((e, i) => {
      expect(Math.hypot(e.car.x - at[i].x, e.car.y - at[i].y)).toBeLessThan(3);
      expect(e.car.wrecked).toBe(false);
    });
    for (const e of race.entrants) expect(e.pit?.phase).toBe('garage');
  }, 30_000);
});
