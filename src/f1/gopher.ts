// A gopher at Twin Lakes (layout.gophers): now and then one pops up out of its
// hole just past the edge of the track, up the road from the camera, looks about, and
// scurries across to its hole on the other side, where it ducks back in. It
// only sets off with no car coming; caught on the track by one, it bolts for
// the nearer hole, three times as fast. Scenery only: no car ever touches it.
// Engine-free (GopherRun) and unit-tested; gopherModel/buildGopher draw it.

import * as THREE from 'three';
import { groundAt, type Grid } from '../engine/sim';
import { HALF_WIDTH } from './circuit';
import { lateralOffset, nearestSample, type Track } from './racing';

type Sample = Track['samples'][number];

export const GOPHER = {
  /** s between one crossing and the next (at least, and up to this much more) */
  wait: 12,
  waitMore: 16,
  /** px along the lap ahead of the camera's focus a crossing may be: just out of sight, coming into it */
  ahead: { from: 340, to: 640 },
  /** px out past the track's edge each hole is */
  holeOut: 22,
  /** px/s it scurries; × that when a car catches it on the track */
  speed: 46,
  bolt: 3,
  /** s it takes to pop up out of the hole and look about, and to duck back in */
  peek: 1.1,
  duck: 0.4,
  /** px: no car this near the crossing for it to set off; one this near while it's crossing sends it bolting */
  clear: 200,
  danger: 130,
  /** × its size (and its holes'): life size is lost among the cars from the camera's height */
  size: 1.8,
};

