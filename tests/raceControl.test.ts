import { describe, expect, it } from 'vitest';
import { applyDamage, carClass, newCar, speedOf, type Car } from '../src/engine/driving';
import { buildCircuit } from '../src/f1/circuit';
import { LAYOUTS, SILVER_HEATH } from '../src/f1/layouts';
import { RACE_HANDLING, aiInput, lineCornerSpeed, lineDecel } from '../src/f1/racing';
import { CLEAR_AFTER, GRID_HOLD, HOLD, SAFETY_CAR, VSC, isBigCrash, newRace, order, running, stepRace, type Race, type RaceEvent } from '../src/f1/raceControl';

const f1 = carClass('f1');
const dt = 1 / 60;

/** A full grid of 10 AI cars at the tuned pace; `player` makes one of them (P6 on the grid) the player's. */
function raceOn(layout = SILVER_HEATH, laps = 3, player?: number): Race {
  const c = buildCircuit(layout, { cornerSpeed: lineCornerSpeed(f1), decel: lineDecel(f1) });
  const field = c.slots.slice(0, 10).map((s, i) => ({
    car: newCar(f1, s.x, s.y, s.heading),
    ai: i === player ? undefined : { lane: ((i * 7) % 11) - 5, pace: 0.94 * (1 - (i / 10) * 0.05) },
  }));
  return newRace(c.track, c.grid, RACE_HANDLING, laps, field);
}

const over = (race: Race) => race.entrants.every((e) => e.progress.finished !== undefined || e.progress.retired);

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

