// Race control: runs the whole field for one step (start lights, inputs,
// driving, contact, lap timing) and applies the race rules around it. A
// wrecked car is cleared off the track and retires; a big crash brings out the
// safety car, which joins ahead of the leader and leads the field at a limited
// pace, with no overtaking, until it goes in and racing resumes. After the flag
// each car does an in-lap: the top three park in their numbered spots on the
// main straight, and the rest drive down the pit lane to their garages. Cutting
// the inside of a marked corner is a strike: warnings first, then seconds added
// (trackLimits.ts). Engine-free,
// so a whole race, crashes and all, runs in a test exactly as in the game.

import { blueFlags } from './blueFlags';
import { gridFor, sameLevel } from './bridge';
import { applyDamage, carClass, collideCars, newCar, speedOf, stepCar, type Car, type DriveInput, type HandlingParams, type StepEvents } from '../engine/driving';
import type { Grid } from '../engine/sim';
import { SIM_DT } from '../engine/fixedStep';
import { PIT, between, entersPit, newPitStop, pitStep, pushIntoGarage, wantsPit, type PitLane, type PitStop } from './pits';
import { COMPOUNDS, DRY_COMPOUNDS, TYRES, fitTyres, freshTyres, isDry, tyreFor, wearPerLap, wearTyres, wrongTyreLoss, type Compound, type DryCompound, type TyreSet } from './tyres';
import { bestPlan, choices, pickFor, stintTime, type Plan, type StrategyInput } from './strategy';
import { stepTow, towBoost, towFrom } from './slipstream';
import { judge, markCorners, newLimits, offTrack, type Corner, type Limits } from './trackLimits';
import type { WeatherId } from './weather';
import { WETNESS, conditionOf, startWeather, stepWeather, weatherAhead, type Forecast } from './forecast';
import { aiInput, coolDownInput, lateralOffset, nearestSample, newProgress, standings, stepProgress, type AiDriver, type Orders, type RaceProgress, type Track } from './racing';

export const SAFETY_CAR = {
  /** px/s it leads the field at (an F1 car's top speed is 320) */
  speed: 150,
  /** px/s: the field's limiter while it's out, quick enough to close up the queue behind it */
  limit: 200,
  /** a hit that takes at least this share of a car's health in one go is a big crash */
  bigHit: 0.4,
  /** px ahead of the leader it joins the track */
  joinAhead: 160,
  /** px: the leader counts as lined up behind it within this gap */
  queueGap: 120,
  /** px: a player who has got this far alongside or ahead of it drops back behind it */
  dropBack: 300,
  /** seconds it stays out once the leader is lined up behind it */
  leadFor: 12,
  /** seconds it stays out at most, however the field lines up */
  maxOut: 40,
  /** seconds added for each car passed while it's out */
  penalty: 5,
};

/**
 * Holding station under the safety car (or the virtual one): the player's limiter follows the car they must stay
 * behind (a car ahead of them when it came out, or the safety car itself), closing on it at its speed plus a little
 * for each px past the gap, less once inside it, and brakes when well over: the car settles into place a gap behind
 * instead of running into the queue or past it (and taking a penalty).
 */
export const HOLD = {
  /** px from the car ahead (along the track, middle to middle: about a car and a half's daylight) to settle at */
  gap: 72,
  /** px ahead it looks for that car */
  reach: 320,
  /** px/s of closing speed for each px past the gap (1/s) */
  close: 1.4,
  /** px/s: the least the limiter asks, however close (it never stops the car dead) */
  crawl: 40,
  /** px/s over the limiter before the brakes go on */
  over: 12,
  /** inside this share of the gap and closing on the car ahead, the brakes go on whatever the limiter says */
  tight: 0.7,
};

/**
 * The virtual safety car: called for a big crash the car survives (its nose, maybe more, on the track), where a wreck
 * brings out the safety car itself. Every car on a limiter and no overtaking (passing costs as under the safety car),
 * but nobody to queue behind: the gaps hold. Out for a set time (as long as the debris lies), its end called a few
 * seconds before the green.
 */
export const VSC = {
  /** px/s: everyone's limiter while it's out (about 60% of an F1 car's top speed) */
  limit: 190,
  /** seconds it's out */
  length: 10,
  /** seconds before the green that its end is called */
  warn: 3,
};

/** Seconds after lights out before the AI makes passing and defending moves: the pack sorts itself out first. */
export const SETTLE = 15;

/** Seconds a wreck stays on track before the marshals clear it and the car retires. */
export const CLEAR_AFTER = 2.5;
/** Seconds of the start lights before the earliest lights-out. */
export const LIGHTS = 3.6;
/** px a car waiting on the grid may creep from its slot (on a sloping grid; on a flat one it never gets that far) */
export const GRID_HOLD = 2;

export interface Entrant {
  car: Car;
  /** where it lined up on the grid (kept to it till the lights go out) */
  slot?: { x: number; y: number; heading: number };
  /** the AI driving it; undefined for the player */
  ai?: AiDriver;
  progress: RaceProgress;
  /** race time it was wrecked */
  wreckedAt?: number;
  /** its team's box in the pit lane */
  box: number;
  /** on its way through the pit lane */
  pit?: PitStop;
  /** just out of the pits: px of track left to drive along the blend line (at the pit side's edge, no overtaking), up to speed before it crosses to the racing line */
  blend?: number;
  /** pit stops made */
  stops: number;
  /** the set of tyres it's on */
  tyres: TyreSet;
  /** how much it's being towed along in the slipstream of a car ahead, 0…1 */
  tow: number;
  /** its track-limits strikes */
  limits: Limits;
  /** the player's limiter this step under the safety car (or the virtual one): px/s, or undefined when there's none */
  held?: number;
  /** blue flags: the car lapping it, close behind (its index), while they're out */
  blue?: number;
  /** after its flag: px driven on its cool-down lap, and whether it has headed (and been pushed) into its garage */
  inLap?: { driven: number; to?: 'garage'; parked?: boolean };
  /** its strategy for the dry (strategy.ts): the plan's stints from the last stop (or the start), and the lap it stops at
   * the end of (none: no more stops) */
  plan?: { plan: Plan; stopAt?: number };
  /** the dry tyres to fit at its next stop (the player's pick in the pit lane; else the plan's) */
  next?: DryCompound;
}

