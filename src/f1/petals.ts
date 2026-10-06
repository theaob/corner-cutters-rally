// Cherry blossom petals (a circuit with its cherry trees in blossom:
// layout.blossoms, Nippon). They fall from the trees near the camera, drift on
// the breeze as they sink, and settle: on the grass, and on the track. A car
// driving over petals on the ground kicks them up: thrown out from under it
// and along in its wake, the faster it goes the higher, tumbling back down a
// way on to settle again. Some lie on the track from the start, under the
// trees that line it. A petal on the track lies there till a car kicks it off;
// one on the grass lies a while, then goes (and when there are too many, those
// on the grass farthest from the camera go first). Engine-free (PetalField) and unit-tested; drawn by
// circuitScene.ts as one instanced mesh.

import { groundAt, type Grid } from '../engine/sim';
import { HALF_WIDTH } from './circuit';
import { lateralOffset, nearestSample, type Track } from './racing';

export const PETALS = {
  /** the most petals there are at once */
  max: 1400,
  /** lying on the track (near the trees lining it) at the start */
  onTrack: 600,
  /** petals a second falling from the trees round the camera, and px from it the trees count */
  fallRate: 45,
  near: 520,
  /** px/s: the breeze (it gusts and veers a little), and how fast a petal sinks through the air at most */
  wind: { x: 16, y: 6 },
  sink: 10,
  /** px/s of sway as it falls, and how quickly the air brings it to the breeze's speed (/s) */
  sway: 12,
  drag: 1.6,
  /** a car kicks up petals within this many px of it, going at least this fast (px/s) */
  reach: 22,
  kickSpeed: 70,
  /** a kicked petal: the share of the car's velocity it's thrown along with, px/s out from under it, and up (at most, at full speed) */
  carry: 0.45,
  out: 70,
  up: 70,
  /** px of height between a car and a petal past which the car's on another level (a bridge) */
  level: 14,
  /** s a petal on the grass lies before it goes (one on the track stays till it's kicked off) */
  life: 50,
};

export interface Petal {
  x: number;
  y: number;
  /** height (px), and its velocity (px/s) */
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** turned about its own axis (radians), and how fast it tumbles in the air (rad/s) */
  spin: number;
  tumble: number;
  /** lying on the ground (or in the air) */
  resting: boolean;
  /** s left lying (it goes at 0; Infinity on the track) */
  life: number;
  /** lying on the track (not the grass) */
  onTrack: boolean;
  /** its pink (an index into the palette) */
  shade: number;
  /** its own sway's phase */
  phase: number;
}

/** A car, as the petals feel it. */
export interface PetalCar {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** its height (px): a car up on a bridge drives over the petals on the ground below it, not through them */
  z: number;
  airborne?: boolean;
}

/** A cherry tree: where it stands and how tall (its crown's where the petals fall from). */
export interface BlossomTree {
  x: number;
  y: number;
  h: number;
}

