// The Championship: a season of rounds, one on each circuit in turn, against
// the same field all season (your team and four others, two cars each, drawn
// when the season starts, each driver with the same pace all season). Points
// as in F1 for the top ten; the drivers' standings by points, then by the best
// results (most wins, then most seconds…). The season is kept on the device
// after every round, so it can be left and picked up again. Engine-free.

import { save, saved } from '../engine/save';
import { seededRandom } from '../engine/rng';
import { paceRanks, type DifficultyId } from './difficulty';
import { numberOf } from './drivers';
import { seasonLength } from './laps';
import { TEAMS, driverSeats, teamGrid, type Seat, type Team } from './teams';
import type { WeatherId } from './weather';

/** Points for 1st to 10th. */
export const POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

/** A driver in the season: their name ('YOU' for you), team (by id) and pace rank (0 the quickest). */
export interface SeasonDriver {
  name: string;
  team: string;
  rank: number;
}

export interface Season {
  /** the season's own seed: its field (and each round's seed from it) */
  seed: number;
  difficulty: DifficultyId;
  /** (a season saved before each round had its own forecast: the weather it was picked for, no longer used) */
  weather?: WeatherId;
  qualifying: boolean;
  /** the circuits (by id), in order */
  rounds: string[];
  /** the next round to race (rounds.length: the season's over) */
  round: number;
  /** the field, by driver: index `you` is you */
  drivers: SeasonDriver[];
  you: number;
  /** each round's laps (a season saved before there was a choice: RACE_LAPS) */
  laps?: number;
  /** which of your team's cars you drive (the first in a season saved before you could pick) */
  seat?: Seat;
  /** each round raced so far: each driver's place (0 = won), or -1 if they didn't finish */
  places: number[][];
}

/** Points for a place (0 = a win; -1, a DNF, scores none). */
export const pointsFor = (place: number) => (place >= 0 ? (POINTS[place] ?? 0) : 0);

/**
 * A new season on `rounds` for `team`: the field drawn from `seed` (your team
 * and four drawn at random, two cars each; each driver a pace rank for the
 * season), `total` drivers in all, you mid-field.
 */
export function newSeason(o: { seed: number; team: Team; seat?: Seat; difficulty: DifficultyId; qualifying: boolean; rounds: string[]; total: number; laps?: number }): Season {
  const rng = seededRandom(o.seed);
  const you = Math.floor(o.total / 2);
  const teams = teamGrid(o.team, o.total, you, rng);
  const seat = o.seat ?? 0;
  const seats = driverSeats(teams, you, seat);
  const ranks = paceRanks(o.total, rng);
  const drivers = teams.map((t, k) => ({ name: k === you ? 'YOU' : t.drivers[seats[k]], team: t.id, rank: ranks[k] }));
  return { seed: o.seed, difficulty: o.difficulty, qualifying: o.qualifying, rounds: [...o.rounds], round: 0, drivers, you, seat, places: [], ...(o.laps !== undefined ? { laps: seasonLength(o.laps).laps } : {}) };
}

/** The seed of round `k`: its start, the AI's dice (the field stays the season's). */
export const roundSeed = (s: Season, k: number) => ((s.seed * 31 + (k + 1) * 7919) >>> 0) || 1;

/** Whether the season's over: every round raced. */
export const seasonOver = (s: Season) => s.round >= s.rounds.length;

/** Record the round just raced: `finish` is the drivers (indexes) in finishing order; `out` those who didn't finish. */
export function recordRound(s: Season, finish: number[], out: Set<number> = new Set()): void {
  if (seasonOver(s)) return;
  const places = s.drivers.map(() => -1);
  let place = 0;
  for (const k of finish) if (!out.has(k)) places[k] = place++;
  s.places.push(places);
  s.round++;
}

export interface Standing {
  driver: number;
  points: number;
  wins: number;
}

/** Each driver's points so far. */
export const pointsOf = (s: Season) => s.drivers.map((_, k) => s.places.reduce((sum, round) => sum + pointsFor(round[k]), 0));

/** The drivers' standings: most points first; level on points, the one with more wins, then more seconds, and so on. */
export function standings(s: Season): Standing[] {
  const points = pointsOf(s);
  /** how many times each driver finished in each place */
  const counts = s.drivers.map((_, k) => {
    const c = new Array(s.drivers.length).fill(0);
    for (const round of s.places) if (round[k] >= 0) c[round[k]]++;
    return c;
  });
  return s.drivers
    .map((_, k) => ({ driver: k, points: points[k], wins: counts[k][0] }))
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      for (let p = 0; p < s.drivers.length; p++) if (counts[b.driver][p] !== counts[a.driver][p]) return counts[b.driver][p] - counts[a.driver][p];
      return a.driver - b.driver;
    });
}

/** The team a season driver drives for. */
export const teamOf = (d: SeasonDriver): Team => TEAMS.find((t) => t.id === d.team) ?? TEAMS[0];

/** Driver `k`'s race number in season `s` (yours: the number of the car you drive). */
export const numberIn = (s: Season, k: number): number | undefined =>
  numberOf(k === s.you ? teamOf(s.drivers[k]).drivers[s.seat ?? 0] : s.drivers[k].name);

/** A season from the save, if it's a sound one. */
export function parseSeason(v: unknown): Season | undefined {
  const s = v as Partial<Season> | null;
  if (!s || typeof s !== 'object') return undefined;
  const int = (x: unknown) => typeof x === 'number' && Number.isInteger(x);
  if (!int(s.seed) || !int(s.round) || !int(s.you) || !Array.isArray(s.rounds) || !Array.isArray(s.drivers) || !Array.isArray(s.places)) return undefined;
  if (!['easy', 'normal', 'hard'].includes(s.difficulty as string) || typeof s.qualifying !== 'boolean') return undefined;
  const n = s.drivers.length;
  if (!n || s.you! < 0 || s.you! >= n || s.round! < 0 || s.round! > s.rounds.length || s.places.length !== s.round) return undefined;
  if (!s.rounds.every((r) => typeof r === 'string')) return undefined;
  if (!s.drivers.every((d) => d && typeof d.name === 'string' && typeof d.team === 'string' && int(d.rank))) return undefined;
  if (!s.places.every((r) => Array.isArray(r) && r.length === n && r.every((p) => int(p) && p >= -1 && p < n))) return undefined;
  // (a length that isn't one: a SPRINT)
  if (s.laps !== undefined && seasonLength(s.laps).laps !== s.laps) return parseSeason({ ...s, laps: undefined });
  if (s.seat !== undefined && s.seat !== 0 && s.seat !== 1) return { ...(s as Season), seat: 0 };
  return s as Season;
}

/** The season in progress (or just finished), kept on the device. */
export const loadSeason = (): Season | undefined => parseSeason(saved('championship', 'season'));
export const saveSeason = (s: Season | undefined): void => save('championship', 'season', s);