/** A circuit's practice: a lap's time (s) and the wear it does on new SOFTs. */
export interface Practice {
  lapTime: number;
  perLap: number;
}
/** (each circuit's, measured once) */
const practiced = new WeakMap<Track, Practice>();

/**
 * `track`'s practice, as the crews plan a race by: one car flat out on its own on new SOFTs, a flying lap timed and
 * its wear measured (a circuit hard on its tyres wears them more a lap than an easy one). Measured once a circuit.
 */
export function practiceOf(track: Track, grid: Grid, handling: HandlingParams): Practice {
  const kept = practiced.get(track);
  if (kept) return kept;
  const race = newRace(track, grid, handling, 99, [{ car: newCar(carClass('f1'), 0, 0, 0), ai: { lane: 0, pace: 1 } }], 0, undefined, 'dry');
  // (on the straight before the line, standing: a run-up, then the lap)
  const n = track.samples.length;
  let idx = n - Math.round(PRACTICE_RUN_UP / track.spacing);
  while (idx < n - 1 && Math.abs(track.samples[idx].curve) >= 1 / 500) idx++;
  const s = track.samples[idx];
  const e = race.entrants[0];
  Object.assign(e.car, { x: s.x, y: s.y, heading: s.dir, vx: 0, vy: 0 });
  e.progress = newProgress(idx);
  race.phase = 'racing';
  race.clock = 0;
  let from: number | undefined;
  for (let t = 0; t < 300 && !e.progress.lapTimes.length; t += SIM_DT) {
    stepRace(race, SIM_DT);
    if (from === undefined && e.progress.lapStart !== undefined) from = e.tyres.wear;
  }
  const lapTime = e.progress.lapTimes[0];
  const practice = lapTime && from !== undefined ? { lapTime, perLap: Math.max(0.05, e.tyres.wear - from) } : { lapTime: track.length / 300, perLap: TYRES.lapWear };
  practiced.set(track, practice);
  return practice;
}
/** px of run-up before the practice's flying lap (as qualifying's) */
const PRACTICE_RUN_UP = 1200;

/** A plan's stop, as the lap it comes in at the end of: `from` laps raced so far (a part lap counted), its first stint's laps on. */
const stopLapOf = (p: Plan, from: number): number | undefined => (p.stints.length > 1 ? Math.round(from + p.stints[0].laps) : undefined);

/** The wear a lap on the SOFT that `set` shows (its compound's share taken out): as its driver drives. */
const softWear = (set: TyreSet, trackLength: number): number =>
  wearPerLap(set, trackLength) / (isDry(set.compound) ? COMPOUNDS[set.compound].on.dry.wear / COMPOUNDS.slick.on.dry.wear : 1);

/** What a plan is made from, for `race`, `lapsLeft` to go, on `current` (none: at the start), wearing `perLap` on the SOFT. */
function strategyInput(race: Race, e: Entrant | undefined, lapsLeft: number, current?: { compound: DryCompound; wear: number }, perLap = race.practice?.perLap ?? TYRES.lapWear): StrategyInput {
  const lapTime = e ? planLapTime(race, e) : race.practice?.lapTime ?? race.track.length / 300;
  return { laps: lapsLeft, lapTime, perLap, stopCost: PIT.stop + TYRES.laneCost, current };
}

/**
 * Plan entrant `k`'s strategy (strategy.ts), `lapsLeft` to go, on `current` (none: at the start): the AI takes its
 * pick of the plans close to the quickest, you the quickest (the pit wall's call). No pit lane: no stops.
 */
function planFor(race: Race, k: number, lapsLeft: number, current?: { compound: DryCompound; wear: number }, options?: Plan[], perLap?: number): Plan {
  const e = race.entrants[k];
  const input = strategyInput(race, current ? e : undefined, lapsLeft, current, perLap);
  if (!race.pit) {
    // (the quicker set to the end: the one on now, or at the start either)
    const one = (c: DryCompound): Plan => ({ stints: [{ compound: c, laps: lapsLeft }], time: stintTime(c, lapsLeft, current?.wear ?? 0, input.perLap, input.lapTime) });
    return current ? one(current.compound) : DRY_COMPOUNDS.map(one).sort((a, b) => a.time - b.time)[0];
  }
  if (!e?.ai) return bestPlan(input);
  return pickFor(options ?? choices(input), k);
}

export interface SafetyCar {
  car: Car;
  idx: number;
  /** seconds the leader has been lined up behind it */
  led: number;
  /** seconds since it came out */
  out: number;
}

