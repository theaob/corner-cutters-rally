import { describe, expect, it } from 'vitest';
import { applyDamage, carClass, newCar, speedOf, type Car } from '../src/engine/driving';
import { buildCircuit, type Circuit } from '../src/f1/circuit';
import { RACE_HANDLING, aiInput, lineCornerSpeed, lineDecel } from '../src/f1/racing';
import { CLEAR_AFTER, GRID_HOLD, isBigCrash, newRace, order, running, stepRace, type Race, type RaceEvent } from '../src/f1/raceControl';
import { SHAKEDOWN, STAGE_SPECS, stageById } from '../src/f1/stages';

const f1 = carClass('f1');
const dt = 1 / 60;

const build = (id: string): Circuit => buildCircuit(stageById(id)!, { cornerSpeed: lineCornerSpeed(f1), decel: lineDecel(f1) });

/** `cars` AI cars lined up on the stage's start places at the tuned pace; `player` makes one of them the player's. */
function stageRace(c: Circuit, cars = 1, player?: number): Race {
  const field = c.slots.slice(0, cars).map((s, i) => ({
    car: newCar(f1, s.x, s.y, s.heading),
    ai: i === player ? undefined : { lane: ((i * 7) % 11) - 5, pace: 0.94 * (1 - (i / 10) * 0.05) },
  }));
  return newRace(c.track, c.grid, RACE_HANDLING, 1, field);
}

/** px along the road a car has come */
const along = (race: Race, i: number) => race.entrants[i].progress.idx * race.track.spacing;

describe('big crashes', () => {
  it('are a wreck, or a single hit taking 40% of a car\'s health', () => {
    const car = newCar(f1, 0, 0);
    car.health = 50;
    expect(isBigCrash(car, 60, false)).toBe(false); // a knock: 10 of 60
    car.health = 30;
    expect(isBigCrash(car, 60, false)).toBe(true); // 30 of 60 at once
    expect(isBigCrash(car, 30, true)).toBe(true);
  });
});

describe('race control on a stage', () => {
  const c = build(SHAKEDOWN);

  it('takes a wreck off the road CLEAR_AFTER s after it was wrecked, and it goes no further', () => {
    const race = stageRace(c);
    const events: { t: number; e: RaceEvent }[] = [];
    let wreckedAt = -1;
    for (let t = 0; t < 30; t += dt) {
      if (wreckedAt < 0 && race.phase === 'racing' && race.clock > 8) {
        applyDamage(race.entrants[0].car, 1000, RACE_HANDLING);
        wreckedAt = along(race, 0);
      }
      for (const e of stepRace(race, dt).race) events.push({ t: race.clock, e });
    }
    // (driven well up the road from the start before it)
    expect(wreckedAt).toBeGreaterThan(race.track.stage!.start + 500);
    expect(events.map((x) => x.e.kind)).toEqual(['lights-out', 'crash', 'wreck', 'retired']);
    // (the crash: the wrecked car's, so its parts fly)
    expect(events.find((x) => x.e.kind === 'crash')!.e).toMatchObject({ who: 0, wrecked: true });
    const at = (k: string) => events.find((x) => x.e.kind === k)!.t;
    expect(at('retired') - at('wreck')).toBeCloseTo(CLEAR_AFTER, 1);
    const me = race.entrants[0];
    expect(running(me)).toBe(false);
    expect(me.progress.retired).toBe(true);
    expect(me.progress.idx * race.track.spacing - wreckedAt).toBeLessThan(200);
  }, 30_000);

  it('calls a big hit a car survives a crash, and the car drives on', () => {
    const race = stageRace(c, 1, 0);
    const me = race.entrants[0];
    let dealt = false;
    // (the player's car driven as the AI would, so the hit can be dealt inside a step, as a crash is)
    const drive = () => {
      if (!dealt && race.phase === 'racing' && race.clock > 6) {
        me.car.health -= me.car.cls.health * 0.5;
        dealt = true;
      }
      return aiInput(me.car, race.track, me.progress.idx, { lane: 0, pace: 0.9 });
    };
    const events: RaceEvent[] = [];
    for (let t = 0; t < 15; t += dt) events.push(...stepRace(race, dt, drive).race);
    const crashes = events.filter((e) => e.kind === 'crash');
    expect(crashes).toHaveLength(1);
    expect(crashes[0]).toMatchObject({ who: 0, wrecked: false });
    expect((crashes[0] as { hit: number }).hit).toBeCloseTo(0.5, 2);
    expect(events.some((e) => e.kind === 'wreck' || e.kind === 'retired')).toBe(false);
    expect(running(me)).toBe(true);
    expect(speedOf(me.car)).toBeGreaterThan(50);
  }, 30_000);

  it('holds the car on the line until GO', () => {
    const race = stageRace(c, 1, 0);
    const start = race.entrants.map((e) => ({ x: e.car.x, y: e.car.y }));
    for (let t = 0; t < 3; t += dt) stepRace(race, dt, () => ({ steer: { x: 0, y: -1 }, handbrake: false }));
    expect(race.phase).toBe('lights');
    race.entrants.forEach((e: { car: Car }, i) => expect(Math.hypot(e.car.x - start[i].x, e.car.y - start[i].y)).toBeLessThan(1));
  });
});

