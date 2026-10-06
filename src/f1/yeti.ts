// A yeti in the snow (layout.yeti: Glacier Pass), after the one in the old
// skiing game: now and then one lies in wait beside the track up the road from
// the camera, out on the run-off just off the track's edge. When the car comes
// by it throws its arms up, roars and gives chase, bounding along beside the
// track with its arms pumping; quick, but no match for a car at full speed on
// a straight, it keeps up in the bends and drops back on the straights. Left
// behind (or tired out), it gives up and lopes off into the snow, and waits
// for the next time. It waits on the side of the track nearer the camera (more
// of the screen's that side of the car), never by the pits' buildings or a
// grandstand (it gives up at them). It never sets foot on the track (it keeps
// to the run-off); scenery only: no car ever touches it. Engine-free (YetiRun)
// and unit-tested; yetiModel and buildYeti draw it.

import * as THREE from 'three';
import { groundAt, type Grid } from '../engine/sim';
import { HALF_WIDTH, type Circuit } from './circuit';
import { GARAGE_ACROSS } from './pits';
import { lateralOffset, nearestSample, type Track } from './racing';
import { STAND, standsOf } from './stands';

export const YETI = {
  /** s between one chase and the next (at least, and up to this much more) */
  wait: 14,
  waitMore: 18,
  /** px along the lap ahead of the camera's focus it lies in wait: just out of sight, coming into it */
  ahead: { from: 420, to: 640 },
  /** px out past the track's edge it keeps to (on the run-off, short of the barriers) */
  out: 30,
  /** px: the car this near, it sees it (and roars); s it roars for */
  sees: 260,
  roar: 0.9,
  /** px/s it bounds along at (an F1 car's quicker, on a straight); s it chases for at the most */
  speed: 210,
  chase: 9,
  /** px: the car this far off, it's lost it (and gives up) */
  lose: 560,
  /** s it waits for a car that doesn't come (one gone the other way, or into the pits) */
  patience: 12,
  /** px/s it lopes off at, giving up, and for how long (s) before it's out of sight */
  leave: 120,
  leaveFor: 4,
  /** × the model's size: big (as in the old game, it towers over the skier), and so it shows against the snow */
  size: 1.4,
};

/** The car it's after (the camera's): where it is. */
export interface YetiFocus {
  x: number;
  y: number;
}

/** Where it is and what it's doing; its heading (radians, as Math.atan2 of its run) and stride. */
export interface YetiPose {
  x: number;
  y: number;
  heading: number;
  phase: 'wait' | 'roar' | 'chase' | 'leave';
  /** s into what it's doing */
  t: number;
  step: number;
}

