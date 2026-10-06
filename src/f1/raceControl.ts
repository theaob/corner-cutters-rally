// Race control: runs the cars on a stage for one step (the countdown, inputs,
// driving, contact, progress along the road) and applies the rules around it.
// A wrecked car is out; there are no track limits: the road's edges are the
// trees and rocks along it (circuit.ts). The weather moves on as forecast. Engine-free, so a whole stage, crashes and all, runs in a test
// exactly as in the game.

import { collideCars, stepCar, type Car, type DriveInput, type HandlingParams, type StepEvents } from '../engine/driving';
import type { Grid } from '../engine/sim';
import { fitTyres, freshTyres, tyreFor, wearTyres, type TyreSet } from './tyres';
import type { WeatherId } from './weather';
import { WETNESS, conditionOf, startWeather, stepWeather, type Forecast } from './forecast';
import { aiInput, nearestSample, newProgress, standings, stepProgress, type AiDriver, type RaceProgress, type Track } from './racing';

/** Seconds a wreck stays on the road before it's out. */
export const CLEAR_AFTER = 2.5;
/** Seconds of the countdown before the earliest GO. */
export const LIGHTS = 3.6;
/** px a car waiting on the line may creep from its place (on a slope; on the flat it never gets that far) */
export const GRID_HOLD = 2;
/** A hit that takes at least this share of a car's health in one go is a big crash. */
export const BIG_HIT = 0.4;

export interface Entrant {
  car: Car;
  /** where it lined up (kept to it till GO) */
  slot?: { x: number; y: number; heading: number };
  /** the AI driving it; undefined for the player */
  ai?: AiDriver;
  progress: RaceProgress;
  /** race time it was wrecked */
  wreckedAt?: number;
  /** the set of tyres it's on */
  tyres: TyreSet;
}

export type RaceEvent =
  | { kind: 'lights-out' }
  /** a big crash (a wreck, or a big share of a car's health lost at once): `vx`, `vy` how it was moving into it (px/s), `hit` the share of its health lost, `wrecked` whether it's a wreck */
  | { kind: 'crash'; who: number; vx: number; vy: number; hit: number; wrecked: boolean }
  | { kind: 'wreck'; who: number }
  /** a car going over: rolled by a side-on hit, or dug in sliding sideways */
  | { kind: 'roll'; who: number }
  | { kind: 'retired'; who: number }
  /** two cars touching (by their places in the field): the first step they touch, and every step after while they do */
  | { kind: 'contact'; a: number; b: number }
  /** the rain starting (or stopping), and the road turning dry, damp or wet as it does */
  | { kind: 'rain'; on: boolean }
  | { kind: 'track'; condition: WeatherId };

export interface Race {
  track: Track;
  grid: Grid;
  /** the road's weather (dry, damp or wet): it sets which tyres the cars run and how they do */
  weather: WeatherId;
  /** how wet the road is (0 dry … 1 damp … 2 wet) and how hard it's raining (0…1), now (forecast.ts) */
  wetness: number;
  rain: number;
  /** the rain to come (none: the weather stays as it started) */
  forecast?: Forecast;
  handling: HandlingParams;
  laps: number;
  entrants: Entrant[];
  phase: 'lights' | 'racing';
  /** race time (s): counts up to `lightsOut` during the countdown, from 0 once it's GO */
  clock: number;
  /** the clock time it's GO */
  lightsOut: number;
}

/** On dirt: × the impact speed a car takes before it's hurt */
export const DIRT_KNOCKS = 2;

/**
 * A stage about to start: the countdown, then GO `lightsOut` s after it. Every car starts on the tyres for the
 * `weather` (on dirt, off-road tyres).
 */
export function newRace(
  track: Track, grid: Grid, handling: HandlingParams, laps: number, field: { car: Car; ai?: AiDriver }[], lightsOut = 0.5, weather: WeatherId | Forecast = 'dry',
): Race {
  // (on dirt, knocks and rubs that would hurt on tarmac don't: soft earth, brushing the undergrowth, banging doors)
  if (track.dirt) handling = { ...handling, crashThreshold: handling.crashThreshold * DIRT_KNOCKS };
  const forecast = typeof weather === 'string' ? undefined : weather;
  const now = forecast ? startWeather(forecast) : { wetness: WETNESS[weather as WeatherId], rain: weather === 'wet' ? 1 : 0 };
  // (on a rally's open road, each car's progress from where it stands on it; on a loop, just behind the line)
  const entrants: Entrant[] = field.map((f) => ({
    ...f, tyres: freshTyres(tyreFor(now.wetness, track.dirt)),
    progress: newProgress(track.open ? nearestSample(track, f.car.x, f.car.y) : track.samples.length - 4),
  }));
  for (const e of entrants) fitTyres(e.tyres, e.car, now.wetness);
  return {
    track, grid, weather: conditionOf(now.wetness), wetness: now.wetness, rain: now.rain, forecast, handling, laps, entrants,
    phase: 'lights', clock: -LIGHTS, lightsOut,
  };
}

