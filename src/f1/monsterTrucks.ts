// Monster trucks in the infield (layout.monsterTrucks: Dust Bowl), jumping a
// pile of crushed cars for the crowd. Their arena is a loop: two lanes side by
// side, a hairpin of packed dirt at each end, and on each lane a ramp either
// side of the pile in the middle. Two trucks go round it half a loop apart, so
// they pass each other going opposite ways, both in the air over the pile at
// once: up the ramp, a flight over the wrecks (the nose up off the lip, level
// at the top, down to meet the far ramp), a landing that squats the truck on
// its springs, and round the hairpin to do it again the other way. Clear of the
// track; scenery only. Engine-free (the arena and the trucks' poses, unit-
// tested); buildMonsterTrucks draws it.

import * as THREE from 'three';
import { groundAt, type Grid } from '../engine/sim';

export const TRUCKS = {
  /** px between the hairpins, along the lanes; px between the lanes */
  length: 560,
  gap: 56,
  /** px/s they go, round and over */
  speed: 150,
  /** each ramp's run (px along) and its rise at the lip (px); px between the two lips (the pile's in between) */
  ramp: 80,
  rise: 24,
  span: 170,
  /** px the flight rises over the lips at its top */
  apex: 38,
  /** s a truck squats on its springs, landing */
  squat: 0.35,
};

export interface Arena {
  /** its middle (px), and the way the lanes run (radians, as Math.atan2 of their run) */
  x: number;
  y: number;
  angle: number;
}

/** Where a truck is and how it sits: its height off the ground there, its heading (radians, as Math.atan2 of its run), its nose up (+) or down (radians), how far it's squatted on its springs (0…1), and whether it's in the air. */
export interface TruckPose {
  x: number;
  y: number;
  z: number;
  heading: number;
  pitch: number;
  squat: number;
  flying: boolean;
}

/** The loop's length (px): two lanes, two hairpins. */
export const loopLength = () => 2 * TRUCKS.length + Math.PI * TRUCKS.gap;

/**
 * Height (px) above the ground `s` px along a lane (0 at one hairpin, TRUCKS.length at the other), and its slope: up
 * the first ramp to its lip, the flight over the pile (a parabola from lip to lip), down the far ramp.
 */
export function laneHeight(s: number): { z: number; slope: number; flying: boolean } {
  const { length, ramp, rise, span, apex } = TRUCKS;
  const mid = length / 2;
  const lipA = mid - span / 2;
  const lipB = mid + span / 2;
  if (s < lipA - ramp || s > lipB + ramp) return { z: 0, slope: 0, flying: false };
  if (s < lipA) return { z: (rise * (s - (lipA - ramp))) / ramp, slope: rise / ramp, flying: false };
  if (s > lipB) return { z: (rise * (lipB + ramp - s)) / ramp, slope: -rise / ramp, flying: false };
  // (the flight: 0 at the take-off lip, 1 at the landing one)
  const u = (s - lipA) / span;
  return { z: rise + apex * 4 * u * (1 - u), slope: (apex * 4 * (1 - 2 * u)) / span, flying: true };
}

