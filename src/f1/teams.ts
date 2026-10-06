// The teams: a name, a three-letter code for the timing screens, a livery
// (body, trim, and an optional third colour for the sidepods), and their two
// drivers. A race runs five of them, two cars each: yours (you in the first
// seat, the team's second driver beside you) and four drawn at random.

import type { LiveryPattern } from '../engine/render/vehicles3d';

export interface Team {
  id: string;
  /** three letters, for the timing screens */
  code: string;
  name: string;
  /** main colour */
  body: string;
  /** wings and nose */
  trim: string;
  /** sidepods, when the livery has a third colour */
  accent?: string;
  /** the two drivers, by their three-letter codes: the first seat (yours, when you race for the team), then the second */
  drivers: [string, string];
  /**
   * how the trim colour runs over the top of the car; teams sharing a pattern have
   * far-apart colours, so from above every team differs in shape or colour
   */
  pattern: LiveryPattern;
}

export const TEAMS: Team[] = [
  { id: 'milk-energy', code: 'MLK', name: 'Milk Energy', body: '#1e2b5c', trim: '#f2c14e', pattern: 'nose', drivers: ['VER', 'HAD'] },
  { id: 'prancing-monkey', code: 'PRM', name: 'Prancing Monkey', body: '#dc0000', trim: '#fff200', pattern: 'stripe', drivers: ['HAM', 'LEC'] },
  { id: 'golden-arrows', code: 'GOA', name: 'Golden Arrows', body: '#c6c9d0', trim: '#00d2be', pattern: 'twin', drivers: ['RUS', 'ANT'] },
  { id: 'calrissian', code: 'CAL', name: 'Calrissian Racing', body: '#ff8000', trim: '#1b1b26', pattern: 'halves', drivers: ['NOR', 'PIA'] },
  { id: 'british-lime', code: 'BLI', name: 'British Lime', body: '#00594f', trim: '#cedc00', pattern: 'chevron', drivers: ['ALO', 'STR'] },
  { id: 'renee', code: 'REN', name: 'Reneé', body: '#f7d117', trim: '#1b1b26', pattern: 'band', drivers: ['GAS', 'COL'] },
  { id: 'frankies-groove', code: 'FRG', name: "Frankie's Groove", body: '#1868db', trim: '#f4f4f8', pattern: 'split', drivers: ['ALB', 'SAI'] },
  { id: 'cheaper-milk', code: 'CHM', name: 'Cheaper Milk', body: '#f4f4f8', trim: '#1634cc', pattern: 'stripe', drivers: ['LAW', 'LIN'] },
  { id: 'dmw', code: 'DMW', name: 'Deutche Motor Werke', body: '#1c69d4', trim: '#f4f4f8', pattern: 'chevron', drivers: ['HUL', 'BOR'] },
  { id: 'maas', code: 'MAS', name: 'MaaS', body: '#f4f4f8', trim: '#d8323c', accent: '#8a8d94', pattern: 'halves', drivers: ['OCO', 'BEA'] },
  { id: 'grandmas-fave', code: 'GMF', name: "Grandma's Fave", body: '#1b1b26', trim: '#f4f4f8', pattern: 'twin', drivers: ['BOT', 'PER'] },
];

/** How many teams race at once, two cars each. */
/** A team's car: its first (0) or its second (1), each with its own driver. */
export type Seat = 0 | 1;

export const TEAMS_PER_RACE = 5;

/** The team with this id, or undefined. */
export const teamById = (id: string | null | undefined) => TEAMS.find((t) => t.id === id);

/**
 * For each grid slot, which of its team's two seats it is (0 = the first
 * driver, 1 = the second, who has the bright green T-camera): you, in slot
 * `you`, take `yours` (the first unless you picked the second) and your
 * teammate the other; for the other teams the car further up the grid is the
 * first driver.
 */
export function driverSeats(grid: Team[], you: number, yours: Seat = 0): Seat[] {
  return grid.map((t, i) => {
    if (i === you) return yours;
    if (t === grid[you]) return yours === 0 ? 1 : 0;
    return grid.slice(0, i).includes(t) ? 1 : 0;
  });
}

/** A shuffled copy of `list` (Fisher–Yates), with `rng` returning 0 ≤ x < 1. */
function shuffled<T>(list: T[], rng: () => number): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Each grid slot's team, for `total` cars with the player in slot `you`: the
 * player's team fills two cars (the teammate somewhere else on the grid), and
 * four teams drawn at random fill the rest, two cars each, in a shuffled order.
 */
export function teamGrid(yours: Team, total: number, you: number, rng: () => number = Math.random): Team[] {
  const rivals = shuffled(TEAMS.filter((t) => t !== yours), rng).slice(0, TEAMS_PER_RACE - 1);
  // the other cars: your teammate first, then each rival twice, as many as there are seats
  const cars = [yours, ...rivals.flatMap((t) => [t, t])].slice(0, Math.max(0, total - 1));
  const others = shuffled(cars, rng);
  return Array.from({ length: total }, (_, i) => (i === you ? yours : others[i < you ? i : i - 1]));
}
