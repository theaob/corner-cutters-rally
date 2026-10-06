// The crowd in the grandstands, on its feet (layout.crowds: Dust Bowl): rows of
// spectators on terraced steps in front of each stand, facing the track. Each
// stand's crowd gets excited as the cars come by (more, the nearer they are),
// quickly, and settles slowly once they've gone: excited, they hop and throw
// their arms up, waving; settled, they stand, swaying a little, arms down.
// Each spectator in step with no one else. Engine-free (the excitement and the
// poses, unit-tested); buildCrowds draws them, instanced.

import * as THREE from 'three';
import { groundAt, type Grid } from '../engine/sim';
import type { Stand } from './stands';

export const CROWD = {
  /** rows of them, on steps in front of the stand (px deep each, and px higher each row back), and px apart along a row */
  rows: 3,
  step: 4.5,
  riser: 2.6,
  spacing: 4.5,
  /** px from the stand's middle within which a car excites its crowd (and fully, this near) */
  near: 360,
  full: 120,
  /** how fast excitement rises (/s) and settles (/s) */
  rise: 3,
  settle: 0.5,
  /** px they hop at their most excited; hops a second */
  hop: 2.4,
  hops: 1.3,
};

/** A stand's crowd's excitement `dt` s on, from `was`, with the nearest car `nearest` px from the stand's middle. */
export function excitement(was: number, nearest: number, dt: number): number {
  const want = Math.max(0, Math.min(1, (CROWD.near - nearest) / (CROWD.near - CROWD.full)));
  return want > was ? Math.min(want, was + CROWD.rise * dt) : Math.max(want, was - CROWD.settle * dt);
}

/** How a spectator stands `time` s on in a crowd that `excited` (0…1), at its own `phase`: how high it hops (px), how far up its arms are (0 down … 1 up), and its sway (radians). */
export function spectatorPose(excited: number, time: number, phase: number): { hop: number; arms: number; sway: number } {
  const beat = time * CROWD.hops * Math.PI * 2 + phase;
  const hop = excited * CROWD.hop * Math.abs(Math.sin(beat));
  // (arms up once it's worked up, waving in time)
  const arms = excited > 0.25 ? Math.min(1, (excited - 0.25) * 2) * (0.75 + 0.25 * Math.sin(beat * 1.5)) : 0;
  return { hop, arms, sway: Math.sin(time * 1.3 + phase) * (0.06 + 0.08 * excited) };
}

/** Where each spectator in front of `stand` stands, in the stand's own space (its face toward the track is −x, its length runs along z): x and z, its floor's height off the ground, and its own phase. */
export function spectatorsOf(stand: Stand, seed: number): { x: number; z: number; floor: number; phase: number }[] {
  const out: { x: number; z: number; floor: number; phase: number }[] = [];
  let s = seed >>> 0;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const half = stand.len / 2 - 3;
  for (let row = 0; row < CROWD.rows; row++) {
    // (the front row nearest the track, lowest; each row back a step higher)
    const x = -9 - (CROWD.rows - row) * CROWD.step + CROWD.step / 2;
    for (let z = -half; z <= half; z += CROWD.spacing) {
      if (r() < 0.12) continue;
      out.push({ x: x + (r() - 0.5), z: z + (r() - 0.5) * 1.5, floor: (row + 1) * CROWD.riser, phase: r() * Math.PI * 2 });
    }
  }
  return out;
}

const SHIRTS = [0xd8323c, 0xf2c14e, 0x3d7fc4, 0xf4f4f8, 0x5fe0d0, 0xff5fb8, 0x8a3cc8, 0x3d9a5a, 0xf08a2a];
const SKINS = [0xf1c8a0, 0xd9a273, 0xa86d44, 0x7a4a2c, 0xe8b88e];

