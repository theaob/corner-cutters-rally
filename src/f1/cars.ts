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
}

export const CARS: CarSpec[] = [
  { id: 'pip', name: 'PIP 1300', era: '1960s', drive: 'front', unlock: 0, speed: 0.94, pickup: 1.25, turn: 1.08, grip: 0.95, tough: 0.9 },
  { id: 'brisk', name: 'BRISK 1800', era: '1970s', drive: 'rear', unlock: 40, speed: 0.96, pickup: 1.2, turn: 1, grip: 0.82, tough: 1 },
  { id: 'stiletto', name: 'STILETTO', era: '1970s', drive: 'rear', unlock: 110, speed: 0.98, pickup: 1.1, turn: 1.12, grip: 0.92, tough: 0.85 },
  { id: 'quadra', name: 'QUADRA', era: '1980s', drive: 'all', unlock: 220, speed: 1, pickup: 1.1, turn: 0.94, grip: 1.12, tough: 1.1 },
  { id: 'typhoon', name: 'TYPHOON', era: '1990s', drive: 'all', unlock: 380, speed: 1.02, pickup: 1.05, turn: 1.02, grip: 1.08, tough: 1.05 },
  { id: 'apex', name: 'APEX R1', era: 'TODAY', drive: 'all', unlock: 560, speed: 1.04, pickup: 1, turn: 1.06, grip: 1.15, tough: 1 },
];

export const carById = (id: string | null | undefined): CarSpec | undefined => CARS.find((c) => c.id === id);

/** The cars `points` career points have unlocked, in order. */
export const unlockedCars = (points: number): CarSpec[] => CARS.filter((c) => points >= c.unlock);

/** The next car `points` would unlock, if any is left. */
export const nextCar = (points: number): CarSpec | undefined => CARS.find((c) => points < c.unlock);
