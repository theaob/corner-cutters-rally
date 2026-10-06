// The rallies. A rally is a run of special stages, each a long road from a
// standing start at its start line to its flying finish, on your own against the clock; the crew
// with the least time over all the stages wins it. Nine rival crews run each
// stage too: their times come from a reference run (one car on the racing line,
// alone, from the same standing start) scaled by each crew's pace, spread a
// little either way, and now and then one goes off, spins or punctures and
// loses time. Your car carries its damage from one stage to the next, until
// the service park (after the stages the rally says) puts it right; a stage you
// don't finish (the car wrecked) is given the slowest time on it and a penalty,
// and the crew patch the car up enough to go on. The rally in progress is kept
// on the device, and your best result in each. Engine-free and unit-tested.

import { carClass, newCar, type HandlingParams } from '../engine/driving';
import { SIM_DT } from '../engine/fixedStep';
import type { Grid } from '../engine/sim';
import { save, saved } from '../engine/save';
import { seededRandom } from '../engine/rng';
import { aiPaceFor, paceRanks, type Difficulty } from './difficulty';
import { newRace, stepRace } from './raceControl';
import { stageSplits, type Track } from './racing';
import { CREWS, SCHEMES, crewById, schemeById, type Scheme } from './crews';
import type { WeatherId } from './weather';

export const RALLY = {
  /** crews in a rally, you among them */
  crews: 10,
  /** an AI crew's time on a stage, spread either way, as a share of it */
  spread: 0.012,
  /** the chance an AI crew loses time on a stage, and how much (s, from…to) */
  moment: { chance: 0.12, from: 3, to: 18 },
  /** the chance it's a big one */
  big: { chance: 0.03, from: 25, to: 60 },
  /** a stage you don't finish: the slowest time on it, and this many seconds more */
  notFinished: 60,
  /** your car's health (a share of it) after the crew patch up a car that didn't finish a stage */
  patched: 0.5,
};

export type Surface = 'GRAVEL' | 'SNOW' | 'SAND' | 'TARMAC';

export interface RallyStage {
  /** the stage's layout (layouts.ts's STAGE_LAYOUTS) */
  layout: string;
  weather: WeatherId;
}

export interface RallyEvent {
  id: string;
  name: string;
  surface: Surface;
  /** a line about it, for its screen */
  about: string;
  stages: RallyStage[];
  /** the service park, after these stages (indexes): your car repaired */
  service: number[];
}

export const RALLIES: RallyEvent[] = [
  {
    id: 'forests', name: 'RALLY OF THE FORESTS', surface: 'GRAVEL', about: 'gravel roads over the hills and through the forests',
    stages: [
      { layout: 'ss-pine-ridge', weather: 'dry' }, { layout: 'ss-old-mill', weather: 'damp' },
      { layout: 'ss-fox-hollow', weather: 'dry' }, { layout: 'ss-high-moor', weather: 'dry' },
    ],
    service: [1],
  },
  {
    id: 'winter', name: 'WINTER RALLY', surface: 'SNOW', about: 'snow and ice up in the mountains',
    stages: [{ layout: 'ss-glacier-road', weather: 'dry' }, { layout: 'ss-frozen-pass', weather: 'dry' }, { layout: 'ss-ice-lake', weather: 'dry' }],
    service: [0],
  },
  {
    id: 'desert', name: 'DESERT RALLY', surface: 'SAND', about: 'sand and dust under the desert sun',
    stages: [{ layout: 'ss-dune-run', weather: 'dry' }, { layout: 'ss-red-canyon', weather: 'dry' }, { layout: 'ss-salt-flats', weather: 'dry' }],
    service: [1],
  },
  {
    id: 'tarmac', name: 'TARMAC RALLY', surface: 'TARMAC', about: 'sealed mountain roads, hairpins and all',
    stages: [
      { layout: 'ss-mountain-col', weather: 'dry' }, { layout: 'ss-vineyards', weather: 'dry' },
      { layout: 'ss-coast-road', weather: 'damp' }, { layout: 'ss-castle-hill', weather: 'dry' },
    ],
    service: [1],
  },
];

export const rallyById = (id: string | null | undefined) => RALLIES.find((r) => r.id === id);

/** A crew in a rally: a rival (crews.ts) with its pace rank (0 the quickest), or you (no crew, your car's paint). */
export interface RallyCrew {
  crew?: string;
  rank?: number;
  /** yours: the paint scheme you picked */
  scheme?: string;
}

/** What happened to a crew on a stage, said in the stage's results. */
export type StageNote = 'OFF' | 'SPIN' | 'PUNCTURE' | 'ROLLED' | 'DNF' | 'PENALTY';

export interface Rally {
  v: 2;
  event: string;
  seed: number;
  difficulty: string;
  /** the crews (you're `you`) */
  crews: RallyCrew[];
  you: number;
  /** the stages run so far: each crew's time (s, penalties in) and what happened, if anything */
  stages: { times: number[]; notes: (StageNote | undefined)[] }[];
  /** your car's health going into the next stage, as a share of it */
  health: number;
}

