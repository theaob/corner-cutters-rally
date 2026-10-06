// The weather through a race: how hard it's raining, and how wet the track
// is. The track's wetness runs from 0 (dry) through 1 (damp) to 2 (wet): rain
// makes it wetter (the harder the rain, the wetter it gets, and the faster),
// and once the rain stops it dries, slowly. The tyres grip by it (tyres.ts),
// and the circuit looks it (weather.ts's look).
//
// A forecast is the race's rain to come: a fixed weather (dry, damp or wet, the
// same all race), or a changeable one drawn from the race's seed: a shower
// coming through, a wet start drying out, or light rain setting in, timed by
// the race's length. A Championship round's forecast is drawn from the
// season's seed. Engine-free and unit-tested.

import { seededRandom } from '../engine/rng';
import type { WeatherId } from './weather';

/** The track's wetness at each weather: dry, damp, wet. */
export const WETNESS: Record<WeatherId, number> = { dry: 0, damp: 1, wet: 2 };

export const FORECAST = {
  /** wetness per second the track gains in full rain (less in lighter rain), and loses drying */
  wetten: 0.08,
  dry: 0.02,
  /** s a shower takes to build up and to ease off */
  fade: 8,
};

/** Rain from `from` to `to` (s of race time), `rain` hard (0…1: 1 soaks the track, 0.5 leaves it damp). */
export interface Shower {
  from: number;
  to: number;
  rain: number;
}

export interface Forecast {
  /** what it's called (for the screens): DRY, DAMP, WET, SHOWERS, DRYING, LIGHT RAIN */
  name: string;
  /** the track's wetness at the start */
  start: number;
  showers: Shower[];
  /** the same all race (a fixed weather): the track's wetness doesn't change */
  fixed?: boolean;
}

/** The weather now: how wet the track is (0 dry … 2 wet), and how hard it's raining (0…1). */
export interface WeatherState {
  wetness: number;
  rain: number;
}

/** What a track's wetness makes it: dry, damp or wet. */
export const conditionOf = (wetness: number): WeatherId => (wetness < 0.5 ? 'dry' : wetness < 1.5 ? 'damp' : 'wet');

/** A fixed weather's forecast: the same all race. */
export function fixedForecast(weather: WeatherId): Forecast {
  return {
    name: weather.toUpperCase(),
    start: WETNESS[weather],
    showers: weather === 'wet' ? [{ from: -Infinity, to: Infinity, rain: 1 }] : [],
    fixed: true,
  };
}

/** How hard it's raining at race time `t` (s): each shower building up and easing off over FORECAST.fade. */
export function rainAt(f: Forecast, t: number): number {
  let rain = 0;
  for (const s of f.showers) {
    if (t < s.from || t >= s.to) continue;
    const ramp = Math.min(1, (t - s.from) / FORECAST.fade, (s.to - t) / FORECAST.fade);
    rain = Math.max(rain, s.rain * ramp);
  }
  return rain;
}

/** The weather at the start. */
export const startWeather = (f: Forecast): WeatherState => ({ wetness: f.start, rain: rainAt(f, 0) });

/** The weather `dt` s on from `s` at race time `t`: the rain as forecast, the track wetting in it or drying after. */
export function stepWeather(s: WeatherState, f: Forecast, t: number, dt: number): void {
  s.rain = rainAt(f, t);
  if (f.fixed) return;
  // (rain as hard as `r` soaks the track to 2 × r)
  const target = 2 * s.rain;
  if (s.wetness < target) s.wetness = Math.min(target, s.wetness + FORECAST.wetten * Math.max(0.3, s.rain) * dt);
  else s.wetness = Math.max(target, s.wetness - FORECAST.dry * dt);
}

/** The weather `ahead` s on from `s` at race time `t`, as forecast (without changing `s`). */
export function weatherAhead(s: WeatherState, f: Forecast, t: number, ahead: number): WeatherState {
  const next = { ...s };
  const dt = 0.5;
  for (let k = 0; k < ahead; k += dt) stepWeather(next, f, t + k, dt);
  return next;
}

/**
 * A changeable forecast for a race of about `seconds`, drawn from `seed`: a shower coming through (dry, then wet, then
 * drying), a wet start drying out, or light rain setting in (dry to damp).
 */
export function changeableForecast(seed: number, seconds: number): Forecast {
  const rng = seededRandom(seed || 1);
  const at = (a: number, b: number) => seconds * (a + rng() * (b - a));
  const kind = rng();
  if (kind < 0.45) {
    const from = at(0.2, 0.45);
    return { name: 'SHOWERS', start: 0, showers: [{ from, to: from + at(0.25, 0.4), rain: 0.75 + rng() * 0.25 }] };
  }
  if (kind < 0.75) return { name: 'DRYING', start: 2, showers: [{ from: -Infinity, to: at(0.05, 0.25), rain: 1 }] };
  return { name: 'LIGHT RAIN', start: 0, showers: [{ from: at(0.25, 0.5), to: Infinity, rain: 0.5 }] };
}

/**
 * A Championship round's forecast, drawn from `seed` (the round's): mostly dry, now and then damp or wet all race,
 * and now and then changeable.
 */
export function roundForecast(seed: number, seconds: number): Forecast {
  const r = seededRandom((seed * 7919) >>> 0 || 1)();
  if (r < 0.55) return fixedForecast('dry');
  if (r < 0.65) return fixedForecast('damp');
  if (r < 0.75) return fixedForecast('wet');
  return changeableForecast(seed, seconds);
}
