// The spectators: groups of fans on the open ground beside the road, where a
// rally's crowds gather. At the start and the flying finish, round the jumps,
// at the slowest bends (on their outsides, where there's room), and a few
// more along the way. Each stands facing the road. They cheer as a car comes
// by (jumping, arms up), and one coming at them sends them running back out of
// its way, to wander back once it's gone. Visual only: no car hits them.
// Placed by spectatorsOf (engine-free, seeded by the stage); drawn and moved
// by buildSpectators.

import * as THREE from 'three';
import { groundAt } from '../engine/sim';
import { HALF_WIDTH, ROADSIDE, RUNOFF, TILE, type Circuit } from './circuit';
import { paceNotes } from './paceNotes';

export interface Spectator {
  /** where they stand, and the way they face (radians, as a car's heading: toward the road) */
  x: number;
  y: number;
  heading: number;
  /** their jacket and trousers */
  jacket: number;
  legs: number;
  /** a share of their height (1: 12 px tall) */
  size: number;
  /** a share of a second their cheering is out of step with the rest */
  phase: number;
}

export const CROWD = {
  /** the most fans in one spot, and the least */
  most: 12,
  least: 4,
  /** px along the road a spot's fans spread over, either way */
  spread: 50,
  /** px at least between two fans */
  apart: 6,
  /** px between the stray spots along the road (one in each such stretch, on a side drawn at random) */
  every: 1400,
  /** a car within this many px has them cheering; within `flee` px and coming their way, running from it */
  cheer: 260,
  flee: 90,
  /** px/s they run off at, and walk back at; px at most they run */
  run: 140,
  walk: 24,
  away: 60,
};

const JACKETS = [0xd8323c, 0x2e6fd8, 0xf2c14e, 0x3fae5a, 0xf28c28, 0x9b4fd0, 0xf4f4f8, 0x1b1b26, 0x2ab5b5, 0xe85d9a];
const LEGS = [0x2a2d3a, 0x3b4a6b, 0x4a3a2a, 0x1b1b26, 0x5a5a62];

