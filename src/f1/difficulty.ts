// How hard a race is: how much a crash costs (the damage from hitting a wall,
// landing hard or contact, and how much a damaged car slows), and how quick
// and closely matched the AI field is. It applies to every car alike, so on
// HARD the AI pays for its crashes too. Its racecraft (how boldly the AI passes
// and how hard it defends: racing.ts) rises with it.

import type { HandlingParams } from '../engine/driving';
import { RACE_HANDLING } from './racing';

export type DifficultyId = 'easy' | 'normal' | 'hard';

export interface Difficulty {
  id: DifficultyId;
  name: string;
  /** a line about it, for the menu */
  about: string;
  /** the AI's pace, as a share of the racing line's speed (the quickest AI car) */
  aiPace: number;
  /** how much slower the last AI car on the grid is than the first, as a share of its pace */
  aiSpread: number;
  /** damage per px/s of impact above the crash threshold (walls, landings, contact) */
  crashDamage: number;
  /** share of top speed a car has lost by the time its health runs out */
  damageSlow: number;
  /** the AI's racecraft, 0…1 (each driver a little either side): how boldly it passes, and how hard it defends */
  aiCraft: number;
  /** the chance an AI driver makes a mistake going into a bend (a lock-up or a run wide), before its consistency */
  aiMistakes: number;
  /** the chance an AI driver, close behind another AI car into a braking bend, misjudges it and dives into it (racing.ts), before its aggression */
  aiIncidents: number;
}

export const DIFFICULTIES: Difficulty[] = [
  { id: 'easy', name: 'EASY', about: 'slower AI · crashes forgiven', aiPace: 0.86, aiSpread: 0.08, crashDamage: 0.1, damageSlow: 0.15, aiCraft: 0.3, aiMistakes: 0.08, aiIncidents: 0.06 },
  { id: 'normal', name: 'NORMAL', about: 'a fair fight', aiPace: 0.94, aiSpread: 0.05, crashDamage: 0.2, damageSlow: 0.3, aiCraft: 0.6, aiMistakes: 0.05, aiIncidents: 0.045 },
  { id: 'hard', name: 'HARD', about: 'flat-out AI · crashes cost you', aiPace: 0.985, aiSpread: 0.02, crashDamage: 0.35, damageSlow: 0.4, aiCraft: 0.9, aiMistakes: 0.025, aiIncidents: 0.03 },
];

export const NORMAL = DIFFICULTIES[1];

/** The difficulty with this id, or undefined. */
export const difficultyById = (id: string | null | undefined) => DIFFICULTIES.find((d) => d.id === id);

/** The race's driving rules at this difficulty. */
export const handlingFor = (d: Difficulty): HandlingParams => ({ ...RACE_HANDLING, crashDamage: d.crashDamage, damageSlow: d.damageSlow });

/** An AI driver's racecraft at this difficulty: its own, drawn from `rng`, within 0.15 either side, plus its style's aggression. */
export const aiCraftFor = (d: Difficulty, rng: () => number, aggression = 0) => Math.max(0, Math.min(1, d.aiCraft + aggression + (rng() * 2 - 1) * 0.15));

/** An AI driver's chance of diving into the AI car ahead, when it's close behind it into a braking bend, at this difficulty: the more aggressive its style, the likelier. */
export const aiIncidentsFor = (d: Difficulty, aggression = 0) => d.aiIncidents * Math.max(0.3, 1 + 2 * aggression);

/** An AI driver's chance of a mistake into each bend at this difficulty, for its style's consistency. */
export const aiMistakesFor = (d: Difficulty, consistency = 0) => d.aiMistakes * (1 - 0.6 * consistency);

/**
 * Each grid slot's pace rank (0 = the quickest car): mostly in grid order, but
 * each car moved up to `mix` places either way (drawn from `rng`), as a grid
 * after qualifying with its mistakes: some quicker cars start behind slower
 * ones and have to race past.
 */
export function paceRanks(total: number, rng: () => number, mix = 3): number[] {
  const keyed = Array.from({ length: total }, (_, i) => ({ i, k: i + (rng() * 2 - 1) * mix }));
  const ranks = new Array<number>(total);
  keyed.sort((a, b) => a.k - b.k).forEach((c, r) => (ranks[c.i] = r));
  return ranks;
}

/** The pace of the AI car of pace rank `i` of `total` (0 the quickest), times the TUNE panel's adjustment. */
export const aiPaceFor = (d: Difficulty, i: number, total: number, adjust = 1) => d.aiPace * adjust * (1 - (i / total) * d.aiSpread);