export type RaceEvent =
  | { kind: 'lights-out' }
  /** a big crash (a wreck, or a big share of a car's health lost at once): `vx`, `vy` how it was moving into it (px/s), `hit` the share of its health lost, `wrecked` whether it's a wreck */
  | { kind: 'crash'; who: number; vx: number; vy: number; hit: number; wrecked: boolean }
  | { kind: 'wreck'; who: number }
  | { kind: 'retired'; who: number }
  | { kind: 'safety-car' }
  /** the virtual safety car out, and its end called (the green follows) */
  | { kind: 'vsc' }
  | { kind: 'vsc-ending' }
  | { kind: 'green' }
  | { kind: 'penalty'; who: number; seconds: number }
  | { kind: 'pit-in'; who: number }
  | { kind: 'pit-stop'; who: number; seconds: number }
  | { kind: 'pit-out'; who: number }
  /** two cars touching (by their places in the field): the first step they touch, and every step after while they do */
  | { kind: 'contact'; a: number; b: number }
  /** the stop done: the car repaired, new parts on */
  | { kind: 'pit-repaired'; who: number }
  | { kind: 'mistake'; who: number; what: 'late' | 'wide' }
  | { kind: 'blue'; who: number; by: number }
  /** a cut across a corner's inside: strike number `strike`, costing `seconds` (0: a warning) */
  | { kind: 'track-limits'; who: number; strike: number; seconds: number }
  /** all four wheels past the white line, either side (anywhere: against the clock, it deletes the lap) */
  | { kind: 'off-track'; who: number }
  /** the rain starting (or stopping), and the track turning dry, damp or wet as it does */
  | { kind: 'rain'; on: boolean }
  | { kind: 'track'; condition: WeatherId };

export interface Race {
  track: Track;
  grid: Grid;
  /** the track's marked corners, for track limits */
  corners: Corner[];
  /** the circuit's pit lane (none: no stops) */
  pit?: PitLane;
  /** the track's weather (dry, damp or wet): it sets which tyres the crews fit and how they do */
  weather: WeatherId;
  /** how wet the track is (0 dry … 1 damp … 2 wet) and how hard it's raining (0…1), now (forecast.ts) */
  wetness: number;
  rain: number;
  /** the rain to come (none: the weather stays as it started) */
  forecast?: Forecast;
  handling: HandlingParams;
  laps: number;
  /** the circuit's practice (a lap's time and wear on new SOFTs), its strategies planned by: a race with a pit lane, in the dry */
  practice?: Practice;
  entrants: Entrant[];
  phase: 'lights' | 'racing';
  /** race time (s): counts up to `lightsOut` during the lights, from 0 once they go out */
  clock: number;
  /** the clock time the lights go out */
  lightsOut: number;
  sc?: SafetyCar;
  /** the virtual safety car, while it's out: seconds since it came out */
  vsc?: { out: number };
  /** per entrant: the entrants it has to stay behind while the safety car (or the virtual one) is out */
  holdBehind: Set<number>[];
}

/** On dirt: × the impact speed a car takes before it's hurt */
export const DIRT_KNOCKS = 2;

/**
 * A race about to start: the lights come on, then go out `lightsOut` s after the
 * fifth. With a `pit` lane, cars can stop there, each at its `box`. Every car
 * starts on the tyres for the `weather`.
 */
export function newRace(
  track: Track, grid: Grid, handling: HandlingParams, laps: number, field: { car: Car; ai?: AiDriver; box?: number; start?: DryCompound }[], lightsOut = 0.5, pit?: PitLane,
  weather: WeatherId | Forecast = 'dry',
): Race {
  // (on dirt, knocks and rubs that would hurt on tarmac don't: soft earth, hay bales, rallycross's banging doors)
  if (track.dirt) handling = { ...handling, crashThreshold: handling.crashThreshold * DIRT_KNOCKS };
  const forecast = typeof weather === 'string' ? undefined : weather;
  const now = forecast ? startWeather(forecast) : { wetness: WETNESS[weather as WeatherId], rain: weather === 'wet' ? 1 : 0 };
  const entrants: Entrant[] = field.map((f) => ({ ...f, box: f.box ?? 0, stops: 0, tow: 0, limits: newLimits(), tyres: freshTyres(tyreFor(now.wetness, track.dirt)), progress: newProgress(track.samples.length - 4) }));
  const race: Race = {
    track, grid, corners: markCorners(track), pit, weather: conditionOf(now.wetness), wetness: now.wetness, rain: now.rain, forecast, handling, laps, entrants,
    phase: 'lights', clock: -LIGHTS, lightsOut, holdBehind: entrants.map(() => new Set()),
  };
  // a dry start: each car on its strategy's tyres (the AI its pick of the plans close to the quickest, the player
  // the tyres they asked for, else the quickest plan's); the plans worked out once, for the whole field
  if (isDry(tyreFor(now.wetness, track.dirt)) && laps > 0) {
    if (pit) race.practice = practiceOf(track, grid, handling);
    const options = race.pit ? choices(strategyInput(race, undefined, laps)) : undefined;
    entrants.forEach((e, k) => {
      const plan = planFor(race, k, laps, undefined, options);
      const start = field[k].start ?? plan.stints[0].compound;
      // (the player on other tyres than the plan's: the plan for them)
      const mine = start === plan.stints[0].compound ? plan : planFor(race, k, laps, { compound: start, wear: 0 });
      e.tyres = freshTyres(start);
      e.plan = { plan: mine, stopAt: stopLapOf(mine, 0) };
    });
  }
  for (const e of entrants) fitTyres(e.tyres, e.car, now.wetness);
  return race;
}

/** s ahead the crews look, fitting tyres at a stop: about half a lap */
const TYRE_LOOKAHEAD = 0.5;

/** The track's wetness `ahead` s on, as forecast (now, without a forecast). */
export function wetnessAhead(race: Race, ahead: number): number {
  if (!race.forecast || race.phase !== 'racing') return race.wetness;
  return weatherAhead({ wetness: race.wetness, rain: race.rain }, race.forecast, race.clock, ahead).wetness;
}

/**
 * The compound the crew fits at a stop now: the one for the track as it will be over the next part of a lap; for the
 * dry, the one asked for (the player's pick in the pit lane), else the strategy's next stint's at its stop, or the
 * quicker set to the end at any other (a repair).
 */