describe('race control', () => {
  it('brings out the safety car for a wreck: the field queues behind it at a limited pace, the wreck is cleared, then racing resumes', () => {
    const race = raceOn();
    const events: { t: number; e: RaceEvent }[] = [];
    let victim = -1;
    let spreadAtCrash = 0;
    let spreadAtGreen = 0;
    let fastest = 0;
    let scSpeed = 0;
    let scOut = 0;
    /** track distance from the leader back to the last running car */
    const spread = () => {
      const n = race.track.samples.length;
      const on = order(race).map((i) => race.entrants[i]).filter((e) => running(e) && !e.car.wrecked);
      const at = (e: (typeof on)[0]) => e.progress.lap * n + e.progress.idx;
      return (at(on[0]) - at(on[on.length - 1])) * race.track.spacing;
    };
    for (let t = 0; t < 200 && !over(race); t += dt) {
      if (victim < 0 && race.phase === 'racing' && race.clock > 15) {
        victim = order(race)[4];
        applyDamage(race.entrants[victim].car, 1000, RACE_HANDLING);
        spreadAtCrash = spread();
      }
      const step = stepRace(race, dt).race;
      for (const e of step) {
        events.push({ t: race.clock, e });
        if (e.kind === 'green') spreadAtGreen = spread();
      }
      if (race.sc) {
        scOut += dt;
        // once the field has had a few seconds to slow, nobody running goes over the limiter
        if (scOut > 3) for (const e of race.entrants) if (running(e) && !e.car.wrecked && e.progress.finished === undefined) fastest = Math.max(fastest, speedOf(e.car));
        if (scOut > 3) scSpeed = Math.max(scSpeed, speedOf(race.sc.car));
      }
    }
    // (race control's calls: the cars touching aside)
    const kinds = events.map((x) => x.e.kind).filter((k) => k !== 'contact');
    expect(kinds).toEqual(['lights-out', 'crash', 'wreck', 'safety-car', 'retired', 'green']);
    // (the crash: the wrecked car's, so its parts fly)
    expect(events.find((x) => x.e.kind === 'crash')!.e).toMatchObject({ who: victim, wrecked: true });
    const at = (k: string) => events.find((x) => x.e.kind === k)!.t;
    // out at once, cleared after CLEAR_AFTER, in once the queue has run behind it
    expect(at('safety-car')).toBeCloseTo(at('wreck'), 1);
    expect(at('retired') - at('wreck')).toBeCloseTo(CLEAR_AFTER, 1);
    expect(at('green') - at('safety-car')).toBeGreaterThanOrEqual(SAFETY_CAR.leadFor);
    expect(at('green') - at('safety-car')).toBeLessThanOrEqual(SAFETY_CAR.maxOut);
    expect(fastest).toBeLessThanOrEqual(SAFETY_CAR.limit + 5);
    // …and the safety car, and the cars catching it up, really do run at those speeds
    expect(scSpeed).toBeGreaterThan(SAFETY_CAR.speed - 5);
    expect(fastest).toBeGreaterThan(SAFETY_CAR.limit - 10);
    expect(spreadAtGreen).toBeLessThan(spreadAtCrash);
    // the AI keeps its place behind it; everyone else finishes, the wreck classified last as DNF
    expect(race.entrants.every((e) => e.progress.penalty === 0)).toBe(true);
    const final = order(race);
    expect(final[final.length - 1]).toBe(victim);
    expect(race.entrants[victim].progress.retired).toBe(true);
    expect(race.entrants.filter((e) => e.progress.finished !== undefined)).toHaveLength(9);
  }, 30_000);

  it('holds a player flat out on the queue in station: a gap behind the car ahead, no contact, no passing, no penalty', () => {
    // from the back of the grid, the player's car goes at the queue flat out and wide of it, trying to pass (steering
    // round what's in its way, a wreck and all, but never lifting for the queue: the limiter does the holding)
    const you = 9;
    const race = raceOn(SILVER_HEATH, 3, you);
    const me = race.entrants[you];
    const reckless = () => aiInput(me.car, race.track, me.progress.idx, { lane: 12, pace: 1, craft: 1 }, race.entrants.filter((o) => o !== me).map((o) => o.car));
    const n = race.track.samples.length;
    let crashed = false;
    let health = 0;
    let hurt = 0;
    let out = 0;
    const gaps: number[] = [];
    for (let t = 0; t < 200 && !over(race); t += dt) {
      if (!crashed && race.phase === 'racing' && race.clock > 4) {
        applyDamage(race.entrants[order(race)[0]].car, 1000, RACE_HANDLING);
        crashed = true;
      }
      stepRace(race, dt, reckless);
      if (!race.sc) continue;
      out += dt;
      if (out < 1) health = me.car.health;
      // (contact while it's out)
      hurt = health - me.car.health;
      // once it has had time to close up: the gap along the track to the car ahead of it
      const ranked = order(race).filter((i) => running(race.entrants[i]) && !race.entrants[i].car.wrecked);
      const ahead = race.entrants[ranked[ranked.indexOf(you) - 1]];
      if (out > 10 && ahead) gaps.push(((((ahead.progress.idx - me.progress.idx) % n) + n) % n) * race.track.spacing);
    }
    expect(gaps.length).toBeGreaterThan(60);
    expect(Math.min(...gaps)).toBeGreaterThan(HOLD.gap * 0.5);
    expect(Math.max(...gaps.slice(-60))).toBeLessThan(HOLD.gap * 2.5);
    expect(hurt).toBe(0);
    expect(me.progress.penalty).toBe(0);
  }, 30_000);

  it('penalises passing under the safety car, 5 s a place', () => {
    const you = 5;
    const race = raceOn(SILVER_HEATH, 3, you);
    const me = race.entrants[you];
    const drive = () => aiInput(me.car, race.track, me.progress.idx, { lane: 0, pace: 0.9 });
    let crashed = false;
    let penalties = 0;
    for (let t = 0; t < 40 && !over(race); t += dt) {
      if (!crashed && race.phase === 'racing' && race.clock > 4) {
        applyDamage(race.entrants[order(race)[9]].car, 1000, RACE_HANDLING);
        crashed = true;
      }
      // (a pass however it came about: a car now behind the player that it had to stay behind)
      if (race.sc && race.sc.out > 2 && !penalties) {
        const behind = order(race).slice(order(race).indexOf(you) + 1).find((i) => !race.entrants[i].car.wrecked)!;
        race.holdBehind[you].add(behind);
      }
      for (const e of stepRace(race, dt, drive).race) if (e.kind === 'penalty' && e.who === you) penalties++;
    }
    expect(penalties).toBe(1);
    expect(me.progress.penalty).toBe(SAFETY_CAR.penalty);
    expect(race.entrants.filter((e) => e !== me).every((e) => e.progress.penalty === 0)).toBe(true);
  }, 30_000);

  it("won't let the player past the safety car itself", () => {
    // on pole, flat out on the racing line; a backmarker crashes
    const race = raceOn(SILVER_HEATH, 3, 0);
    const me = race.entrants[0];
    const flatOut = () => aiInput(me.car, race.track, me.progress.idx, { lane: 0, pace: 1 });
    const n = race.track.samples.length;
    let crashed = false;
    let behind = true;
    let out = 0;
    let green = false;
    for (let t = 0; t < 120 && !green; t += dt) {
      if (!crashed && race.phase === 'racing' && race.clock > 12) {
        applyDamage(race.entrants[order(race)[9]].car, 1000, RACE_HANDLING);
        crashed = true;
      }
      green = stepRace(race, dt, flatOut).race.some((e) => e.kind === 'green');
      if (race.sc) {
        out += dt;
        // the safety car stays up the road: less than half a lap ahead of us
        const ahead = (((race.sc.idx - me.progress.idx) % n) + n) % n;
        behind &&= ahead > 0 && ahead < n / 2;
      }
    }
    expect(crashed && green).toBe(true);
    expect(behind).toBe(true);
    // in on the queue's schedule, not the time limit
    expect(out).toBeLessThan(SAFETY_CAR.maxOut - 5);
    expect(me.progress.penalty).toBe(0);
  }, 30_000);

  it('holds everyone on the grid until the lights go out', () => {
    const race = raceOn();
    const start = race.entrants.map((e) => ({ x: e.car.x, y: e.car.y }));
    for (let t = 0; t < 3; t += dt) stepRace(race, dt, () => ({ steer: { x: 0, y: -1 }, handbrake: false }));
    expect(race.phase).toBe('lights');
    race.entrants.forEach((e: { car: Car }, i) => expect(Math.hypot(e.car.x - start[i].x, e.car.y - start[i].y)).toBeLessThan(1));
  });
});

