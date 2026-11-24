// The garage's lineup: eighteen rally cars, from a 1960s pocket saloon to today's top class, each unlocked for good by
// career points (career.ts: points earned from season rounds and seasons; never spent). Every name is made up and no
// car carries a maker's badge: each is built after a real rally car's shape (carBodies.ts), not its name.
//
// Each car is in a performance class (HISTORIC … WRC), and every car in a class drives the same: the class sets the
// handling (CLASSES, against today's top class: 1 = as WRC drives), the car only its looks. Engine-free.

import type { CarModel } from '../engine/render/carBodies';

export type CarClassKey = 'historic' | 'classic' | 'groupb' | 'groupa' | 'wrc';

export interface ClassSpec {
  id: CarClassKey;
  /** its name, as the menus show it (translated: t()) */
  name: string;
  /** against today's top class: top speed, turn rate, grip (how fast a slide dies, and grip off the road), and how
   * much damage a car takes before it's wrecked */
  speed: number;
  turn: number;
  grip: number;
  tough: number;
  /** s from a standstill to top speed, against today's top class's (more is slower) */
  pickup: number;
}

/** The performance classes, slowest first: a ladder, each opened by its first car's unlocking. */
export const CLASSES: ClassSpec[] = [
  { id: 'historic', name: 'HISTORIC', speed: 0.7, pickup: 1.7, turn: 1.1, grip: 0.55, tough: 0.9 },
  { id: 'classic', name: 'CLASSIC', speed: 0.79, pickup: 1.45, turn: 1.05, grip: 0.72, tough: 0.95 },
  { id: 'groupb', name: 'GROUP B', speed: 0.88, pickup: 1.15, turn: 1, grip: 0.92, tough: 0.95 },
  { id: 'groupa', name: 'GROUP A', speed: 0.94, pickup: 1.08, turn: 1, grip: 0.96, tough: 1 },
  { id: 'wrc', name: 'WRC', speed: 1, pickup: 1, turn: 1, grip: 1, tough: 1 },
];

export const classById = (id: string | null | undefined): ClassSpec | undefined => CLASSES.find((c) => c.id === id);

export interface CarSpec {
  id: CarModel;
  name: string;
  /** the era it's from */
  era: string;
  /** which wheels drive */
  drive: 'front' | 'rear' | 'all';
  /** career points that unlock it */
  unlock: number;
  /** its performance class (it drives as the class does) */
  cls: CarClassKey;
  /** its own paint (each car has its own): the body, the second colour (the roof, flares, wing), the sides */
  paint?: { body: string; stripe: string; accent?: string };
}

export const CARS: CarSpec[] = [
  { id: 'mini', name: 'BANTAM S', era: '1960s', drive: 'front', unlock: 0, cls: 'historic', paint: { body: '#b8182a', stripe: '#f3f1ea' } },
  { id: 'fulvia', name: 'VELA 1600', era: '1960s', drive: 'front', unlock: 20, cls: 'historic', paint: { body: '#94172b', stripe: '#c9a96a' } },
  { id: 'alpine', name: 'BERLINA 1600', era: '1970s', drive: 'rear', unlock: 30, cls: 'historic', paint: { body: '#1f5bb0', stripe: '#f4f4f0' } },
  { id: 'brisk', name: 'BRISK 1800', era: '1970s', drive: 'rear', unlock: 40, cls: 'classic', paint: { body: '#efede6', stripe: '#1d3f9a' } },
  { id: 'stiletto', name: 'STILETTO', era: '1970s', drive: 'rear', unlock: 110, cls: 'classic', paint: { body: '#f3f2ec', stripe: '#0f8a4a' } },
  { id: 'volta', name: 'VOLTA 2000', era: '1970s', drive: 'rear', unlock: 160, cls: 'classic', paint: { body: '#f3f2ec', stripe: '#13977a' } },
  { id: 'raia', name: 'RAIA 400', era: '1980s', drive: 'rear', unlock: 190, cls: 'groupb', paint: { body: '#f2c230', stripe: '#2148b8' } },
  { id: 'saetta', name: 'SAETTA 037', era: '1980s', drive: 'rear', unlock: 205, cls: 'groupb', paint: { body: '#f3f2ec', stripe: '#1c2f6e' } },
  { id: 'quadra', name: 'QUADRA S1', era: '1980s', drive: 'all', unlock: 220, cls: 'groupb', paint: { body: '#f3f2ec', stripe: '#f2c21c' } },
  { id: 'kestrel', name: 'KESTREL T16', era: '1980s', drive: 'all', unlock: 260, cls: 'groupb', paint: { body: '#f3f2ec', stripe: '#3a8fd8' } },
  { id: 'merlin', name: 'MERLIN 200', era: '1980s', drive: 'all', unlock: 300, cls: 'groupb', paint: { body: '#f4f4f0', stripe: '#1f4f9e' } },
  { id: 'vortice', name: 'VORTICE EVO', era: '1990s', drive: 'all', unlock: 330, cls: 'groupa', paint: { body: '#f4f4f0', stripe: '#16306e' } },
  { id: 'corsaro', name: 'CORSARO GT4', era: '1990s', drive: 'all', unlock: 355, cls: 'groupa', paint: { body: '#f4f4f0', stripe: '#d0242a' } },
  { id: 'typhoon', name: 'TYPHOON GT', era: '1990s', drive: 'all', unlock: 380, cls: 'groupa', paint: { body: '#1d3c9a', stripe: '#f3c81a' } },
  { id: 'falco', name: 'FALCO VI', era: '1990s', drive: 'all', unlock: 410, cls: 'groupa', paint: { body: '#d0242a', stripe: '#f4f4f0' } },
  { id: 'leone', name: 'LEONE S', era: '2000s', drive: 'all', unlock: 450, cls: 'wrc', paint: { body: '#f4f4f0', stripe: '#1d3f9a' } },
  { id: 'zefiro', name: 'ZEFIRO RS', era: '2000s', drive: 'all', unlock: 500, cls: 'wrc', paint: { body: '#f4f4f0', stripe: '#a6d23a' } },
  { id: 'apex', name: 'APEX R1', era: '2020s', drive: 'all', unlock: 560, cls: 'wrc', paint: { body: '#f4f4f0', stripe: '#d8202a' } },
];

export const carById = (id: string | null | undefined): CarSpec | undefined => CARS.find((c) => c.id === id);

/** A car's performance class. */
export const classOf = (car: CarSpec): ClassSpec => classById(car.cls)!;

/** The cars of class `cls`, in unlock order. */
export const carsIn = (cls: CarClassKey): CarSpec[] => CARS.filter((c) => c.cls === cls);

/** The cars `points` career points have unlocked, in order. */
export const unlockedCars = (points: number): CarSpec[] => CARS.filter((c) => points >= c.unlock);

/** The next car `points` would unlock, if any is left. */
export const nextCar = (points: number): CarSpec | undefined => CARS.find((c) => points < c.unlock);
