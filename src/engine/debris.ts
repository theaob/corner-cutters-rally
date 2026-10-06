// Debris: a part torn off a car in a big crash (a nose, a wheel), thrown clear
// and tumbling, bouncing on the ground (and up and down hills) until it comes to
// rest, then lying there a while before it's gone. Only for the picture: nothing
// hits it. Pure (the renderer draws a piece where this says it is).

/** Debris tuning (px, px/s, s). */
export const DEBRIS = {
  /** px/s² down (more than the cars fall off a ramp: a piece is up and down again in under a second, a car length or so high) */
  gravity: 600,
  /** share of the speed into the ground a piece keeps, bouncing back up */
  bounce: 0.38,
  /** share of its speed along the ground a piece keeps at each bounce */
  scrub: 0.7,
  /** px/s: slower than this into the ground, and a piece stops bouncing and slides */
  settle: 30,
  /** px/s² a piece sliding along the ground slows by */
  slide: 420,
  /** s a piece lies at rest before it's gone (it sinks away over the last second) */
  lies: 8,
};

export interface Piece {
  /** where it is: x and y on the ground plane, h up (px) */
  x: number;
  y: number;
  h: number;
  vx: number;
  vy: number;
  vh: number;
  /** its tumble (radians) about the ground's x, up and y axes, and how fast it turns (rad/s); at rest, only its turn about the up axis is left (it lies in its resting pose) */
  rot: [number, number, number];
  spin: [number, number, number];
  /** on the ground and still */
  rest: boolean;
  /** s since it came to rest */
  rested: number;
}

/**
 * A piece torn off a car at (x, y, h), thrown `out` (a unit direction on the ground) from a car moving at (vx, vy):
 * it carries on with some of the car's speed, flung outward and up harder the bigger `power` (0…1) is.
 */
export function fling(x: number, y: number, h: number, vx: number, vy: number, out: { x: number; y: number }, power: number, rng: () => number = Math.random): Piece {
  const kick = 50 + 100 * power * (0.6 + 0.4 * rng());
  const keep = 0.55 + 0.2 * rng();
  const spin = () => (rng() - 0.5) * 24 * (0.5 + power);
  return {
    x, y, h,
    vx: vx * keep + out.x * kick,
    vy: vy * keep + out.y * kick,
    vh: 90 + 120 * power * (0.6 + 0.4 * rng()),
    rot: [0, 0, 0],
    spin: [spin(), spin(), spin()],
    rest: false,
    rested: 0,
  };
}

/** Move `p` on `dt` s over ground `ground(x, y)` px high. */
export function stepPiece(p: Piece, dt: number, ground: (x: number, y: number) => number): void {
  if (p.rest) {
    p.rested += dt;
    return;
  }
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.vh -= DEBRIS.gravity * dt;
  p.h += p.vh * dt;
  for (let k = 0; k < 3; k++) p.rot[k] += p.spin[k] * dt;
  const floor = ground(p.x, p.y);
  if (p.h > floor) return;
  // on (or into) the ground: bounce, or slide once there's too little left to bounce
  p.h = floor;
  if (-p.vh > DEBRIS.settle) {
    p.vh = -p.vh * DEBRIS.bounce;
    p.vx *= DEBRIS.scrub;
    p.vy *= DEBRIS.scrub;
    for (let k = 0; k < 3; k++) p.spin[k] *= DEBRIS.scrub;
    return;
  }
  p.vh = 0;
  const v = Math.hypot(p.vx, p.vy);
  const slower = Math.max(0, v - DEBRIS.slide * dt);
  p.vx = v ? (p.vx * slower) / v : 0;
  p.vy = v ? (p.vy * slower) / v : 0;
  for (let k = 0; k < 3; k++) p.spin[k] *= Math.max(0, 1 - 6 * dt);
  // (sliding, it rocks down into its resting pose: its tumble about the ground's axes eased out, a whole turn at a time)
  const ease = Math.min(1, 8 * dt);
  for (const k of [0, 2]) p.rot[k] += (Math.round(p.rot[k] / (2 * Math.PI)) * 2 * Math.PI - p.rot[k]) * ease;
  if (slower === 0) {
    p.rest = true;
    p.rot[0] = p.rot[2] = 0;
    p.spin = [0, 0, 0];
  }
}

/** Whether a piece has lain long enough to go. */
export const gone = (p: Piece) => p.rest && p.rested >= DEBRIS.lies;

/** How far a piece at rest has sunk out of sight (0…1), over its last second. */
export const sunk = (p: Piece) => (p.rest ? Math.min(1, Math.max(0, p.rested - (DEBRIS.lies - 1))) : 0);
