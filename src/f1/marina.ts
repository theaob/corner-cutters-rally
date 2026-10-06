// The Harbour's marina: wooden pontoons out from the quay into the sea, yachts
// moored stern-to along both sides of each (as in a Mediterranean harbour: the
// stern to the pontoon, the bow out), and a few boats out on the water going
// round. To scale with the cars (an F1 car is 30 px, about 5.5 m: 1 px ≈ 0.18 m):
// the yachts 10–15 m (55–80 px), the boats going round bigger still.
// It stands where the sea's edge is best seen from the track (on a phone the
// camera shows little either side of a stretch running up the screen: see
// IN_VIEW), its pontoons clear of the track and wholly in the sea. Where
// everything goes is worked out here, engine-free; town3d.ts builds it.

import type { Circuit } from './circuit';
import { HALF_WIDTH } from './circuit';
import type { Pt } from './racing';
import { inView, inside, seaOf } from './town3d';

export const MARINA = {
  /** pontoons, px long out from the quay, and px between them along it (room for a yacht either side of each) */
  piers: 3,
  length: 190,
  apart: 190,
  /** px between moored boats along a pontoon (their beams side by side, and a fender's gap), and their lengths */
  berth: 30,
  boat: [55, 80] as [number, number],
  /** px from the pontoon's middle to a moored boat's stern */
  stern: 6,
  /** boats out on the water, going round, and their lengths */
  cruisers: 3,
  cruiser: [70, 100] as [number, number],
};

export interface Pier {
  /** where it meets the quay, the way it runs out to sea (a unit vector), and how long it is */
  x: number;
  y: number;
  dx: number;
  dy: number;
  length: number;
}

export interface Berth {
  x: number;
  y: number;
  /** the way its bow points (radians, as the cars' headings: 0 up the screen) */
  heading: number;
  length: number;
  kind: 'motor' | 'sail';
}

export interface Cruise {
  /** the middle of its loop, and how far out (across and up the screen) */
  x: number;
  y: number;
  rx: number;
  ry: number;
  /** s to go round once, and where it starts */
  period: number;
  phase: number;
  length: number;
  kind: 'motor' | 'sail';
}

export interface Marina {
  piers: Pier[];
  berths: Berth[];
  cruises: Cruise[];
}

