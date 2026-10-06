// The rallies' special stages: long roads with two ends, not circuits. Each is
// grown from its own seed, a piece at a time: a straight, or a bend of one of
// the co-driver's grades (a fast 6 down to a slow 1, and the odd hairpin), left
// or right. A piece is kept only if the road stays inside the map and keeps
// well clear of every stretch of itself further back (it never crosses or runs
// alongside itself); when the road has boxed itself in, the last pieces are
// taken back and tried again. A stage opens on a straight (the service park
// beside it, the start line at its end); past the flying finish the road runs
// on to the stop at its end. Over it, hills from its
// seed, and on a long straight here and there, a jump. Engine-free; the same
// stage from the same seed, every time.

import { seededRandom } from '../engine/rng';
import type { CircuitLayout } from './layouts';
import type { Pt } from './racing';

export type StageSurface = 'gravel' | 'snow' | 'sand' | 'tarmac';

export interface StageSpec {
  id: string;
  name: string;
  about: string;
  seed: number;
  surface: StageSurface;
  /** px of road from the start line to the flying finish, about */
  length: number;
  /** jumps on it, at most */
  jumps?: number;
  /** px the hills rise to, at most */
  hills?: number;
  /** the scenery: a forest's trees all round, or the mountains' meadow, rock and pines (snow and sand bring their own) */
  scenery?: 'forest' | 'mountain';
}

export const ROAD = {
  /** px between the road's points as it's grown */
  step: 20,
  /** px square the road stays inside (the map: its ground's texture is drawn a px to a texel) */
  box: 4300,
  /** px kept clear inside the box's edges */
  edge: 240,
  /** px at least between two stretches of the road that aren't close along it */
  apart: 400,
  /** px along the road past which two stretches must be `apart`; nearer along it, a share of the way along (a hairpin's legs) */
  near: 1000,
  /** px of straight it opens with: the service park beside it, the start line near its end */
  opening: 1700,
  /** px along the road of the start line */
  start: 1500,
  /** px of road after the flying finish, to the stop at the road's end */
  runout: 900,
};

/** The pieces a road is grown from: a bend's radius (px) and how far it turns (degrees, from…to), or a straight's length; and how often each comes. */
const PIECES: { radius?: number; turn?: [number, number]; straight?: [number, number]; weight: number }[] = [
  { straight: [120, 600], weight: 0.22 },
  { radius: 700, turn: [15, 45], weight: 0.12 }, // a 6
  { radius: 420, turn: [20, 70], weight: 0.14 }, // a 5
  { radius: 260, turn: [25, 90], weight: 0.15 }, // a 4
  { radius: 165, turn: [30, 100], weight: 0.14 }, // a 3
  { radius: 110, turn: [40, 110], weight: 0.11 }, // a 2
  { radius: 80, turn: [50, 110], weight: 0.07 }, // a 1
  { radius: 72, turn: [165, 180], weight: 0.05 }, // a hairpin
];

interface Piece {
  /** the points it adds */
  count: number;
  /** a straight: px along the road where it starts, and its length */
  straight?: { at: number; length: number };
}

/** A stage's road (points `ROAD.step` apart, from the start of the road to its end) and its straights. */
export function growRoad(spec: Pick<StageSpec, 'seed' | 'length'>): { points: Pt[]; straights: { at: number; length: number }[] } {
  // (a road that boxes itself in is let go soon, and another grown in its place: most come quickly)
  for (let attempt = 0; attempt < 400; attempt++) {
    const road = tryRoad(spec.seed * 101 + attempt, spec.length);
    if (road) return road;
  }
  throw new Error(`no road for stage seed ${spec.seed}`);
}

