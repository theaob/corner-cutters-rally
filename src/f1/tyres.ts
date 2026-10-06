// Tyres. A car's tyres wear as it drives: with speed, faster while sliding (a
// drift eats them) and on rough ground. Worn tyres grip and turn less and
// can't put the power down, a little at first, then sharply once they're nearly
// gone (the cliff). A rally's stage starts on a fresh set (and keeps it fresh).
//
// On tarmac, the compound for the weather: SOFT slicks in the dry (the HARD
// is kept for completeness: 4% slower, lasting twice as long),
// intermediates on a damp road, full wets in the rain. The wrong tyre for the
// road grips less, is slower, and (a wet tyre on a dry road) wears out fast; a
// wet road is slower than a dry one even on the right tyres. In between (the
// road wetting in the rain or drying after it: forecast.ts) each does as it
// would between the two.
//
// On dirt (a stage's `dirt`: gravel, snow and sand) every car runs off-road
// tyres, the only compound there: knobbly, they bite into the loose surface,
// but it gives less grip than tarmac (the cars slide through the bends); in the
// rain it turns to mud, slower and slipperier still. Engine-free and unit-tested.

import { speedOf, type Car, type StepEvents } from '../engine/driving';
import type { WeatherId } from './weather';

export type Compound = 'slick' | 'hard' | 'inter' | 'wet' | 'dirt';
/** The dry compounds. */
export type DryCompound = 'slick' | 'hard';
export const isDry = (c: Compound): c is DryCompound => c === 'slick' || c === 'hard';

/** How a compound does on a track: its share of grip and of top speed, and how fast it wears (× a slick's in the dry). */
export interface Fit {
  grip: number;
  speed: number;
  wear: number;
}

/** Each compound's name, its colour (as F1 marks them: red softs, white hards, green intermediates, blue wets), and how it does in each weather. */
export const COMPOUNDS: Record<Compound, { name: string; short: string; color: string; on: Record<WeatherId, Fit> }> = {
  slick: {
    name: 'SOFTS', short: 'SFT', color: '#e8463c',
    on: { dry: { grip: 1, speed: 1, wear: 1 }, damp: { grip: 0.7, speed: 0.88, wear: 0.8 }, wet: { grip: 0.5, speed: 0.78, wear: 0.6 } },
  },
  hard: {
    name: 'HARDS', short: 'HRD', color: '#f4f2fa',
    on: { dry: { grip: 0.96, speed: 0.96, wear: 0.5 }, damp: { grip: 0.66, speed: 0.85, wear: 0.32 }, wet: { grip: 0.47, speed: 0.75, wear: 0.24 } },
  },
  inter: {
    name: 'INTERMEDIATES', short: 'INT', color: '#3ccf4e',
    on: { dry: { grip: 0.85, speed: 0.93, wear: 2.2 }, damp: { grip: 0.9, speed: 0.95, wear: 1 }, wet: { grip: 0.75, speed: 0.87, wear: 0.8 } },
  },
  wet: {
    name: 'FULL WETS', short: 'WET', color: '#2f8bff',
    on: { dry: { grip: 0.75, speed: 0.86, wear: 3.5 }, damp: { grip: 0.8, speed: 0.9, wear: 1.6 }, wet: { grip: 0.85, speed: 0.9, wear: 1 } },
  },
  // (on dirt, the only tyre: the loose earth's grip with it, then mud's)
  dirt: {
    name: 'OFF-ROAD', short: 'OFF', color: '#d08a3e',
    on: { dry: { grip: 0.8, speed: 1, wear: 0.3 }, damp: { grip: 0.7, speed: 0.95, wear: 0.3 }, wet: { grip: 0.62, speed: 0.9, wear: 0.3 } },
  },
};

/** A weather, or a track's wetness (0 dry … 1 damp … 2 wet: forecast.ts), as a wetness. */
const wetnessOf = (w: WeatherId | number): number => (typeof w === 'number' ? Math.max(0, Math.min(2, w)) : w === 'wet' ? 2 : w === 'damp' ? 1 : 0);

