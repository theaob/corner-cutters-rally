// A circuit in a forest (layout.forest): spruces and firs packed all round the
// track beyond its barriers, with here and there a broadleaf (a few turning
// gold and rust), on up the hillsides and out past the edge of the map. Each
// tree is only as tall as it can be without hiding the track from the camera
// (which looks down from the south), on hills too: a tree on the slope above a
// stretch of track has less room than one below it. None stands on the pits,
// the garages or a grandstand. Drawn as instanced meshes in square chunks, so
// the chunks off screen (and out of the sun's shadow box) aren't drawn.
//
// In a park (layout.park), broadleaf trees in groves over the lawns, a cedar
// here and there, and lining both sides of its woods, by the same rules.
//
// In the mountains (layout.mountain), spruces scattered thinner up to the tree
// line and none above it, and boulders strewn over the meadows, the rock and
// the snow (low, so never in the way), by the same rules. Under snow
// (layout.snow), every spruce's boughs are laden with it, the boulders are
// snow-capped, and none stands under the tramway's line (tramway.ts).
//
// Where the cherry trees are in blossom (layout.blossoms: Nippon), groves of
// them here and there over the grass, and clumps of them lining the lap (so
// their petals drift onto the track: petals.ts), by the same rules.
//
// In the desert (layout.desert), palms instead: in groves here and there round
// the circuit and out over the sand, a curved trunk and a crown of drooping
// fronds, by the same rules (clear of the track, the pits and the stands, and
// never so tall they hide the track).

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { groundAt } from '../engine/sim';
import { HALF_WIDTH, RUNOFF, TILE as T, type Circuit } from './circuit';
import { HIDES } from './town3d';
import { standsOf, STAND } from './stands';
import { GARAGE_ACROSS } from './pits';
import { TRAMWAY, tramwayOf } from './tramway';

export interface Tree {
  x: number;
  y: number;
  /** px tall, from the ground at its foot */
  h: number;
  kind: 'spruce' | 'broadleaf' | 'palm' | 'rock' | 'blossom';
  /** its crown's colour */
  color: number;
  /** laden with snow (a spruce: a cap of it on each tier) */
  snowy?: boolean;
}

export const FOREST = {
  /** px between trees (before a random nudge) */
  spacing: 30,
  /** px past the run-off's edge (the barriers) before the trees start */
  clear: 26,
  /** px out past the edge of the map the forest goes on */
  beyond: 360,
  /** px tall: the most a tree grows, and the least worth planting */
  tallest: 52,
  shortest: 14,
  /** a crown's radius, as a share of the tree's height */
  crown: 0.38,
  /** px square of each drawn chunk */
  chunk: 640,
};

export const PALMS = {
  /** px between the spots a grove may stand (before a random nudge), and the share of them that have one */
  every: 120,
  groves: 0.7,
  /** px past the run-off's edge (the barriers) before they start: closer than the forest, a palm being slender */
  clear: 12,
  /** palms in a grove (at least, and up to this many more), and px round its middle they stand within */
  least: 3,
  more: 6,
  spread: 46,
  /** px tall: the most a palm grows (taller than a spruce: a palm is mostly trunk) */
  tallest: 60,
  /** px out past the edge of the map the groves go on */
  beyond: 300,
  /** and lining the circuit, where they're seen as you drive by: every this many px along the lap, each side, the
   * chance of a clump of one to three palms there, and px out past the barriers (at least, and up to this much more) */
  liningEvery: 64,
  lining: 0.55,
  liningOut: [0, 50] as const,
  /** a crown's reach, as a share of the palm's height */
  crown: 0.34,
};

export const MOUNTAIN = {
  /** px between the spots a spruce may stand (before a random nudge), and the share of them that have one */
  spacing: 40,
  trees: 0.55,
  /** px up (the ground's height) past which no tree grows */
  treeLine: 120,
  /** px between the spots a boulder may lie, the share of them that have one, and its size (px across: at least, and up to this much more) */
  rockEvery: 64,
  rocks: 0.4,
  rockSize: [7, 14] as const,
  /** px up past which the boulders are snowy */
  snowLine: 150,
  /** px out past the edge of the map they go on */
  beyond: 300,
};