function tryRoad(seed: number, length: number) {
  const rng = seededRandom(seed >>> 0 || 1);
  const { step, box, edge, apart, near } = ROAD;
  const xs: number[] = [];
  const ys: number[] = [];
  let heading = 0;
  // a spatial hash of the points, `apart` px buckets
  const buckets = new Map<number, number[]>();
  const key = (bx: number, by: number) => bx * 4096 + by;
  const add = (x: number, y: number) => {
    const k = key(Math.floor(x / apart), Math.floor(y / apart));
    (buckets.get(k) ?? buckets.set(k, []).get(k)!).push(xs.length);
    xs.push(x);
    ys.push(y);
  };
  const removeLast = () => {
    const i = xs.length - 1;
    const k = key(Math.floor(xs[i] / apart), Math.floor(ys[i] / apart));
    buckets.get(k)!.pop();
    xs.pop();
    ys.pop();
  };
  /** Whether a point at (x, y), `j`th along the road, is clear of the road already there. */
  const clear = (x: number, y: number, j: number) => {
    if (x < edge || y < edge || x > box - edge || y > box - edge) return false;
    const bx = Math.floor(x / apart);
    const by = Math.floor(y / apart);
    for (let i = bx - 1; i <= bx + 1; i++) {
      for (let k = by - 1; k <= by + 1; k++) {
        for (const o of buckets.get(key(i, k)) ?? []) {
          const along = (j - o) * step;
          if (along < 300) continue;
          const need = along >= near ? apart : Math.min(apart, Math.max(150, along * 0.4));
          if ((xs[o] - x) ** 2 + (ys[o] - y) ** 2 < need * need) return false;
        }
      }
    }
    return true;
  };
  /** Lay a piece from the road's end, heading `heading`: whether it fits (if not, nothing is laid). */
  const lay = (straight: number | undefined, radius: number, turn: number): boolean => {
    const steps = straight !== undefined ? Math.round(straight / step) : Math.max(1, Math.round((Math.abs(turn) * radius) / step));
    const dh = straight !== undefined ? 0 : turn / steps;
    let x = xs[xs.length - 1];
    let y = ys[ys.length - 1];
    let h = heading;
    const pts: [number, number][] = [];
    for (let k = 0; k < steps; k++) {
      h += dh / 2;
      x += Math.cos(h) * step;
      y += Math.sin(h) * step;
      h += dh / 2;
      if (!clear(x, y, xs.length + k)) return false;
      pts.push([x, y]);
    }
    for (const [px, py] of pts) add(px, py);
    heading = h;
    return true;
  };
  // the start: by the edge of the map, heading in across it
  const side = Math.floor(rng() * 4);
  const along = edge + 200 + rng() * (box - 2 * edge - 400);
  const starts: [number, number, number][] = [[edge + 20, along, 0], [box - edge - 20, along, Math.PI], [along, edge + 20, Math.PI / 2], [along, box - edge - 20, -Math.PI / 2]];
  const [sx, sy, sh] = starts[side];
  add(sx, sy);
  heading = sh;
  const pieces: (Piece & { heading: number })[] = [];
  const total = () => (xs.length - 1) * step;
  const push = (straight: number | undefined, radius: number, turn: number) => {
    const before = heading;
    const from = xs.length;
    const at = total();
    if (!lay(straight, radius, turn)) return false;
    pieces.push({ count: xs.length - from, heading: before, ...(straight !== undefined ? { straight: { at, length: straight } } : {}) });
    return true;
  };
  const pop = () => {
    const p = pieces.pop();
    if (!p) return;
    for (let k = 0; k < p.count; k++) removeLast();
    heading = p.heading;
  };
  if (!push(ROAD.opening, 0, 0)) return undefined;
  const target = ROAD.start + length;
  const weights = PIECES.reduce((sum, p) => sum + p.weight, 0);
  let fails = 0;
  for (let tries = 0; tries < 5000; tries++) {
    // long enough: the flying finish, and the run-out past it to the road's end
    if (total() >= target + ROAD.runout) {
      const straights = pieces.filter((p) => p.straight).map((p) => p.straight!);
      return { points: xs.map((x, i) => ({ x, y: ys[i] })), straights };
    }
    if (total() > (target + ROAD.runout) * 1.25) {
      pop();
      continue;
    }
    let pick = rng() * weights;
    const piece = PIECES.find((p) => (pick -= p.weight) < 0) ?? PIECES[0];
    // (no two straights end to end: one long straight instead)
    const ok = piece.straight
      ? !pieces[pieces.length - 1]?.straight && push(piece.straight[0] + rng() * (piece.straight[1] - piece.straight[0]), 0, 0)
      : push(undefined, piece.radius!, (rng() < 0.5 ? -1 : 1) * ((piece.turn![0] + rng() * (piece.turn![1] - piece.turn![0])) * Math.PI) / 180);
    if (ok) {
      fails = 0;
      continue;
    }
    // boxed in: take back the last few pieces (never the opening straight) and go on from there
    if (++fails > 16) {
      fails = 0;
      const back = 1 + Math.floor(rng() * 3);
      for (let k = 0; k < back && pieces.length > 1; k++) pop();
    }
  }
  return undefined;
}

/** A stage's hills: its height (px) along it, as [share of the road, height], gentle enough to drive. */
function hills(rng: () => number, length: number, high: number): [number, number][] {
  const knots = Math.max(4, Math.round(length / 2400));
  // (the steepest grade between two knots, before the easing between them steepens it by half as much again)
  const rise = 0.05 * (length / knots);
  const out: [number, number][] = [[0, high / 3], [1 / knots / 2, high / 3]];
  let h = high / 3;
  for (let k = 1; k <= knots; k++) {
    h = Math.max(0, Math.min(high, h + (rng() * 2 - 1) * rise));
    out.push([k / knots, Math.round(h)]);
  }
  return out;
}