/** How `compound` does on a track `w` wet: its fit there, eased between the dry, damp and wet ones. */
export function fitAt(compound: Compound, w: WeatherId | number): Fit {
  const x = wetnessOf(w);
  const on = COMPOUNDS[compound].on;
  const [a, b, t] = x <= 1 ? [on.dry, on.damp, x] : [on.damp, on.wet, x - 1];
  return { grip: a.grip + (b.grip - a.grip) * t, speed: a.speed + (b.speed - a.speed) * t, wear: a.wear + (b.wear - a.wear) * t };
}

const ALL: Compound[] = ['slick', 'hard', 'inter', 'wet'];

/** The compound for a weather (or a track's wetness): the one that grips best there; on `dirt`, off-road tyres whatever the weather. */
export const tyreFor = (w: WeatherId | number, dirt = false): Compound => (dirt ? 'dirt' : ALL.reduce((best, c) => (fitAt(c, w).grip > fitAt(best, w).grip ? c : best)));

/**
 * The grip `compound` gives up on a track `w` wet against the right compound there (0: it is the right one). The
 * two slicks are the same kind of tyre: on a dry track the HARD's no more wrong than the SOFT (it gives up a little
 * grip for its life, and that's strategy's to weigh), and against the right tyre for the wet they're both slicks.
 */
export const wrongTyreLoss = (compound: Compound, w: WeatherId | number): number => {
  // (off-road tyres: on dirt, where they're all there is)
  if (compound === 'dirt') return 0;
  const right = tyreFor(w);
  if (isDry(compound) && isDry(right)) return 0;
  return 1 - fitAt(isDry(compound) ? 'slick' : compound, w).grip / fitAt(right, w).grip;
};

export const TYRES = {
  /** wear per second at top speed, driving cleanly */
  base: 0.009,
  /** extra wear per second while sliding flat out sideways (px/s of slide, up to `slideFull`) */
  slide: 0.03,
  slideFull: 150,
  /** extra wear per second on grass or gravel */
  rough: 0.01,
  /** wear past which the tyres fall off the cliff */
  cliff: 0.7,
  /** grip and turn lost: linearly with wear, and more over the cliff */
  gripLoss: 0.2,
  cliffGripLoss: 0.25,
  /** top speed lost: linearly with wear, and more over the cliff */
  speedLoss: 0.06,
  cliffSpeedLoss: 0.14,
};

/** A car's set of tyres. */
export interface TyreSet {
  compound: Compound;
  /** 0 = new … 1 = gone */
  wear: number;
  /** px driven on this set */
  driven: number;
}

export const freshTyres = (compound: Compound = 'slick'): TyreSet => ({ compound, wear: 0, driven: 0 });

/** How far over the cliff `wear` is: 0 before it, 1 with the tyres gone. */
const overCliff = (wear: number) => Math.max(0, (wear - TYRES.cliff) / (1 - TYRES.cliff));

/** The share of grip and turn left at `wear`. */
export const tyreGrip = (wear: number) => 1 - TYRES.gripLoss * wear - TYRES.cliffGripLoss * overCliff(wear);

/** The share of top speed left at `wear`. */
export const tyreSpeed = (wear: number) => 1 - TYRES.speedLoss * wear - TYRES.cliffSpeedLoss * overCliff(wear);

/** Wear the tyres for one driving step of `car` (with that step's events) in `weather` (or on a track that wet), and put their state on the car. */
export function wearTyres(set: TyreSet, car: Car, events: StepEvents, dt: number, weather: WeatherId | number = 'dry'): void {
  if (!car.airborne && !car.wrecked) {
    const v = speedOf(car);
    const f = { x: Math.sin(car.heading), y: -Math.cos(car.heading) };
    const slide = Math.abs(car.vx * -f.y + car.vy * f.x);
    const rate = TYRES.base * Math.min(1, v / car.cls.topSpeed) + TYRES.slide * Math.min(1, slide / TYRES.slideFull) + (events.onRough && v > 20 ? TYRES.rough : 0);
    set.wear = Math.min(1, set.wear + rate * fitAt(set.compound, weather).wear * dt);
    set.driven += v * dt;
  }
  fitTyres(set, car, weather);
}

/** Put the set's grip and speed in `weather` (or on a track that wet) on the car. */
export function fitTyres(set: TyreSet, car: Car, weather: WeatherId | number = 'dry'): void {
  const fit = fitAt(set.compound, weather);
  car.tyreGrip = tyreGrip(set.wear) * fit.grip;
  car.speedScale = tyreSpeed(set.wear) * fit.speed;
}