export const BLOSSOM = {
  /** px tall at the most */
  tallest: 44,
  /** px past the run-off's edge (the barriers) before they start */
  clear: 12,
  /** lining the lap: every this many px along it, each side, the chance of a clump of one to three there, and px out past the barriers (at least, and up to this much more) */
  liningEvery: 70,
  lining: 0.65,
  liningOut: [0, 36] as const,
  /** the groves: px between the spots one may stand, the share of them that have one, trees in each (at least, and up to this many more), and px round its middle */
  every: 150,
  groves: 0.45,
  least: 3,
  more: 4,
  spread: 50,
  /** px out past the edge of the map they go on */
  beyond: 300,
};

export const PARK = {
  /** px between the spots a grove may stand (before a random nudge), and the share of them that have one */
  every: 150,
  groves: 0.55,
  /** px past the run-off's edge (the barriers) before they start */
  clear: 20,
  /** trees in a grove (at least, and up to this many more), and px round its middle they stand within */
  least: 3,
  more: 6,
  spread: 56,
  /** px tall at the most, and the share of them that are cedars (dark, tiered) */
  tallest: 50,
  cedars: 0.15,
  /** px out past the edge of the map the groves go on */
  beyond: 300,
  /** the woods: every this many px along the lap, each side, a tree (the chance of one), px out past the barriers (at least, and up to this much more) */
  avenueEvery: 34,
  avenue: 0.85,
  avenueOut: [0, 40] as const,
};

const SPRUCE = [0x24492a, 0x2d5a32, 0x1f4026, 0x335f38];
/** spruces under snow: their greens darker, against it */
const SNOWY_SPRUCE = [0x1c3a22, 0x23462a, 0x18341e, 0x284c2e];
/** cherry blossom: pinks, pale to deep */
export const BLOSSOM_PINKS = [0xf4b6c8, 0xf7c6d4, 0xeea2b8, 0xfbd3de, 0xf0aec2];
/** boulders: granite greys, and snow-capped up high */
const ROCK = [0x8a8780, 0x7a776f, 0x96928a, 0x6e6b64];
const SNOWY_ROCK = [0xd6dde4, 0xc4ccd4, 0xe4e9ee];
/** a park's broadleaves in summer: greens, light and dark */
const PARKLAND = [0x4f8a3c, 0x5f9a44, 0x3f7a34, 0x6ba84a, 0x467f3a];
const FRONDS = [0x3f8a34, 0x4c9a3a, 0x5a9e3c, 0x6f9a3a];
const BROADLEAF = [0x4f8a3c, 0x5f9a44, 0x6b9a40, 0xc98a3a, 0xa8542c];

