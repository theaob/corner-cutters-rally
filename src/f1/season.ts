// The season, as the World Rally Championship runs one: the rallies are its rounds, one after another on a calendar
// (a new round opens each week; one that's open stays open, so a player who comes late drives every round already
// out), with the same nine rival crews all season. Each round scores points as the WRC does: the top ten overall at
// the end of it (25, 18, 15 … 1), and the five quickest on its last stage, the Power Stage, a bonus (5 … 1). The
// most points after the last round takes the title. A round is driven once: it counts as it finished, and one you
// retire from scores you nothing (retireRound).
//
// Each performance class (cars.ts) runs a championship of its own over the same rounds, with nine rival crews of its
// own: you drive a round in a class's championship in one of its cars, and can drive every class you've opened. The
// championships under way are kept on the device (the save's 'rally' section, as 'seasons', by class; one kept as
// 'season' from before the classes is the HISTORIC one, the class every player starts in). Engine-free and unit-tested.

import { save, saved } from '../engine/save';
import { seededRandom } from '../engine/rng';
import { paceRanks } from './difficulty';
import { CREWS, crewById } from './crews';
import { classById, type CarClassKey } from './cars';
import { RALLY, rallyById, rallyOver, stageOrder, standings, type Rally, type RallyCrew, type RallyEvent } from './rally';

const DAY = 24 * 60 * 60 * 1000;

export const SEASON = {
  /** this season's name, kept with its results (a result from another season isn't this one's) */
  id: '2026-27',
  /** when its first round opens (UTC ms): a Monday */
  start: Date.UTC(2026, 10, 16),
  /** days from one round's opening to the next's */
  every: 7,
  /** the rounds, in order (rallies' ids) */
  rounds: ['forests', 'winter', 'desert', 'tarmac', 'riviera'],
  /** points for the top ten overall at the end of a round */
  points: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1],
  /** the Power Stage's bonus, for its five quickest */
  power: [5, 4, 3, 2, 1],
};

/** The rounds, as rallies. */
export const ROUNDS: RallyEvent[] = SEASON.rounds.map((id) => rallyById(id)!).filter(Boolean);
/** Round `k`'s place in the season (0 the first), by its rally's id; -1 if it isn't one. */
export const roundOf = (event: string) => SEASON.rounds.indexOf(event);
/** When round `k` opens (UTC ms). */
export const opensAt = (k: number) => SEASON.start + k * SEASON.every * DAY;
/** Whether round `k` is open at `now` (a round once open stays open). */
export const roundOpen = (k: number, now: number) => k >= 0 && k < ROUNDS.length && now >= opensAt(k);

/** A crew's key in the season's points: a rival's id, or 'you'. */
export const YOU = 'you';

export interface RoundResult {
  /** your place overall (0: you retired from it) */
  place: number;
  /** each crew's points from it (the top ten's, and the Power Stage's), by key */
  points: Record<string, number>;
  /** the Power Stage's bonus in that (by key) */
  power: Record<string, number>;
}

/** A class's championship over the season. */
export interface Season {
  v: 1;
  id: string;
  /** the performance class it's for (one saved before the classes: HISTORIC) */
  cls: CarClassKey;
  seed: number;
  /** the nine rival crews, with their pace ranks: the same all season */
  rivals: RallyCrew[];
  /** the rounds driven, by their rally's id */
  results: Record<string, RoundResult>;
}

/** A new championship of class `cls`: nine of the rival crews, drawn by `seed`, with their pace ranks. */
export function newSeason(seed: number, cls: CarClassKey = 'historic'): Season {
  const rng = seededRandom(seed);
  const all: RallyCrew[] = CREWS.map((c) => ({ crew: c.id }));
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  const rivals = all.slice(0, RALLY.crews - 1);
  const ranks = paceRanks(rivals.length, rng);
  rivals.forEach((c, i) => (c.rank = ranks[i]));
  return { v: 1, id: SEASON.id, cls, seed, rivals, results: {} };
}

/** A crew's key in a rally's points. */
const keyOf = (r: Rally, i: number) => (i === r.you ? YOU : (r.crews[i].crew ?? `#${i}`));

/** A round's points, from its rally once it's over: the top ten overall, and the Power Stage's five quickest. */
export function roundResult(r: Rally): RoundResult {
  const points: Record<string, number> = {};
  const power: Record<string, number> = {};
  const order = standings(r);
  order.forEach((s, k) => (points[keyOf(r, s.crew)] = SEASON.points[k] ?? 0));
  stageOrder(r, r.stages.length - 1).slice(0, SEASON.power.length).forEach((s, k) => {
    const key = keyOf(r, s.crew);
    power[key] = SEASON.power[k];
    points[key] = (points[key] ?? 0) + SEASON.power[k];
  });
  return { place: order.findIndex((s) => s.crew === r.you) + 1, points, power };
}

/** The class whose championship rally `r` is a round of (one from before the classes: HISTORIC). */
export const roundClass = (r: Rally): CarClassKey => classById(r.cls)?.id ?? 'historic';