function rng(seed: number): () => number {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

/** px a pontoon (and the boats along it) must keep from the middle of the track */
const keepOf = (circuit: Circuit) => HALF_WIDTH + (circuit.layout.street?.runoff ?? 72) + 20;

/** The Harbour's marina, on the map (none without a sea). */
export function marinaOf(circuit: Circuit): Marina {
  const sea = seaOf(circuit);
  if (!sea?.length) return { piers: [], berths: [], cruises: [] };
  const samples = circuit.track.samples;
  const keep = keepOf(circuit);
  const fromTrack = (x: number, y: number) => {
    let best = Infinity;
    for (let k = 0; k < samples.length; k += 2) best = Math.min(best, (samples[k].x - x) ** 2 + (samples[k].y - y) ** 2);
    return Math.sqrt(best);
  };
  /** px either side of a pontoon its moored boats reach */
  const reachOut = MARINA.stern + MARINA.boat[1];
  /** a pontoon from (x, y) out along (dx, dy): wholly in the sea with room for its boats either side, and clear of the track */
  const fits = (x: number, y: number, dx: number, dy: number) => {
    for (let a = 8; a <= MARINA.length + 12; a += 12) {
      for (const side of [-1, -0.5, 0, 0.5, 1]) {
        const px = x + dx * a - dy * side * reachOut;
        const py = y + dy * a + dx * side * reachOut;
        if (!inside(sea, px, py) || fromTrack(px, py) < keep) return false;
      }
    }
    return true;
  };
  /** how much of the marina round a pontoon from (x, y) the camera shows at once from the track */
  const seen = (x: number, y: number, dx: number, dy: number) => {
    const cx = x + (dx * MARINA.length) / 2;
    const cy = y + (dy * MARINA.length) / 2;
    const w = Math.abs(dx) * MARINA.length + Math.abs(dy) * reachOut * 2;
    const d = Math.abs(dy) * MARINA.length + Math.abs(dx) * reachOut * 2;
    return inView(samples, cx, cy, w, d);
  };
  // along every edge of the sea, the root of the best-seen run of pontoons
  let best: { edge: number; t: number; score: number } | undefined;
  const edges = sea.map((a, i) => [a, sea[(i + 1) % sea.length]] as const);
  const normalOf = ([a, b]: readonly [Pt, Pt]) => {
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    let nx = -(b.y - a.y) / len;
    let ny = (b.x - a.x) / len;
    // (pointing into the sea)
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    if (!inside(sea, mx + nx * 6, my + ny * 6)) [nx, ny] = [-nx, -ny];
    return { nx, ny, len };
  };
  edges.forEach((edge, i) => {
    const [a, b] = edge;
    const { nx, ny, len } = normalOf(edge);
    for (let t = 0; t <= len; t += 12) {
      const x = a.x + ((b.x - a.x) * t) / len + nx * 2;
      const y = a.y + ((b.y - a.y) * t) / len + ny * 2;
      if (!fits(x, y, nx, ny)) continue;
      const score = seen(x, y, nx, ny);
      if (!best || score > best.score) best = { edge: i, t, score };
    }
  });
  if (!best) return { piers: [], berths: [], cruises: [] };
  const [a, b] = edges[best.edge];
  const { nx, ny, len } = normalOf(edges[best.edge]);
  const at = (t: number) => ({ x: a.x + ((b.x - a.x) * t) / len + nx * 2, y: a.y + ((b.y - a.y) * t) / len + ny * 2 });
  // the pontoons: from the best root out either way along the quay, as many as fit
  const piers: Pier[] = [];
  const ts = [best.t];
  for (let k = 1; ts.length < MARINA.piers * 3 && k < 12; k++) ts.push(best.t + k * MARINA.apart, best.t - k * MARINA.apart);
  for (const t of ts) {
    if (piers.length >= MARINA.piers || t < 0 || t > len) continue;
    const p = at(t);
    if (fits(p.x, p.y, nx, ny)) piers.push({ x: p.x, y: p.y, dx: nx, dy: ny, length: MARINA.length });
  }
  // the boats moored along them: stern-to on both sides, bows pointing away from the pontoon, now and then a berth
  // empty (none so long it would reach the next pontoon's)
  const r = rng(53);
  const berths: Berth[] = [];
  for (const p of piers) {
    for (let a2 = 20; a2 <= p.length - 10; a2 += MARINA.berth) {
      for (const side of [-1, 1]) {
        if (r() < 0.15) continue;
        const length = MARINA.boat[0] + r() * (MARINA.boat[1] - MARINA.boat[0]);
        // (the way out from the pontoon on this side)
        const ox = -p.dy * side;
        const oy = p.dx * side;
        const off = MARINA.stern + length / 2;
        berths.push({ x: p.x + p.dx * a2 + ox * off, y: p.y + p.dy * a2 + oy * off, heading: Math.atan2(ox, -oy), length, kind: r() < 0.4 ? 'sail' : 'motor' });
      }
    }
  }
  // boats out on the water: each going round a loop past the marina, all of it in the sea and clear of the track
  const cruises: Cruise[] = [];
  const reach = MARINA.length + 200;
  const mid = at(best.t);
  for (let tries = 0; tries < 2000 && cruises.length < MARINA.cruisers; tries++) {
    const along = (r() - 0.5) * MARINA.apart * MARINA.piers * 2.5;
    const x = mid.x + nx * (reach * (0.6 + r() * 0.8)) + ((b.x - a.x) / len) * along;
    const y = mid.y + ny * (reach * (0.6 + r() * 0.8)) + ((b.y - a.y) / len) * along;
    const rx = 100 + r() * 70;
    const ry = 70 + r() * 40;
    const length = MARINA.cruiser[0] + r() * (MARINA.cruiser[1] - MARINA.cruiser[0]);
    // (all the way round with room for its length, clear of the pontoons and their boats, and of the others' loops)
    let ok = cruises.every((o) => Math.hypot(o.x - x, o.y - y) > Math.max(o.rx, o.ry) + Math.max(rx, ry) + 40);
    for (let k = 0; k < 24 && ok; k++) {
      const px = x + Math.cos((k / 24) * Math.PI * 2) * (rx + length / 2 + 10);
      const py = y + Math.sin((k / 24) * Math.PI * 2) * (ry + length / 2 + 10);
      ok = inside(sea, px, py) && fromTrack(px, py) >= keep + 20 && piers.every((p) => Math.hypot(px - (p.x + p.dx * p.length / 2), py - (p.y + p.dy * p.length / 2)) > p.length / 2 + reachOut + 30);
    }
    if (ok) cruises.push({ x, y, rx, ry, period: 22 + r() * 14, phase: r() * Math.PI * 2, length, kind: r() < 0.5 ? 'sail' : 'motor' });
  }
  return { piers, berths, cruises };
}

/** Where a cruising boat is `t` s on, and the way its bow points. */
export function cruiseAt(c: Cruise, t: number): { x: number; y: number; heading: number } {
  const a = c.phase + (t / c.period) * Math.PI * 2;
  const x = c.x + Math.cos(a) * c.rx;
  const y = c.y + Math.sin(a) * c.ry;
  // (going round anticlockwise on the map: its velocity, as a heading)
  const vx = -Math.sin(a) * c.rx;
  const vy = Math.cos(a) * c.ry;
  return { x, y, heading: Math.atan2(vx, -vy) };
}
