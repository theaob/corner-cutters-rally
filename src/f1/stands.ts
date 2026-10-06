// Where a circuit's grandstands stand: three along the main straight behind
// the start line (across the straight from the pits), and on a circuit in the
// country one on the outside of each kerbed bend, behind the run-off, facing
// the track at the apex, where the crowd sees the braking and the overtakes.
// Each is clear of the track, the pits and the other stands, and never so tall
// that it hides the track from the camera (looking down from the south).

import { HALF_WIDTH, RUNOFF, type Circuit } from './circuit';
import { markCorners } from './trackLimits';
import { seeOver } from './town3d';
import { GARAGE_ACROSS, PIT } from './pits';
import { inLake, lakesOf } from './lakes';

export interface Stand {
  /** its middle on the map */
  x: number;
  y: number;
  /** the track's direction beside it (the stand runs along it), and which side of the track it's on (+1: the right) */
  dir: number;
  side: -1 | 1;
  /** px along the track */
  len: number;
  /** at the start line, or by a bend */
  at: 'start' | 'bend';
}

export const STAND = {
  /** px deep (back from the track) and high (with its roof), and long by a bend */
  depth: 18,
  height: 22,
  len: 110,
  /** and with its flags on top, px high */
  flags: 32,
  /** px between the run-off's edge and its front */
  gap: 24,
  /** px between stands, at the least, and from the pit lane */
  apart: 170,
  clearOfPits: 110,
};

/** The four corners of a stand's footprint (for the checks). */
function corners(s: Stand): { x: number; y: number }[] {
  const ax = { x: Math.sin(s.dir), y: -Math.cos(s.dir) };
  const ac = { x: Math.cos(s.dir), y: Math.sin(s.dir) };
  return [-1, 1].flatMap((u) => [-1, 1].map((v) => ({ x: s.x + ax.x * (u * s.len) / 2 + ac.x * (v * STAND.depth) / 2, y: s.y + ax.y * (u * s.len) / 2 + ac.y * (v * STAND.depth) / 2 })));
}

/** A circuit's grandstands. */
export function standsOf(circuit: Circuit): Stand[] {
  const { track, pit, layout } = circuit;
  const samples = track.samples;
  const n = samples.length;
  const runoff = layout.street?.runoff ?? RUNOFF;
  const out = HALF_WIDTH + runoff + STAND.gap + STAND.depth / 2;
  const fromTrack = (x: number, y: number) => Math.min(...samples.map((p) => Math.hypot(p.x - x, p.y - y)));
  /** clear of every stretch of the track and its run-off (another can pass close behind a stand, round a bend), and out of any lake */
  const lakes = lakesOf(circuit);
  const clear = (s: Stand) => [...corners(s), s].every((c) => fromTrack(c.x, c.y) >= HALF_WIDTH + runoff + 8 && !inLake(lakes, c.x, c.y, 20));
  // the main straight's: three side by side behind the start line, across from the pits; one with another stretch
  // of track close behind it moves on back along the straight (and, as a last resort, over to the pit side, past
  // the garages)
  const side = -pit.side as -1 | 1;
  const stands: Stand[] = [];
  const startStand = (k: number, sd: -1 | 1): Stand => {
    const p = samples[(n - 20 - k * 16 + 4 * n) % n];
    const lat = (sd === side ? HALF_WIDTH + runoff + 40 : PIT.offset + GARAGE_ACROSS + 60) * sd;
    return { x: p.x + Math.cos(p.dir) * lat, y: p.y + Math.sin(p.dir) * lat, dir: p.dir, side: sd, len: 110, at: 'start' };
  };
  for (const sd of [side, -side as -1 | 1]) {
    for (let k = 0; k < 12 && stands.length < 3; k++) {
      // (on the straight: not round the bend before it)
      if (Math.abs(samples[(n - 20 - k * 16 + 4 * n) % n].curve) >= 1 / 700) break;
      const s = startStand(k, sd);
      if (clear(s) && stands.every((o) => Math.hypot(o.x - s.x, o.y - s.y) >= s.len)) stands.push(s);
    }
  }
  // (a street circuit's bends have its town round them instead)
  if (layout.street) return stands;
  const fits = (s: Stand) => {
    const box = corners(s);
    // clear of the track and its run-off (another part of the track can pass close by, round a bend)
    if (!clear(s)) return false;
    if (pit.points.some((q) => Math.hypot(q.x - s.x, q.y - s.y) < STAND.clearOfPits)) return false;
    if (stands.some((o) => Math.hypot(o.x - s.x, o.y - s.y) < STAND.apart)) return false;
    // and the camera sees over it, flags and all
    const xs = box.map((c) => c.x);
    const ys = box.map((c) => c.y);
    const w = Math.max(...xs) - Math.min(...xs);
    const d = Math.max(...ys) - Math.min(...ys);
    return seeOver(circuit, (Math.max(...xs) + Math.min(...xs)) / 2, (Math.max(...ys) + Math.min(...ys)) / 2, w, d) >= STAND.flags;
  };
  for (const k of markCorners(track)) {
    const outside = -k.side as -1 | 1;
    // at the apex, or failing that where the bend begins or ends
    const span = (((k.to - k.from) % n) + n) % n;
    for (const at of [k.apex, (k.from + Math.round(span * 0.25)) % n, (k.from + Math.round(span * 0.75)) % n]) {
      const p = samples[at];
      const s: Stand = { x: p.x + Math.cos(p.dir) * out * outside, y: p.y + Math.sin(p.dir) * out * outside, dir: p.dir, side: outside, len: STAND.len, at: 'bend' };
      if (!fits(s)) continue;
      stands.push(s);
      break;
    }
  }
  return stands;
}