export function tyreCall(race: Race, e: Entrant): Compound {
  const weather = tyreFor(wetnessAhead(race, planLapTime(race, e) * TYRE_LOOKAHEAD), race.track.dirt);
  if (!isDry(weather)) return weather;
  if (e.next) return e.next;
  // (the plan's stop: its next stint's; any other (a repair, or off the plan's lap): the quicker set to the end)
  const plan = e.plan;
  const done = e.progress.lap + e.progress.idx / race.track.samples.length;
  if (plan?.stopAt !== undefined && plan.plan.stints[1] && done >= plan.stopAt - 1.5) return plan.plan.stints[1].compound;
  const left = Math.max(1, race.laps - done);
  const lapTime = planLapTime(race, e);
  const perLap = race.practice?.perLap ?? TYRES.lapWear;
  return DRY_COMPOUNDS.reduce((a, c) => (stintTime(c, left, 0, perLap, lapTime) < stintTime(a, left, 0, perLap, lapTime) ? c : a));
}

/** Whether entrant `e`'s strategy calls it in now (it's on its planned lap, and the track's dry). */
export function planDue(race: Race, e: Entrant): boolean {
  if (e.plan?.stopAt === undefined || !isDry(tyreFor(race.wetness, race.track.dirt)) || !isDry(e.tyres.compound)) return false;
  return e.progress.lap + e.progress.idx / race.track.samples.length >= e.plan.stopAt - 0.5;
}

/**
 * Whether entrant `i` is on the wrong tyres for the track (as it is, and will be over the next part of a lap): more
 * grip given up than its crew's call to change them (each crew calls it a little differently, so the field doesn't
 * all stop on the same lap).
 */
export function wrongTyres(race: Race, i: number): boolean {
  const e = race.entrants[i];
  const call = tyreCall(race, e);
  if (call === e.tyres.compound) return false;
  const loss = wrongTyreLoss(e.tyres.compound, wetnessAhead(race, planLapTime(race, e) * TYRE_LOOKAHEAD));
  return loss > (e.ai ? 0.05 + ((i * 37) % 10) * 0.012 : 0.04);
}

/** Samples before the pit entry from which an AI car that wants to stop heads in. */
const PIT_CALL = 20;

/** A lap's time on new tyres, to plan a stop by: the entrant's best so far, or a guess before it has one. */
export const planLapTime = (race: Race, e: Entrant) => (e.progress.lapTimes.length ? Math.min(...e.progress.lapTimes) : race.track.length / 300);

/** Whether an AI entrant heads into the pit lane now: it's at the entry, and new tyres and repairs are worth a stop now. */
function aiPits(race: Race, e: Entrant): boolean {
  const { pit, track } = race;
  const n = track.samples.length;
  if (!pit || e.progress.lapStart === undefined || !between(e.progress.idx, pit.entry - PIT_CALL, pit.entry + 4, n)) return false;
  return stopCalled(race, e);
}

/** Health (share of full) under which a car off its strategy's lap stops for repairs (if they pay): a scrape isn't worth the pit lane. */
export const REPAIR_BELOW = 0.7;
/** Wear past which a set is worn out: in before the strategy's lap (if a stop pays), as a driver who burns through them must. */
export const WORN_OUT = 0.95;

/**
 * Whether the pit wall calls entrant `e` in on this lap (the AI's crew, and your BOX, BOX): the wrong tyres for the
 * weather with most of a lap to go; in the dry, its strategy's lap, or a stop its repairs pay for, or a set worn out
 * early if a stop pays; in the wet (or with no plan), a stop as it pays.
 */
export function stopCalled(race: Race, e: Entrant): boolean {
  const n = race.track.samples.length;
  const lapsLeft = race.laps - e.progress.lap - e.progress.idx / n;
  if (lapsLeft > 0.4 && wrongTyres(race, race.entrants.indexOf(e))) return true;
  const pays = () => wantsPit(e.car, e.tyres, lapsLeft, planLapTime(race, e), race.handling.damageSlow, race.track.length);
  // (the dry: the plan's lap; a stop real damage's repairs alone pay for, as if the tyres were new (the plan's tyres
  // are its own); or a set worn out before the plan's lap, if a stop pays: the rest planned again)
  if (e.plan && isDry(e.tyres.compound) && isDry(tyreFor(race.wetness, race.track.dirt))) {
    return planDue(race, e)
      || (e.car.health < e.car.cls.health * REPAIR_BELOW && wantsPit(e.car, { ...e.tyres, wear: 0 }, lapsLeft, planLapTime(race, e), race.handling.damageSlow, race.track.length))
      || (e.tyres.wear >= WORN_OUT && pays());
  }
  return pays();
}

/** px of track a car just out of the pits drives along the blend line, at the pit side's edge */
const BLEND_LINE = 400;

/** Share of a lap a car drives after its flag before it heads for its parking place (at the pit entry, or the line). */
const IN_LAP = 0.5;

/**
 * Where a car that has finished parks: at the pit entry on its in-lap it heads
 * down the pit lane to its garage (side by side with a teammate already there).
 * Without a pit lane it just carries on cooling down.
 */
function parkAfterRace(race: Race, i: number): void {
  const e = race.entrants[i];
  const lap = e.inLap!;
  const { pit, track } = race;
  const n = track.samples.length;
  if (!pit || lap.to !== undefined || lap.driven < track.length * IN_LAP) return;
  if (!between(e.progress.idx, pit.entry - PIT_CALL, pit.entry + 4, n)) return;
  lap.to = 'garage';
  const first = !race.entrants.some((o) => o !== e && o.box === e.box && o.inLap?.to === 'garage');
  e.pit = newPitStop(pit, e.car, e.box, PIT.garageSlots[first ? 0 : 1]);
}

