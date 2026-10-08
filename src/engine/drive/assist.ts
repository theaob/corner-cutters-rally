// ASSIST in the settings: a hand on the wheel that knows the road. It steers you toward where the road goes a little
// ahead, and back toward its middle, and gives way to you: the harder you steer yourself, the less it does, and at
// full lock it does nothing. It never touches the gas or the brakes. Engine-free.

export type AssistLevel = 'off' | 'light' | 'strong';
export const ASSIST_LEVELS: AssistLevel[] = ['off', 'light', 'strong'];
/** How much of its steering the assist adds at each level. */
export const ASSIST_SHARE: Record<AssistLevel, number> = { off: 0, light: 0.35, strong: 0.7 };

/** How the assist reads the road. */
export const ASSIST = {
  /** wheel per radian the road ahead turns away from the car */
  heading: 1.8,
  /** wheel per px off the road's middle (the road is 88 px wide: from the edge, a quarter of a turn back) */
  across: 0.006,
};

/** The road as the assist sees it: which way it goes a little ahead (radians, as a heading), and how far right of
 * its middle the car is (px). */
export interface RoadAhead {
  dir: number;
  lateral: number;
}

const clamp1 = (v: number) => Math.max(-1, Math.min(1, v));
/** b − a, the short way round (radians). */
const turnBetween = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

/** The wheel position the assist would steer to, on its own (−1…1). */
export function roadSteer(heading: number, road: RoadAhead): number {
  return clamp1(ASSIST.heading * turnBetween(heading, road.dir) - ASSIST.across * road.lateral);
}

/** Where you steer (`yours`, −1…1) with the assist's hand added: as much of it as `level` gives, less the more you steer. */
export function assisted(yours: number, heading: number, road: RoadAhead | undefined, level: AssistLevel): number {
  if (!road || level === 'off') return clamp1(yours);
  return clamp1(yours + ASSIST_SHARE[level] * roadSteer(heading, road) * (1 - Math.abs(clamp1(yours))));
}