/** Truck `k` (of two, half a loop apart) `time` s on, in `arena`. */
export function truckPose(arena: Arena, time: number, k: number): TruckPose {
  const { length, gap, speed, squat } = TRUCKS;
  const L = loopLength();
  const along = (((time * speed + k * (L / 2)) % L) + L) % L;
  const ux = Math.cos(arena.angle);
  const uy = Math.sin(arena.angle);
  // a point `a` px along the lanes from the middle, `c` px across (+: to the right of the way the lanes run)
  const at = (a: number, c: number) => ({ x: arena.x + ux * a - uy * c, y: arena.y + uy * a + ux * c });
  const R = gap / 2;
  const hairpin = Math.PI * R;
  // (how long since the last landing, for the squat: the landing lip's s, back along the way it's going)
  const landed = (s: number) => {
    const lip = length / 2 + TRUCKS.span / 2;
    return s >= lip ? (s - lip) / speed : Infinity;
  };
  const squatOf = (s: number) => Math.max(0, 1 - landed(s) / squat);
  if (along < length) {
    // the first lane, out along the way the lanes run
    const h = laneHeight(along);
    return { ...at(along - length / 2, -R), z: h.z, heading: arena.angle, pitch: Math.atan(h.slope), squat: squatOf(along), flying: h.flying };
  }
  if (along < length + hairpin) {
    // round the far hairpin
    const t = (along - length) / R;
    const p = at(length / 2 + R * Math.sin(t), -R * Math.cos(t));
    return { ...p, z: 0, heading: arena.angle + t, pitch: 0, squat: 0, flying: false };
  }
  if (along < 2 * length + hairpin) {
    // back along the other lane
    const s = along - length - hairpin;
    const h = laneHeight(s);
    return { ...at(length / 2 - s, R), z: h.z, heading: arena.angle + Math.PI, pitch: Math.atan(h.slope), squat: squatOf(s), flying: h.flying };
  }
  // round the near hairpin
  const t = (along - 2 * length - hairpin) / R;
  const p = at(-length / 2 - R * Math.sin(t), R * Math.cos(t));
  return { ...p, z: 0, heading: arena.angle + Math.PI + t, pitch: 0, squat: 0, flying: false };
}

const TYRE = new THREE.MeshLambertMaterial({ color: 0x1a1a1e });
const TREAD = new THREE.MeshLambertMaterial({ color: 0x3a3a40 });
const STEEL = new THREE.MeshLambertMaterial({ color: 0x8a8f99 });
const GLASS = new THREE.MeshLambertMaterial({ color: 0x24384c });
const DIRT = new THREE.MeshLambertMaterial({ color: 0x8a5e38 });
const PAINTS = [
  { body: 0x2fbf4a, trim: 0xf2c14e },
  { body: 0x2f6fe0, trim: 0xe8463c },
];
const WRECKS = [0x7a6a5a, 0x5a6a7a, 0x8a4a3a, 0x6a7a5a, 0x9a8a6a];

/** A monster truck, about 44 px nose to tail, facing +x: a pickup's body up high on four huge tyres. */
export function truckModel(paint: { body: number; trim: number }): { group: THREE.Group; body: THREE.Group; wheels: THREE.Object3D[] } {
  const group = new THREE.Group();
  const body = new THREE.Group();
  const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z = 0, into: THREE.Object3D = body) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    into.add(m);
    return m;
  };
  const coat = new THREE.MeshLambertMaterial({ color: paint.body });
  const trim = new THREE.MeshLambertMaterial({ color: paint.trim });
  // the body: the bonnet, the cab with its windows, the bed; a stripe down its side; the roll bar and lights
  box(34, 7, 20, coat, 0, 0);
  box(12, 8, 18, coat, -2, 7.5);
  for (const z of [-1, 1]) box(10, 4, 0.6, GLASS, -2, 8.5, z * 9.1);
  box(0.6, 4, 15, GLASS, 4.1, 8.5);
  box(34.4, 1.6, 20.4, trim, 0, -1.2);
  box(1.2, 7, 18, STEEL, -12, 6.5);
  for (const z of [-1, 1]) box(1, 2, 3, trim, 17.2, 1, z * 6);
  // the chassis under it, up on its springs
  box(30, 3, 10, STEEL, 0, -6);
  body.position.y = 22;
  group.add(body);
  // the tyres: huge, knobbly, on long legs from the chassis
  const wheels: THREE.Object3D[] = [];
  for (const [x, z] of [[12, 12], [12, -12], [-12, 12], [-12, -12]]) {
    const wheel = new THREE.Group();
    const tyre = new THREE.Mesh(new THREE.CylinderGeometry(10, 10, 8, 14), TYRE);
    tyre.rotation.x = Math.PI / 2;
    tyre.castShadow = true;
    wheel.add(tyre);
    for (let k = 0; k < 10; k++) {
      const knob = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.2, 8.4), TREAD);
      const a = (k / 10) * Math.PI * 2;
      knob.position.set(Math.cos(a) * 10.2, Math.sin(a) * 10.2, 0);
      knob.rotation.z = a;
      wheel.add(knob);
    }
    wheel.position.set(x, 10, z);
    group.add(wheel);
    wheels.push(wheel);
  }
  return { group, body, wheels };
}