function rng(seed: number): () => number {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

/** The fans along `circuit`'s stage (none on a road that isn't one). */
export function spectatorsOf(circuit: Circuit): Spectator[] {
  const { track, cells, width: W, height: H } = circuit;
  const stage = track.stage;
  if (!stage) return [];
  const n = track.samples.length;
  const r = rng(Math.round(stage.finish) * 31 + n);
  const cell = (x: number, y: number) => {
    const i = Math.floor(x / TILE);
    const j = Math.floor(y / TILE);
    return i < 0 || j < 0 || i >= W || j >= H ? 'wall' : cells[j * W + i];
  };
  const out: Spectator[] = [];
  /** a spot's fans: round `s` px along the road, on `side` (1: the right) */
  const spot = (s: number, side: number, count: number) => {
    for (let k = 0, tries = 0; k < count && tries < count * 8; tries++) {
      const along = Math.max(0, Math.min(track.length - 1, s + (r() * 2 - 1) * CROWD.spread));
      const p = track.samples[Math.min(n - 1, Math.round(along / track.spacing))];
      const off = HALF_WIDTH + ROADSIDE.verge + 4 + r() * (RUNOFF - ROADSIDE.verge - 8);
      const x = p.x + Math.cos(p.dir) * off * side;
      const y = p.y + Math.sin(p.dir) * off * side;
      const jacket = JACKETS[Math.floor(r() * JACKETS.length)];
      const legs = LEGS[Math.floor(r() * LEGS.length)];
      const size = 0.85 + r() * 0.3;
      const phase = r();
      // (on the open ground, a step clear of the trees, and not on top of one another)
      const ground = cell(x, y);
      if (ground !== 'grass' && ground !== 'gravel') continue;
      if (cell(x + Math.cos(p.dir) * side * 6, y + Math.sin(p.dir) * side * 6) === 'wall') continue;
      if (out.some((o) => Math.hypot(o.x - x, o.y - y) < CROWD.apart)) continue;
      // (facing the road: its nearest point, which by a bend may be another stretch of it than this)
      let q = p;
      for (const o of track.samples) if ((o.x - x) ** 2 + (o.y - y) ** 2 < (q.x - x) ** 2 + (q.y - y) ** 2) q = o;
      if (Math.hypot(q.x - x, q.y - y) <= HALF_WIDTH + ROADSIDE.verge) continue;
      const heading = Math.atan2(q.x - x, -(q.y - y));
      out.push({ x, y, heading, jacket, legs, size, phase });
      k++;
    }
  };
  const many = () => CROWD.least + Math.floor(r() * (CROWD.most - CROWD.least + 1));
  // the start and the finish, both sides
  for (const side of [-1, 1]) {
    spot(stage.start - 60, side, CROWD.most);
    spot(stage.finish + 30, side, many());
  }
  // the jumps, both sides
  for (const j of circuit.layout.jumps ?? []) for (const side of [-1, 1]) spot(j.at, side, many());
  // the slowest bends: on their outsides
  for (const note of paceNotes(track)) {
    if (!note.dir || (note.grade !== 'hairpin' && (note.grade ?? 6) > 2)) continue;
    spot((note.at + note.end) / 2, note.dir === 'right' ? -1 : 1, many());
  }
  // and a few more along the way
  for (let s = stage.start + CROWD.every; s < stage.finish - 300; s += CROWD.every) spot(s + r() * CROWD.every * 0.5, r() < 0.5 ? -1 : 1, CROWD.least + Math.floor(r() * 4));
  return out;
}

export interface SpectatorScene {
  group: THREE.Group;
  /** Move them on to page time `t` (s), `dt` s since the last, with the cars at `cars` (px, and px/s). */
  animate(t: number, dt: number, cars: { x: number; y: number; vx: number; vy: number }[]): void;
}

/** The fans in 3D, each a little figure: legs, a jacket, arms, a head. */
export function buildSpectators(circuit: Circuit): SpectatorScene {
  const group = new THREE.Group();
  const fans = spectatorsOf(circuit);
  if (!fans.length) return { group, animate: () => {} };
  const make = (geo: THREE.BufferGeometry, color?: number) => {
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: color ?? 0xffffff }), fans.length);
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    group.add(mesh);
    return mesh;
  };
  // (each part 1 unit = 1 px at size 1, its origin at the fan's feet)
  const legs = make(new THREE.BoxGeometry(3, 5, 1.8).translate(0, 2.5, 0));
  const body = make(new THREE.BoxGeometry(3.6, 4.4, 2.2).translate(0, 7.2, 0));
  const head = make(new THREE.BoxGeometry(2.2, 2.2, 2.2).translate(0, 10.5, 0), 0xe0b090);
  // an arm hangs from its shoulder (its origin), turned up to cheer
  const armGeo = new THREE.BoxGeometry(1, 4, 1).translate(0, -2, 0);
  const arms = [make(armGeo), make(armGeo)];
  const c = new THREE.Color();
  fans.forEach((f, i) => {
    legs.setColorAt(i, c.set(f.legs));
    body.setColorAt(i, c.set(f.jacket));
    for (const a of arms) a.setColorAt(i, c.set(f.jacket));
  });
  const state = fans.map(() => ({ dx: 0, dy: 0, fleeing: 0 }));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  const place = (mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number, heading: number, size: number, tilt = 0) => {
    q.setFromEuler(e.set(tilt, -heading, 0, 'YXZ'));
    mesh.setMatrixAt(i, m.compose(v.set(x, y, z), q, s.set(size, size, size)));
  };
  const draw = (t: number, cars: { x: number; y: number; vx: number; vy: number }[], dt: number) => {
    fans.forEach((f, i) => {
      const st = state[i];
      let x = f.x + st.dx;
      let y = f.y + st.dy;
      // the nearest car: how near, and whether it's coming their way
      let near = Infinity;
      let threat: { x: number; y: number } | undefined;
      for (const car of cars) {
        const d = Math.hypot(car.x - x, car.y - y);
        near = Math.min(near, d);
        const coming = ((x - car.x) * car.vx + (y - car.y) * car.vy) / Math.max(1, d * Math.hypot(car.vx, car.vy));
        if (d < CROWD.flee && coming > 0.5 && Math.hypot(car.vx, car.vy) > 40) threat = car;
      }
      let heading = f.heading;
      if (threat) {
        // run: away from the car, a little out from the road
        const d = Math.max(1, Math.hypot(x - threat.x, y - threat.y));
        const out = Math.hypot(st.dx, st.dy);
        if (out < CROWD.away) {
          st.dx += ((x - threat.x) / d) * CROWD.run * dt;
          st.dy += ((y - threat.y) / d) * CROWD.run * dt;
        }
        st.fleeing = 1.2;
        heading = Math.atan2(x - threat.x, -(y - threat.y));
      } else if (st.fleeing > 0) st.fleeing -= dt;
      else if (st.dx || st.dy) {
        // wander back to their place
        const d = Math.hypot(st.dx, st.dy);
        const step = Math.min(d, CROWD.walk * dt);
        st.dx -= (st.dx / d) * step;
        st.dy -= (st.dy / d) * step;
        if (d - step < 0.01) st.dx = st.dy = 0;
        heading = Math.atan2(-st.dx, st.dy);
      }
      x = f.x + st.dx;
      y = f.y + st.dy;
      // cheering: a car near, they jump and wave, each in their own time
      const cheer = near < CROWD.cheer && !threat && st.fleeing <= 0;
      const hop = cheer ? Math.abs(Math.sin((t + f.phase) * 9)) * 2.2 : 0;
      const z = groundAt(circuit.grid, x, y).h + hop;
      place(legs, i, x, z, y, heading, f.size);
      place(body, i, x, z, y, heading, f.size);
      place(head, i, x, z, y, heading, f.size);
      // (arms from the shoulders: up and waving to cheer, down otherwise)
      const wave = cheer ? Math.PI * 0.85 + Math.sin((t + f.phase) * 14) * 0.3 : 0.1;
      const fx = Math.sin(heading);
      const fy = -Math.cos(heading);
      arms.forEach((a, k) => {
        const side = k === 0 ? -1 : 1;
        const ax = x + -fy * side * 2.3 * f.size;
        const ay = y + fx * side * 2.3 * f.size;
        q.setFromEuler(e.set(0, -heading, side * wave, 'YXZ'));
        a.setMatrixAt(i, m.compose(v.set(ax, z + 9.2 * f.size, ay), q, s.set(f.size, f.size, f.size)));
      });
    });
    for (const mesh of [legs, body, head, ...arms]) mesh.instanceMatrix.needsUpdate = true;
  };
  draw(0, [], 0);
  return { group, animate: (t, dt, cars) => draw(t, cars, Math.min(dt, 0.1)) };
}
