// The Riviera: a mountainside falling south into the sea, the road cut into it. The shore follows the road's
// southernmost stretches, a little way out from them, so wherever the road is the last thing before the sea it runs
// along the cliff's edge above it (a corniche), round bays and out round capes; from the shore the land climbs
// steadily north, and the road with it: going north is going up. Where the road runs across the slope it's a ledge
// cut in it: a rock face rising on its north side, a stone parapet and a drop on its south. The camera looks down
// from the south, so the faces are in full view behind the road and nothing tall ever stands in front of it. Here
// and there the road goes through the rock: a tunnel. Engine-free and unit-tested.

import type { Pt } from './racing';

export const RIVIERA = {
  /** px from the road's southern edge of the map out to the shore, at the least */
  shore: 84,
  /** px east or west the shore takes to fall back a px north from a stretch of road (a bay's sides: 1 in this many) */
  bay: 1.5,
  /** px between the shore's points along the map, and px either way it's smoothed over */
  step: 40,
  smooth: 120,
  /** px the land stands above the sea at the shore, and px it climbs per px north of it */
  beach: 26,
  grade: 0.05,
  /** px it falls per px south of the shore, into the sea (whose level is 0) */
  dip: 1.5,
  /** the ledge: px the rock face rises north of the road (the drop falls south of it), over `run` px from the roadside; and px on over which the ground eases back to the mountainside */
  face: 56,
  run: 26,
  ease: 240,
  /** a tunnel's roof: px above the road; and px from the centreline to its walls */
  roof: 22,
  wall: 6,
};

export interface Riviera {
  /** the shore: its y (px, the layout's) at every `RIVIERA.step` px of x from 0 */
  coast: number[];
}

/** The shore for a road through `points`: `RIVIERA.shore` px out from its southernmost stretches, bays between them. */
export function coastOf(points: Pt[]): Riviera {
  const { step, shore, bay, smooth } = RIVIERA;
  const cols = Math.ceil(Math.max(...points.map((p) => p.x)) / step) + 8;
  // the road's southernmost point in each column
  const south = new Array<number>(cols).fill(-Infinity);
  for (const p of points) {
    const k = Math.max(0, Math.min(cols - 1, Math.round(p.x / step)));
    south[k] = Math.max(south[k], p.y);
  }
  // the shore: as far south as any column's road reaches, less what it falls back with the distance east or west
  const raw = south.map((_, k) => {
    let y = -Infinity;
    for (let j = 0; j < cols; j++) if (south[j] > -Infinity) y = Math.max(y, south[j] + shore - (Math.abs(j - k) * step) / bay);
    return y;
  });
  const reach = Math.round(smooth / step);
  const coast = raw.map((_, k) => {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, k - reach); j <= Math.min(cols - 1, k + reach); j++) [sum, count] = [sum + raw[j], count + 1];
    // (smoothed, but never nearer the road than most of the way out)
    return Math.round(Math.max(sum / count, south[k] + shore * 0.8));
  });
  return { coast };
}

/** The shore's y at `x` (px, the layout's). */
export function shoreAt(r: Riviera, x: number): number {
  const f = Math.max(0, Math.min(r.coast.length - 1, x / RIVIERA.step));
  const k = Math.min(r.coast.length - 2, Math.floor(f));
  return r.coast[k] + (r.coast[k + 1] - r.coast[k]) * (f - k);
}

/** The mountainside's height at (x, y) (px, the layout's): the sea's level is 0, and it's under it south of the shore. */
export function slopeAt(r: Riviera, x: number, y: number): number {
  const north = shoreAt(r, x) - y;
  return north >= 0 ? RIVIERA.beach + north * RIVIERA.grade : RIVIERA.beach + north * RIVIERA.dip;
}

/**
 * The ledge's lift of the ground `d` px past the roadside, on the side `north` of the road (1 due north of it, -1 due
 * south, 0 east or west): up a rock face on its north, down a drop on its south, easing back to the mountainside beyond.
 */
export function ledgeLift(d: number, north: number): number {
  if (d <= 0) return 0;
  const { face, run, ease } = RIVIERA;
  // (full on either side within half a right angle of north or south, none where the road runs straight up the slope)
  const side = Math.max(-1, Math.min(1, north * 1.6));
  const shape = d < run ? (1 - Math.cos((d / run) * Math.PI)) / 2 : Math.max(0, 1 - (d - run) / ease);
  return face * side * shape;
}

/** Whether `s` px along the road is inside one of `tunnels`. */
export const inTunnel = (tunnels: { from: number; to: number }[] | undefined, s: number): boolean => !!tunnels?.some((t) => s >= t.from && s <= t.to);
