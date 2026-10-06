// Achievements: things to do in the game, each unlocked once and kept (in the
// save's 'trophies' section, with the medals and titles), shown in the trophy
// cabinet and announced with a toast as they're won. Most are judged at your
// flag from how the race went (raceAchievements); some as they happen (a
// launch, a jump start, cars hit off the start, a stop, lapping a car, a
// wreck); and the medals'
// and the Championship's as those are won. Engine-free but for the save.

import { save, saved } from '../engine/save';
import type { Trophies } from './medals';

export interface Achievement {
  id: string;
  name: string;
  /** what it takes */
  about: string;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'finish', name: 'CHEQUERED', about: 'Finish a race' },
  { id: 'podium', name: 'PODIUM', about: 'Finish a race in the top three' },
  { id: 'win', name: 'WINNER', about: 'Win a race' },
  { id: 'hard-win', name: 'GIANT KILLER', about: 'Win a race on HARD' },
  { id: 'wet-win', name: 'RAIN MASTER', about: 'Win a race in the wet' },
  { id: 'from-back', name: 'FROM THE BACK', about: 'Win from the back half of the grid' },
  { id: 'charge', name: 'CHARGE', about: 'Gain five places in a race' },
  { id: 'hat-trick', name: 'HAT TRICK', about: 'Pole, the win and the fastest lap in one race' },
  { id: 'spotless', name: 'SPOTLESS', about: 'Finish a race with no damage and no track-limits warnings' },
  { id: 'purple', name: 'PURPLE PATCH', about: "Set a race's fastest lap" },
  { id: 'endurance', name: 'ENDURANCE', about: 'Finish a race of 15 laps or more' },
  { id: 'bald', name: 'BALD', about: 'Finish a race on tyres worn down to 0%' },
  { id: 'torch', name: 'TORCH', about: 'Finish a race with your car on fire' },
  { id: 'rocket', name: 'ROCKET START', about: 'Get a GREAT LAUNCH off the lights' },
  { id: 'too-keen', name: 'TOO KEEN', about: 'Jump the start' },
  { id: 'torpedo', name: 'TORPEDO', about: 'Hit three cars or more off the start at the Ardennes' },
  { id: 'box', name: 'BOX, BOX', about: 'Make a pit stop' },
  { id: 'no-stop', name: "CAN'T STOP WON'T STOP", about: 'Finish a race without a pit stop' },
  { id: 'lapped', name: 'LAPPED', about: 'Lap a car' },
  { id: 'scrapheap', name: 'SCRAPHEAP', about: 'Wreck your car' },
  { id: 'golden', name: 'GOLDEN', about: 'Win a gold medal' },
  { id: 'gold-standard', name: 'GOLD STANDARD', about: 'A Time Trial gold on every circuit' },
  { id: 'champion', name: 'CHAMPION', about: 'Win a Championship' },
  { id: 'globetrotter', name: 'GLOBETROTTER', about: 'Race on every circuit' },
];

export const achievementById = (id: string): Achievement | undefined => ACHIEVEMENTS.find((a) => a.id === id);

/** How a race went for you, at your flag. */
export interface RaceSummary {
  /** your place (1 = the win) and the field's size */
  place: number;
  field: number;
  /** where you started (1 = pole) */
  grid: number;
  /** you set the race's fastest lap */
  fastest: boolean;
  /** you took damage, or a track-limits warning (or worse) */
  damaged: boolean;
  strikes: number;
  laps: number;
  difficulty: string;
  weather: string;
  /** % of your tyres left at the flag, as the readout shows it */
  tyresLeft?: number;
  /** your car on fire as you took the flag */
  burning?: boolean;
  /** your pit stops in the race */
  stops?: number;
}

/** The achievements a finished race earns. */
export function raceAchievements(r: RaceSummary): string[] {
  const won = r.place === 1;
  const out = ['finish'];
  if (r.place <= 3) out.push('podium');
  if (won) out.push('win');
  if (won && r.difficulty === 'hard') out.push('hard-win');
  if (won && r.weather === 'wet') out.push('wet-win');
  if (won && r.grid > Math.ceil(r.field / 2)) out.push('from-back');
  if (r.grid - r.place >= 5) out.push('charge');
  if (won && r.grid === 1 && r.fastest) out.push('hat-trick');
  if (!r.damaged && r.strikes === 0) out.push('spotless');
  if (r.fastest) out.push('purple');
  if (r.laps >= 15) out.push('endurance');
  if (r.tyresLeft !== undefined && r.tyresLeft <= 0) out.push('bald');
  if (r.burning) out.push('torch');
  if (r.stops === 0) out.push('no-stop');
  return out;
}

/** The medals' achievements, from the cabinet: a gold anywhere, and a Time Trial gold on every one of `circuits`. */
export function medalAchievements(t: Trophies, circuits: string[]): string[] {
  const out: string[] = [];
  const golds = Object.values(t.medals).flatMap((m) => [m.trial, m.attack]).filter((m) => m === 'gold');
  if (golds.length) out.push('golden');
  if (circuits.length && circuits.every((id) => t.medals[id]?.trial === 'gold')) out.push('gold-standard');
  if (t.titles > 0) out.push('champion');
  return out;
}

/** The achievements unlocked so far (ids), as saved. */
export function unlockedAchievements(): string[] {
  const v = saved('trophies', 'achievements');
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!achievementById(x)) : [];
}

/** Unlock `ids`: the ones that weren't already (saved), in the list's order. */
export function unlock(ids: string[]): Achievement[] {
  const had = new Set(unlockedAchievements());
  const fresh = ACHIEVEMENTS.filter((a) => ids.includes(a.id) && !had.has(a.id));
  if (fresh.length) save('trophies', 'achievements', [...had, ...fresh.map((a) => a.id)]);
  return fresh;
}

/** s after the lights go out that count as the start, for TORPEDO */
export const TORPEDO = { circuit: 'ardennes', window: 8, cars: 3 };

/** TORPEDO's due: the cars you've touched (`hit`, their places in the field) so far off the start, on `circuit`. */
export const torpedo = (circuit: string, hit: Set<number>): boolean => circuit === TORPEDO.circuit && hit.size >= TORPEDO.cars;

/** You raced on circuit `id`: true (and GLOBETROTTER's due) once that makes every one of `circuits`. */
export function raced(id: string, circuits: string[]): boolean {
  const v = saved('trophies', 'raced');
  const list = Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  if (!list.includes(id)) save('trophies', 'raced', [...list, id]);
  const all = new Set([...list, id]);
  return circuits.every((c) => all.has(c));
}
