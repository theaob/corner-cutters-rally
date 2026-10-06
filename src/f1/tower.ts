// The broadcast touches of a race: the timing tower (the top three, then the
// cars around you, as on TV), and the overtake callouts (who you passed, or who
// passed you, between one frame's order and the next). Engine-free and tested.

/** The places the tower shows: the top `top`, then (if you're further back) a gap and the car either side of you. */
export function towerRows(order: number[], you: number, top = 3): (number | 'gap')[] {
  const at = order.indexOf(you);
  if (at < top + 2) return order.slice(0, Math.max(top, at + 2));
  const near = order.slice(at - 1, at + 2);
  return [...order.slice(0, top), 'gap', ...near];
}

/** A tower gap: the leader, a gap in s, laps behind, or none yet. */
export function towerGap(place: number, gap: number | undefined, lapsDown: number): string {
  if (place === 1) return 'LEAD';
  if (lapsDown > 0) return `+${lapsDown}L`;
  return gap === undefined ? '' : `+${gap.toFixed(1)}`;
}

export type Overtake = { kind: 'passed' | 'passed-by'; other: number; place: number };

/**
 * What changed for you between `was` and `now` (orders, first to last): the car you went by, or the car that went by
 * you (the one now just behind you or just ahead), and your place now. None if your place didn't change.
 */
export function overtakeOf(was: number[], now: number[], you: number): Overtake | undefined {
  const a = was.indexOf(you);
  const b = now.indexOf(you);
  if (a < 0 || b < 0 || a === b) return undefined;
  if (b < a) {
    // the car now just behind you, which was ahead
    const other = now[b + 1];
    return other !== undefined && was.indexOf(other) < a ? { kind: 'passed', other, place: b + 1 } : undefined;
  }
  const other = now[b - 1];
  return other !== undefined && was.indexOf(other) > a ? { kind: 'passed-by', other, place: b + 1 } : undefined;
}