function rng(seed: number): () => number {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

/**
 * Where a tree may stand on `circuit`: for a spot and the height it would grow to (with its crown reaching
 * `crown` of that), the height it may have there: none on or by the track and its run-off, the pit lane and its
 * garages, or a grandstand, and no taller than lets its crown keep clear of hiding any of the track north of it.
 */
function growth(circuit: Circuit, clear: number) {
  const { track, grid, pit } = circuit;
  const reach = HALF_WIDTH + RUNOFF;
  // the track's samples in columns 64 px wide, with the ground under each
  const COL = 64;
  const cols = new Map<number, { x: number; y: number; h: number }[]>();
  for (const p of track.samples) {
    const k = Math.floor(p.x / COL);
    (cols.get(k) ?? cols.set(k, []).get(k)!).push({ x: p.x, y: p.y, h: groundAt(grid, p.x, p.y).h });
  }
  const stands = standsOf(circuit);
  return (x: number, y: number, want: number, crown: number): number => {
    let near = Infinity;
    for (let k = Math.floor((x - reach - clear) / COL); k <= Math.floor((x + reach + clear) / COL); k++) {
      for (const p of cols.get(k) ?? []) near = Math.min(near, Math.hypot(p.x - x, p.y - y));
    }
    if (near < reach + clear) return 0;
    if (pit.points.some((q) => Math.hypot(q.x - x, q.y - y) < GARAGE_ACROSS + 60)) return 0;
    if (stands.some((s) => Math.hypot(s.x - x, s.y - y) < s.len / 2 + STAND.depth + 20)) return 0;
    const foot = groundAt(grid, x, y).h;
    const room = (h: number) => {
      const cr = h * crown;
      let most = Infinity;
      for (let k = Math.floor((x - cr - reach) / COL); k <= Math.floor((x + cr + reach) / COL); k++) {
        for (const p of cols.get(k) ?? []) {
          if (Math.abs(p.x - x) > cr + reach) continue;
          const gap = y - cr - (p.y + reach);
          if (gap < 0) continue;
          // (its top, seen over the track's edge: the gap it may hide, less how far its foot stands above the track)
          most = Math.min(most, Math.max(0, gap - 6) / HIDES - (foot - p.h));
        }
      }
      return most;
    };
    let h = Math.min(want, room(want));
    if (h < want) h = Math.min(h, room(h)) * 0.95;
    return h;
  };
}

/** The forest's trees (none for a circuit that isn't in one); in the desert, its palms. */
export function treesOf(circuit: Circuit): Tree[] {
  if (circuit.layout.desert) return palmsOf(circuit);
  if (circuit.layout.park) return parkOf(circuit, circuit.layout.park.avenue);
  if (circuit.layout.mountain) return mountainOf(circuit);
  if (circuit.layout.blossoms) return blossomsOf(circuit);
  if (!circuit.layout.forest) return [];
  const W = circuit.width * T;
  const H = circuit.height * T;
  const grow = growth(circuit, FOREST.clear);
  const r = rng(29);
  const out: Tree[] = [];
  const S = FOREST.spacing;
  for (let gy = -FOREST.beyond; gy < H + FOREST.beyond; gy += S) {
    for (let gx = -FOREST.beyond; gx < W + FOREST.beyond; gx += S) {
      const x = gx + (r() - 0.5) * S * 0.8;
      const y = gy + (r() - 0.5) * S * 0.8;
      const pick = r();
      const want = FOREST.tallest * (0.6 + 0.4 * r());
      const h = grow(x, y, want, FOREST.crown);
      if (h < FOREST.shortest) continue;
      const kind = pick < 0.82 ? 'spruce' : 'broadleaf';
      const palette = kind === 'spruce' ? SPRUCE : BROADLEAF;
      out.push({ x, y, h, kind, color: palette[Math.floor(r() * palette.length)] });
    }
  }
  return out;
}

/** The cherry trees in blossom: clumps lining the lap, and groves over the grass round it. */
function blossomsOf(circuit: Circuit): Tree[] {
  const W = circuit.width * T;
  const H = circuit.height * T;
  const B = BLOSSOM;
  const grow = growth(circuit, B.clear);
  const r = rng(83);
  const out: Tree[] = [];
  const plant = (x: number, y: number) => {
    const want = B.tallest * (0.6 + 0.4 * r());
    const pick = r();
    const h = grow(x, y, want, FOREST.crown);
    // (no two crowns on top of each other)
    if (h < FOREST.shortest || out.some((t) => Math.hypot(t.x - x, t.y - y) < h * FOREST.crown)) return;
    out.push({ x, y, h, kind: 'blossom', color: BLOSSOM_PINKS[Math.floor(pick * BLOSSOM_PINKS.length)] });
  };
  const { samples, spacing } = circuit.track;
  const step = Math.max(1, Math.round(B.liningEvery / spacing));
  const reach = HALF_WIDTH + RUNOFF + B.clear;
  for (let i = 0; i < samples.length; i += step) {
    const p = samples[i];
    for (const side of [-1, 1]) {
      if (r() > B.lining) continue;
      const clump = 1 + Math.floor(r() * 3);
      const out0 = reach + B.liningOut[0] + r() * B.liningOut[1];
      for (let k = 0; k < clump; k++) {
        const along = (r() - 0.5) * 34;
        const off = out0 + r() * 18;
        plant(p.x + Math.cos(p.dir) * off * side + Math.sin(p.dir) * along, p.y + Math.sin(p.dir) * off * side - Math.cos(p.dir) * along);
      }
    }
  }
  for (let gy = -B.beyond; gy < H + B.beyond; gy += B.every) {
    for (let gx = -B.beyond; gx < W + B.beyond; gx += B.every) {
      const cx = gx + (r() - 0.5) * B.every * 0.7;
      const cy = gy + (r() - 0.5) * B.every * 0.7;
      const count = B.least + Math.floor(r() * (B.more + 1));
      if (r() > B.groves) continue;
      for (let k = 0; k < count; k++) {
        const a = r() * Math.PI * 2;
        const d = Math.sqrt(r()) * B.spread;
        plant(cx + Math.cos(a) * d, cy + Math.sin(a) * d);
      }
    }
  }
  return out;
}

/** The mountains': spruces up to the tree line, thinner than a forest's, and boulders strewn over it all. */
function mountainOf(circuit: Circuit): Tree[] {
  const W = circuit.width * T;
  const H = circuit.height * T;
  const grow = growth(circuit, FOREST.clear);
  const r = rng(53);
  const out: Tree[] = [];
  const M = MOUNTAIN;
  const snow = !!circuit.layout.snow;
  // (none under the tramway's line: from station to station, and a little past each)
  const tram = tramwayOf(circuit);
  const underTram = (x: number, y: number) => {
    if (!tram) return false;
    const ux = Math.cos(tram.angle);
    const uy = Math.sin(tram.angle);
    const along = (x - tram.from.x) * ux + (y - tram.from.y) * uy;
    const across = -(x - tram.from.x) * uy + (y - tram.from.y) * ux;
    return along > -TRAMWAY.house.along && along < tram.length + TRAMWAY.house.along && Math.abs(across) < TRAMWAY.corridor;
  };
  for (let gy = -M.beyond; gy < H + M.beyond; gy += M.spacing) {
    for (let gx = -M.beyond; gx < W + M.beyond; gx += M.spacing) {
      const x = gx + (r() - 0.5) * M.spacing * 0.8;
      const y = gy + (r() - 0.5) * M.spacing * 0.8;
      const keep = r() < M.trees;
      const want = FOREST.tallest * (0.55 + 0.45 * r());
      const pick = r();
      if (!keep || groundAt(circuit.grid, x, y).h > M.treeLine || underTram(x, y)) continue;
      const h = grow(x, y, want, FOREST.crown);
      const greens = snow ? SNOWY_SPRUCE : SPRUCE;
      if (h >= FOREST.shortest) out.push({ x, y, h, kind: 'spruce', color: greens[Math.floor(pick * greens.length)], ...(snow ? { snowy: true } : {}) });
    }
  }
  for (let gy = -M.beyond; gy < H + M.beyond; gy += M.rockEvery) {
    for (let gx = -M.beyond; gx < W + M.beyond; gx += M.rockEvery) {
      const x = gx + (r() - 0.5) * M.rockEvery;
      const y = gy + (r() - 0.5) * M.rockEvery;
      const keep = r() < M.rocks;
      const want = M.rockSize[0] + r() * M.rockSize[1];
      const pick = r();
      if (!keep || underTram(x, y)) continue;
      // (a boulder's as wide as it's high: its "crown" all of it)
      const h = grow(x, y, want, 0.5);
      if (h < M.rockSize[0] * 0.8) continue;
      const palette = snow || groundAt(circuit.grid, x, y).h > M.snowLine ? SNOWY_ROCK : ROCK;
      out.push({ x, y, h, kind: 'rock', color: palette[Math.floor(pick * palette.length)] });
    }
  }
  return out;
}

/** A park's trees: lining its woods, and in groves over the lawns round the circuit. */
function parkOf(circuit: Circuit, [from, to]: [number, number]): Tree[] {
  const W = circuit.width * T;
  const H = circuit.height * T;
  const grow = growth(circuit, PARK.clear);
  const r = rng(71);
  const out: Tree[] = [];
  const plant = (x: number, y: number, tall = PARK.tallest) => {
    const cedar = r() < PARK.cedars;
    const want = tall * (0.6 + 0.4 * r());
    const h = grow(x, y, want, FOREST.crown);
    // (no two crowns on top of each other)
    if (h < FOREST.shortest || out.some((t) => Math.hypot(t.x - x, t.y - y) < h * FOREST.crown)) return;
    const palette = cedar ? SPRUCE : PARKLAND;
    out.push({ x, y, h, kind: cedar ? 'spruce' : 'broadleaf', color: palette[Math.floor(r() * palette.length)] });
  };
  // the woods: lining both sides of the lap
  const { samples, spacing } = circuit.track;
  const reach = HALF_WIDTH + RUNOFF + PARK.clear;
  const step = Math.max(1, Math.round(PARK.avenueEvery / spacing));
  for (let i = Math.round(from / spacing); i <= Math.round(to / spacing); i += step) {
    const p = samples[i % samples.length];
    for (const side of [-1, 1]) {
      if (r() > PARK.avenue) continue;
      for (const deeper of [0, 1]) {
        const off = reach + PARK.avenueOut[0] + r() * PARK.avenueOut[1] + deeper * 30;
        const along = (r() - 0.5) * 16;
        plant(p.x + Math.cos(p.dir) * off * side + Math.sin(p.dir) * along, p.y + Math.sin(p.dir) * off * side - Math.cos(p.dir) * along);
      }
    }
  }
  // and the groves over the lawns
  const S = PARK.every;
  for (let gy = -PARK.beyond; gy < H + PARK.beyond; gy += S) {
    for (let gx = -PARK.beyond; gx < W + PARK.beyond; gx += S) {
      const cx = gx + (r() - 0.5) * S * 0.7;
      const cy = gy + (r() - 0.5) * S * 0.7;
      const count = PARK.least + Math.floor(r() * (PARK.more + 1));
      if (r() > PARK.groves) continue;
      for (let k = 0; k < count; k++) {
        const a = r() * Math.PI * 2;
        const d = Math.sqrt(r()) * PARK.spread;
        plant(cx + Math.cos(a) * d, cy + Math.sin(a) * d);
      }
    }
  }
  return out;
}

/** The desert's palms: in groves, here and there round the circuit and out over the sand. */
function palmsOf(circuit: Circuit): Tree[] {
  const W = circuit.width * T;
  const H = circuit.height * T;
  const grow = growth(circuit, PALMS.clear);
  const r = rng(53);
  const out: Tree[] = [];
  const plant = (x: number, y: number) => {
    const want = PALMS.tallest * (0.55 + 0.45 * r());
    const h = grow(x, y, want, PALMS.crown);
    // (no two trunks on top of each other)
    if (h < FOREST.shortest || out.some((t) => Math.hypot(t.x - x, t.y - y) < 9)) return;
    out.push({ x, y, h, kind: 'palm', color: FRONDS[Math.floor(r() * FRONDS.length)] });
  };
  // lining the circuit, just past the barriers
  const { samples, spacing } = circuit.track;
  const step = Math.round(PALMS.liningEvery / spacing);
  const reach = HALF_WIDTH + RUNOFF + PALMS.clear;
  for (let i = 0; i < samples.length; i += step) {
    const p = samples[i];
    for (const side of [-1, 1]) {
      if (r() > PALMS.lining) continue;
      const clump = 1 + Math.floor(r() * 3);
      const out0 = reach + PALMS.liningOut[0] + r() * PALMS.liningOut[1];
      for (let k = 0; k < clump; k++) {
        const along = (r() - 0.5) * 30;
        const off = out0 + r() * 16;
        plant(p.x + Math.cos(p.dir) * off * side + Math.sin(p.dir) * along, p.y + Math.sin(p.dir) * off * side - Math.cos(p.dir) * along);
      }
    }
  }
  // and the groves
  const S = PALMS.every;
  for (let gy = -PALMS.beyond; gy < H + PALMS.beyond; gy += S) {
    for (let gx = -PALMS.beyond; gx < W + PALMS.beyond; gx += S) {
      const cx = gx + (r() - 0.5) * S * 0.7;
      const cy = gy + (r() - 0.5) * S * 0.7;
      const count = PALMS.least + Math.floor(r() * (PALMS.more + 1));
      if (r() > PALMS.groves) continue;
      for (let k = 0; k < count; k++) {
        const a = r() * Math.PI * 2;
        const d = Math.sqrt(r()) * PALMS.spread;
        plant(cx + Math.cos(a) * d, cy + Math.sin(a) * d);
      }
    }
  }
  return out;
}

/** The trees' shapes, 1 px tall at their foot (scaled up per tree): a spruce's three tiers, a broadleaf's round crown, a trunk. */
function shapes() {
  const tiers = [
    new THREE.ConeGeometry(FOREST.crown, 0.5, 6).translate(0, 0.42, 0),
    new THREE.ConeGeometry(FOREST.crown * 0.78, 0.42, 6).translate(0, 0.64, 0),
    new THREE.ConeGeometry(FOREST.crown * 0.52, 0.34, 6).translate(0, 0.84, 0),
  ];
  const spruce = mergeGeometries(tiers)!;
  // (the snow on a spruce's boughs: a cap on each tier, over its upper part, a shade wider so it shows)
  const snow = mergeGeometries([
    new THREE.ConeGeometry(FOREST.crown * 0.7, 0.3, 6).translate(0, 0.52, 0),
    new THREE.ConeGeometry(FOREST.crown * 0.55, 0.25, 6).translate(0, 0.725, 0),
    new THREE.ConeGeometry(FOREST.crown * 0.38, 0.21, 6).translate(0, 0.905, 0),
  ])!;
  const broadleaf = new THREE.IcosahedronGeometry(FOREST.crown * 0.9, 0).scale(1, 0.85, 1).translate(0, 0.66, 0);
  const trunk = new THREE.CylinderGeometry(0.05, 0.07, 0.36, 5).translate(0, 0.18, 0);
  // a palm: a slender trunk leaning a little and curving back up (two pieces), and at its top a crown of seven
  // fronds, each a long flat leaf rising from the top and drooping at its tip (two pieces), round a few dates
  const lean = 0.1;
  const palmTrunk = mergeGeometries([
    new THREE.CylinderGeometry(0.028, 0.042, 0.5, 5).rotateZ(-lean).translate(0.025, 0.25, 0),
    new THREE.CylinderGeometry(0.024, 0.03, 0.42, 5).rotateZ(lean * 0.4).translate(0.04, 0.7, 0),
  ])!;
  const top = new THREE.Vector3(0.03, 0.9, 0);
  const fronds: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 7; k++) {
    const turn = (k / 7) * Math.PI * 2;
    const inner = new THREE.BoxGeometry(PALMS.crown * 0.6, 0.012, 0.07).translate(PALMS.crown * 0.3, 0, 0).rotateZ(0.25);
    const outer = new THREE.BoxGeometry(PALMS.crown * 0.5, 0.01, 0.055).translate(PALMS.crown * 0.25, 0, 0).rotateZ(-0.55).translate(PALMS.crown * 0.6 * Math.cos(0.25), PALMS.crown * 0.6 * Math.sin(0.25), 0);
    fronds.push(mergeGeometries([inner, outer])!.rotateY(turn + (k % 2) * 0.2).translate(top.x, top.y, top.z));
  }
  const palm = mergeGeometries(fronds)!;
  const dates = new THREE.IcosahedronGeometry(0.035, 0).translate(top.x, top.y - 0.03, top.z);
  // (a boulder: a rough lump, wider than it's high, sunk a little into the ground)
  const rock = new THREE.DodecahedronGeometry(0.62, 0).scale(1, 0.62, 0.86).translate(0, 0.22, 0);
  return { spruce, snow, broadleaf, trunk, palm, palmTrunk, dates, rock };
}

