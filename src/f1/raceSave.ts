// The race in progress, kept on the device, so a long race survives the app
// being closed (or the phone killing it in the background): a Quick Race or a
// Championship round, from the lights going out to your flag. It's saved as
// the game goes into the background, as you pause and as you finish each lap,
// and thrown away at your flag, or when you leave the race or start it again.
//
// What's kept is the race's state as plain data (every car where it is, how
// fast, how damaged, its laps, its tyres, its strategy, its pit stop; the
// weather; the safety car; the clock), with what's needed to build the same
// weekend again: the circuit, the options, the seed and the grid. Coming back,
// the race is built as it was (the same field, from the same seed and grid) and
// the state laid over it; the AI's dice are rolled afresh from the seed and the
// lap (they can't be kept), so the race goes on as it was, if not exactly as it
// would have. Engine-free, unit-tested.

import { save, saved } from '../engine/save';
import { seededRandom } from '../engine/rng';
import type { Car } from '../engine/driving';
import type { Forecast } from './forecast';
import type { DryCompound } from './tyres';
import type { Entrant, Race } from './raceControl';

/** The version of a kept race: one of another version is thrown away. */
export const RACE_SAVE_VERSION = 1;
/** A kept race older than this (ms) is thrown away: a week. */
export const RACE_SAVE_MAX_AGE = 7 * 24 * 3600 * 1000;

/** A car's state (its class left out: every car's an F1 car, given back on the way in). */
type CarState = Omit<Car, 'cls'>;

/** An entrant's state, as plain data (the AI's dice and the cars it's racing left out: they're refs). */
export interface EntrantState extends Omit<Entrant, 'car' | 'ai'> {
  car: CarState;
  ai?: Omit<NonNullable<Entrant['ai']>, 'rng' | 'move' | 'lunge'>;
}

/** The race's state, as plain data. */
export interface RaceState {
  weather: Race['weather'];
  wetness: number;
  rain: number;
  forecast?: Forecast;
  laps: number;
  phase: Race['phase'];
  clock: number;
  lightsOut: number;
  sc?: { car: CarState; idx: number; led: number; out: number };
  vsc?: { out: number };
  holdBehind: number[][];
  entrants: EntrantState[];
}

/** A race kept to come back to: where, how it was set up, and its state. */
export interface KeptRace {
  v: number;
  /** when it was kept (ms) */
  at: number;
  circuit: string;
  /** its circuit's name, for the button that comes back to it */
  name: string;
  mode: 'race' | 'championship';
  /** the Championship's round it is (it's thrown away if the season's moved on) */
  round?: number;
  /** the race's set-up: the options it was started with */
  setup: { team: string; seat: 0 | 1; difficulty: string; weather: string; laps: number; startTyres?: DryCompound };
  seed: number;
  /** the grid it started from (drivers by slot: qualifying's), or none (everyone in their own) */
  grid?: number[];
  /** your laps already saved to your records (so they aren't saved again) */
  lapsSaved: number;
  /** which entrant's you */
  you: number;
  state: RaceState;
}

const carState = ({ cls: _cls, ...rest }: Car): CarState => structuredClone(rest);

/** The race's state, as plain data (a copy: the race goes on). */
export function snapshotRace(race: Race): RaceState {
  return {
    weather: race.weather, wetness: race.wetness, rain: race.rain, forecast: race.forecast && structuredClone(race.forecast),
    laps: race.laps, phase: race.phase, clock: race.clock, lightsOut: race.lightsOut,
    sc: race.sc && { car: carState(race.sc.car), idx: race.sc.idx, led: race.sc.led, out: race.sc.out },
    vsc: race.vsc && { ...race.vsc },
    holdBehind: race.holdBehind.map((s) => [...s]),
    entrants: race.entrants.map((e) => {
      const { car, ai, ...rest } = e;
      const { rng: _rng, move: _move, lunge: _lunge, ...mind } = ai ?? {};
      return { ...structuredClone(rest), car: carState(car), ...(ai ? { ai: structuredClone(mind) } : {}) } as EntrantState;
    }),
  };
}

/**
 * Lay `state` over `race` (built afresh, as it was: the same field from the same seed and grid). The AI's dice are
 * rolled afresh from `seed` and the lap. False (and `race` untouched) if it isn't this race's: another field.
 */
export function restoreRace(race: Race, state: RaceState, seed: number): boolean {
  if (state.entrants.length !== race.entrants.length || state.laps !== race.laps) return false;
  Object.assign(race, {
    weather: state.weather, wetness: state.wetness, rain: state.rain, forecast: state.forecast ?? race.forecast,
    phase: state.phase, clock: state.clock, lightsOut: state.lightsOut, vsc: state.vsc,
    holdBehind: state.holdBehind.map((h) => new Set(h)),
  });
  const cls = race.entrants[0].car.cls;
  race.sc = state.sc && { car: { ...structuredClone(state.sc.car), cls }, idx: state.sc.idx, led: state.sc.led, out: state.sc.out };
  state.entrants.forEach((s, k) => {
    const e = race.entrants[k];
    const { car, ai, ...rest } = structuredClone(s);
    // (fields a kept entrant doesn't have are gone from it now: a pit stop over, say)
    for (const key of ['slot', 'wreckedAt', 'pit', 'blend', 'held', 'blue', 'inLap', 'plan', 'next'] as const) delete e[key];
    Object.assign(e, rest);
    Object.assign(e.car, car);
    if (e.ai && ai) {
      delete e.ai.move;
      delete e.ai.lunge;
      Object.assign(e.ai, ai, e.ai.rng ? { rng: seededRandom(((seed ^ ((k + 1) * 2654435761)) + e.progress.lap * 97) >>> 0 || 1) } : {});
    }
  });
  return true;
}

/** The kept race, if there's one and it's sound (this version, not too old). */
export function keptRace(now = Date.now()): KeptRace | undefined {
  const k = saved('race', 'kept') as Partial<KeptRace> | undefined;
  if (!k || typeof k !== 'object' || k.v !== RACE_SAVE_VERSION || typeof k.at !== 'number' || now - k.at > RACE_SAVE_MAX_AGE) return undefined;
  if (typeof k.circuit !== 'string' || (k.mode !== 'race' && k.mode !== 'championship') || typeof k.seed !== 'number' || !k.state || !Array.isArray(k.state.entrants) || !k.setup || typeof k.you !== 'number' || !k.state.entrants[k.you]) return undefined;
  return k as KeptRace;
}

/** Keep `race` to come back to (instead of any kept before). */
export const keepRace = (race: KeptRace): void => save('race', 'kept', race);

/** Throw the kept race away. */
export const dropKeptRace = (): void => {
  if (saved('race', 'kept') !== undefined) save('race', 'kept', undefined);
};

/** Your lap in a kept race, for the button that comes back to it: LAP 4/10 (the lap you're on). */
export function keptLap(k: KeptRace): string {
  const p = k.state.entrants[k.you]?.progress;
  return `LAP ${Math.min(k.state.laps, (p?.lap ?? 0) + 1)}/${k.state.laps}`;
}
