// Medals and the trophy cabinet. On each circuit a Time Trial lap and a Time
// Attack run earn bronze, silver or gold: a lap as quick as the quickest AI car
// on EASY is bronze, on NORMAL silver, on HARD gold (each a share of the AI's
// reference lap on its own, flat out: its pace at that difficulty); a Time
// Attack run as far as a driver lapping at NORMAL's or HARD's pace gets before
// the clock runs out is silver or gold, and a lap at least bronze. The best medal on each circuit (whatever the weather) is kept, with the
// Championships you've won, in the save's 'trophies' section. Engine-free but
// for the save; the thresholds are unit-tested.

import { save, saved } from '../engine/save';
import { ATTACK, bonus, newAttack } from './timeAttack';
import { DIFFICULTIES } from './difficulty';
import { SECTORS } from './racing';

export type Medal = 'bronze' | 'silver' | 'gold';
export const MEDALS: Medal[] = ['bronze', 'silver', 'gold'];
export const MEDAL_NAME: Record<Medal, string> = { bronze: 'BRONZE', silver: 'SILVER', gold: 'GOLD' };
export const MEDAL_COLOR: Record<Medal, string> = { bronze: '#d08a4e', silver: '#c9cfdc', gold: '#f2c14e' };

/** The pace (a share of the reference lap's speed) each medal asks for: the quickest AI's on EASY, NORMAL and HARD. */
const paceOf = (id: string) => DIFFICULTIES.find((d) => d.id === id)!.aiPace;
export const MEDAL_PACE: Record<Medal, number> = { bronze: paceOf('easy'), silver: paceOf('normal'), gold: paceOf('hard') };

/** The better of two medals (or none). */
export const better = (a?: Medal, b?: Medal): Medal | undefined => (!a ? b : !b ? a : MEDALS.indexOf(a) >= MEDALS.indexOf(b) ? a : b);

/** The medal after `held` (bronze if none; none after gold). */
export const nextMedal = (held?: Medal): Medal | undefined => (held ? MEDALS[MEDALS.indexOf(held) + 1] : 'bronze');

/** s: the lap each medal asks for, on a circuit whose reference lap is `reference`. */
export const lapTargets = (reference: number): Record<Medal, number> =>
  Object.fromEntries(MEDALS.map((m) => [m, reference / MEDAL_PACE[m]])) as Record<Medal, number>;

/** The medal a lap of `time` s earns (none if slower than bronze). */
export function lapMedal(time: number, reference: number): Medal | undefined {
  const t = lapTargets(reference);
  return [...MEDALS].reverse().find((m) => time <= t[m] + 1e-9);
}

/**
 * Checkpoints a driver lapping at `pace` (a share of the reference lap's speed) gets past in a Time Attack before the
 * clock runs out: each checkpoint (a third of a lap) takes them par / pace, and adds its bonus to the clock.
 */
export function attackReach(pace: number, generous = 1): number {
  const a = newAttack(SECTORS, undefined);
  a.generous = generous;
  let left = a.par * ATTACK.grace;
  let passed = 0;
  for (;;) {
    left -= a.par / pace;
    if (left < 0 || passed > 999) return passed;
    left += bonus(a, passed);
    passed++;
  }
}

/**
 * Checkpoints each medal asks for in a Time Attack (at the difficulty's `generous`): silver and gold as far as a
 * driver at their pace gets; bronze a lap at least (at EASY's pace the clock wins from the start).
 */
export function attackTargets(generous = 1): Record<Medal, number> {
  const bronze = Math.max(SECTORS, attackReach(MEDAL_PACE.bronze, generous));
  const silver = Math.max(bronze + 1, attackReach(MEDAL_PACE.silver, generous));
  return { bronze, silver, gold: Math.max(silver + 1, attackReach(MEDAL_PACE.gold, generous)) };
}

/** The medal a Time Attack run of `passed` checkpoints earns. */
export function attackMedal(passed: number, generous = 1): Medal | undefined {
  const t = attackTargets(generous);
  return [...MEDALS].reverse().find((m) => passed >= t[m]);
}

export type MedalKind = 'trial' | 'attack';

export interface Trophies {
  /** the best medal on each circuit (by id), in a Time Trial and a Time Attack */
  medals: Record<string, Partial<Record<MedalKind, Medal>>>;
  /** Championships won */
  titles: number;
}

/** Trophies from a saved value (anything odd left out). */
export function parseTrophies(v: unknown): Trophies {
  const out: Trophies = { medals: {}, titles: 0 };
  if (!v || typeof v !== 'object') return out;
  const { medals, titles } = v as { medals?: unknown; titles?: unknown };
  if (typeof titles === 'number' && Number.isInteger(titles) && titles > 0) out.titles = titles;
  if (medals && typeof medals === 'object') {
    for (const [id, m] of Object.entries(medals as Record<string, unknown>)) {
      if (!m || typeof m !== 'object') continue;
      const got: Partial<Record<MedalKind, Medal>> = {};
      for (const kind of ['trial', 'attack'] as const) {
        const medal = (m as Record<string, unknown>)[kind];
        if (MEDALS.includes(medal as Medal)) got[kind] = medal as Medal;
      }
      if (Object.keys(got).length) out.medals[id] = got;
    }
  }
  return out;
}

export const loadTrophies = (): Trophies => parseTrophies({ medals: saved('trophies', 'medals'), titles: saved('trophies', 'titles') });

/** Award `medal` for `kind` on circuit `id`: true (and saved) if it's better than the one there. */
export function awardMedal(id: string, kind: MedalKind, medal: Medal | undefined): boolean {
  if (!medal) return false;
  const t = loadTrophies();
  const was = t.medals[id]?.[kind];
  if (better(was, medal) === was) return false;
  t.medals[id] = { ...t.medals[id], [kind]: medal };
  save('trophies', 'medals', t.medals);
  return true;
}

/** A Championship won. */
export function awardTitle(): void {
  save('trophies', 'titles', loadTrophies().titles + 1);
}