/** A new rally: you in your car's `scheme` against nine of the rival crews, drawn by `seed`. */
export function newRally(o: { event: RallyEvent; seed: number; scheme: Scheme; difficulty: string }): Rally {
  const rng = seededRandom(o.seed);
  const others: RallyCrew[] = CREWS.map((c) => ({ crew: c.id }));
  // nine of them, at random
  for (let i = others.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [others[i], others[j]] = [others[j], others[i]];
  }
  const rivals = others.slice(0, RALLY.crews - 1);
  const ranks = paceRanks(rivals.length, rng);
  rivals.forEach((c, i) => (c.rank = ranks[i]));
  // (you start in the middle of the running order)
  const you = Math.floor(RALLY.crews / 2);
  const crews = [...rivals.slice(0, you), { scheme: o.scheme.id }, ...rivals.slice(you)];
  return { v: 2, event: o.event.id, seed: o.seed, difficulty: o.difficulty, crews, you, stages: [], health: 1 };
}

export const rallyEvent = (r: Rally): RallyEvent => rallyById(r.event) ?? RALLIES[0];
/** The stage up next (its index), or the rally's over. */
export const nextStage = (r: Rally) => r.stages.length;
export const rallyOver = (r: Rally) => r.stages.length >= rallyEvent(r).stages.length;
/** A stage's seed, from the rally's: the same stage, the same rivals' times. */
export const stageSeed = (r: Rally, k: number) => ((r.seed * 31 + (k + 1) * 7919) >>> 0) || 1;
/** The service park comes after stage `k`. */
export const serviceAfter = (r: Rally, k: number) => rallyEvent(r).service.includes(k);

/** A crew's paint (yours too). */
export const crewScheme = (c: RallyCrew): Scheme => schemeById(c.scheme ?? crewById(c.crew)?.scheme) ?? SCHEMES[0];
/** A crew's name, as the timing screens show it (yours: YOU). */
export const crewName = (c: RallyCrew): string => crewById(c.crew)?.name ?? 'YOU';
/** A crew's car number (yours: 1). */
export const crewNumber = (c: RallyCrew): number => crewById(c.crew)?.number ?? 1;

/**
 * A stage's reference run: one car flat out on the racing line, alone, from a standing start at `start`; its time from
 * GO to the flying finish, and its time at each split (stageSplits).
 */
export function referenceStage(track: Track, grid: Grid, handling: HandlingParams, weather: WeatherId, start: { x: number; y: number; heading: number }): { time: number; splits: number[] } {
  const race = newRace(track, grid, handling, 1, [{ car: newCar(carClass('f1'), start.x, start.y, start.heading), ai: { lane: 0, pace: 1 } }], 0, weather);
  const marks = stageSplits(track);
  const finish = track.stage?.finish ?? track.length;
  const splits: number[] = [];
  const along = () => race.entrants[0].progress.idx * track.spacing;
  for (let t = 0; t < 600; t += SIM_DT) {
    stepRace(race, SIM_DT);
    if (race.phase !== 'racing') continue;
    while (splits.length < marks.length && along() >= marks[splits.length]) splits.push(race.clock);
    if (along() >= finish) return { time: race.clock, splits };
  }
  return { time: (finish - (track.stage?.start ?? 0)) / 250, splits };
}

/**
 * Each crew's time on stage `k` off the reference run (`reference` s), and what went wrong for any; yours left out
 * (undefined: it's driven).
 */
export function aiStage(r: Rally, k: number, reference: number, difficulty: Difficulty): { times: (number | undefined)[]; notes: (StageNote | undefined)[] } {
  const rng = seededRandom(stageSeed(r, k));
  const total = r.crews.length - 1;
  const times: (number | undefined)[] = [];
  const notes: (StageNote | undefined)[] = [];
  r.crews.forEach((c, i) => {
    // (the dice drawn for every crew alike, yours too, so each crew's luck is its own)
    const spread = rng() * 2 - 1;
    const luck = rng();
    const lost = rng();
    const kind = rng();
    if (i === r.you || c.rank === undefined) {
      times.push(undefined);
      notes.push(undefined);
      return;
    }
    let time = (reference / aiPaceFor(difficulty, c.rank, total)) * (1 + spread * RALLY.spread);
    let note: StageNote | undefined;
    if (luck < RALLY.big.chance) {
      time += RALLY.big.from + lost * (RALLY.big.to - RALLY.big.from);
      note = 'ROLLED';
    } else if (luck < RALLY.big.chance + RALLY.moment.chance) {
      time += RALLY.moment.from + lost * (RALLY.moment.to - RALLY.moment.from);
      note = kind < 0.45 ? 'OFF' : kind < 0.8 ? 'SPIN' : 'PUNCTURE';
    }
    times.push(time);
    notes.push(note);
  });
  return { times, notes };
}

/**
 * Stage `k` run: your time (undefined: you didn't finish it), any penalty in it, the rivals' (aiStage), and your car's
 * health at the end as a share of it. The service park after it repairs the car; a car that didn't finish is patched up.
 */