/** A car, as the gopher sees it. */
export interface GopherCar {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/** Where it is, which way it faces (radians, as the track's), how far up out of the ground (0 in its hole, 1 out), and its stride. */
export interface GopherPose {
  x: number;
  y: number;
  heading: number;
  up: number;
  step: number;
  running: boolean;
}

function rng(seed: number): () => number {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

/** The gopher's crossings of the track. */
export class GopherRun {
  /** the crossing under way: its holes, how far across (0…1), and what it's doing */
  crossing?: { from: { x: number; y: number }; to: { x: number; y: number }; done: number; phase: 'peek' | 'run' | 'bolt' | 'duck'; t: number; back: boolean };
  /** crossings made, and those it bolted from */
  crossings = 0;
  bolts = 0;
  private wait: number;
  private readonly r: () => number;
  private stride = 0;

  constructor(private readonly track: Track, seed = 5) {
    this.r = rng(seed);
    this.wait = GOPHER.wait * 0.5 + this.r() * GOPHER.waitMore;
  }

  /** `dt` s on, near `focus` (the camera's), with `cars` about. */
  step(dt: number, cars: GopherCar[], focus: { x: number; y: number }): void {
    if (dt <= 0) return;
    const c = this.crossing;
    if (!c) {
      this.wait -= dt;
      if (this.wait > 0) return;
      this.start(cars, focus);
      return;
    }
    c.t += dt;
    const at = this.where();
    const danger = cars.some((k) => Math.hypot(k.x - at.x, k.y - at.y) < GOPHER.danger);
    if (c.phase === 'peek') {
      // (a car coming as it looks about: back down its hole)
      if (danger) this.end();
      else if (c.t >= GOPHER.peek) Object.assign(c, { phase: 'run', t: 0 });
      return;
    }
    const length = Math.hypot(c.to.x - c.from.x, c.to.y - c.from.y);
    if (c.phase === 'run' && danger) {
      // caught on the track: for the nearer hole, as fast as it can
      Object.assign(c, { phase: 'bolt', back: c.done < 0.5 });
      this.bolts++;
    }
    if (c.phase === 'run' || c.phase === 'bolt') {
      const speed = GOPHER.speed * (c.phase === 'bolt' ? GOPHER.bolt : 1);
      this.stride += speed * dt;
      c.done += ((c.back ? -1 : 1) * speed * dt) / length;
      if (c.done >= 1 || c.done <= 0) {
        c.done = Math.max(0, Math.min(1, c.done));
        Object.assign(c, { phase: 'duck', t: 0 });
      }
      return;
    }
    if (c.t >= GOPHER.duck) this.end();
  }

  /** Off across the track up the road from `focus`: at a spot with no car near, if there's one. */
  private start(cars: GopherCar[], focus: { x: number; y: number }): void {
    const { samples } = this.track;
    const n = samples.length;
    const spacing = samples[1].s - samples[0].s;
    const at = nearestSample(this.track, focus.x, focus.y);
    const ahead = [];
    for (let k = Math.ceil(GOPHER.ahead.from / spacing); k <= GOPHER.ahead.to / spacing && k < n; k++) ahead.push(samples[(at + k) % n]);
    const clear = ahead.filter((p) => cars.every((k) => Math.hypot(k.x - p.x, k.y - p.y) > GOPHER.clear));
    if (!clear.length) {
      // (none clear: it tries again a moment later)
      this.wait = 1.5;
      return;
    }
    const out = HALF_WIDTH + GOPHER.holeOut;
    const hole = (p: Sample, s: number, along: number) => ({ x: p.x + Math.cos(p.dir) * out * s + Math.sin(p.dir) * along, y: p.y + Math.sin(p.dir) * out * s - Math.cos(p.dir) * along });
    // (its holes in the grass: not on another stretch of the lap running by)
    const offTrack = (h: { x: number; y: number }) => Math.abs(lateralOffset(this.track, nearestSample(this.track, h.x, h.y), h.x, h.y)) > HALF_WIDTH + GOPHER.holeOut / 2;
    const p = clear[Math.floor(this.r() * clear.length)];
    const side = this.r() < 0.5 ? 1 : -1;
    // (a little aslant, as an animal crosses)
    const lean = (this.r() - 0.5) * 30;
    const from = hole(p, side, -lean);
    const to = hole(p, -side, lean);
    if (!offTrack(from) || !offTrack(to)) {
      this.wait = 1.5;
      return;
    }
    this.crossing = { from, to, done: 0, phase: 'peek', t: 0, back: false };
  }

  private end(): void {
    if (this.crossing && this.crossing.phase === 'duck' && (this.crossing.done >= 1 || this.crossing.done <= 0)) this.crossings++;
    this.crossing = undefined;
    this.wait = GOPHER.wait + this.r() * GOPHER.waitMore;
  }

  /** Where it is on its way across. */
  private where(): { x: number; y: number } {
    const c = this.crossing!;
    return { x: c.from.x + (c.to.x - c.from.x) * c.done, y: c.from.y + (c.to.y - c.from.y) * c.done };
  }

  /** How it looks now (none: it's in its hole). */
  pose(): GopherPose | undefined {
    const c = this.crossing;
    if (!c) return undefined;
    const at = this.where();
    const dir = Math.atan2(c.to.y - c.from.y, c.to.x - c.from.x) + (c.back ? Math.PI : 0);
    const up = c.phase === 'peek' ? Math.min(1, c.t / (GOPHER.peek * 0.4)) : c.phase === 'duck' ? Math.max(0, 1 - c.t / GOPHER.duck) : 1;
    return { ...at, heading: dir, up, step: this.stride / 5, running: c.phase === 'run' || c.phase === 'bolt' };
  }
}

const FUR = new THREE.MeshLambertMaterial({ color: 0x8a5a32 });
const BELLY = new THREE.MeshLambertMaterial({ color: 0xc89a6a });
const DARK = new THREE.MeshLambertMaterial({ color: 0x2a1a10 });
const TEETH = new THREE.MeshLambertMaterial({ color: 0xf4efe0 });
const DIRT = new THREE.MeshLambertMaterial({ color: 0x5e4630 });

/** A gopher, about 12 px nose to tail, facing +x (drawn GOPHER.size times that). */
export function gopherModel(): { group: THREE.Group; body: THREE.Group; feet: THREE.Object3D[] } {
  const group = new THREE.Group();
  const body = new THREE.Group();
  const part = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    body.add(m);
  };
  part(new THREE.BoxGeometry(6, 3.4, 3.6), FUR, 0, 2.3);
  part(new THREE.BoxGeometry(4.4, 1, 3), BELLY, 0.3, 0.9);
  part(new THREE.BoxGeometry(2.8, 2.8, 3), FUR, 3.6, 3.2);
  part(new THREE.BoxGeometry(1, 1.3, 1.6), BELLY, 5.2, 2.7);
  part(new THREE.BoxGeometry(0.5, 0.9, 1), TEETH, 5.7, 1.9);
  part(new THREE.BoxGeometry(0.5, 0.6, 0.6), DARK, 5.8, 3.2);
  for (const z of [-1, 1]) {
    part(new THREE.BoxGeometry(0.5, 0.5, 0.5), DARK, 4.7, 3.9, z * 1.1);
    part(new THREE.BoxGeometry(0.6, 0.9, 0.7), FUR, 3, 4.7, z * 1.2);
  }
  part(new THREE.BoxGeometry(2.4, 0.8, 0.8), FUR, -3.8, 1.8);
  group.add(body);
  const feet: THREE.Object3D[] = [];
  for (const [x, z] of [[2, 1.3], [2, -1.3], [-2, 1.3], [-2, -1.3]]) {
    const foot = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1), DARK);
    foot.position.set(x, 0.6, z);
    body.add(foot);
    feet.push(foot);
  }
  return { group, body, feet };
}