/** Plant the forest in `scene`, in chunks. Gives back its trees. */
export function buildForest(scene: THREE.Scene, circuit: Circuit): Tree[] {
  const trees = treesOf(circuit);
  if (!trees.length) return trees;
  const geo = shapes();
  const crown = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const bark = new THREE.MeshLambertMaterial({ color: 0x5a4030 });
  const palmBark = new THREE.MeshLambertMaterial({ color: 0x9a7a52 });
  const dates = new THREE.MeshLambertMaterial({ color: 0x8a4a22 });
  const snow = new THREE.MeshLambertMaterial({ color: 0xf2f6fa });
  const chunks = new Map<string, Tree[]>();
  for (const t of trees) {
    const key = `${Math.floor(t.x / FOREST.chunk)},${Math.floor(t.y / FOREST.chunk)}`;
    (chunks.get(key) ?? chunks.set(key, []).get(key)!).push(t);
  }
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const c = new THREE.Color();
  for (const list of chunks.values()) {
    const palms = list.filter((t) => t.kind === 'palm').length;
    const rocks = list.filter((t) => t.kind === 'rock').length;
    const meshes = {
      spruce: new THREE.InstancedMesh(geo.spruce, crown, list.filter((t) => t.kind === 'spruce').length),
      broadleaf: new THREE.InstancedMesh(geo.broadleaf, crown, list.filter((t) => t.kind === 'broadleaf').length),
      palm: new THREE.InstancedMesh(geo.palm, crown, palms),
      rock: new THREE.InstancedMesh(geo.rock, crown, rocks),
      // (a cherry tree: a broadleaf's crown, in blossom)
      blossom: new THREE.InstancedMesh(geo.broadleaf, crown, list.filter((t) => t.kind === 'blossom').length),
      trunk: new THREE.InstancedMesh(geo.trunk, bark, list.length - palms - rocks),
      palmTrunk: new THREE.InstancedMesh(geo.palmTrunk, palmBark, palms),
      dates: new THREE.InstancedMesh(geo.dates, dates, palms),
      snow: new THREE.InstancedMesh(geo.snow, snow, list.filter((t) => t.snowy).length),
    };
    let snowed = 0;
    const n = { spruce: 0, broadleaf: 0, palm: 0, rock: 0, blossom: 0, trunk: 0 };
    list.forEach((t) => {
      const foot = groundAt(circuit.grid, t.x, t.y).h;
      // (each turned its own way, a little wider or narrower)
      q.setFromAxisAngle(up, (t.x * 7.3 + t.y * 3.1) % (Math.PI * 2));
      const wide = 0.9 + ((t.x * 13.7 + t.y * 5.3) % 1) * 0.25;
      m.compose(new THREE.Vector3(t.x, foot - 1, t.y), q, new THREE.Vector3(t.h * wide, t.h, t.h * wide));
      if (t.kind === 'palm') {
        // (a palm keeps its slender width)
        m.compose(new THREE.Vector3(t.x, foot - 1, t.y), q, new THREE.Vector3(t.h, t.h, t.h));
        meshes.palmTrunk.setMatrixAt(n.palm, m);
        meshes.dates.setMatrixAt(n.palm, m);
      } else if (t.kind !== 'rock') meshes.trunk.setMatrixAt(n.trunk++, m);
      if (t.snowy) meshes.snow.setMatrixAt(snowed++, m);
      meshes[t.kind].setMatrixAt(n[t.kind], m);
      meshes[t.kind].setColorAt(n[t.kind]++, c.set(t.color));
    });
    for (const mesh of Object.values(meshes)) {
      if (!mesh.count) continue;
      mesh.computeBoundingSphere();
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
    }
  }
  return trees;
}