/** The arena in `scene` (on `grid`'s ground): its ramps and the pile of wrecks, and the two trucks. Gives back its step (`dt` s on). */
export function buildMonsterTrucks(scene: THREE.Scene, grid: Grid, arena: Arena): (dt: number) => void {
  const { length, gap, ramp, rise, span } = TRUCKS;
  const ground = (x: number, y: number) => groundAt(grid, x, y).h;
  const turn = -arena.angle;
  const ux = Math.cos(arena.angle);
  const uy = Math.sin(arena.angle);
  const place = (o: THREE.Object3D, a: number, c: number, lift = 0) => {
    const x = arena.x + ux * a - uy * c;
    const y = arena.y + uy * a + ux * c;
    o.position.set(x, ground(x, y) + lift, y);
    o.rotation.y = turn;
    scene.add(o);
  };
  // the ramps: a wedge of dirt either side of the pile, on each lane (each a box, tilted to its slope)
  const slope = Math.atan(rise / ramp);
  const run = Math.hypot(ramp, rise);
  for (const lane of [-1, 1]) {
    for (const side of [-1, 1]) {
      const wedge = new THREE.Group();
      const m = new THREE.Mesh(new THREE.BoxGeometry(run, 6, gap * 0.8), DIRT);
      m.rotation.z = side < 0 ? slope : -slope;
      m.position.y = rise / 2 - 2;
      m.castShadow = m.receiveShadow = true;
      wedge.add(m);
      // (and the dirt banked under it, to the ground)
      const under = new THREE.Mesh(new THREE.BoxGeometry(ramp * 0.5, rise * 0.6, gap * 0.8), DIRT);
      under.position.set((side < 0 ? 1 : -1) * ramp * 0.2, rise * 0.3, 0);
      wedge.add(under);
      place(wedge, side * (span / 2 + ramp / 2), (lane * gap) / 2);
    }
  }
  // the pile of wrecks in the middle, under both lanes: flattened cars side by side, a few stacked on them
  for (let k = 0; k < 10; k++) {
    const wreck = new THREE.Mesh(new THREE.BoxGeometry(14, 4, 26), new THREE.MeshLambertMaterial({ color: WRECKS[k % WRECKS.length] }));
    wreck.castShadow = true;
    const stack = k >= 8 ? 1 : 0;
    const lane = k % 2 === 0 ? -1 : 1;
    place(wreck, stack ? lane * 6 : (Math.floor(k / 2) - 1.5) * 16, (lane * gap) / 2, 2 + stack * 4);
    wreck.rotation.y = turn + ((k % 3) - 1) * 0.08;
  }
  // the lanes' packed dirt, the loop round them (a darker band on the ground, just above it)
  const track = new THREE.Mesh(new THREE.PlaneGeometry(length + gap * 2, gap * 2).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x6e4a2c }));
  track.receiveShadow = true;
  place(track, 0, 0, 0.4);
  // the trucks
  const trucks = PAINTS.map((p) => {
    const t = truckModel(p);
    scene.add(t.group);
    return t;
  });
  let time = 0;
  const pose = () => {
    trucks.forEach((t, k) => {
      const p = truckPose(arena, time, k);
      t.group.position.set(p.x, ground(p.x, p.y) + p.z, p.y);
      t.group.rotation.set(0, -p.heading, p.pitch, 'YXZ');
      // (squatting on its springs as it lands; the wheels hanging down in the air)
      t.body.position.y = 22 - p.squat * 6 + (p.flying ? 2 : 0);
      t.wheels.forEach((w) => (w.position.y = p.flying ? 7 : 10));
    });
  };
  pose();
  return (dt: number) => {
    time += dt;
    pose();
  };
}