/**
 * Skip to the end: every car still racing is given the finish its pace would
 * bring it (the laps it has left at its average lap), a wreck retires, and every
 * finisher is put where its in-lap would end: in its garage. No safety car.
 * Returns the top three (indexes into `entrants`), for the podium.
 */
export function skipToParked(race: Race): number[] {
  const { track, pit, entrants } = race;
  const n = track.samples.length;
  race.phase = 'racing';
  race.sc = undefined;
  race.vsc = undefined;
  race.holdBehind = entrants.map(() => new Set());
  for (const e of entrants) {
    const p = e.progress;
    if (p.retired) continue;
    if (e.car.wrecked) {
      e.progress = { ...p, retired: true };
      continue;
    }
    if (p.finished !== undefined) continue;
    const times = p.lapTimes;
    const lap = times.length ? times.reduce((a, b) => a + b, 0) / times.length : planLapTime(race, e);
    const left = Math.max(0, race.laps - p.lap - (p.lapStart === undefined ? 0 : p.idx / n));
    e.progress = { ...p, lap: race.laps, finished: race.clock + left * lap };
  }
  const finishers = order(race).filter((i) => entrants[i].progress.finished !== undefined);
  const home = new Set<number>();
  for (const i of finishers) {
    const e = entrants[i];
    const car = e.car;
    car.vx = car.vy = 0;
    e.inLap = { driven: track.length, to: 'garage', parked: true };
    if (!pit) continue;
    const slot = PIT.garageSlots[home.has(e.box) ? 1 : 0];
    home.add(e.box);
    const q = pit.points.find((pt) => pt.s >= pit.boxes[e.box]) ?? pit.points[pit.points.length - 1];
    e.pit = { phase: 'garage', at: 0, box: e.box, left: 0, time: 0, home: slot, push: { x: q.x, y: q.y, heading: q.dir, done: PIT.garagePush } };
    pushIntoGarage(pit, e.pit, car);
    e.progress = { ...e.progress, idx: nearestSample(track, car.x, car.y) };
  }
  return finishers.slice(0, 3);
}

/** Still on the track: not retired (a wreck counts until it's cleared). */
export const running = (e: Entrant) => !e.progress.retired;

/** Whether a car's damage this step makes a big crash: it was wrecked, or lost a big share of its health at once. */
export function isBigCrash(car: Car, healthBefore: number, wreckedNow: boolean): boolean {
  return wreckedNow || healthBefore - car.health >= SAFETY_CAR.bigHit * car.cls.health;
}

/** A dive's contact: `closing` px/s into the car ahead. Both take a hard hit; the car hit spins half round and slows. */
export const INCIDENT = { damage: 0.25, spin: 2.6, slow: 0.5 };

export function racingIncident(diver: Car, hit: Car, closing: number, p: HandlingParams): void {
  applyDamage(diver, closing * INCIDENT.damage, p);
  applyDamage(hit, closing * INCIDENT.damage * 1.2, p);
  // (spun the way the dive pushed it: its tail round)
  const side = Math.sign((hit.x - diver.x) * Math.cos(hit.heading) + (hit.y - diver.y) * Math.sin(hit.heading)) || 1;
  hit.heading += side * INCIDENT.spin * (0.7 + 0.3 * Math.min(1, closing / 150));
  hit.vx *= INCIDENT.slow;
  hit.vy *= INCIDENT.slow;
}

/** Race order (indexes into `entrants`). */
export const order = (race: Race) => standings(race.entrants.map((e) => e.progress), race.track);

/** The virtual safety car out now: everyone on the limiter where they are, and nobody may pass anyone ahead of them now. */
export function callVsc(race: Race): RaceEvent {
  const ranked = order(race);
  race.vsc = { out: 0 };
  race.holdBehind = race.entrants.map((_, i) => new Set(ranked.slice(0, ranked.indexOf(i))));
  return { kind: 'vsc' };
}

/** The safety car joins `ahead` px up the track from `car`, heading the way of the race at no more than its own speed. */
function safetyCarAhead(track: Track, car: Car, idx: number): SafetyCar {
  const n = track.samples.length;
  const i = (idx + Math.round(SAFETY_CAR.joinAhead / track.spacing)) % n;
  const s = track.samples[i];
  const sc = newCar(carClass('f1'), s.x, s.y, s.dir);
  const v = Math.min(SAFETY_CAR.speed, speedOf(car));
  sc.vx = Math.sin(s.dir) * v;
  sc.vy = -Math.cos(s.dir) * v;
  return { car: sc, idx: i, led: 0, out: 0 };
}

export interface StepResult {
  /** each entrant's driving events this step (skids, rough ground…) */
  cars: StepEvents[];
  race: RaceEvent[];
}

/**
 * One step of the race. `player` gives the input for an entrant without an AI
 * (the race applies the safety car's limiter on top).
 */
