// Time Attack: beat the clock. On your own, from the same standing run-up as a
// Time Trial; at the line a countdown starts, with a little more than a
// sector's worth of time on it, and each checkpoint you pass (each sector's end,
// the line included) adds time: the sector's par (a third of the AI's reference
// lap) times a factor that's generous on the first lap and shrinks lap by lap,
// so the clock wins in the end. A cut across a marked corner costs time. When
// it runs out: TIME UP, and how far you got (laps and sectors) is the result,
// your best on each circuit (and weather) kept as a record. Engine-free.

import type { Difficulty } from './difficulty';
import { SECTORS } from './racing';

export const ATTACK = {
  /** pars on the clock at the line (to reach the first checkpoint, with a little to spare) */
  grace: 1.15,
  /** a checkpoint on the first lap adds its par times this… */
  first: 1.1,
  /** …less this for each lap after… */
  fade: 0.04,
  /** …down to this */
  floor: 0.6,
  /** seconds off the clock for a cut across a marked corner */
  cut: 3,
};

/** How generous the clock is at each difficulty (the time each checkpoint adds, ×). */
const GENEROUS: Record<string, number> = { easy: 1.08, normal: 1, hard: 0.95 };

export interface Attack {
  /** s: a sector's par (a third of the reference lap) */
  par: number;
  /** × the time each checkpoint adds, for the difficulty */
  generous: number;
  /** s left on the clock; undefined until you cross the line */
  left?: number;
  /** checkpoints passed since the line (a lap is SECTORS of them) */
  passed: number;
  /** the clock ran out */
  over: boolean;
  /** s since the clock started, and when the last checkpoint was passed (two runs as far: the quicker there is ahead) */
  elapsed: number;
  lastAt: number;
}

export function newAttack(referenceLap: number, difficulty?: Difficulty): Attack {
  return { par: referenceLap / SECTORS, generous: GENEROUS[difficulty?.id ?? 'normal'] ?? 1, passed: 0, over: false, elapsed: 0, lastAt: 0 };
}

/** Seconds checkpoint `k` (0: the first after the line) adds to the clock. */
export function bonus(a: Attack, k: number): number {
  const lap = Math.floor(k / SECTORS);
  return a.par * a.generous * Math.max(ATTACK.floor, ATTACK.first - ATTACK.fade * lap);
}

export interface AttackStep {
  /** the clock started this step (you crossed the line) */
  started?: boolean;
  /** seconds added at a checkpoint passed this step */
  added?: number;
  /** seconds taken off for a cut this step */
  lost?: number;
  /** the clock ran out this step */
  timeUp?: boolean;
}

/**
 * One step of the clock, `dt` s: `started` once you've crossed the line, `passed` the checkpoints you've passed since
 * (laps × SECTORS + sectors this lap), `cut` whether you cut a corner this step.
 */
export function stepAttack(a: Attack, dt: number, started: boolean, passed: number, cut: boolean): AttackStep {
  const out: AttackStep = {};
  if (a.over || !started) return out;
  if (a.left === undefined) {
    a.left = a.par * ATTACK.grace;
    out.started = true;
  }
  while (passed > a.passed) {
    const add = bonus(a, a.passed);
    a.left += add;
    out.added = (out.added ?? 0) + add;
    a.passed++;
    a.lastAt = a.elapsed;
  }
  if (cut) {
    a.left -= ATTACK.cut;
    out.lost = ATTACK.cut;
  }
  a.left -= dt;
  a.elapsed += dt;
  if (a.left <= 0) {
    a.left = 0;
    a.over = true;
    out.timeUp = true;
  }
  return out;
}

/** How far `passed` checkpoints is, short, where room is tight (the readout, the share card): '5L 1S', '5L', '2S', '0S'. */
export function shortDistance(passed: number): string {
  const laps = Math.floor(passed / SECTORS);
  const sectors = passed % SECTORS;
  return laps ? (sectors ? `${laps}L ${sectors}S` : `${laps}L`) : `${sectors}S`;
}

/** How far `passed` checkpoints is, as said on the screen: '2 LAPS + 1 SECTOR', '1 LAP', '2 SECTORS', 'NO SECTORS'. */
export function distance(passed: number): string {
  const laps = Math.floor(passed / SECTORS);
  const sectors = passed % SECTORS;
  const part = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 'S'}`;
  if (!laps) return sectors ? part(sectors, 'SECTOR') : 'NO SECTORS';
  return sectors ? `${part(laps, 'LAP')} + ${part(sectors, 'SECTOR')}` : part(laps, 'LAP');
}