describe('the virtual safety car', () => {
  /**
   * A race with the car at the back of the grid driven as the AI would, through the player's input (so a hit can be
   * dealt inside a step, as a crash is): `hit(race)` once racing has run `at` s. The events with their times.
   */
  function runWith(at: number, hit: (race: Race) => void, seconds = 40, then?: (race: Race, t: number) => void) {
    const you = 9;
    const race = raceOn(SILVER_HEATH, 3, you);
    const me = race.entrants[you];
    let dealt = false;
    const drive = () => {
      if (!dealt && race.phase === 'racing' && race.clock > at) {
        hit(race);
        dealt = true;
      }
      // (minding the cars round it, and the orders when there are any, as an AI car does)
      const others = race.entrants.filter((o) => o !== me && running(o)).map((o) => o.car);
      return aiInput(me.car, race.track, me.progress.idx, { lane: 0, pace: 0.9 }, others, race.vsc || race.sc ? { noOvertaking: true } : {});
    };
    const events: { t: number; e: RaceEvent }[] = [];
    for (let t = 0; t < seconds && !over(race); t += dt) {
      for (const e of stepRace(race, dt, drive).race) events.push({ t: race.clock, e });
      then?.(race, t);
    }
    return { race, events };
  }
  /** a big hit a car survives: half its health at once, mid-pack */
  const bigHit = (race: Race) => {
    const car = race.entrants[order(race)[4]].car;
    car.health -= car.cls.health * 0.5;
  };

  it('comes out for a big crash a car survives: everyone on its limiter, nobody passing, the gaps held; its end called, then the green', () => {
    let fastest = 0;
    let spreadAt: number[] = [];
    let orderAt: number[][] = [];
    const { race, events } = runWith(12, bigHit, 40, (r) => {
      if (!r.vsc) return;
      const on = order(r).filter((i) => running(r.entrants[i]) && !r.entrants[i].pit);
      const at = (i: number) => r.entrants[i].progress.lap * r.track.samples.length + r.entrants[i].progress.idx;
      if (r.vsc.out < dt * 1.5 || r.vsc.out > VSC.length - dt * 1.5) {
        spreadAt.push((at(on[0]) - at(on[on.length - 1])) * r.track.spacing);
        orderAt.push(on);
      }
      // (once the field has had a moment to slow)
      if (r.vsc.out > 2) for (const e of r.entrants) if (running(e) && !e.pit) fastest = Math.max(fastest, speedOf(e.car));
    });
    const kinds = events.map((x) => x.e.kind).filter((k) => k !== 'contact');
    expect(kinds.slice(0, 5)).toEqual(['lights-out', 'crash', 'vsc', 'vsc-ending', 'green']);
    expect(kinds).not.toContain('safety-car');
    const at = (k: string) => events.find((x) => x.e.kind === k)!.t;
    expect(at('vsc-ending') - at('vsc')).toBeCloseTo(VSC.length - VSC.warn, 1);
    expect(at('green') - at('vsc')).toBeCloseTo(VSC.length, 1);
    // on the limiter, and really running at it
    expect(fastest).toBeLessThanOrEqual(VSC.limit + 5);
    expect(fastest).toBeGreaterThan(VSC.limit - 15);
    // the field neither closes up nor spreads out much, and keeps its order
    [spreadAt, orderAt] = [spreadAt.slice(-2), orderAt.slice(-2)];
    expect(spreadAt[1]).toBeGreaterThan(spreadAt[0] * 0.75);
    expect(orderAt[1]).toEqual(orderAt[0]);
    expect(race.entrants.every((e) => e.progress.penalty === 0)).toBe(true);
    expect(race.vsc).toBeUndefined();
  }, 30_000);

  it('gives way to the safety car if a car is wrecked while it is out', () => {
    const { race, events } = runWith(12, bigHit, 20, (r) => {
      if (r.vsc && r.vsc.out > 3 && !r.sc) applyDamage(r.entrants[order(r)[2]].car, 1000, RACE_HANDLING);
    });
    const kinds = events.map((x) => x.e.kind).filter((k) => ['vsc', 'vsc-ending', 'safety-car', 'green'].includes(k));
    expect(kinds).toEqual(['vsc', 'safety-car']);
    expect(race.vsc).toBeUndefined();
    expect(race.sc).toBeDefined();
  }, 30_000);
});

