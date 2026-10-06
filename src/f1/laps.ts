// How long a race is. A Championship round is its season's length (a SPRINT
// season's RACE_LAPS, a GRAND PRIX season's GRAND_PRIX_LAPS: long enough for
// a two-stop), so a season's rounds are alike; a Quick Race is as many laps as the menu's LAPS row says
// (remembered, in the save's choices). Five laps is long enough that worn tyres
// make a pit stop worth it (a set lasts about two laps at its best).

export const RACE_LAPS = 5;
/** A GRAND PRIX season's rounds. */
export const GRAND_PRIX_LAPS = 10;
/** A season's lengths, as its LENGTH row shows them. */
export const SEASON_LENGTHS = [
  { laps: RACE_LAPS, name: 'SPRINT' },
  { laps: GRAND_PRIX_LAPS, name: 'GRAND PRIX' },
] as const;
/** A season's length by its laps (a season saved before there was a choice: a SPRINT). */
export const seasonLength = (laps: unknown) => SEASON_LENGTHS.find((l) => l.laps === laps) ?? SEASON_LENGTHS[0];

/** The race lengths the LAPS row steps through. */
export const LAP_CHOICES = [1, 2, 3, 5, 7, 10, 15, 20] as const;

/** A saved race length, if it's one of the choices; else the default. */
export function lapsFrom(saved: unknown): number {
  const n = Number(saved);
  return (LAP_CHOICES as readonly number[]).includes(n) ? n : RACE_LAPS;
}

/** A short line about a race of `n` laps, for the menu. */
export function lapsAbout(n: number): string {
  if (n === 1) return 'a sprint, flat out';
  if (n <= 3) return 'short: no tyre stop';
  if (n <= 5) return 'a tyre stop pays';
  if (n <= 10) return 'one or two tyre stops';
  return 'endurance: stops, strategy';
}
