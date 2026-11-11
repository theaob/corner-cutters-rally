// CONTROL: POINT, TOP-DOWN's steering. You point the way you want to go on the screen (a thumb dragged from where it
// landed, the arrow keys, a stick) and the car turns to go that way: up the screen is up, whichever way the car faces.
// Point roughly down the road and the road takes your aim, pulling it along the road and toward its middle (as much
// as ASSIST gives); point well away from it (across the inside of a bend, say) and you go exactly where you point.
// Let go and the car holds its course. The speed looks after itself: the car slows for what's ahead (race.ts works out
// how fast it can take it), and BRAKE slows it more. Engine-free.

import type { AssistLevel } from './assist';

export const POINT = {
  /** radians: an aim this close to the road's way is pulled onto it (all the way within half of it, fading to none at
   * its edge) */
  snap: 0.75,
  /** radians of turn back toward the middle per px off it, and the most it turns back */
  across: 0.012,
  acrossMost: 0.45,
  /** px/s over the speed the road ahead allows before the brakes come on (under it, the car eases off the gas) */
  brakeOver: 6,
  /** radians between where the car points and where you aim it, braking, that slide it (the handbrake: TOP-DOWN's
   * slide), at at least SLIDE.from of top speed */
  slide: 0.9,
};

/** How hard the road pulls your aim at each ASSIST level (0: not at all, 1: onto it). */
export const POINT_PULL: Record<AssistLevel, number> = { off: 0, light: 0.75, strong: 1 };

/** b − a, the short way round (radians). */
export const turnBetween = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

/** A way on the map (radians: 0 north, clockwise) for a direction (x right, y down: south). */
export const wayOf = (x: number, y: number) => Math.atan2(x, -y);

/**
 * The way on the map for a direction pointed on the screen (x right, y down), through a camera turned `yaw` (radians;
 * 0 north up) and pitched so the ground's north-south shows `squash` as long as it is (the CLASSIC view: sin(pitch)).
 */
export function screenToMap(sx: number, sy: number, yaw = 0, squash = 1): { x: number; y: number } {
  const y = sy / Math.max(0.2, squash);
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return { x: sx * c - y * s, y: sx * s + y * c };
}

/** The road as POINT steers by it: its way a little ahead, and px right of its middle the car is. */
export interface RoadWay {
  dir: number;
  lateral: number;
}

/** The way the road would have you go: along it, turned back toward its middle. */
export function roadAim(road: RoadWay): number {
  const back = Math.max(-POINT.acrossMost, Math.min(POINT.acrossMost, -road.lateral * POINT.across));
  return road.dir + back;
}

/** Where the car steers for an `aim` (radians on the map), the road pulling it as much as `level` gives. */
export function pulledAim(aim: number, road: RoadWay | undefined, level: AssistLevel): number {
  if (!road) return aim;
  const along = roadAim(road);
  const off = Math.abs(turnBetween(aim, road.dir));
  const pull = POINT_PULL[level] * Math.max(0, Math.min(1, 2 * (1 - off / POINT.snap)));
  return aim + pull * turnBetween(aim, along);
}
