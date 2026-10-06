// A circuit that crosses itself (layout.bridge): one stretch of track carried
// over the other on a bridge. The ground (the circuit's grid) is the lower
// level, where the stretch underneath runs; the stretch on the bridge has a
// grid of its own, the same ground but for the deck: lifted along that stretch,
// up a ramp to the bridge's height over the crossing and down again, between
// low walls along its edges (where it's off the ground). A car drives on the
// deck's grid while it's on that stretch, on the ground everywhere else; so it
// climbs the ramp, crosses over, and comes down, and a car passing underneath
// meets neither the deck nor the cars on it. Engine-free.

import type { Car } from '../engine/driving';
import { groundAt, type Grid } from '../engine/sim';
import type { Track } from './racing';

export const BRIDGE = {
  /** px up a ramp to the deck's full height, and px the deck stays at it either side of the crossing */
  ramp: 440,
  flat: 220,
  /**
   * px from the centreline to the deck's edge (the track's half-width, 44, and a little more; its walls just past it),
   * and how thick the walls are: at least a tile and a half, so that, built of whole tiles, they leave no gap a car
   * can slip through where the deck runs at a slant across the grid
   */
  deck: 50,
  wall: 24,
  /** px of lift from which the deck needs its walls (lower, a car rolls off onto the ground) */
  walled: 4,
  /** px apart in height beyond which two cars are on different levels: they don't touch, or race each other */
  levels: 12,
};

/** A bridge on a track: the deck's grid, the samples on it (`from` to `to`, round the loop), and where it crosses. */
export interface Levels {
  upper: Grid;
  from: number;
  to: number;
  /** the samples where the two stretches cross: on the bridge, and underneath */
  over: number;
  under: number;
  /** px the deck stands above the ground at the crossing */
  height: number;
}

/** Whether sample `i` is in `from`…`to` round a loop of `n`. */
const within = (i: number, from: number, to: number) => (from <= to ? i >= from && i <= to : i >= from || i <= to);

/** px the deck is lifted at sample `i` of the bridge's stretch (0 off it): eased up its ramp, flat over the crossing, eased down. */
export function liftAt(track: Track, levels: Pick<Levels, 'over' | 'height'>, i: number): number {
  const n = track.samples.length;
  let d = Math.abs(i - levels.over);
  d = Math.min(d, n - d) * track.spacing;
  if (d <= BRIDGE.flat) return levels.height;
  const t = 1 - (d - BRIDGE.flat) / BRIDGE.ramp;
  if (t <= 0) return 0;
  return levels.height * t * t * (3 - 2 * t);
}

/** The grid a car on sample `idx` drives on: the deck's on the bridge's stretch, else the ground. */
export function gridFor(track: Track, grid: Grid, idx: number): Grid {
  const l = track.levels;
  return l && within(idx, l.from, l.to) ? l.upper : grid;
}

/** Whether samples `i` and `j` are the two stretches meeting at the bridge's crossing (one on the bridge, the other underneath, near it): the one place two stretches of track may cross. */
export function atCrossing(track: Track, i: number, j: number): boolean {
  const l = track.levels;
  if (!l) return false;
  const n = track.samples.length;
  const reach = Math.ceil((BRIDGE.flat + BRIDGE.ramp) / track.spacing);
  const near = (k: number, c: number) => {
    const d = Math.abs(k - c);
    return Math.min(d, n - d) <= reach;
  };
  return (within(i, l.from, l.to) && near(j, l.under)) || (within(j, l.from, l.to) && near(i, l.under));
}

/** Whether two cars are on the same level (not one on the bridge and the other underneath). */
export const sameLevel = (a: Car, b: Car) => Math.abs(a.z - b.z) < BRIDGE.levels;

/**
 * The bridge on `track` over `grid`: `over` and `under` px along the lap where the stretch on the bridge and the
 * one underneath cross, the deck `height` px up there.
 */