function rng(seed: number): () => number {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

/** The yeti's chases. */
export class YetiRun {
  /** out in the open (none: it's off out of sight) */
  pose?: YetiPose;
  /** chases it's given (it roared and set off after a car) */
  chases = 0;
  /** which side of the track it's on (-1 or 1) */
  private side = 1;
  private wait: number;
  private readonly r: () => number;
  /** px from the track's centreline it keeps to, at the least */
  readonly keep = HALF_WIDTH + YETI.out;

  /** `avoid`: places it keeps away from (px round each): the pits' buildings, the grandstands */
  constructor(private readonly track: Track, private readonly avoid: { x: number; y: number; r: number }[] = [], seed = 3) {
    this.r = rng(seed);
    this.wait = YETI.wait * 0.4 + this.r() * YETI.waitMore * 0.5;
  }

  /** `dt` s on, the camera on `focus` (the car it's after). */
  step(dt: number, focus: YetiFocus): void {
    if (dt <= 0) return;
    const p = this.pose;
    if (!p) {
      this.wait -= dt;
      if (this.wait <= 0) this.appear(focus);
      return;
    }
    p.t += dt;
    const far = Math.hypot(focus.x - p.x, focus.y - p.y);
    if (p.phase === 'wait') {
      p.heading = Math.atan2(focus.y - p.y, focus.x - p.x);
      if (far < YETI.sees) Object.assign(p, { phase: 'roar', t: 0 });
      else if (p.t > YETI.patience) this.gone();
      return;
    }
    if (p.phase === 'roar') {
      p.heading = Math.atan2(focus.y - p.y, focus.x - p.x);
      if (p.t >= YETI.roar) {
        Object.assign(p, { phase: 'chase', t: 0 });
        this.chases++;
      }
      return;
    }
    if (p.phase === 'chase') {
      if (far > YETI.lose || p.t > YETI.chase || this.blocked(p)) {
        // (given up: off away from the track)
        const i = nearestSample(this.track, p.x, p.y);
        const q = this.track.samples[i];
        Object.assign(p, { phase: 'leave', t: 0, heading: Math.atan2(Math.sin(q.dir) * this.side, Math.cos(q.dir) * this.side) });
        return;
      }
      // after the car: for the spot beside it, on its own side of the track
      const i = nearestSample(this.track, focus.x, focus.y);
      const q = this.track.samples[i];
      const tx = q.x + Math.cos(q.dir) * this.keep * this.side;
      const ty = q.y + Math.sin(q.dir) * this.keep * this.side;
      const dx = tx - p.x;
      const dy = ty - p.y;
      const d = Math.hypot(dx, dy);
      const go = Math.min(d, YETI.speed * dt);
      if (d > 0.5) {
        p.heading = Math.atan2(dy, dx);
        p.x += (dx / d) * go;
        p.y += (dy / d) * go;
        p.step += go;
      }
      this.keepOff(p);
      return;
    }
    // giving up: loping off into the snow, then gone
    p.x += Math.cos(p.heading) * YETI.leave * dt;
    p.y += Math.sin(p.heading) * YETI.leave * dt;
    p.step += YETI.leave * dt;
    if (p.t >= YETI.leaveFor) this.gone();
  }

  /** Out of the snow up the road from `focus`, beside the track, if there's a spot clear of the lap's other stretches. */
  private appear(focus: YetiFocus): void {
    const { samples } = this.track;
    const n = samples.length;
    const spacing = samples[1].s - samples[0].s;
    const at = nearestSample(this.track, focus.x, focus.y);
    const k = Math.round((YETI.ahead.from + this.r() * (YETI.ahead.to - YETI.ahead.from)) / spacing);
    const q = samples[(at + k) % n];
    // (on the camera's side of the track, the south: where more of the screen is; either, by a stretch running north and south)
    const south = Math.sin(q.dir);
    this.side = Math.abs(south) > 0.3 ? Math.sign(south) : this.r() < 0.5 ? 1 : -1;
    const x = q.x + Math.cos(q.dir) * this.keep * this.side;
    const y = q.y + Math.sin(q.dir) * this.keep * this.side;
    // (not on another stretch of the lap running by, nor by the pits or a grandstand: try again a moment later)
    if (Math.abs(lateralOffset(this.track, nearestSample(this.track, x, y), x, y)) < this.keep - 1 || this.blocked({ x, y })) {
      this.wait = 1.5;
      return;
    }
    this.pose = { x, y, heading: Math.atan2(focus.y - y, focus.x - x), phase: 'wait', t: 0, step: 0 };
  }

  /** By the pits' buildings or a grandstand. */
  private blocked(p: { x: number; y: number }): boolean {
    return this.avoid.some((a) => Math.hypot(a.x - p.x, a.y - p.y) < a.r);
  }

  /** Never on the track: kept out on the run-off, on its own side. */
  private keepOff(p: YetiPose): void {
    const i = nearestSample(this.track, p.x, p.y);
    const off = lateralOffset(this.track, i, p.x, p.y);
    if (Math.abs(off) >= this.keep) return;
    const q = this.track.samples[i];
    const to = (Math.sign(off) || this.side) * this.keep;
    p.x += Math.cos(q.dir) * (to - off);
    p.y += Math.sin(q.dir) * (to - off);
  }

  private gone(): void {
    this.pose = undefined;
    this.wait = YETI.wait + this.r() * YETI.waitMore;
  }
}

/** The places on `circuit` the yeti keeps away from: the pits' buildings, and the grandstands. */
export function yetiAvoids(circuit: Circuit): { x: number; y: number; r: number }[] {
  return [
    ...circuit.pit.points.filter((_, k) => k % 4 === 0).map((p) => ({ x: p.x, y: p.y, r: GARAGE_ACROSS + 60 })),
    ...standsOf(circuit).map((s) => ({ x: s.x, y: s.y, r: s.len / 2 + STAND.depth + 30 })),
  ];
}

const FUR = new THREE.MeshLambertMaterial({ color: 0xf4f6f8 });
const SHADE = new THREE.MeshLambertMaterial({ color: 0xb4c0cc });
const FACE = new THREE.MeshLambertMaterial({ color: 0x6c7688 });
const DARK = new THREE.MeshLambertMaterial({ color: 0x1c1c24 });
const MOUTH = new THREE.MeshLambertMaterial({ color: 0xb8323a });

/** A yeti, about 30 px tall (drawn YETI.size times that), facing +x: big and white and shaggy, a grey face, long arms (to throw up). */
export function yetiModel(): { group: THREE.Group; body: THREE.Group; arms: THREE.Object3D[]; legs: THREE.Object3D[]; mouth: THREE.Object3D } {
  const group = new THREE.Group();
  const body = new THREE.Group();
  const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z = 0, into: THREE.Object3D = body) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    into.add(m);
    return m;
  };
  // the body, broad and shaggy, the belly a shade darker; the head on top, its grey face forward
  box(9, 13, 12, FUR, 0, 15);
  box(1, 9, 8, SHADE, 4.6, 14);
  box(8, 7, 9, FUR, 0.6, 24.5);
  box(1, 5, 6.6, FACE, 4.8, 24);
  for (const z of [-1.6, 1.6]) box(0.6, 1.2, 1.2, DARK, 5.4, 25.4, z);
  const mouth = box(0.6, 1.4, 3.6, MOUTH, 5.4, 22.4);
  // (a tuft on its head)
  box(4, 1.6, 5, FUR, -0.4, 28.6);
  // the arms: from the shoulders, swung up and down about them (they hang to the knees)
  const arms: THREE.Object3D[] = [];
  for (const z of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(0.5, 20, z * 7.6);
    box(3, 11, 3, FUR, 0, -5.5, 0, arm);
    box(3.4, 2.4, 3.4, FACE, 0, -11.6, 0, arm);
    body.add(arm);
    arms.push(arm);
  }
  // the legs: short and thick, big feet
  const legs: THREE.Object3D[] = [];
  for (const z of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(0, 9, z * 3);
    box(4, 8, 4, FUR, 0, -4.5, 0, leg);
    box(6, 2, 4.4, FACE, 1, -8.6, 0, leg);
    body.add(leg);
    legs.push(leg);
  }
  group.add(body);
  return { group, body, arms, legs, mouth };
}