export function recordStage(r: Rally, k: number, yours: { time?: number; penalty?: number; health: number }, ai: { times: (number | undefined)[]; notes: (StageNote | undefined)[] }): void {
  if (k !== r.stages.length) return;
  const others = ai.times.filter((t): t is number => t !== undefined);
  const slowest = others.length ? Math.max(...others) : 0;
  const times = ai.times.map((t, i) => (i === r.you ? (yours.time ?? slowest + RALLY.notFinished) : (t ?? slowest)));
  const notes = ai.notes.map((n, i) => (i === r.you ? (yours.time === undefined ? 'DNF' : yours.penalty ? 'PENALTY' : undefined) : n));
  r.stages.push({ times, notes });
  r.health = serviceAfter(r, k) ? 1 : yours.time === undefined ? Math.max(RALLY.patched, yours.health) : Math.max(0.05, Math.min(1, yours.health));
}

export interface RallyStanding {
  crew: number;
  total: number;
  /** s behind the leader (0 for the leader) */
  gap: number;
}

/** The standings after the stages run so far: every crew by its total time, the least first. */
export function standings(r: Rally): RallyStanding[] {
  const totals = r.crews.map((_, i) => r.stages.reduce((sum, s) => sum + s.times[i], 0));
  const order = totals.map((total, crew) => ({ crew, total })).sort((a, b) => a.total - b.total || a.crew - b.crew);
  const lead = order[0]?.total ?? 0;
  return order.map((s) => ({ ...s, gap: s.total - lead }));
}

/** Stage `k`'s results: every crew by its time on it, the quickest first. */
export function stageOrder(r: Rally, k: number): { crew: number; time: number; gap: number; note?: StageNote }[] {
  const s = r.stages[k];
  if (!s) return [];
  const order = s.times.map((time, crew) => ({ crew, time, note: s.notes[crew] })).sort((a, b) => a.time - b.time || a.crew - b.crew);
  const best = order[0]?.time ?? 0;
  return order.map((o) => ({ ...o, gap: o.time - best }));
}

/** Your place in the rally so far (1 the leader). */
export const yourPlace = (r: Rally) => standings(r).findIndex((s) => s.crew === r.you) + 1;

/** A gap as the timing screens show it: '+12.34', '+1:02.50'. */
export function gapText(s: number): string {
  if (s < 60) return `+${s.toFixed(2)}`;
  return `+${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, '0')}`;
}

/** A saved rally, if it's a good one. */
export function parseRally(v: unknown): Rally | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const r = v as Rally;
  const ok = r.v === 2 && !!rallyById(r.event) && Number.isInteger(r.seed) && Array.isArray(r.crews) && r.crews.length >= 2 && Number.isInteger(r.you)
    && r.you >= 0 && r.you < r.crews.length && Array.isArray(r.stages) && r.stages.every((s) => Array.isArray(s?.times) && s.times.length === r.crews.length && s.times.every(Number.isFinite))
    && typeof r.health === 'number' && r.crews.every((c, i) => (i === r.you ? !!schemeById(c?.scheme) : !!crewById(c?.crew)));
  return ok ? { ...r, stages: r.stages.map((s) => ({ times: s.times, notes: Array.isArray(s.notes) ? s.notes : s.times.map(() => undefined) })) } : undefined;
}

export const loadRally = (): Rally | undefined => parseRally(saved('rally', 'current'));
export const saveRally = (r: Rally | undefined): void => save('rally', 'current', r);

/** Your best finish in each rally (its place, and your total then). */
export type RallyBests = Record<string, { place: number; total: number }>;
export function loadBests(): RallyBests {
  const v = saved('rally', 'best');
  if (!v || typeof v !== 'object') return {};
  return Object.fromEntries(Object.entries(v as RallyBests).filter(([id, b]) => rallyById(id) && Number.isInteger(b?.place) && Number.isFinite(b?.total)));
}
/** A finished rally's result kept, if it's your best there (a better place, or the same quicker): whether it was. */
export function recordBest(r: Rally): boolean {
  if (!rallyOver(r)) return false;
  const bests = loadBests();
  const place = yourPlace(r);
  const total = standings(r).find((s) => s.crew === r.you)!.total;
  const had = bests[r.event];
  if (had && (had.place < place || (had.place === place && had.total <= total))) return false;
  save('rally', 'best', { ...bests, [r.event]: { place, total } });
  return true;
}

/** Your best time on each stage (s, penalties in), by its id. */
export function loadStageBests(): Record<string, number> {
  const v = saved('rally', 'stages');
  if (!v || typeof v !== 'object') return {};
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter((e): e is [string, number] => typeof e[1] === 'number' && Number.isFinite(e[1]) && e[1] > 0));
}
/** A stage run in `time` s: kept if it's your best there. Whether it was (and there was one before it to beat). */
export function recordStageBest(id: string, time: number): { best: boolean; had?: number } {
  const bests = loadStageBests();
  const had = bests[id];
  if (had !== undefined && had <= time) return { best: false, had };
  save('rally', 'stages', { ...bests, [id]: time });
  return { best: true, had };
}
