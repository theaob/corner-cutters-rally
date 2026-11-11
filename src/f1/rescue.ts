// TOP-DOWN's way back onto the road: a car stopped off it (among the trees, nose in a bank) for a few seconds is put back
// on the road where it left it, facing down it, at a cost to its time. Engine-free.

export const RESCUE = {
  /** s stopped off the road before the car is put back */
  after: 3,
  /** px/s: slower than this counts as stopped */
  stopped: 25,
  /** px out from the road's middle that's off it (the road is HALF_WIDTH each side: circuit.ts) */
  off: 52,
  /** s added to the stage time */
  cost: 2,
};

export interface Rescue {
  /** s stopped off the road so far */
  stuck: number;
}

export const newRescue = (): Rescue => ({ stuck: 0 });

/** One step (`dt` s) of a car `out` px from the road's middle going `speed` px/s: true when it's time to put it back. */
export function stepRescue(r: Rescue, out: number, speed: number, dt: number): boolean {
  if (Math.abs(out) < RESCUE.off || speed >= RESCUE.stopped) {
    r.stuck = 0;
    return false;
  }
  r.stuck += dt;
  if (r.stuck < RESCUE.after) return false;
  r.stuck = 0;
  return true;
}
