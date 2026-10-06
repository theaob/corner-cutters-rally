// The weather for a race, picked on the menu: a dry track, a damp one (no
// rain falling, but wet in places), a wet one (raining), or changeable (rain
// that comes and goes through the race: forecast.ts). A Championship round's
// is its own, drawn from the season. It sets which tyres work (tyres.ts), and
// how the circuit looks: the sky and light, how dark the track is, falling rain
// and the spray the cars throw up, eased between dry, damp and wet as the
// weather changes (lookAt).

import type { SkyState } from '../engine/render/daylight';

export type WeatherId = 'dry' | 'damp' | 'wet';
/** A weather to race in: one of the three, the same all race, or changeable */
export type WeatherChoice = WeatherId | 'changeable';

export interface Weather {
  id: WeatherChoice;
  name: string;
  /** a line about it, for the menu */
  about: string;
  /** the sky and light over the circuit */
  sky: SkyState;
  /** multiplied into the ground's colours: a wet track (and grass) is darker */
  groundTint: number;
  /** how hard it's raining: 0 = not at all … 1 = heavily */
  rain: number;
  /** cars throw up spray */
  spray: boolean;
}

const SUN = { x: 140, y: 260, z: 170 };

export const WEATHERS: Weather[] = [
  {
    id: 'dry', name: 'DRY', about: 'slicks · full grip', rain: 0, spray: false, groundTint: 0xffffff,
    sky: { background: 0x8fb8e8, sky: 0xb8d4ff, ground: 0x5a4f48, ambient: 1.35, key: 0xffe0b0, keyIntensity: 2.6, keyOffset: SUN, moon: false, lights: 0 },
  },
  {
    id: 'damp', name: 'DAMP', about: 'intermediates · drying track', rain: 0, spray: true, groundTint: 0xc8c8d0,
    sky: { background: 0x9aa6b4, sky: 0xc0c8d4, ground: 0x4c4a4c, ambient: 1.45, key: 0xe8e4dc, keyIntensity: 1.5, keyOffset: SUN, moon: false, lights: 0 },
  },
  {
    id: 'wet', name: 'WET', about: 'full wets · rain, spray, less grip', rain: 1, spray: true, groundTint: 0xa4a4b0,
    sky: { background: 0x6e7684, sky: 0xa8b0bc, ground: 0x3c3a3e, ambient: 1.5, key: 0xd0d4dc, keyIntensity: 0.8, keyOffset: SUN, moon: false, lights: 0 },
  },
];

export const DRY = WEATHERS[0];

/** Changeable weather: rain that may come, or go, through the race (it starts as its forecast has it). */
export const CHANGEABLE: Weather = { ...DRY, id: 'changeable', name: 'CHANGEABLE', about: 'rain may come or go · box for the right tyres' };

/** The weathers a Quick Race can be run in: the three, and changeable. */
export const RACE_WEATHERS: Weather[] = [...WEATHERS, CHANGEABLE];

/** How the circuit looks at any weather: its sky and light, the ground's tint, and whether the cars throw up spray. */
export interface WeatherLook {
  sky: SkyState;
  groundTint: number;
  spray: boolean;
}

const mix = (a: number, b: number, t: number) => {
  const c = (sh: number) => Math.round(((a >> sh) & 255) + (((b >> sh) & 255) - ((a >> sh) & 255)) * t);
  return (c(16) << 16) | (c(8) << 8) | c(0);
};

/**
 * How the circuit looks with the track `wetness` wet (0 dry … 1 damp … 2 wet) and the rain `rain` hard: eased
 * between the dry, damp and wet looks, the sky darker in the rain.
 */
export function lookAt(wetness: number, rain: number): WeatherLook {
  const [a, b, t] = wetness <= 1 ? [WEATHERS[0], WEATHERS[1], wetness] : [WEATHERS[1], WEATHERS[2], wetness - 1];
  // (the sky by the rain falling: grey as soon as it rains, whatever the track)
  const [sa, sb, st] = [WEATHERS[0].sky, WEATHERS[2].sky, Math.max(rain, Math.min(1, wetness / 2) * 0.6)];
  const sky: SkyState = {
    ...sa,
    background: mix(sa.background, sb.background, st), sky: mix(sa.sky, sb.sky, st), ground: mix(sa.ground, sb.ground, st), key: mix(sa.key, sb.key, st),
    ambient: sa.ambient + (sb.ambient - sa.ambient) * st, keyIntensity: sa.keyIntensity + (sb.keyIntensity - sa.keyIntensity) * st,
  };
  return { sky, groundTint: mix(a.groundTint, b.groundTint, Math.max(0, Math.min(1, t))), spray: wetness > 0.4 };
}

/** The weather with this id, or undefined. */
export const weatherById = (id: string | null | undefined) => RACE_WEATHERS.find((w) => w.id === id);