export function buildLevels(track: Track, grid: Grid, spec: { over: number; under: number; height: number }): Levels {
  const n = track.samples.length;
  const over = Math.round(spec.over / track.spacing) % n;
  const under = Math.round(spec.under / track.spacing) % n;
  const reach = Math.ceil((BRIDGE.flat + BRIDGE.ramp) / track.spacing);
  const from = (over - reach + n) % n;
  const to = (over + reach) % n;
  const span: number[] = [];
  for (let k = -reach; k <= reach; k++) span.push((over + k + n) % n);
  const levels = { over, under, height: spec.height };
  const T = grid.tile;
  const W = grid.width;
  const H = grid.height;
  /** the bridge's sample nearest (x, y), and how far across from it */
  const nearest = (x: number, y: number) => {
    let best = span[0];
    let bestD = Infinity;
    for (const i of span) {
      const p = track.samples[i];
      const d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < bestD) [best, bestD] = [i, d];
    }
    const p = track.samples[best];
    // (across: from the centreline, square to it; along: past the end of the span, if beyond it)
    const across = Math.abs((x - p.x) * Math.cos(p.dir) + (y - p.y) * Math.sin(p.dir));
    return { i: best, across, d: Math.sqrt(bestD) };
  };
  const heights = [...(grid.heights ?? new Array((W + 1) * (H + 1)).fill(0))];
  const solid = [...grid.solid];
  const rough = grid.rough ? [...grid.rough] : undefined;
  // (only the tiles round the span)
  const xs = span.map((i) => track.samples[i].x);
  const ys = span.map((i) => track.samples[i].y);
  const pad = BRIDGE.deck + BRIDGE.wall + 2 * T;
  const tx0 = Math.max(0, Math.floor((Math.min(...xs) - pad) / T));
  const tx1 = Math.min(W, Math.ceil((Math.max(...xs) + pad) / T));
  const ty0 = Math.max(0, Math.floor((Math.min(...ys) - pad) / T));
  const ty1 = Math.min(H, Math.ceil((Math.max(...ys) + pad) / T));
  // the deck: each tile corner on it lifted by the bridge's lift there
  for (let cy = ty0; cy <= ty1; cy++) {
    for (let cx = tx0; cx <= tx1; cx++) {
      const q = nearest(cx * T, cy * T);
      // (out to the far side of the tiles along its edge, so the deck is level right to its walls)
      if (q.across > BRIDGE.deck + T || q.d > BRIDGE.deck + 2 * T) continue;
      heights[cy * (W + 1) + cx] += liftAt(track, levels, q.i);
    }
  }
  // its walls: the tiles just past its edges, where it's off the ground; and the deck itself smooth
  for (let ty = ty0; ty < ty1; ty++) {
    for (let tx = tx0; tx < tx1; tx++) {
      const q = nearest((tx + 0.5) * T, (ty + 0.5) * T);
      const lift = liftAt(track, levels, q.i);
      const k = ty * W + tx;
      // (a tile with any of the deck in it is deck; the walls are the tiles wholly past its edge)
      if (q.across <= BRIDGE.deck + T / 2 && q.d <= BRIDGE.deck + T) {
        solid[k] = grid.solid[k] && lift < BRIDGE.walled;
        if (rough && lift >= BRIDGE.walled) rough[k] = false;
      } else if (q.across <= BRIDGE.deck + T / 2 + BRIDGE.wall && q.d <= BRIDGE.deck + T + BRIDGE.wall && lift >= BRIDGE.walled) solid[k] = true;
    }
  }
  return { upper: { ...grid, heights, solid, rough }, from, to, over, under, height: spec.height };
}

/** The deck's height above the ground at (x, y) on the bridge (for drawing it): the upper grid less the ground. */
export function deckHeight(levels: Levels, grid: Grid, x: number, y: number): number {
  return groundAt(levels.upper, x, y).h - groundAt(grid, x, y).h;
}

/** Whether a car at (x, y), `z` px up, is under the deck (hidden from the camera by it): the deck well above the ground there, and the car down on the ground, not up on it. */
export function underDeck(levels: Levels, grid: Grid, x: number, y: number, z: number): boolean {
  const lift = deckHeight(levels, grid, x, y);
  return lift > BRIDGE.levels && z < groundAt(grid, x, y).h + lift / 2;
}