/** The yeti at a circuit with one, in `scene`. Gives back its chases, and its step (`dt` s on, the camera on `focus`). */
export function buildYeti(scene: THREE.Scene, grid: Grid, track: Track, avoid: { x: number; y: number; r: number }[] = []): { run: YetiRun; step: (dt: number, focus: YetiFocus) => void } {
  const run = new YetiRun(track, avoid);
  const { group, body, arms, legs, mouth } = yetiModel();
  group.scale.setScalar(YETI.size);
  group.visible = false;
  scene.add(group);
  const step = (dt: number, focus: YetiFocus) => {
    run.step(dt, focus);
    const p = run.pose;
    group.visible = !!p;
    if (!p) return;
    group.position.set(p.x, groundAt(grid, p.x, p.y).h, p.y);
    group.rotation.y = -p.heading;
    const stride = (p.step / 22) * Math.PI;
    if (p.phase === 'wait') {
      // (lying in wait: hunched, arms down, swaying a little)
      body.position.y = 0;
      body.rotation.z = -0.08 + Math.sin(p.t * 2) * 0.04;
      arms.forEach((a) => (a.rotation.z = 0.1));
      legs.forEach((l) => (l.rotation.z = 0));
      mouth.scale.y = 1;
    } else if (p.phase === 'roar') {
      // (seen you: arms flung up, mouth wide, a hop)
      body.position.y = Math.abs(Math.sin((p.t / YETI.roar) * Math.PI * 2)) * 4;
      body.rotation.z = 0.12;
      arms.forEach((a) => (a.rotation.z = Math.PI * 0.95));
      legs.forEach((l) => (l.rotation.z = 0));
      mouth.scale.y = 2.2;
    } else {
      // (bounding along: arms up and pumping in turn, as in the old game, legs striding, a bob in its step)
      body.position.y = Math.abs(Math.sin(stride)) * 3;
      body.rotation.z = -0.15;
      arms.forEach((a, k) => (a.rotation.z = Math.PI * 0.8 + Math.sin(stride + k * Math.PI) * 0.35));
      legs.forEach((l, k) => (l.rotation.z = Math.sin(stride + k * Math.PI) * 0.6));
      mouth.scale.y = p.phase === 'chase' ? 1.8 : 1;
    }
  };
  return { run, step };
}
