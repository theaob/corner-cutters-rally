// Retention from retention_stats() (supabase/schema.sql): players grouped by the day they first appeared, and how many
// were back exactly 1, 7 and 30 days later. Counts only; the cohort maths is here so it can be tested.

export interface Cohort {
  day: string;
  size: number;
  d1: number;
  d7: number;
  d30: number;
}
export interface Retention {
  today: string;
  cohorts: Cohort[];
}

export const MARKS = [1, 7, 30] as const;
export type Mark = (typeof MARKS)[number];

const DAY_MS = 86400000;
/** Whole UTC days from `from` to `to` (both YYYY-MM-DD). */
const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);

/** Has the cohort of `day` lived long enough for its day-`mark` to be known (a full UTC day has passed)? */
export const mature = (day: string, mark: Mark, today: string) => daysBetween(day, today) > mark;

/** Overall day-`mark` retention, 0 to 1, over the cohorts old enough to know it; undefined when there are none. */
export function rate(r: Retention, mark: Mark): { rate: number; back: number; of: number } | undefined {
  const key = `d${mark}` as const;
  const old = r.cohorts.filter((c) => mature(c.day, mark, r.today));
  const of = old.reduce((n, c) => n + c.size, 0);
  if (!of) return undefined;
  const back = old.reduce((n, c) => n + c[key], 0);
  return { rate: back / of, back, of };
}

/** A cohort's day-`mark` share, 0 to 1, or undefined while it isn't old enough (or is empty). */
export const cohortRate = (c: Cohort, mark: Mark, today: string) =>
  mature(c.day, mark, today) && c.size ? c[`d${mark}` as const] / c.size : undefined;
