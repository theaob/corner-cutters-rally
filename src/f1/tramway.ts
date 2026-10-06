// An aerial tramway (layout.tramway: Glacier Pass): from a station on the
// valley floor in the infield up to one on the mountainside by the summit, two
// ropes slung over a couple of lattice towers between them, and a cabin on
// each. As in a real one, the two cabins are hauled together: as one climbs
// the other comes down, passing mid-way, and each waits a while at its
// station before setting off again (easing away and easing in). Its line is
// clear of the track (no tree stands under it either: forest3d.ts), and the
// ropes are always well above the ground. Engine-free (tramwayOf, ropeAt,
// cabinsAt) and unit-tested; buildTramway draws it.

import * as THREE from 'three';
import { groundAt, type Grid } from '../engine/sim';
import type { Circuit } from './circuit';

export const TRAMWAY = {
  /** px up off the station's floor the ropes leave it */
  station: 40,
  /** a station's size (px): along the line, across it, and its walls' height */
  house: { along: 34, across: 38, high: 28 },
  /** the towers between the stations, and how far each stands up past the line between them (px) */
  towers: 2,
  towerLift: 6,
  /** px between the two ropes */
  gauge: 16,
  /** the ropes' sag mid-span, as a share of the span */
  sag: 0.035,
  /** px the ropes keep above the ground at the least */
  clearance: 18,
  /** a cabin (px: along, across, high), and how far it hangs under its rope */
  cabin: { along: 18, across: 12, high: 13 },
  hang: 9,
  /** s a cabin takes from one station to the other, and waits at each */
  travel: 26,
  dwell: 7,
  /** px either side of its line no tree stands */
  corridor: 34,
};

export interface RopePoint {
  x: number;
  y: number;
  /** height (px) */
  z: number;
}

export interface Tramway {
  /** its two stations (the valley's, then the summit's): where they stand, and the ground there */
  from: { x: number; y: number; h: number };
  to: { x: number; y: number; h: number };
  /** where the ropes rest (mid-way between them): the stations' and the towers' tops, from the valley up */
  supports: RopePoint[];
  /** the line's direction (radians, as Math.atan2 of its run) and length (px) */
  angle: number;
  length: number;
}

/** The circuit's tramway, if it has one. */
export function tramwayOf(circuit: Circuit): Tramway | undefined {
  const t = circuit.layout.tramway;
  if (!t) return undefined;
  return tramwayOn(circuit.grid, t.from, t.to);
}

/** A tramway on `grid` from `from` (the valley's station) to `to` (the summit's). */
export function tramwayOn(grid: Grid, [ax, ay]: [number, number], [bx, by]: [number, number]): Tramway {
  const from = { x: ax, y: ay, h: groundAt(grid, ax, ay).h };
  const to = { x: bx, y: by, h: groundAt(grid, bx, by).h };
  const a = { x: ax, y: ay, z: from.h + TRAMWAY.station };
  const b = { x: bx, y: by, z: to.h + TRAMWAY.station };
  const supports: RopePoint[] = [a];
  for (let k = 1; k <= TRAMWAY.towers; k++) {
    const f = k / (TRAMWAY.towers + 1);
    const x = ax + (bx - ax) * f;
    const y = ay + (by - ay) * f;
    // (a tower stands up past the line between the stations, and never so short its ropes would touch the ground)
    supports.push({ x, y, z: Math.max(a.z + (b.z - a.z) * f + TRAMWAY.towerLift, groundAt(grid, x, y).h + TRAMWAY.station) });
  }
  supports.push(b);
  return { from, to, supports, angle: Math.atan2(by - ay, bx - ax), length: Math.hypot(bx - ax, by - ay) };
}

/** Where the line is `f` of the way up (0 at the valley's station, 1 the summit's), `side` (-1 or 1) of it a rope's (0: mid-way between them). */
export function ropeAt(t: Tramway, f: number, side = 0): RopePoint {
  const s = t.supports;
  const spans = s.length - 1;
  const k = Math.min(spans - 1, Math.max(0, Math.floor(f * spans)));
  const u = Math.max(0, Math.min(1, f * spans - k));
  const p = s[k];
  const q = s[k + 1];
  const span = Math.hypot(q.x - p.x, q.y - p.y);
  // (slung between its supports: sagging most mid-span)
  const z = p.z + (q.z - p.z) * u - TRAMWAY.sag * span * 4 * u * (1 - u);
  const across = (side * TRAMWAY.gauge) / 2;
  return { x: p.x + (q.x - p.x) * u - Math.sin(t.angle) * across, y: p.y + (q.y - p.y) * u + Math.cos(t.angle) * across, z };
}

/** How far up (0…1) each cabin is, `time` s on: the first leaves the valley as the second leaves the summit. */
export function cabinsAt(time: number): [number, number] {
  const leg = TRAMWAY.travel + TRAMWAY.dwell;
  const t = ((time % (2 * leg)) + 2 * leg) % (2 * leg);
  // (on its way: easing away, and easing in)
  const go = (s: number) => {
    const u = Math.max(0, Math.min(1, s / TRAMWAY.travel));
    return u * u * (3 - 2 * u);
  };
  const up = t < leg ? go(t) : 1 - go(t - leg);
  return [up, 1 - up];
}

const STEEL = new THREE.MeshLambertMaterial({ color: 0x6c7480 });
const ROOF = new THREE.MeshLambertMaterial({ color: 0x8a2f2a });
const WALL = new THREE.MeshLambertMaterial({ color: 0xd8d2c4 });
const GLASS = new THREE.MeshLambertMaterial({ color: 0x2c4660 });
const CABINS = [0xd8312c, 0xf2b630].map((c) => new THREE.MeshLambertMaterial({ color: c }));

