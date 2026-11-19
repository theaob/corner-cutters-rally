// Career points: what unlocks the garage's cars (cars.ts), for good. They're never spent: the total only grows. A
// season's round pays your points from it (the top ten's and the Power Stage's, season.ts), and a season once every
// round is driven pays a bonus by where you finished it. Free play pays none. Kept on the device (the save's
// 'progress' section, as 'career'), with what of the season under way has been paid, so nothing is paid twice
// (payCareer can be called as often as you like). Also your car: the one picked in the garage, kept with the
// choices. Engine-free and unit-tested.

import { save, saved } from '../engine/save';
import { CARS, carById, nextCar, unlockedCars, type CarSpec } from './cars';
import { ROUNDS, YOU, seasonOver, seasonPlace, type Season } from './season';

/** The season's bonus by where you finished it (1st … 10th): every crew that sees a season out gets some. */
export const SEASON_BONUS = [50, 35, 25, 20, 15, 12, 10, 8, 6, 5];

export interface Career {
  v: 1;
  /** career points earned, all told */
  points: number;
  /** the season paid from (its id and seed: a new season is a new one), and what of it is paid: its rounds (by
   * rally id), and 'season' once its bonus is */
  season?: string;
  paid: string[];
}

const fresh = (): Career => ({ v: 1, points: 0, paid: [] });

/** A season's key: its id and its seed (a NEW SEASON is drawn with another seed). */
const keyOf = (s: Season) => `${s.id}:${s.seed}`;

/** A saved career, if it's a good one. */
export function parseCareer(v: unknown): Career | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const c = v as Career;
  const ok = c.v === 1 && Number.isFinite(c.points) && c.points >= 0 && Array.isArray(c.paid) && c.paid.every((p) => typeof p === 'string')
    && (c.season === undefined || typeof c.season === 'string');
  return ok ? { v: 1, points: Math.floor(c.points), season: c.season, paid: [...c.paid] } : undefined;
}

export const loadCareer = (): Career => parseCareer(saved('progress', 'career')) ?? fresh();
export const saveCareer = (c: Career): void => save('progress', 'career', c);

/** What `season` pays that `c` hasn't been paid yet: each round driven, and the bonus once it's over. */
export function owed(c: Career, season: Season): { rounds: string[]; bonus: number; points: number } {
  const paid = c.season === keyOf(season) ? c.paid : [];
  const rounds = ROUNDS.map((e) => e.id).filter((id) => season.results[id] && !paid.includes(id));
  const roundPoints = rounds.reduce((sum, id) => sum + (season.results[id].points[YOU] ?? 0), 0);
  const bonus = seasonOver(season) && !paid.includes('season') ? (SEASON_BONUS[seasonPlace(season) - 1] ?? 0) : 0;
  return { rounds, bonus, points: roundPoints + bonus };
}

/**
 * `c` paid what `season` owes it (changed in place): its rounds driven, and its bonus once it's over. A new season
 * starts a new tally of what's paid. The points newly paid.
 */
export function pay(c: Career, season: Season): number {
  const o = owed(c, season);
  const key = keyOf(season);
  if (c.season !== key) {
    c.season = key;
    c.paid = [];
  }
  c.paid.push(...o.rounds, ...(seasonOver(season) && !c.paid.includes('season') ? ['season'] : []));
  c.points += o.points;
  return o.points;
}

/** The saved career paid what `season` owes it, and saved if anything was. The points newly paid, and the cars they unlocked. */
export function payCareer(season: Season): { points: number; unlocked: CarSpec[] } {
  const c = loadCareer();
  const before = c.points;
  const key = c.season;
  const paid = c.paid.length;
  const points = pay(c, season);
  if (points || c.season !== key || c.paid.length !== paid) saveCareer(c);
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
