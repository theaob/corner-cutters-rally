// Camels at a desert circuit (layout.desert): a few caravans of three to five,
// nose to tail, walking slowly round long loops on the sand just past the
// barriers, where you see them as you drive by. Each loop runs beside a stretch
// of track, out and back on two lines a little apart; none comes near the
// track, the pit lane, a grandstand or a palm. A camel paces as camels do
// (both legs on a side together), its body rising and falling with each step,
// a bright saddle blanket over its back.

import * as THREE from 'three';
import { groundAt } from '../engine/sim';
import { HALF_WIDTH, RUNOFF, TILE as T, type Circuit } from './circuit';
import { treesOf } from './forest3d';
import { GARAGE_ACROSS } from './pits';
import { STAND, standsOf } from './stands';

export const CAMELS = {
  /** caravans round the lap, and camels in one (at least, and up to this many more) */
  caravans: 7,
  least: 3,
  more: 2,
  /** px between one camel and the next in a caravan (a camel is about 16 px, 3 m, long) */
  apart: 22,
  /** px/s they walk (about 1.5 m/s) */
  speed: 9,
  /** px a camel covers in a stride (a pair of steps) */
  stride: 14,
  /** a loop: px long (at least, and up to this much more), and px between its out and back lines */
  length: 240,
  longer: 160,
  across: 14,
  /** px out past the barriers its near line runs (at least, and up to this much more): close, as the camera shows
   * little either side of a stretch running across the screen */
  out: 0,
  further: 14,
  /** px kept clear of the track's run-off, of a palm's trunk, of the pit lane and of a grandstand */
  clearTrack: 24,
  clearPalm: 9,
};

export interface Caravan {
  /** the loop's start and end on the map (its near line), and which side of that line its far line is (+1: right) */
  ax: number;
  ay: number;
  bx: number;
  by: number;
  side: -1 | 1;
  camels: number;
  /** px along the loop the leader starts at */
  start: number;
}

/** A camel's place at a moment: on the map, its heading (0 = north, clockwise), and how far into its stride (0–1). */
export interface CamelAt {
  x: number;
  y: number;
  heading: number;
  step: number;
}