/** The stage layout for `spec`: its road grown, its hills, jumps, service park, start and finish. */
export function buildStage(spec: StageSpec): CircuitLayout {
  const { points, straights } = growRoad(spec);
  const rng = seededRandom((spec.seed * 7919) >>> 0 || 1);
  const length = (points.length - 1) * ROAD.step;
  const finish = length - ROAD.runout;
  // jumps: in the middle of long straights, clear of the start and the finish
  const jumps: { at: number; rise: number }[] = [];
  const long = straights.filter((s) => s.length >= 480 && s.at > ROAD.start + 300 && s.at + s.length < finish - 300);
  for (const s of long.sort(() => rng() - 0.5)) {
    if (jumps.length >= (spec.jumps ?? 0)) break;
    const at = Math.round(s.at + s.length / 2);
    if (jumps.every((j) => Math.abs(j.at - at) > 1500)) jumps.push({ at, rise: 18 + Math.round(rng() * 8) });
  }
  jumps.sort((a, b) => a.at - b.at);
  const surface = spec.surface;
  return {
    id: spec.id,
    name: spec.name,
    about: spec.about,
    points,
    scale: 1,
    elevation: hills(rng, length, spec.hills ?? 60),
    // the service park: beside the opening straight, before the start line
    pit: { from: 240, to: 1240, side: 1 },
    stage: { start: ROAD.start, finish },
    ...(jumps.length ? { jumps } : {}),
    free: true,
    ...(surface !== 'tarmac' ? { dirt: true } : {}),
    ...(surface === 'snow' ? { snow: true, mountain: true } : {}),
    ...(surface === 'sand' ? { desert: true } : {}),
    ...(surface === 'gravel' || surface === 'tarmac' ? (spec.scenery === 'mountain' ? { mountain: true } : { forest: true }) : {}),
  };
}

/** The rallies' stages. */
export const STAGE_SPECS: StageSpec[] = [
  // gravel, through the forests
  { id: 'ss-pine-ridge', name: 'Pine Ridge', about: 'gravel · fast through the pines', seed: 11, surface: 'gravel', length: 17000, jumps: 2, hills: 70 },
  { id: 'ss-old-mill', name: 'Old Mill', about: 'gravel · twisty, down to the river', seed: 23, surface: 'gravel', length: 19000, jumps: 1, hills: 90 },
  { id: 'ss-fox-hollow', name: 'Fox Hollow', about: 'gravel · tight and technical', seed: 37, surface: 'gravel', length: 16000, jumps: 1, hills: 60 },
  { id: 'ss-high-moor', name: 'High Moor', about: 'gravel · over the moor, crests and jumps', seed: 41, surface: 'gravel', length: 20000, jumps: 3, hills: 110, scenery: 'mountain' },
  // snow, in the mountains
  { id: 'ss-glacier-road', name: 'Glacier Road', about: 'snow · up to the glacier', seed: 53, surface: 'snow', length: 17000, jumps: 1, hills: 200 },
  { id: 'ss-frozen-pass', name: 'Frozen Pass', about: 'snow · over the pass and down', seed: 67, surface: 'snow', length: 19000, jumps: 1, hills: 220 },
  { id: 'ss-ice-lake', name: 'Ice Lake', about: 'snow · along the frozen lake', seed: 71, surface: 'snow', length: 16000, jumps: 0, hills: 160 },
  // sand, in the desert
  { id: 'ss-dune-run', name: 'Dune Run', about: 'sand · flat out through the dunes', seed: 83, surface: 'sand', length: 18000, jumps: 3, hills: 80 },
  { id: 'ss-red-canyon', name: 'Red Canyon', about: 'sand · winding through the canyon', seed: 97, surface: 'sand', length: 17000, jumps: 1, hills: 120 },
  { id: 'ss-salt-flats', name: 'Salt Flats', about: 'sand · the fastest stage of all', seed: 103, surface: 'sand', length: 20000, jumps: 2, hills: 30 },
  // tarmac, on mountain roads
  { id: 'ss-mountain-col', name: 'Mountain Col', about: 'tarmac · hairpins up to the col', seed: 113, surface: 'tarmac', length: 18000, hills: 160, scenery: 'mountain' },
  { id: 'ss-vineyards', name: 'Vineyards', about: 'tarmac · between the vineyards', seed: 127, surface: 'tarmac', length: 17000, hills: 70 },
  { id: 'ss-coast-road', name: 'Coast Road', about: 'tarmac · fast along the coast', seed: 131, surface: 'tarmac', length: 19000, hills: 90, scenery: 'mountain' },
  { id: 'ss-castle-hill', name: 'Castle Hill', about: 'tarmac · up and down the castle hill', seed: 139, surface: 'tarmac', length: 16000, hills: 120 },
];

const built = new Map<string, CircuitLayout>();
/** The stage with this id (grown the first time it's asked for), or undefined. */
export function stageById(id: string | null | undefined): CircuitLayout | undefined {
  const spec = STAGE_SPECS.find((s) => s.id === id);
  if (!spec) return undefined;
  let layout = built.get(spec.id);
  if (!layout) built.set(spec.id, (layout = buildStage(spec)));
  return layout;
}