describe('blue flags', () => {
  it('come out for a backmarker as the leader comes up to lap it, and it lets the leader by', () => {
    const c = buildCircuit(SILVER_HEATH, { cornerSpeed: lineCornerSpeed(f1), decel: lineDecel(f1) });
    const field = c.slots.slice(0, 2).map((s, i) => ({ car: newCar(f1, s.x, s.y, s.heading), ai: { lane: 0, pace: i === 0 ? 1 : 0.6 } }));
    const race = newRace(c.track, c.grid, RACE_HANDLING, 8, field);
    const n = race.track.samples.length;
    const at = (i: number) => race.entrants[i].progress.lap * n + race.entrants[i].progress.idx;
    let flagged: number | undefined;
    let passed: number | undefined;
    for (let t = 0; t < 400 && passed === undefined; t += dt) {
      for (const e of stepRace(race, dt).race) if (e.kind === 'blue' && flagged === undefined) {
        expect(e).toEqual({ kind: 'blue', who: 1, by: 0 });
        flagged = race.clock;
      }
      // the leader a lap and a bit ahead: past it on the track
      if (flagged !== undefined && at(0) - at(1) > n + 10) passed = race.clock;
    }
    expect(flagged).toBeDefined();
    expect(passed).toBeDefined();
    // (through in a few seconds: let by, not held up behind it; about 2.4 s from the flag at 140 px)
    expect(passed! - flagged!).toBeLessThan(4);
    expect(race.entrants[1].blue).toBeUndefined();
  }, 30_000);
});

describe('the start', () => {
  it('keeps every car on its grid slot through the lights, on every circuit (a sloping grid, like Twin Lakes\'s, included)', () => {
    for (const layout of LAYOUTS) {
      // (the player, mid-grid, holding the throttle: it waits all the same)
      const race = raceOn(layout, 3, 5);
      const start = race.entrants.map((e) => ({ x: e.car.x, y: e.car.y, heading: e.car.heading }));
      while (race.clock + dt < race.lightsOut) stepRace(race, dt, () => ({ steer: { x: 0, y: -1 }, handbrake: false }));
      race.entrants.forEach((e, i) => {
        expect(Math.hypot(e.car.x - start[i].x, e.car.y - start[i].y), `${layout.name} slot ${i + 1}`).toBeLessThanOrEqual(GRID_HOLD + 1e-6);
        expect(Math.abs(e.car.heading - start[i].heading)).toBeLessThan(0.05);
      });
    }
  }, 60_000);
  it('is a scramble: each AI car goes on its own reaction, and a bogged start loses places without the field piling into it', () => {
    const race = raceOn(SILVER_HEATH, 3);
    // pole bogs down; the rest react in a spread
    race.entrants.forEach((e, i) => (e.ai!.reaction = i === 0 ? 1.1 : 0.16 + ((i * 37) % 10) * 0.026));
    const crashes: RaceEvent[] = [];
    let movedAt: (number | undefined)[] = race.entrants.map(() => undefined);
    for (let t = 0; t < 30 && !(race.phase === 'racing' && race.clock > 5); t += dt) {
      for (const e of stepRace(race, dt).race) if (e.kind === 'crash') crashes.push(e);
      if (race.phase === 'racing') race.entrants.forEach((e, i) => { if (movedAt[i] === undefined && speedOf(e.car) > 5) movedAt[i] = race.clock; });
    }
    // each away about its reaction after lights out (and the bogged one last)
    race.entrants.forEach((e, i) => expect(movedAt[i]!).toBeGreaterThanOrEqual(e.ai!.reaction! - dt));
    expect(movedAt[0]).toBeGreaterThan(Math.max(...movedAt.slice(1).map((m) => m!)));
    expect(order(race).indexOf(0)).toBeGreaterThan(0);
    expect(crashes).toEqual([]);
  });
});

describe('contact between cars', () => {
  it('is reported, with both cars by their places in the field (for TORPEDO)', () => {
    const race = raceOn(SILVER_HEATH, 3, 5);
    // (the player's car flat out straight ahead from P6, into the cars in front at the start)
    const flatOut = () => ({ steer: { x: 0, y: -1 }, handbrake: false });
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
  });
});
