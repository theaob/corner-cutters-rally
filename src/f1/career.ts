// Career points: what unlocks the garage's cars (cars.ts), for good. They're never spent: the total only grows. A
// championship's round (season.ts: each class runs one) pays your points from it (the top ten's and the Power Stage's),
// and a championship once every round is driven pays a bonus by where you finished it. Free play pays none. Kept on
// the device (the save's 'progress' section, as 'career'), with what of each championship under way has been paid, so
// nothing is paid twice (payCareer can be called as often as you like). Also your car: the one picked in the garage,
// kept with the choices. Engine-free and unit-tested.

import { save, saved } from '../engine/save';
import { CARS, carById, nextCar, unlockedCars, type CarSpec } from './cars';
import { ROUNDS, YOU, seasonOver, seasonPlace, type Season } from './season';

/** A championship's bonus by where you finished it (1st … 10th): every crew that sees one out gets some. */
export const SEASON_BONUS = [50, 35, 25, 20, 15, 12, 10, 8, 6, 5];

export interface Career {
  v: 2;
  /** career points earned, all told */
  points: number;
  /** what of each championship has been paid, by its key (champKey): its rounds (by rally id), and 'season' once its
   * bonus is */
  paid: Record<string, string[]>;
}

const fresh = (): Career => ({ v: 2, points: 0, paid: {} });

/** A championship's key: the season, the class and its seed (a NEW SEASON is drawn with another seed). */
export const champKey = (s: Season) => `${s.id}:${s.cls}:${s.seed}`;

/** A saved career, if it's a good one (one from before the classes: its season's tally is HISTORIC's). */
export function parseCareer(v: unknown): Career | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const c = v as { v: number; points: number; paid: unknown; season?: unknown };
  if (!Number.isFinite(c.points) || c.points < 0) return undefined;
  const list = (l: unknown): l is string[] => Array.isArray(l) && l.every((p) => typeof p === 'string');
  if (c.v === 1) {
    if (!list(c.paid) || (c.season !== undefined && typeof c.season !== 'string')) return undefined;
    const [id, seed] = typeof c.season === 'string' ? c.season.split(':') : [];
    return { v: 2, points: Math.floor(c.points), paid: id && seed ? { [`${id}:historic:${seed}`]: [...c.paid] } : {} };
  }
  if (c.v !== 2 || !c.paid || typeof c.paid !== 'object' || !Object.values(c.paid).every(list)) return undefined;
  return { v: 2, points: Math.floor(c.points), paid: Object.fromEntries(Object.entries(c.paid as Record<string, string[]>).map(([k, l]) => [k, [...l]])) };
}

export const loadCareer = (): Career => parseCareer(saved('progress', 'career')) ?? fresh();
export const saveCareer = (c: Career): void => save('progress', 'career', c);

/** What championship `season` pays that `c` hasn't been paid yet: each round driven, and the bonus once it's over. */
export function owed(c: Career, season: Season): { rounds: string[]; bonus: number; points: number } {
  const paid = c.paid[champKey(season)] ?? [];
  const rounds = ROUNDS.map((e) => e.id).filter((id) => season.results[id] && !paid.includes(id));
  const roundPoints = rounds.reduce((sum, id) => sum + (season.results[id].points[YOU] ?? 0), 0);
  const bonus = seasonOver(season) && !paid.includes('season') ? (SEASON_BONUS[seasonPlace(season) - 1] ?? 0) : 0;
  return { rounds, bonus, points: roundPoints + bonus };
}

/**
 * `c` paid what championship `season` owes it (changed in place): its rounds driven, and its bonus once it's over. A
 * class's new championship starts a new tally (the last one's let go). The points newly paid.
 */
export function pay(c: Career, season: Season): number {
  const o = owed(c, season);
  const key = champKey(season);
  const prefix = `${season.id}:${season.cls}:`;
  for (const k of Object.keys(c.paid)) if (k !== key && (k.startsWith(prefix) || !k.startsWith(`${season.id}:`))) delete c.paid[k];
  const paid = (c.paid[key] ??= []);
  paid.push(...o.rounds, ...(seasonOver(season) && !paid.includes('season') ? ['season'] : []));
  c.points += o.points;
  return o.points;
}

/** The saved career paid what `seasons` owe it, and saved if anything changed. The points newly paid, and the cars they unlocked. */
export function payCareer(...seasons: Season[]): { points: number; unlocked: CarSpec[] } {
  const c = loadCareer();
  const before = c.points;
  const was = JSON.stringify(c.paid);
  let points = 0;
  for (const s of seasons) points += pay(c, s);
  if (points || JSON.stringify(c.paid) !== was) saveCareer(c);
  return { points, unlocked: CARS.filter((car) => car.unlock > before && car.unlock <= c.points) };
}

/** The car picked in the garage, if it's still one `points` have unlocked; else the first car. */
export function yourCar(points = loadCareer().points): CarSpec {
  const picked = carById(stringOr(saved('choices', 'car')));
  return picked && unlockedCars(points).includes(picked) ? picked : CARS[0];
}
const stringOr = (v: unknown) => (typeof v === 'string' ? v : undefined);

/** Picks `car` for the rallies to come (if it's unlocked). Whether it was. */
export function pickCar(car: CarSpec, points = loadCareer().points): boolean {
  if (points < car.unlock) return false;
  save('choices', 'car', car.id);
  return true;
}

/** How far `points` are along to the next car: it, the points still to go, and the share of the way from the last one. */
export function toNextCar(points: number): { car: CarSpec; left: number; share: number } | undefined {
  const car = nextCar(points);
  if (!car) return undefined;
  const from = [...CARS].reverse().find((c) => c.unlock <= points)?.unlock ?? 0;
  return { car, left: car.unlock - points, share: Math.max(0, Math.min(1, (points - from) / (car.unlock - from))) };
}