/** The gopher at a circuit with them, in `scene`. Gives back its crossings, and its step (`dt` s on, with `cars` about, near `focus`). */
export function buildGopher(scene: THREE.Scene, grid: Grid, track: Track): { run: GopherRun; step: (dt: number, cars: GopherCar[], focus: { x: number; y: number }) => void } {
  const run = new GopherRun(track);
  const { group, body, feet } = gopherModel();
  // its two holes: a dark hole in a ring of dug earth, either side of the track
  const hole = () => {
    const g = new THREE.Group();
    const mound = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 5, 1, 10), DIRT);
    mound.position.y = 0.3;
    const pit = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 0.2, 10), DARK);
    pit.position.y = 0.85;
    g.add(mound, pit);
    g.scale.setScalar(GOPHER.size);
    g.visible = false;
    scene.add(g);
    return g;
  };
  const holes = [hole(), hole()];
  group.scale.setScalar(GOPHER.size);
  group.visible = false;
  scene.add(group);
  let shown: GopherRun['crossing'];
  const step = (dt: number, cars: GopherCar[], focus: { x: number; y: number }) => {
    run.step(dt, cars, focus);
    const c = run.crossing;
    // (the holes stay while it's out, gone once it's in and off elsewhere)
    if (c !== shown) {
      shown = c;
      holes.forEach((h, k) => {
        h.visible = !!c;
        if (!c) return;
        const at = k === 0 ? c.from : c.to;
        h.position.set(at.x, groundAt(grid, at.x, at.y).h, at.y);
      });
    }
    const pose = run.pose();
    group.visible = !!pose && pose.up > 0;
    if (!pose) return;
    const ground = groundAt(grid, pose.x, pose.y).h;
    // (popping up out of the hole: rising from under the ground; running: bobbing with its stride)
    const bob = pose.running ? Math.abs(Math.sin(pose.step * Math.PI)) * 0.8 : 0;
    group.position.set(pose.x, ground + (-(1 - pose.up) * 6 + bob) * GOPHER.size, pose.y);
    group.rotation.y = -pose.heading;
    body.rotation.z = pose.running ? 0 : 0.35 * pose.up;
    feet.forEach((f, k) => (f.position.x = (k < 2 ? 2 : -2) + (pose.running ? Math.sin(pose.step * Math.PI * 2 + (k % 2) * Math.PI) * 0.8 : 0)));
  };
  return { run, step };
}
