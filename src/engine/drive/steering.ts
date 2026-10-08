// The steering wheel between your hands and the front tyres. Whatever you steer with (a thumb dragged across the
// screen, a key, a stick) asks for a wheel position, −1 full left … 1 full right; the wheel turns toward it at a
// steady rate (quicker back to the middle, as a real rack self-centres), so a key tapped is a nudge and held is a bend,
// and nothing jerks. The tyres turn on a curve of the wheel: little near the middle, for the fine corrections a fast
// road wants, and full lock at the ends. Flat out the lock closes a little, never below what the racing line needs
// (the rivals' times come from it). Engine-free.

/** How the wheel turns. */
export const STEERING = {
  /** wheel travel per s toward where you ask (0 to full lock in 1/rate s) */
  rate: 5,
  /** per s back toward the middle (let go, or steering the other way) */
  centre: 8,
  /** the tyres' turn for the wheel's: |wheel| to this power (1: straight; more: softer round the middle) */
  curve: 1.4,
  /** the share of full lock the tyres get at a crawl, and flat out (the racing line uses up to 0.9 of it anywhere) */
  lockSlow: 1,
  lockFast: 0.9,
  /** share of top speed below which there's full lock */
  lockFrom: 0.1,
  /** with the handbrake on, more lock to swing the tail */
  handbrakeLock: 1.3,
};

/** STEERING in the settings: how quick and how far the wheel turns. */
export type SteerFeel = 'gentle' | 'normal' | 'quick';
export const STEER_FEELS: SteerFeel[] = ['gentle', 'normal', 'quick'];
export const FEEL: Record<SteerFeel, { rate: number; lock: number }> = {
  gentle: { rate: 0.7, lock: 0.85 },
  normal: { rate: 1, lock: 1 },
  quick: { rate: 1.35, lock: 1.15 },
};

const clamp1 = (v: number) => Math.max(-1, Math.min(1, v));

/** The wheel `pos` moved toward `target` over `dt` s. */
export function turnWheel(pos: number, target: number, dt: number, feel: SteerFeel = 'normal'): number {
  const want = clamp1(target);
  // (back toward the middle, letting go or steering the other way: the rack's own spring helps; out from it, your hands)
  const centring = pos !== 0 && (Math.abs(want) < Math.abs(pos) || Math.sign(want) !== Math.sign(pos));
  const rate = (centring ? STEERING.centre : STEERING.rate) * FEEL[feel].rate;
  const step = rate * dt;
  return Math.abs(want - pos) <= step ? want : pos + Math.sign(want - pos) * step;
}

/** How far the tyres turn (−1…1, a share of full lock) for the wheel at `pos`, going at `speedShare` of top speed. */
export function tyreTurn(pos: number, speedShare: number, handbrake = false, feel: SteerFeel = 'normal'): number {
  return Math.sign(pos) * Math.abs(pos) ** STEERING.curve * lockAt(speedShare, handbrake, feel);
}

/** The share of full lock the tyres get going at `speedShare` of top speed (0…1). */
export function lockAt(speedShare: number, handbrake = false, feel: SteerFeel = 'normal'): number {
  const s = Math.max(0, Math.min(1, (speedShare - STEERING.lockFrom) / (1 - STEERING.lockFrom)));
  const lock = STEERING.lockSlow + (STEERING.lockFast - STEERING.lockSlow) * s;
  return Math.min(1, lock * FEEL[feel].lock * (handbrake ? STEERING.handbrakeLock : 1));
}