describe('the start', () => {
  it('keeps every car on its place behind the start line through the countdown, on every stage (up a slope or down one too)', () => {
    for (const spec of STAGE_SPECS) {
      const c = build(spec.id);
      // (the player, mid-field, holding the throttle: it waits all the same)
      const race = stageRace(c, 10, 5);
      const start = race.entrants.map((e) => ({ x: e.car.x, y: e.car.y, heading: e.car.heading }));
      while (race.clock + dt < race.lightsOut) stepRace(race, dt, () => ({ steer: { x: 0, y: -1 }, handbrake: false }));
      race.entrants.forEach((e, i) => {
        expect(Math.hypot(e.car.x - start[i].x, e.car.y - start[i].y), `${spec.name} place ${i + 1}`).toBeLessThanOrEqual(GRID_HOLD + 1e-6);
        expect(Math.abs(e.car.heading - start[i].heading)).toBeLessThan(0.05);
      });
    }
  }, 120_000);

  it('is a scramble: each AI car goes on its own reaction, and a bogged start loses places without the field piling into it', () => {
    const race = stageRace(build(SHAKEDOWN), 10);
    // the front car bogs down badly; the rest react in a spread
    race.entrants.forEach((e, i) => (e.ai!.reaction = i === 0 ? 3 : 0.16 + ((i * 37) % 10) * 0.026));
    const crashes: RaceEvent[] = [];
    const movedAt: (number | undefined)[] = race.entrants.map(() => undefined);
    for (let t = 0; t < 30 && !(race.phase === 'racing' && race.clock > 5); t += dt) {
      for (const e of stepRace(race, dt).race) if (e.kind === 'crash') crashes.push(e);
      if (race.phase === 'racing') race.entrants.forEach((e, i) => { if (movedAt[i] === undefined && speedOf(e.car) > 5) movedAt[i] = race.clock; });
    }
    // each away about its reaction after GO (and the bogged one last)
    race.entrants.forEach((e, i) => expect(movedAt[i]!).toBeGreaterThanOrEqual(e.ai!.reaction! - dt));
    expect(movedAt[0]).toBeGreaterThan(Math.max(...movedAt.slice(1).map((m) => m!)));
    expect(order(race).indexOf(0)).toBeGreaterThan(0);
    expect(crashes).toEqual([]);
  }, 30_000);
});

describe('contact between cars', () => {
  it('is reported, with both cars by their places in the field (for TORPEDO)', () => {
    const race = stageRace(build(SHAKEDOWN), 10, 5);
    // (the AI cars slow away; the player's car flat out straight up the road from the 6th place, into the cars in front)
    race.entrants.forEach((e) => e.ai && (e.ai.reaction = 1.5));
    const me = race.entrants[5].car;
    const flatOut = () => ({ steer: { x: Math.sin(me.heading), y: -Math.cos(me.heading) }, handbrake: false });
    const hit = new Set<number>();
    for (let t = 0; t < 30 && race.clock < 6; t += dt) {
      for (const e of stepRace(race, dt, flatOut).race) {
        if (e.kind !== 'contact') continue;
        expect(e.a).not.toBe(e.b);
        for (const k of [e.a, e.b]) expect(race.entrants[k]).toBeDefined();
        if (e.a === 5 || e.b === 5) hit.add(e.a === 5 ? e.b : e.a);
      }
    }
    expect(hit.size).toBeGreaterThan(0);
  }, 30_000);
});