/** Still on the road: not out (a wreck counts until it's cleared). */
export const running = (e: Entrant) => !e.progress.retired;

/** Whether a car's damage this step makes a big crash: it was wrecked, or lost a big share of its health at once. */
export function isBigCrash(car: Car, healthBefore: number, wreckedNow: boolean): boolean {
  return wreckedNow || healthBefore - car.health >= BIG_HIT * car.cls.health;
}

/** The cars in order along the road (indexes into `entrants`). */
export const order = (race: Race) => standings(race.entrants.map((e) => e.progress), race.track);

export interface StepResult {
  /** each entrant's driving events this step (skids, rough ground…) */
  cars: StepEvents[];
  race: RaceEvent[];
}

/** One step of the stage. `player` gives the input for an entrant without an AI. */
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
  // the weather moves on as forecast: the rain coming and going, the road wetting and drying
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
  const onTrack = entrants.filter(running);
  const cars = onTrack.map((e) => e.car);

  // drive
  const before = entrants.map((e) => e.car.health);
  // (how each car was moving going into the step: a crash throws its parts on that way)
  const moving = entrants.map((e) => ({ vx: e.car.vx, vy: e.car.vy }));
  const events = entrants.map((e): StepEvents => {
    const quiet: StepEvents = { damage: 0, skidding: false, wreckedNow: false, onRough: false, airborne: false, landed: 0, impact: 0, scrape: 0, rolledNow: false, rolling: false };
    if (!running(e)) return quiet;
    const others = cars.filter((c) => c !== e.car);
    let input: DriveInput;
    if (!racing) input = { handbrake: true, brake: true };
    // (an AI car still reacting to GO sits on its brakes)
    else if (e.ai && race.clock < (e.ai.reaction ?? 0)) input = { handbrake: false, brake: true };
    else if (e.ai) input = aiInput(e.car, track, e.progress.idx, e.ai, others, {});
    else input = player(e);
    if (!racing) {
      // waiting for GO: kept to its place (on a slope the brakes alone let it creep away), never more than GRID_HOLD px from where it lined up
      const slot = (e.slot ??= { x: e.car.x, y: e.car.y, heading: e.car.heading });
      const ev = stepCar(e.car, input, p, dt, grid);
      const off = Math.hypot(e.car.x - slot.x, e.car.y - slot.y);
      if (off > GRID_HOLD) {
        const k = GRID_HOLD / off;
        Object.assign(e.car, { x: slot.x + (e.car.x - slot.x) * k, y: slot.y + (e.car.y - slot.y) * k, heading: slot.heading, vx: 0, vy: 0, spin: 0 });
      }
      return ev;
    }
    return stepCar(e.car, input, p, dt, grid);
  });
  // the tyres wear with the driving
  entrants.forEach((e, i) => {
    if (running(e)) wearTyres(e.tyres, e.car, events[i], dt * (track.tyreWear ?? 1), race.wetness);
  });
  // contact
  const owner = new Map(entrants.map((e, k) => [e.car, k]));
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      if (collideCars(cars[i], cars[j], p) <= 0) continue;
      out.push({ kind: 'contact', a: owner.get(cars[i])!, b: owner.get(cars[j])! });
    }
  }
  if (racing) for (const e of onTrack) e.progress = stepProgress(e.progress, track, e.car, race.clock, race.laps, dt);

  // big crashes and wrecks: a wreck is out after a moment
  entrants.forEach((e, i) => {
    if (!running(e)) return;
    const wreckedNow = events[i].wreckedNow || (e.car.wrecked && e.wreckedAt === undefined);
    if (events[i].rolledNow) out.push({ kind: 'roll', who: i });
    if (isBigCrash(e.car, before[i], wreckedNow)) out.push({ kind: 'crash', who: i, ...moving[i], hit: (before[i] - e.car.health) / e.car.cls.health, wrecked: e.car.wrecked });
    if (e.car.wrecked && e.wreckedAt === undefined) {
      e.wreckedAt = race.clock;
      out.push({ kind: 'wreck', who: i });
    }
    if (e.wreckedAt !== undefined && race.clock - e.wreckedAt >= CLEAR_AFTER) {
      e.progress = { ...e.progress, retired: true };
      out.push({ kind: 'retired', who: i });
    }
  });
  return { cars: events, race: out };
}