/** Whether rally `r` is a round of championship `season` not yet driven (a rally from before the classes: HISTORIC's). */
const roundFor = (season: Season, r: Rally) => r.season === season.id && roundClass(r) === season.cls && roundOf(r.event) >= 0 && !season.results[r.event];

/** Rally `r`, a round of `season`, over: its result kept (once: a round counts as it first finished). Whether it was. */
export function recordRound(season: Season, r: Rally): boolean {
  if (!roundFor(season, r) || !rallyOver(r)) return false;
  season.results[r.event] = roundResult(r);
  return true;
}

/**
 * Rally `r`, a round of `season`, retired from before its end: it counts as driven, with no points for you (place 0).
 * The rival crews score as they stood when you retired (your time left out), the top ten's points from the top; if no
 * stage had been run, as they rank on pace. No Power Stage bonus: it's the last stage, and wasn't run. Whether it was kept.
 */
export function retireRound(season: Season, r: Rally): boolean {
  if (!roundFor(season, r)) return false;
  const rivals = r.crews.map((_, i) => i).filter((i) => i !== r.you);
  const order = r.stages.length
    ? standings(r).map((o) => o.crew).filter((i) => i !== r.you)
    : [...rivals].sort((a, b) => (r.crews[a].rank ?? 0) - (r.crews[b].rank ?? 0) || a - b);
  const points: Record<string, number> = { [YOU]: 0 };
  order.forEach((i, k) => (points[keyOf(r, i)] = SEASON.points[k] ?? 0));
  season.results[r.event] = { place: 0, points, power: {} };
  return true;
}

export interface SeasonStanding {
  /** the crew's key: a rival's id, or YOU */
  key: string;
  points: number;
  wins: number;
}

/** The season's standings: every crew by its points, the most first (then the most wins). */
export function seasonStandings(s: Season): SeasonStanding[] {
  const keys = [YOU, ...s.rivals.map((c) => c.crew!).filter(Boolean)];
  const results = Object.values(s.results);
  return keys
    .map((key) => ({
      key,
      points: results.reduce((sum, r) => sum + (r.points[key] ?? 0), 0),
      wins: results.filter((r) => (r.points[key] ?? 0) >= SEASON.points[0]).length,
    }))
    .sort((a, b) => b.points - a.points || b.wins - a.wins || keys.indexOf(a.key) - keys.indexOf(b.key));
}

/** Your place in the season (1 the leader). */
export const seasonPlace = (s: Season) => seasonStandings(s).findIndex((c) => c.key === YOU) + 1;
/** Whether every round has been driven. */
export const seasonOver = (s: Season) => ROUNDS.every((e) => !!s.results[e.id]);
/** The rounds still to drive that are open at `now`. */
export const roundsToDrive = (s: Season, now: number) => ROUNDS.filter((e, k) => roundOpen(k, now) && !s.results[e.id]);

/** A saved championship, if it's a good one (and this season's; one from before the classes is HISTORIC's). */
export function parseSeason(v: unknown): Season | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const s = v as Season;
  const cls = s.cls ?? 'historic';
  const ok = s.v === 1 && s.id === SEASON.id && !!classById(cls) && Number.isInteger(s.seed) && Array.isArray(s.rivals) && s.rivals.length === RALLY.crews - 1
    && s.rivals.every((c) => !!crewById(c?.crew) && Number.isInteger(c.rank)) && !!s.results && typeof s.results === 'object'
    && Object.entries(s.results).every(([id, r]) => roundOf(id) >= 0 && Number.isInteger(r?.place) && !!r.points && typeof r.points === 'object');
  return ok ? { ...s, cls, results: Object.fromEntries(Object.entries(s.results).map(([id, r]) => [id, { ...r, power: r.power ?? {} }])) } : undefined;
}

/** The championships kept, by class (the one from before the classes moved in as HISTORIC's). */
export function loadSeasons(): Partial<Record<CarClassKey, Season>> {
  const kept = saved('rally', 'seasons');
  const out: Partial<Record<CarClassKey, Season>> = {};
  if (kept && typeof kept === 'object') {
    for (const v of Object.values(kept as Record<string, unknown>)) {
      const s = parseSeason(v);
      if (s) out[s.cls] = s;
    }
  }
  const old = parseSeason(saved('rally', 'season'));
  if (old && !out[old.cls]) out[old.cls] = old;
  return out;
}

export const loadSeason = (cls: CarClassKey): Season | undefined => loadSeasons()[cls];
/** Championship `s` kept as its class's (or, `undefined`, class `cls`'s let go: a new one is drawn next time). */
export function saveSeason(s: Season | undefined, cls: CarClassKey | undefined = s?.cls): void {
  if (!cls) return;
  const all = loadSeasons();
  if (s) all[cls] = s;
  else delete all[cls];
  save('rally', 'seasons', all);
  save('rally', 'season', undefined);
}

/** Class `cls`'s championship under way, or a new one (drawn by `seed`), saved. */
export function currentSeason(seed: number, cls: CarClassKey = 'historic'): Season {
  const had = loadSeason(cls);
  if (had) return had;
  const s = newSeason(seed, cls);
  saveSeason(s);
  return s;
}
