// The garage's lineup: six rally cars, one an era, from a 1960s pocket saloon to today's top class, each unlocked
// for good by career points (points earned from season rounds and seasons; not spent). Every name is made up and no
// car carries a maker's badge: each echoes its era's famous shape (carBodies.ts), not any one car.
//
// The handling numbers are against today's car (1 = as it drives now) and are the plan's starting point: not wired
// into the driving yet (see the car plan). Engine-free.

import type { CarModel } from '../engine/render/carBodies';

export interface CarSpec {
  id: CarModel;
  name: string;
  /** the era it's from */
  era: string;
  /** which wheels drive */
  drive: 'front' | 'rear' | 'all';
  /** career points that unlock it */
  unlock: number;
  /** against today's car: top speed, turn rate, how fast a slide dies (and grip off the road), crash damage taken */
  speed: number;
  turn: number;
  grip: number;
  tough: number;
  /** s from a standstill to top speed */
  pickup: number;
  /** its own paint (each car has its own): the body, the second colour (the roof, flares, wing), the sides */
  paint?: { body: string; stripe: string; accent?: string };
}

export const CARS: CarSpec[] = [
  { id: 'mini', name: 'BANTAM S', era: '1960s', drive: 'front', unlock: 0, speed: 0.94, pickup: 1.25, turn: 1.08, grip: 0.95, tough: 0.9, paint: { body: '#b8182a', stripe: '#f3f1ea' } },
  { id: 'fulvia', name: 'VELA 1600', era: '1960s', drive: 'front', unlock: 20, speed: 0.95, pickup: 1.22, turn: 1.06, grip: 0.96, tough: 0.92, paint: { body: '#94172b', stripe: '#c9a96a' } },
  { id: 'alpine', name: 'BERLINA 1600', era: '1970s', drive: 'rear', unlock: 30, speed: 0.955, pickup: 1.2, turn: 1.1, grip: 0.92, tough: 0.88, paint: { body: '#1f5bb0', stripe: '#f4f4f0' } },
  { id: 'brisk', name: 'BRISK 1800', era: '1970s', drive: 'rear', unlock: 40, speed: 0.96, pickup: 1.2, turn: 1, grip: 0.82, tough: 1, paint: { body: '#efede6', stripe: '#1d3f9a' } },
  { id: 'stiletto', name: 'STILETTO', era: '1970s', drive: 'rear', unlock: 110, speed: 0.98, pickup: 1.1, turn: 1.12, grip: 0.92, tough: 0.85, paint: { body: '#f3f2ec', stripe: '#0f8a4a' } },
  { id: 'volta', name: 'VOLTA 2000', era: '1970s', drive: 'rear', unlock: 160, speed: 0.99, pickup: 1.1, turn: 1.04, grip: 0.9, tough: 1.05, paint: { body: '#f3f2ec', stripe: '#13977a' } },
  { id: 'raia', name: 'RAIA 400', era: '1980s', drive: 'rear', unlock: 190, speed: 0.995, pickup: 1.1, turn: 1.04, grip: 0.94, tough: 1.05, paint: { body: '#f2c230', stripe: '#2148b8' } },
  { id: 'saetta', name: 'SAETTA 037', era: '1980s', drive: 'rear', unlock: 205, speed: 0.998, pickup: 1.08, turn: 1.08, grip: 0.96, tough: 1, paint: { body: '#f3f2ec', stripe: '#1c2f6e' } },
  { id: 'quadra', name: 'QUADRA S1', era: '1980s', drive: 'all', unlock: 220, speed: 1, pickup: 1.1, turn: 0.94, grip: 1.12, tough: 1.1, paint: { body: '#f3f2ec', stripe: '#c8202a' } },
  { id: 'typhoon', name: 'TYPHOON', era: '1990s', drive: 'all', unlock: 380, speed: 1.02, pickup: 1.05, turn: 1.02, grip: 1.08, tough: 1.05 },
  { id: 'apex', name: 'APEX R1', era: 'TODAY', drive: 'all', unlock: 560, speed: 1.04, pickup: 1, turn: 1.06, grip: 1.15, tough: 1 },
];

export const carById = (id: string | null | undefined): CarSpec | undefined => CARS.find((c) => c.id === id);

/** The cars `points` career points have unlocked, in order. */
export const unlockedCars = (points: number): CarSpec[] => CARS.filter((c) => points >= c.unlock);

/** The next car `points` would unlock, if any is left. */
export const nextCar = (points: number): CarSpec | undefined => CARS.find((c) => points < c.unlock);
