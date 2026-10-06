// The start: your launch off the line, judged on your reaction to the lights.
// Once all five lights are lit, getting on the throttle before they're out is a
// jump start (5 s added at the flag); after they're out, the time to get on it
// is your reaction, and a quick one gets a better getaway (a kick of speed off
// the line). Already on it as the lights come on, and holding it there, is no
// jump, just an ordinary start; as is one you don't react to within a moment
// and a half. Engine-free and unit-tested; race.ts feeds it the lights and your
// throttle.

export const LAUNCH = {
  /** throttle (0…1) that counts as going */
  gas: 0.4,
  /** s of reaction for a great launch, and for a good one */
  great: 0.25,
  good: 0.45,
  /** s after which a start is just slow (judged, no more) */
  late: 1.5,
  /** px/s of speed a great launch, or a good one, gives you off the line */
  greatKick: 25,
  goodKick: 12,
  /** s added at the flag for a jump start */
  jumpPenalty: 5,
};

export type LaunchVerdict = 'jump' | 'great' | 'good' | 'slow';

export interface Launch {
  /** how the start went, once it's judged */
  verdict?: LaunchVerdict;
  /** s from lights out to on the throttle (for a great, good or slow start) */
  reaction?: number;
  /** on the throttle last frame */
  on?: boolean;
}

export const newLaunch = (): Launch => ({});

/**
 * A frame of the start: `lit`, all five lights are on (the lights phase, waiting for them to go out); `out`, s since
 * they went out (undefined before); `gas`, your throttle. The verdict, on the frame it's reached.
 */
export function stepLaunch(l: Launch, lit: boolean, out: number | undefined, gas: number): LaunchVerdict | undefined {
  const on = gas >= LAUNCH.gas;
  // (a press is getting on the throttle: held from before the first frame, it isn't one)
  const pressed = on && l.on === false;
  l.on = on;
  if (l.verdict) return undefined;
  if (out === undefined) {
    if (lit && pressed) return (l.verdict = 'jump');
    return undefined;
  }
  if (on || out >= LAUNCH.late) {
    l.reaction = out;
    // (on it since before the lights went out: an ordinary start)
    l.verdict = !pressed ? 'slow' : out <= LAUNCH.great ? 'great' : out <= LAUNCH.good ? 'good' : 'slow';
    return l.verdict;
  }
  return undefined;
}

/** px/s of speed straight ahead a verdict gives you off the line. */
export const kickOf = (v: LaunchVerdict): number => (v === 'great' ? LAUNCH.greatKick : v === 'good' ? LAUNCH.goodKick : 0);

/**
 * The AI off the lights: s from lights out to going, quicker the sharper the driver's racecraft, with a bit of luck;
 * now and then a bogged start (less often for a consistent driver). The field leaves the line in a scramble rather
 * than all at once.
 */
export const AI_LAUNCH = { quick: 0.16, slow: 0.42, bog: 0.06, bogFrom: 0.7, bogTo: 1.2 };

/** An AI driver's reaction off the lights (s), from its dice, racecraft (0…1) and consistency (−1…1). */
export function aiReaction(rng: () => number, craft: number, consistency = 0): number {
  const A = AI_LAUNCH;
  if (rng() < A.bog * (1 - 0.6 * consistency)) return A.bogFrom + rng() * (A.bogTo - A.bogFrom);
  return A.quick + (A.slow - A.quick) * (0.6 * rng() + 0.4 * (1 - Math.max(0, Math.min(1, craft))));
}