/** The crowds in front of `stands` in `scene` (on `grid`'s ground). Gives back its step (`dt` s on, with `cars` about). */
export function buildCrowds(scene: THREE.Scene, grid: Grid, stands: Stand[]): (dt: number, cars: { x: number; y: number }[]) => void {
  const people = stands.map((s, k) => spectatorsOf(s, k * 7919 + 13));
  const n = people.reduce((a, p) => a + p.length, 0);
  const stepMat = new THREE.MeshLambertMaterial({ color: 0x9a9ea8 });
  const lambert = () => new THREE.MeshLambertMaterial({ color: 0xffffff });
  const bodies = new THREE.InstancedMesh(new THREE.BoxGeometry(2.6, 3.6, 2).translate(0, 1.8, 0), lambert(), n);
  const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(1.8, 1.8, 1.8).translate(0, 0.9, 0), lambert(), n);
  // (an arm hangs from its shoulder: it turns up about the shoulder)
  const arm = () => new THREE.InstancedMesh(new THREE.BoxGeometry(0.8, 2.8, 0.8).translate(0, -1.4, 0), lambert(), n);
  const arms = [arm(), arm()];
  const c = new THREE.Color();
  // the stands' own spaces, and their steps
  const frames = stands.map((s) => {
    const frame = new THREE.Group();
    frame.position.set(s.x, groundAt(grid, s.x, s.y).h, s.y);
    frame.rotation.y = -s.dir + (s.side < 0 ? Math.PI : 0);
    frame.updateMatrixWorld();
    for (let row = 0; row < CROWD.rows; row++) {
      const x = -9 - (CROWD.rows - row) * CROWD.step + CROWD.step / 2;
      const h = (row + 1) * CROWD.riser;
      const step = new THREE.Mesh(new THREE.BoxGeometry(CROWD.step, h, s.len).translate(x, h / 2, 0), stepMat);
      step.receiveShadow = true;
      frame.add(step);
    }
    scene.add(frame);
    return frame;
  });
  let i = 0;
  people.forEach((list, k) =>
    list.forEach((p) => {
      bodies.setColorAt(i, c.setHex(SHIRTS[Math.floor(((p.phase * 7) % 1) * SHIRTS.length) % SHIRTS.length]));
      heads.setColorAt(i, c.setHex(SKINS[Math.floor(((p.phase * 13) % 1) * SKINS.length) % SKINS.length]));
      for (const a of arms) a.setColorAt(i, c.setHex(SKINS[Math.floor(((p.phase * 13) % 1) * SKINS.length) % SKINS.length]));
      i++;
      void k;
    }),
  );
  for (const mesh of [bodies, heads, ...arms]) {
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    scene.add(mesh);
  }
  const excited = stands.map(() => 0);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  let time = 0;
  const draw = () => {
    let j = 0;
    people.forEach((list, k) => {
      const frame = frames[k].matrixWorld;
      for (const p of list) {
        const pose = spectatorPose(excited[k], time, p.phase);
        const y = p.floor + pose.hop;
        // body and head, facing the track (−x), swaying
        q.setFromEuler(e.set(pose.sway, -Math.PI / 2, 0, 'YXZ'));
        m.compose(v.set(p.x, y, p.z), q, one).premultiply(frame);
        bodies.setMatrixAt(j, m);
        m.compose(v.set(p.x, y + 3.6, p.z), q, one).premultiply(frame);
        heads.setMatrixAt(j, m);
        // arms: hanging at its sides, or turned up over its head about the shoulder
        arms.forEach((a, side) => {
          const sign = side === 0 ? -1 : 1;
          q.setFromEuler(e.set(pose.sway, -Math.PI / 2, sign * (0.15 + pose.arms * 2.7), 'YXZ'));
          m.compose(v.set(p.x, y + 3.3, p.z + sign * 1.7), q, one).premultiply(frame);
          a.setMatrixAt(j, m);
        });
        j++;
      }
    });
    for (const mesh of [bodies, heads, ...arms]) mesh.instanceMatrix.needsUpdate = true;
  };
  draw();
  return (dt, cars) => {
    time += dt;
    stands.forEach((s, k) => {
      let nearest = Infinity;
      for (const car of cars) nearest = Math.min(nearest, Math.hypot(car.x - s.x, car.y - s.y));
      excited[k] = excitement(excited[k], nearest, dt);
    });
    draw();
  };
}