/** The tramway in `scene` (on `grid`'s ground): its stations, towers and ropes, and its two cabins. Gives back its step (`dt` s on). */
export function buildTramway(scene: THREE.Scene, grid: Grid, t: Tramway): (dt: number) => void {
  const group = new THREE.Group();
  const solid = <M extends THREE.Object3D>(m: M) => {
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  };
  const turn = -t.angle;
  // the stations: a house with a pitched roof, its open end facing along the line, the rope wheel out over it
  for (const [s, faces] of [[t.from, 1], [t.to, -1]] as const) {
    const { along, across, high } = TRAMWAY.house;
    const house = new THREE.Group();
    house.add(solid(new THREE.Mesh(new THREE.BoxGeometry(along, high + 4, across), WALL)).translateY(high / 2 - 2));
    const roof = solid(new THREE.Mesh(new THREE.CylinderGeometry(across * 0.62, across * 0.62, along + 6, 3), ROOF));
    roof.rotation.set(0, 0, Math.PI / 2);
    // (pitched low)
    roof.scale.set(0.42, 1, 1);
    roof.position.y = high + 2;
    house.add(roof);
    // (a band of windows along each side)
    for (const z of [-1, 1]) house.add(new THREE.Mesh(new THREE.BoxGeometry(along * 0.7, 4, 0.6), GLASS).translateY(high * 0.62).translateZ((z * across) / 2 + z * 0.3));
    // (the bull wheel the ropes turn on, out over its open end)
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(TRAMWAY.gauge / 2 + 1, TRAMWAY.gauge / 2 + 1, 2, 12), STEEL);
    wheel.position.set((faces * along) / 2 + faces * 2, TRAMWAY.station, 0);
    house.add(wheel);
    house.position.set(s.x, s.h, s.y);
    house.rotation.y = turn;
    group.add(house);
  }
  // the towers: four legs tapering up to a crossbeam carrying both ropes, braced as they go
  for (const p of t.supports.slice(1, -1)) {
    const foot = groundAt(grid, p.x, p.y).h;
    const high = p.z - foot;
    const tower = new THREE.Group();
    const base = 9;
    const top = 3;
    for (const [i, k] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
      const leg = solid(new THREE.Mesh(new THREE.BoxGeometry(1.4, high, 1.4), STEEL));
      // (leaning in from its foot to the top)
      leg.position.set((i * (base + top)) / 2, high / 2, (k * (base + top)) / 2);
      leg.rotation.set(-k * Math.atan((base - top) / high), 0, i * Math.atan((base - top) / high));
      tower.add(leg);
    }
    for (let y = 14; y < high - 4; y += 16) {
      const w = (base - ((base - top) * y) / high) * 2;
      for (const z of [-1, 1]) tower.add(new THREE.Mesh(new THREE.BoxGeometry(w, 1, 1), STEEL).translateY(y).translateZ((z * w) / 2));
      for (const x of [-1, 1]) tower.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, w), STEEL).translateY(y).translateX((x * w) / 2));
    }
    tower.add(solid(new THREE.Mesh(new THREE.BoxGeometry(5, 2.5, TRAMWAY.gauge + 8), STEEL)).translateY(high));
    tower.position.set(p.x, foot, p.y);
    tower.rotation.y = turn;
    group.add(tower);
  }
  // the ropes: slung from support to support
  const STEPS = 120;
  for (const side of [-1, 1]) {
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= STEPS; k++) {
      const r = ropeAt(t, k / STEPS, side);
      pts.push(new THREE.Vector3(r.x, r.z, r.y));
    }
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x2a2a30 })));
  }
  // the cabins: one on each rope, hung from a carriage on it, its windows all round
  const cabins = CABINS.map((paint) => {
    const { along, across, high } = TRAMWAY.cabin;
    const cabin = new THREE.Group();
    cabin.add(solid(new THREE.Mesh(new THREE.BoxGeometry(along, high, across), paint)).translateY(-TRAMWAY.hang - high / 2));
    for (const z of [-1, 1]) cabin.add(new THREE.Mesh(new THREE.BoxGeometry(along * 0.8, high * 0.35, 0.5), GLASS).translateY(-TRAMWAY.hang - high * 0.36).translateZ((z * across) / 2 + z * 0.3));
    for (const x of [-1, 1]) cabin.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, high * 0.35, across * 0.75), GLASS).translateY(-TRAMWAY.hang - high * 0.36).translateX((x * along) / 2 + x * 0.3));
    cabin.add(new THREE.Mesh(new THREE.BoxGeometry(along + 1, 1.5, across + 1), STEEL).translateY(-TRAMWAY.hang + 0.6));
    cabin.add(new THREE.Mesh(new THREE.BoxGeometry(1.2, TRAMWAY.hang, 1.2), STEEL).translateY(-TRAMWAY.hang / 2));
    cabin.add(new THREE.Mesh(new THREE.BoxGeometry(7, 2.4, 2.4), STEEL));
    cabin.rotation.y = turn;
    group.add(cabin);
    return cabin;
  });
  scene.add(group);
  let time = 0;
  const place = () => {
    cabinsAt(time).forEach((f, k) => {
      const r = ropeAt(t, f, k === 0 ? -1 : 1);
      cabins[k].position.set(r.x, r.z, r.y);
    });
  };
  place();
  return (dt: number) => {
    time += dt;
    place();
  };
}