function rng(seed: number): () => number {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

/** px round a caravan's loop */
export function loopLength(c: Caravan): number {
  const L = Math.hypot(c.bx - c.ax, c.by - c.ay);
  return 2 * L + Math.PI * (CAMELS.across / 2) * 2;
}

/** Where on its loop `s` px round is: out along the near line, round the end, back along the far line, round again. */
export function pointOnLoop(c: Caravan, s: number): { x: number; y: number; heading: number } {
  const L = Math.hypot(c.bx - c.ax, c.by - c.ay);
  const r = CAMELS.across / 2;
  const total = loopLength(c);
  s = ((s % total) + total) % total;
  // along the near line (unit d)
  const dx = (c.bx - c.ax) / L;
  const dy = (c.by - c.ay) / L;
  // (toward the far line: the right of the near line for side +1; right of a heading (sin h, −cos h) is (cos h, sin h), i.e. (−dy, dx))
  const rx = c.side === 1 ? -dy : dy;
  const ry = c.side === 1 ? dx : -dx;
  const heading = (vx: number, vy: number) => Math.atan2(vx, -vy);
  const arc = Math.PI * r;
  if (s < L) return { x: c.ax + dx * s, y: c.ay + dy * s, heading: heading(dx, dy) };
  s -= L;
  if (s < arc) {
    // round the far end: about its middle, from the near line to the far
    const a = s / r;
    const mx = c.bx + rx * r;
    const my = c.by + ry * r;
    const x = mx - rx * r * Math.cos(a) + dx * r * Math.sin(a);
    const y = my - ry * r * Math.cos(a) + dy * r * Math.sin(a);
    return { x, y, heading: heading(dx * Math.cos(a) + rx * Math.sin(a), dy * Math.cos(a) + ry * Math.sin(a)) };
  }
  s -= arc;
  if (s < L) return { x: c.bx + rx * 2 * r - dx * s, y: c.by + ry * 2 * r - dy * s, heading: heading(-dx, -dy) };
  s -= L;
  const a = s / r;
  const mx = c.ax + rx * r;
  const my = c.ay + ry * r;
  const x = mx + rx * r * Math.cos(a) - dx * r * Math.sin(a);
  const y = my + ry * r * Math.cos(a) - dy * r * Math.sin(a);
  return { x, y, heading: heading(-dx * Math.cos(a) - rx * Math.sin(a), -dy * Math.cos(a) - ry * Math.sin(a)) };
}

/** The caravan's camels `t` seconds on, the leader first. */
export function camelsAt(c: Caravan, t: number): CamelAt[] {
  const out: CamelAt[] = [];
  for (let k = 0; k < c.camels; k++) {
    const s = c.start + t * CAMELS.speed - k * CAMELS.apart;
    const p = pointOnLoop(c, s);
    // (each a little out of step with the one ahead)
    const step = (((s / CAMELS.stride + k * 0.37) % 1) + 1) % 1;
    out.push({ ...p, step });
  }
  return out;
}

/** The caravans at a desert circuit (none elsewhere): spread round the lap, each beside a stretch of track. */
export function caravansOf(circuit: Circuit): Caravan[] {
  if (!circuit.layout.desert) return [];
  const { track, pit } = circuit;
  const n = track.samples.length;
  const reach = HALF_WIDTH + RUNOFF;
  const stands = standsOf(circuit);
  const palms = treesOf(circuit);
  const W = circuit.width * T;
  const H = circuit.height * T;
  const r = rng(71);
  const clearOf = (x: number, y: number) => {
    if (x < 0 || y < 0 || x > W || y > H) return false;
    for (let i = 0; i < n; i += 2) {
      const p = track.samples[i];
      if (Math.hypot(p.x - x, p.y - y) < reach + CAMELS.clearTrack) return false;
    }
    if (pit.points.some((q) => Math.hypot(q.x - x, q.y - y) < GARAGE_ACROSS + 40)) return false;
    if (stands.some((s) => Math.hypot(s.x - x, s.y - y) < s.len / 2 + STAND.depth + 12)) return false;
    if (palms.some((p) => Math.hypot(p.x - x, p.y - y) < CAMELS.clearPalm)) return false;
    return true;
  };
  const out: Caravan[] = [];
  for (let k = 0; k < CAMELS.caravans; k++) {
    // (tried at a spot a share of the way round, either side, then nudged on round the lap)
    for (let tries = 0; tries < 40; tries++) {
      const i = Math.floor(((k + tries * 0.13) / CAMELS.caravans) * n) % n;
      const p = track.samples[i];
      const side = (tries % 2 === 0 ? 1 : -1) as -1 | 1;
      const off = reach + CAMELS.clearTrack + CAMELS.out + r() * CAMELS.further;
      const L = CAMELS.length + r() * CAMELS.longer;
      // (the near line along the track's direction there, its far line further out)
      const ox = Math.cos(p.dir) * off * side;
      const oy = Math.sin(p.dir) * off * side;
      const fx = Math.sin(p.dir);
      const fy = -Math.cos(p.dir);
      const c: Caravan = {
        ax: p.x + ox - (fx * L) / 2,
        ay: p.y + oy - (fy * L) / 2,
        bx: p.x + ox + (fx * L) / 2,
        by: p.y + oy + (fy * L) / 2,
        // (the far line further from the track: to the right of the near line when out on the track's right)
        side: side,
        camels: CAMELS.least + Math.floor(r() * (CAMELS.more + 1)),
        start: r() * 1000,
      };
      const total = loopLength(c);
      let ok = true;
      for (let s = 0; s < total && ok; s += 6) {
        const q = pointOnLoop(c, s);
        if (!clearOf(q.x, q.y)) ok = false;
      }
      if (ok && out.every((o) => Math.hypot((o.ax + o.bx) / 2 - (c.ax + c.bx) / 2, (o.ay + o.by) / 2 - (c.ay + c.by) / 2) > 200)) {
        out.push(c);
        break;
      }
    }
  }
  return out;
}

/** A camel, 1 unit = 1 px, facing +x: its body (with the hump, neck, head and tail), and its four legs, each pivoting at the hip. */
const HIDE = new THREE.MeshLambertMaterial({ color: 0x8e5c30 });
const LEGS = new THREE.MeshLambertMaterial({ color: 0x6a4222 });
/** the saddle blankets, bright against the sand */
const BLANKETS = [0xd8323c, 0x3d7fc4, 0xf2c14e, 0x3d9a5a, 0x8a3cc8].map((color) => new THREE.MeshLambertMaterial({ color }));

function camelModel(blanket: number): { group: THREE.Group; legs: THREE.Object3D[] } {
  const hide = HIDE;
  const dark = LEGS;
  const group = new THREE.Group();
  const body = new THREE.Group();
  const part = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.z = rz;
    m.castShadow = true;
    body.add(m);
  };
  part(new THREE.BoxGeometry(12, 5, 5), hide, 0, 11.5);
  part(new THREE.IcosahedronGeometry(3, 0).scale(1.2, 1, 0.9), hide, -0.5, 14.2);
  part(new THREE.BoxGeometry(2.4, 7.5, 2.4), hide, 7, 14, 0, -0.55);
  part(new THREE.BoxGeometry(4.2, 2.4, 2.4), hide, 9.6, 17.6);
  part(new THREE.BoxGeometry(0.8, 4, 0.8), dark, -6.3, 10.5, 0, 0.25);
  // (a saddle blanket over its back, before the hump, hanging down its sides)
  part(new THREE.BoxGeometry(3.6, 4.2, 5.6), BLANKETS[blanket % BLANKETS.length], 3, 12.6);
  group.add(body);
  const legs: THREE.Object3D[] = [];
  for (const [x, z] of [[4.5, 1.7], [4.5, -1.7], [-4.5, 1.7], [-4.5, -1.7]]) {
    const hip = new THREE.Group();
    hip.position.set(x, 9.5, z);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(1.4, 9.5, 1.4), dark);
    leg.position.y = -4.75;
    leg.castShadow = true;
    hip.add(leg);
    body.add(hip);
    legs.push(hip);
  }
  return { group, legs };
}

/** The caravans in `scene`; animate(t) walks them (t: seconds). */
export function buildCamels(scene: THREE.Scene, circuit: Circuit): { animate(t: number): void } {
  const caravans = caravansOf(circuit);
  const camels = caravans.map((c, i) => Array.from({ length: c.camels }, (_, k) => {
    const m = camelModel(i * 2 + k);
    scene.add(m.group);
    return m;
  }));
  const animate = (t: number) => {
    caravans.forEach((c, i) => {
      camelsAt(c, t).forEach((at, k) => {
        const { group, legs } = camels[i][k];
        const swing = Math.sin(at.step * Math.PI * 2);
        group.position.set(at.x, groundAt(circuit.grid, at.x, at.y).h + Math.abs(swing) * 0.5, at.y);
        group.rotation.y = Math.PI / 2 - at.heading;
        // (pacing: both legs on a side swing together, the other side the other way)
        legs.forEach((leg, j) => (leg.rotation.z = (j % 2 === 0 ? 1 : -1) * swing * 0.4));
      });
    });
  };
  animate(0);
  return { animate };
}