function rng(seed: number): () => number {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

/** The petals of a circuit's cherry trees. */
export class PetalField {
  readonly petals: Petal[] = [];
  private readonly r: () => number;
  private due = 0;
  private time = 0;

  /** the camera's last focus: the petals farthest from it are the first to go */
  private focus = { x: 0, y: 0 };

  constructor(private readonly grid: Grid, private readonly track: Track, private readonly trees: BlossomTree[], seed = 7) {
    this.r = rng(seed);
    // lying on the track at the start, where trees line it (within a petal's drift of them)
    // (none on a bridge's stretch: they'd lie on the ground under its deck)
    const n = track.samples.length;
    const onBridge = (i: number) => !!track.levels && (track.levels.from <= track.levels.to ? i >= track.levels.from && i <= track.levels.to : i >= track.levels.from || i <= track.levels.to);
    // (nor on the road that passes under it, where the deck is over it)
    const deck = track.samples.filter((_, i) => onBridge(i));
    const underDeck = (p: { x: number; y: number }) => deck.some((q) => Math.abs(q.x - p.x) < HALF_WIDTH * 2.5 && Math.hypot(q.x - p.x, q.y - p.y) < HALF_WIDTH * 2.5);
    const lined = track.samples.filter((p, i) => !onBridge(i % n) && !underDeck(p) && trees.some((t) => Math.hypot(t.x - p.x, t.y - p.y) < HALF_WIDTH + 200));
    for (let k = 0; k < PETALS.onTrack && lined.length; k++) {
      const p = lined[Math.floor(this.r() * lined.length)];
      const across = (this.r() * 2 - 1) * HALF_WIDTH;
      const along = (this.r() - 0.5) * 16;
      const x = p.x + Math.cos(p.dir) * across + Math.sin(p.dir) * along;
      const y = p.y + Math.sin(p.dir) * across - Math.cos(p.dir) * along;
      this.add(x, y, groundAt(grid, x, y).h, true);
      this.settle(this.petals[this.petals.length - 1]);
    }
  }

  /** A petal at (x, y, z), lying there or (falling) on the breeze. */
  private add(x: number, y: number, z: number, resting: boolean): void {
    if (this.petals.length >= PETALS.max) {
      // (too many: one lying on the grass goes, the farthest from the camera; failing that, one on the track, likewise)
      let gone = -1;
      let far = -1;
      for (const grass of [true, false]) {
        for (let i = 0; i < this.petals.length; i++) {
          const p = this.petals[i];
          if (!p.resting || p.onTrack === grass) continue;
          const d = (p.x - this.focus.x) ** 2 + (p.y - this.focus.y) ** 2;
          if (d > far) [gone, far] = [i, d];
        }
        if (gone >= 0) break;
      }
      if (gone < 0) return;
      this.petals.splice(gone, 1);
    }
    this.petals.push({
      x, y, z, vx: resting ? 0 : PETALS.wind.x, vy: resting ? 0 : PETALS.wind.y, vz: resting ? 0 : -PETALS.sink, spin: this.r() * Math.PI * 2,
      tumble: (this.r() * 2 - 1) * 6, resting, life: PETALS.life, onTrack: false, shade: Math.floor(this.r() * 5), phase: this.r() * Math.PI * 2,
    });
  }

  /** Lay `p` down where it is: on the track it stays (till it's kicked), on the grass it lies its while. */
  private settle(p: Petal): void {
    const i = nearestSample(this.track, p.x, p.y);
    p.onTrack = Math.abs(lateralOffset(this.track, i, p.x, p.y)) <= HALF_WIDTH;
    p.life = p.onTrack ? Infinity : PETALS.life;
  }

  /** `dt` s on: petals falling from the trees near `focus` (the camera's), drifting and settling; any `cars` drive over kick up. */
  step(dt: number, cars: PetalCar[], focus: { x: number; y: number }): void {
    if (dt <= 0) return;
    this.time += dt;
    this.focus = { x: focus.x, y: focus.y };
    // falling from the trees round the camera
    this.due += PETALS.fallRate * dt;
    const near = this.trees.filter((t) => Math.abs(t.x - focus.x) < PETALS.near && Math.abs(t.y - focus.y) < PETALS.near);
    while (this.due >= 1) {
      this.due -= 1;
      if (!near.length) continue;
      const t = near[Math.floor(this.r() * near.length)];
      const a = this.r() * Math.PI * 2;
      const d = this.r() * t.h * 0.35;
      this.add(t.x + Math.cos(a) * d, t.y + Math.sin(a) * d, groundAt(this.grid, t.x, t.y).h + t.h * (0.55 + 0.4 * this.r()), false);
    }
    // the breeze, gusting and veering a little
    const gust = 1 + 0.5 * Math.sin(this.time * 0.7) + 0.25 * Math.sin(this.time * 2.3);
    const wx = PETALS.wind.x * gust + 4 * Math.sin(this.time * 0.4);
    const wy = PETALS.wind.y * gust;
    for (let i = this.petals.length - 1; i >= 0; i--) {
      const p = this.petals[i];
      if (p.resting) {
        p.life -= dt;
        if (p.life <= 0) {
          this.petals.splice(i, 1);
          continue;
        }
        // a car over it: kicked up
        for (const c of cars) {
          if (c.airborne || Math.abs(c.z - p.z) > PETALS.level) continue;
          const dx = p.x - c.x;
          const dy = p.y - c.y;
          if (Math.abs(dx) > PETALS.reach || Math.abs(dy) > PETALS.reach) continue;
          const d = Math.hypot(dx, dy);
          const v = Math.hypot(c.vx, c.vy);
          if (d > PETALS.reach || v < PETALS.kickSpeed) continue;
          const pace = Math.min(1, v / 300);
          const ox = d > 0.01 ? dx / d : this.r() - 0.5;
          const oy = d > 0.01 ? dy / d : this.r() - 0.5;
          const push = PETALS.out * (1 - d / PETALS.reach) * (0.6 + 0.4 * this.r()) * pace;
          p.vx = c.vx * PETALS.carry * (0.6 + 0.4 * this.r()) + ox * push;
          p.vy = c.vy * PETALS.carry * (0.6 + 0.4 * this.r()) + oy * push;
          p.vz = PETALS.up * pace * (0.5 + 0.5 * this.r());
          p.tumble = (this.r() * 2 - 1) * 14;
          p.resting = false;
          p.onTrack = false;
          break;
        }
        continue;
      }
      // in the air: brought to the breeze, swaying, sinking (thrown up: slowed, then sinking)
      const k = Math.min(1, PETALS.drag * dt);
      p.vx += (wx - p.vx) * k;
      p.vy += (wy - p.vy) * k;
      p.vz += (-PETALS.sink - p.vz) * Math.min(1, 2.5 * dt);
      p.x += (p.vx + Math.sin(this.time * 2.1 + p.phase) * PETALS.sway) * dt;
      p.y += (p.vy + Math.cos(this.time * 1.7 + p.phase) * PETALS.sway * 0.5) * dt;
      p.z += p.vz * dt;
      p.spin += p.tumble * dt;
      const ground = groundAt(this.grid, p.x, p.y).h;
      if (p.z <= ground) {
        p.z = ground;
        p.vx = p.vy = p.vz = 0;
        p.resting = true;
        this.settle(p);
      }
    }
  }

  /** How many lie on the ground, and how many are in the air. */
  counts(): { resting: number; flying: number } {
    const resting = this.petals.filter((p) => p.resting).length;
    return { resting, flying: this.petals.length - resting };
  }
}