export function stepRace(race: Race, dt: number, player: (e: Entrant) => DriveInput = () => ({ handbrake: false })): StepResult {
  const { track, grid, handling: p, entrants } = race;
  const out: RaceEvent[] = [];
  race.clock += dt;
  if (race.phase === 'lights' && race.clock >= race.lightsOut) {
    race.phase = 'racing';
    race.clock = 0;
    out.push({ kind: 'lights-out' });
  }
  const racing = race.phase === 'racing';
  // the weather moves on as forecast: the rain coming and going, the track wetting and drying
  if (racing && race.forecast) {
    const was = { condition: race.weather, raining: race.rain > 0.15 };
    const now = { wetness: race.wetness, rain: race.rain };
    stepWeather(now, race.forecast, race.clock, dt);
    race.wetness = now.wetness;
    race.rain = now.rain;
    race.weather = conditionOf(now.wetness);
    if (race.rain > 0.15 !== was.raining) out.push({ kind: 'rain', on: !was.raining });
    if (race.weather !== was.condition) out.push({ kind: 'track', condition: race.weather });
  }
  const sc = race.sc;
  const vsc = race.vsc;
  const orders: Orders = sc ? { limit: SAFETY_CAR.limit, noOvertaking: true } : vsc ? { limit: VSC.limit, noOvertaking: true } : {};
  const onTrack = entrants.filter(running);
  const n = track.samples.length;
  /** px along the track from an entrant up to the safety car (Infinity when it's not out) */
  const toSafetyCar = (e: Entrant) => (sc ? ((((sc.idx - e.progress.idx) % n) + n) % n) * track.spacing : Infinity);
  // (a car in its garage after the race is out of everyone's way)
  const cars = [...onTrack.filter((e) => e.pit?.phase !== 'garage').map((e) => e.car), ...(sc ? [sc.car] : [])];
  /**
   * The player's limiter under the safety car (or the virtual one): the field's limit, held to station behind the car
   * ahead (HOLD); and whether it's too close and closing (brakes on).
   */
  const playerLimit = (e: Entrant, i: number): { limit?: number; tight: boolean } => {
    if (!sc && !vsc) return { tight: false };
    // alongside or just past the safety car: dropping back behind it
    if (sc && n * track.spacing - toSafetyCar(e) <= SAFETY_CAR.dropBack) return { limit: SAFETY_CAR.speed * 0.6, tight: false };
    let limit = sc ? SAFETY_CAR.limit : VSC.limit;
    let tight = false;
    const ahead = [...race.holdBehind[i]]
      .map((j) => entrants[j])
      .filter((o) => running(o) && !o.pit && !o.car.wrecked && o.progress.finished === undefined)
      .map((o) => ({ car: o.car, idx: o.progress.idx }));
    if (sc) ahead.push({ car: sc.car, idx: sc.idx });
    for (const a of ahead) {
      const d = ((((a.idx - e.progress.idx) % n) + n) % n) * track.spacing;
      if (d > HOLD.reach) continue;
      limit = Math.min(limit, Math.max(HOLD.crawl, speedOf(a.car) + HOLD.close * (d - HOLD.gap)));
      if (d < HOLD.gap * HOLD.tight && speedOf(e.car) > speedOf(a.car)) tight = true;
    }
    return { limit, tight };
  };

  // blue flags: a car about to be lapped (racing, not under either safety car)
  {
    const eligible = entrants.map((e) => racing && !sc && !vsc && running(e) && !e.pit && !e.car.wrecked && e.progress.finished === undefined && race.clock > SETTLE);
    const blue = blueFlags(entrants.map((e) => e.progress), eligible, entrants.map((e) => e.blue), n, track.spacing);
    entrants.forEach((e, i) => {
      if (blue[i] !== undefined && blue[i] !== e.blue) out.push({ kind: 'blue', who: i, by: blue[i]! });
      e.blue = blue[i];
    });
  }

  // drive
  const before = entrants.map((e) => e.car.health);
  // (how each car was moving going into the step: a crash throws its parts on that way)
  const moving = entrants.map((e) => ({ vx: e.car.vx, vy: e.car.vy }));
  const events = entrants.map((e, i): StepEvents => {
    const quiet: StepEvents = { damage: 0, skidding: false, wreckedNow: false, onRough: false, airborne: false, landed: 0 };
    if (!running(e)) return quiet;
    // (the cars on its level: not one on a bridge over it, or underneath it)
    const others = cars.filter((c) => c !== e.car && sameLevel(c, e.car));
    // the pit lane: turning in at the entry commits a car; from there it drives itself through
    const pit = race.pit;
    // after the flag: the in-lap, and then to its parking place
    if (e.progress.finished !== undefined && !e.car.wrecked) {
      e.inLap ??= { driven: 0 };
      e.inLap.driven += speedOf(e.car) * dt;
      if (!e.pit) parkAfterRace(race, i);
    }
    if (pit && racing && !e.pit && e.progress.finished === undefined && (e.ai ? aiPits(race, e) : entersPit(pit, track, e.car, e.progress.idx))) {
      e.pit = newPitStop(pit, e.car, e.box);
      e.stops++;
      out.push({ kind: 'pit-in', who: i });
    }
    if (pit && e.pit) {
      // (it keeps behind the cars in the pits with it; the cars racing past the entry and exit roads, on the track, aren't in its lane)
      const r = pitStep(pit, e.pit, e.car, race.entrants.filter((o) => o !== e && o.pit).map((o) => o.car), dt);
      if (e.pit.phase === 'garage') {
        // in the crew's hands: pushed, not driven (and through the garage's walls)
        if (e.pit.push!.done >= PIT.garagePush) e.inLap!.parked = true;
        return quiet;
      }
      if (r.stopped) {
        // new tyres on, the right ones for the weather (as it will be over the next part of the lap), or the
        // strategy's (or the player's pick) in the dry; then the rest of the race planned again on them
        // (the wear the set coming off showed, for planning the rest)
        const worn = softWear(e.tyres, track.length);
        e.tyres = freshTyres(tyreCall(race, e));
        e.next = undefined;
        fitTyres(e.tyres, e.car, race.wetness);
        if (isDry(e.tyres.compound)) {
          const done = e.progress.lap + e.progress.idx / track.samples.length;
          const left = race.laps - done;
          const was = e.plan;
          // (a planned stop: on to the plan's next stint, its stops as planned; an unplanned one, or other tyres than
          // the plan's: the rest planned afresh, from the wear the last set showed)
          const planned = was?.stopAt !== undefined && done >= was.stopAt - 1 && was.plan.stints[1]?.compound === e.tyres.compound;
          if (left <= 0.5) e.plan = undefined;
          else if (planned) {
            const rest = was.plan.stints.slice(1);
            const plan = { stints: rest.map((st, k) => (k === rest.length - 1 ? { ...st, laps: left - rest.slice(0, -1).reduce((a, b) => a + b.laps, 0) } : st)), time: was.plan.time };
            e.plan = { plan, stopAt: stopLapOf(plan, Math.round(done)) };
          } else {
            const plan = planFor(race, i, left, { compound: e.tyres.compound, wear: 0 }, undefined, worn);
            e.plan = { plan, stopAt: stopLapOf(plan, done) };
          }
        }
        out.push({ kind: 'pit-stop', who: i, seconds: e.pit.time });
      }
      if (r.repaired) out.push({ kind: 'pit-repaired', who: i });
      if (!r.done) return stepCar(e.car, r.input, p, dt, gridFor(track, grid, e.progress.idx));
      e.pit = undefined;
      e.blend = BLEND_LINE;
      out.push({ kind: 'pit-out', who: i });
    }
    let input: DriveInput;
    if (!racing) input = { handbrake: true, brake: true };
    else if (e.progress.finished !== undefined) input = { ...coolDownInput(e.car, track, e.progress.idx, others), limit: orders.limit };
    // (no passing or defending moves while the pack is still bunched from the start)
    // the start: an AI car still reacting to the lights going out sits on its brakes
    else if (e.ai && race.clock < (e.ai.reaction ?? 0) && e.progress.lapStart === undefined) input = { handbrake: false, brake: true };
    else if (e.ai) {
      const slip = e.ai.slip;
      const lunging = !!e.ai.lunge;
      // (just out of the pits: along the blend line first)
      const blending = pit && e.blend !== undefined && e.blend > 0;
      if (blending) e.blend! -= speedOf(e.car) * dt;
      const ai = blending ? { ...e.ai, lane: pit.side * PIT.joinAt } : e.ai;
      const lapping = entrants.filter((o) => o.blue === i).map((o) => o.car);
      const spare = entrants.find((o) => !o.ai)?.car;
      const given = { ...orders, spare, ...(e.blue === undefined && !lapping.length ? {} : { blue: e.blue === undefined ? undefined : entrants[e.blue].car, lapping }) };
      input = aiInput(e.car, track, e.progress.idx, ai, others, race.clock < SETTLE || blending ? { ...given, noOvertaking: true } : given, towBoost(e.tow));
      if (e.ai.slip && e.ai.slip !== slip) out.push({ kind: 'mistake', who: i, what: e.ai.slip });
      // (a dive at the car ahead: a lock-up into the bend)
      if (e.ai.lunge && !lunging) out.push({ kind: 'mistake', who: i, what: 'late' });
    }
    // the player's limiter: holding station behind the car ahead (or the safety car), and the brakes on when well over it
    else {
      const { limit, tight } = playerLimit(e, i);
      e.held = limit;
      const given = player(e);
      input = limit !== undefined && (tight || speedOf(e.car) > limit + HOLD.over) ? { ...given, limit, brake: true } : { ...given, limit };
    }
    if (!racing) {
      // waiting for the lights: kept to its grid slot (on a sloping grid, like Twin Lakes's, the brakes alone let it
      // creep away), never more than GRID_HOLD px from where it lined up
      const slot = (e.slot ??= { x: e.car.x, y: e.car.y, heading: e.car.heading });
      const ev = stepCar(e.car, input, p, dt, gridFor(track, grid, e.progress.idx));
      const off = Math.hypot(e.car.x - slot.x, e.car.y - slot.y);
      if (off > GRID_HOLD) {
        const k = GRID_HOLD / off;
        Object.assign(e.car, { x: slot.x + (e.car.x - slot.x) * k, y: slot.y + (e.car.y - slot.y) * k, heading: slot.heading, vx: 0, vy: 0 });
      }
      return ev;
    }
    return stepCar(e.car, input, p, dt, gridFor(track, grid, e.progress.idx));
  });
  // the tyres wear with the driving
  entrants.forEach((e, i) => {
    if (running(e)) wearTyres(e.tyres, e.car, events[i], dt * (track.tyreWear ?? 1), race.wetness);
  });
  // the slipstream: in a car's wake, a higher top speed for the next step (on top of the tyres'); racing only:
  // not in the pit lane, under the safety car, or after the flag
  entrants.forEach((e) => {
    if (!running(e)) return;
    const towing = racing && !e.pit && !race.sc && !race.vsc && e.progress.finished === undefined;
    e.tow = stepTow(e.tow, towing ? towFrom(e.car, cars.filter((c) => sameLevel(c, e.car))) : 0, dt);
    e.car.speedScale = (e.car.speedScale ?? 1) * towBoost(e.tow);
  });
  if (sc) {
    // it drives the line at its own pace, moving round a slower car in its way (a backmarker it joined
    // behind, or a player dropping back) rather than queueing behind it
    const inTheWay = cars.filter((c) => c !== sc.car && sameLevel(c, sc.car));
    stepCar(sc.car, aiInput(sc.car, track, sc.idx, { lane: 0, pace: 1 }, inTheWay, { limit: SAFETY_CAR.speed }), p, dt, gridFor(track, grid, sc.idx));
    sc.idx = nearestSample(track, sc.car.x, sc.car.y, sc.idx);
  }
  // contact (the safety car takes knocks but no damage)
  // (a dive's first contact with the car it's diving at is a racing incident: a hard hit to both, the car hit
  // spun round; and the dive's over)
  const diving = new Map<Car, Entrant>();
  for (const e of entrants) if (e.ai?.lunge) diving.set(e.car, e);
  /** each car's place in the field (not the safety car) */
  const owner = new Map(entrants.map((e, k) => [e.car, k]));
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      // (one on a bridge, the other underneath it: they pass)
      if (!sameLevel(cars[i], cars[j])) continue;
      const closing = collideCars(cars[i], cars[j], p);
      if (closing <= 0) continue;
      const [a, b] = [owner.get(cars[i]), owner.get(cars[j])];
      if (a !== undefined && b !== undefined) out.push({ kind: 'contact', a, b });
      const diver = diving.get(cars[i])?.ai?.lunge?.car === cars[j] ? diving.get(cars[i]) : diving.get(cars[j])?.ai?.lunge?.car === cars[i] ? diving.get(cars[j]) : undefined;
      if (!diver?.ai?.lunge) continue;
      const hit = diver.ai.lunge.car;
      diver.ai.lunge = undefined;
      racingIncident(diver.car, hit, closing, p);
    }
  }
  if (sc) sc.car.health = sc.car.cls.health;
  if (racing) for (const e of onTrack) e.progress = stepProgress(e.progress, track, e.car, race.clock, race.laps, dt);

  // track limits: a cut across a corner's inside (racing only: not in the pit lane, a wreck, or after the flag)
  if (racing) {
    entrants.forEach((e, i) => {
      if (!running(e) || e.car.wrecked || e.pit || e.progress.finished !== undefined) return;
      const cut = judge(e.limits, track, race.corners, e.progress.idx, e.car.x, e.car.y, e.car.cls.width);
      // (off onto the pit entry road, on its side within the pit zone, isn't off the track)
      const pit = race.pit;
      const toPits = !!pit && between(e.progress.idx, pit.entry, pit.wallTo, track.samples.length) && lateralOffset(track, e.progress.idx, e.car.x, e.car.y) * pit.side > 0;
      if (offTrack(e.limits, track, e.progress.idx, e.car.x, e.car.y, e.car.cls.width, toPits)) out.push({ kind: 'off-track', who: i });
      if (!cut) return;
      if (cut.seconds) e.progress = { ...e.progress, penalty: e.progress.penalty + cut.seconds };
      out.push({ kind: 'track-limits', who: i, ...cut });
    });
  }

  // wrecks: cleared off the track after a moment; the car retires
  // (a wreck brings out the safety car; a big crash a car survives, the virtual one)
  let wreck = false;
  let bigCrash = false;
  entrants.forEach((e, i) => {
    if (!running(e)) return;
    const wreckedNow = events[i].wreckedNow || (e.car.wrecked && e.wreckedAt === undefined);
    if (isBigCrash(e.car, before[i], wreckedNow)) {
      bigCrash = true;
      if (e.car.wrecked) wreck = true;
      out.push({ kind: 'crash', who: i, ...moving[i], hit: (before[i] - e.car.health) / e.car.cls.health, wrecked: e.car.wrecked });
    }
    if (e.car.wrecked && e.wreckedAt === undefined) {
      e.wreckedAt = race.clock;
      out.push({ kind: 'wreck', who: i });
    }
    if (e.wreckedAt !== undefined && race.clock - e.wreckedAt >= CLEAR_AFTER) {
      e.progress = { ...e.progress, retired: true };
      out.push({ kind: 'retired', who: i });
    }
  });

  const ranked = order(race);
  const leader = ranked.map((i) => entrants[i]).find((e) => running(e) && !e.car.wrecked && e.progress.finished === undefined);
  /** no passing anyone ahead now (indexes of the entrants each must stay behind) */
  const holdOrder = () => entrants.map((_, i) => new Set(ranked.slice(0, ranked.indexOf(i))));
  if (!race.sc && racing && wreck && leader) {
    // safety car: it joins ahead of the leader, and nobody may pass anyone who is ahead of them now
    // (it takes over from the virtual one, if that's out)
    race.vsc = undefined;
    race.sc = safetyCarAhead(track, leader.car, leader.progress.idx);
    race.holdBehind = holdOrder();
    out.push({ kind: 'safety-car' });
  } else if (!race.sc && !race.vsc && racing && bigCrash && leader) {
    out.push(callVsc(race));
  } else if (sc || vsc) {
    if (sc) {
      if (leader && toSafetyCar(leader) <= SAFETY_CAR.queueGap) sc.led += dt;
      sc.out += dt;
    }
    // no overtaking: passing a car that was ahead when it came out costs a penalty (a wreck, or a car in the pits, may be passed)
    entrants.forEach((e, i) => {
      if (e.pit) return;
      for (const j of race.holdBehind[i]) {
        const other = entrants[j];
        if (!running(other) || other.car.wrecked || other.pit || other.progress.finished !== undefined || !running(e)) race.holdBehind[i].delete(j);
        else if (ranked.indexOf(i) < ranked.indexOf(j)) {
          e.progress = { ...e.progress, penalty: e.progress.penalty + SAFETY_CAR.penalty };
          race.holdBehind[i].delete(j);
          out.push({ kind: 'penalty', who: i, seconds: SAFETY_CAR.penalty });
        }
      }
    });
    if (vsc) {
      // its end called a few seconds before the green
      const was = vsc.out;
      vsc.out += dt;
      if (was < VSC.length - VSC.warn && vsc.out >= VSC.length - VSC.warn) out.push({ kind: 'vsc-ending' });
    }
    // in once the field has run behind it for a while, or when there's no one left to lead (the virtual one: once its time is up)
    if (sc ? sc.led >= SAFETY_CAR.leadFor || sc.out >= SAFETY_CAR.maxOut || !leader : vsc!.out >= VSC.length || !leader) {
      race.sc = undefined;
      race.vsc = undefined;
      race.holdBehind = entrants.map(() => new Set());
      out.push({ kind: 'green' });
    }
  }
  return { cars: events, race: out };
}
