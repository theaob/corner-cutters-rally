// Car effects for a 3D scene: skid marks painted onto the ground, smoke from
// damaged cars, fire on burning ones, and charred paint on
// wrecks. Driven each frame from the engine-free car state.

import * as THREE from 'three';
import { fling, gone, stepPiece, sunk, type Piece } from '../debris';
import { canvas } from './sprites';
import type { CarMesh } from './vehicles3d';

const SKID_CHUNK = 256;

interface SkidChunk {
  ctx: CanvasRenderingContext2D;
  tex: THREE.CanvasTexture;
  dirty: boolean;
}

/**
 * Dark marks left by sliding tyres, drawn into canvases laid over the ground.
 * The ground is split into 256 px chunks, made on first use, so a skid only
 * re-uploads the small texture it touched.
 */
export class SkidLayer {
  readonly group = new THREE.Group();
  private readonly chunks = new Map<string, SkidChunk>();
  private readonly last = new Map<number, { x: number; y: number }[]>();
  private sinceUpload = 0;

  /** `heightAt` (world px → px): lay the marks over sloped ground; flat when omitted. */
  constructor(private readonly heightAt?: (x: number, y: number) => number) {}

  private chunk(cx: number, cy: number): SkidChunk {
    const key = `${cx},${cy}`;
    let ch = this.chunks.get(key);
    if (ch) return ch;
    const [c, ctx] = canvas(SKID_CHUNK, SKID_CHUNK);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    // on sloped ground the chunk bends to follow it, one segment per 16 px
    const segs = this.heightAt ? SKID_CHUNK / 16 : 1;
    const geo = new THREE.PlaneGeometry(SKID_CHUNK, SKID_CHUNK, segs, segs).rotateX(-Math.PI / 2);
    if (this.heightAt) {
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        pos.setY(i, this.heightAt((cx + 0.5) * SKID_CHUNK + pos.getX(i), (cy + 0.5) * SKID_CHUNK + pos.getZ(i)) + 0.3);
      }
      geo.computeVertexNormals();
    }
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false }));
    mesh.position.set((cx + 0.5) * SKID_CHUNK, 0.05, (cy + 0.5) * SKID_CHUNK);
    mesh.receiveShadow = true;
    this.group.add(mesh);
    ch = { ctx, tex, dirty: false };
    this.chunks.set(key, ch);
    return ch;
  }

  /** A line in world pixels, drawn into every chunk it touches. */
  private line(a: { x: number; y: number }, b: { x: number; y: number }, style: string): void {
    const x0 = Math.floor((Math.min(a.x, b.x) - 2) / SKID_CHUNK);
    const x1 = Math.floor((Math.max(a.x, b.x) + 2) / SKID_CHUNK);
    const y0 = Math.floor((Math.min(a.y, b.y) - 2) / SKID_CHUNK);
    const y1 = Math.floor((Math.max(a.y, b.y) + 2) / SKID_CHUNK);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const ch = this.chunk(cx, cy);
        const ox = cx * SKID_CHUNK;
        const oy = cy * SKID_CHUNK;
        ch.ctx.strokeStyle = style;
        ch.ctx.lineWidth = 2;
        ch.ctx.beginPath();
        ch.ctx.moveTo(a.x - ox, a.y - oy);
        ch.ctx.lineTo(b.x - ox + 0.01, b.y - oy);
        ch.ctx.stroke();
        ch.dirty = true;
      }
    }
  }

  /**
   * Continue the marks under both rear wheels of car `id` at (x, y) facing
   * `heading`. Call `lift(id)` on frames the car isn't skidding, so separate
   * slides don't join up.
   */
  mark(id: number, x: number, y: number, heading: number, strength: number, size = { width: 14, length: 26 }): void {
    const fx = Math.sin(heading);
    const fy = -Math.cos(heading);
    const back = size.length / 2 - 5;
    const half = size.width / 2 - 1;
    const wheels = [-1, 1].map((s) => ({ x: x - fx * back - fy * s * half, y: y - fy * back + fx * s * half }));
    const prev = this.last.get(id);
    const style = `rgba(20,18,24,${Math.min(0.55, 0.2 + strength * 0.35)})`;
    wheels.forEach((w, i) => this.line(prev?.[i] ?? w, w, style));
    this.last.set(id, wheels);
  }

  lift(id: number): void {
    this.last.delete(id);
  }

  clear(): void {
    for (const ch of this.chunks.values()) {
      ch.ctx.clearRect(0, 0, SKID_CHUNK, SKID_CHUNK);
      ch.dirty = true;
    }
    this.last.clear();
  }

  /** Upload changed chunks at most ~15 times a second. */
  update(dt: number): void {
    this.sinceUpload += dt;
    if (this.sinceUpload < 1 / 15) return;
    this.sinceUpload = 0;
    for (const ch of this.chunks.values()) {
      if (!ch.dirty) continue;
      ch.tex.needsUpdate = true;
      ch.dirty = false;
    }
  }
}

function puffTexture(): THREE.Texture {
  const [c, x] = canvas(16, 16);
  const g = x.createRadialGradient(8, 8, 1, 8, 8, 8);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 16, 16);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface Puff {
  sprite: THREE.Sprite;
  life: number;
  maxLife: number;
  vx: number;
  vy: number;
  vz: number;
  grow: number;
  /** px/s² it falls (sparks); 0 for a puff */
  fall: number;
}

/** A fixed pool of smoke and flame puffs. */
export class Particles {
  readonly group = new THREE.Group();
  private readonly pool: Puff[] = [];
  private next = 0;

  constructor(size = 90) {
    const tex = puffTexture();
    for (let i = 0; i < size; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
      sprite.visible = false;
      this.group.add(sprite);
      this.pool.push({ sprite, life: 0, maxLife: 1, vx: 0, vy: 0, vz: 0, grow: 0, fall: 0 });
    }
  }

  private spawn(x: number, z: number, y: number, color: number, life: number, size: number, rise: number, additive: boolean): Puff {
    const p = this.pool[this.next];
    this.next = (this.next + 1) % this.pool.length;
    const m = p.sprite.material;
    m.color.setHex(color);
    m.blending = additive ? THREE.AdditiveBlending : THREE.NormalBlending;
    p.sprite.position.set(x + (Math.random() - 0.5) * 6, y, z + (Math.random() - 0.5) * 6);
    p.sprite.scale.setScalar(size);
    p.sprite.visible = true;
    p.life = p.maxLife = life;
    p.vx = (Math.random() - 0.5) * 6;
    p.vz = (Math.random() - 0.5) * 6;
    p.vy = rise;
    p.grow = size * 1.2;
    p.fall = 0;
    return p;
  }

  /**
   * Sparks off a hit, a scrape or a car bottoming out at (x, z), `base` px up: `n` bright specks flung out along
   * (dx, dz) (a unit direction on the ground, or none: every way), up and out, falling and gone in a moment.
   */
  sparks(x: number, z: number, base: number, n: number, dx = 0, dz = 0): void {
    for (let k = 0; k < n; k++) {
      const p = this.spawn(x, z, base + 3, Math.random() < 0.5 ? 0xffe08a : 0xff9a3a, 0.25 + Math.random() * 0.25, 3.5, 0, true);
      const a = Math.random() * Math.PI * 2;
      const out = 60 + Math.random() * 120;
      p.vx = (dx + Math.cos(a) * 0.7) * out;
      p.vz = (dz + Math.sin(a) * 0.7) * out;
      p.vy = 40 + Math.random() * 80;
      p.fall = 420;
      p.grow = -4;
      p.sprite.position.set(x, base + 3, z);
    }
  }

  /** A low brown cloud kicked up on rough ground. */
  dust(x: number, z: number, base = 0): void {
    this.spawn(x, z, base + 4, Math.random() < 0.5 ? 0xe0cca4 : 0xc8a878, 1.0, 10, 6, false);
  }

  /** Mud flung up off a wet dirt track: dark clods, low, falling back quickly. */
  mud(x: number, z: number, base = 0): void {
    const p = this.spawn(x, z, base + 3, Math.random() < 0.5 ? 0x4a3020 : 0x5e3d28, 0.55, 6, 30, false);
    p.fall = 90;
    p.grow = 2;
  }

  smoke(x: number, z: number, dark: boolean, base = 0): void {
    this.spawn(x, z, base + 10, dark ? 0x2a2830 : 0x8a8894, 1.4, 6, 14, false);
  }

  /** Spray thrown up off a wet track: pale, low and quickly gone. */
  spray(x: number, z: number, base = 0): void {
    this.spawn(x, z, base + 3, Math.random() < 0.5 ? 0xd8dee8 : 0xb8c0cc, 0.45, 9, 5, false);
  }

  flame(x: number, z: number, base = 0): void {
    this.spawn(x, z, base + 13, Math.random() < 0.5 ? 0xff7a1a : 0xffc23a, 0.5, 10, 24, true);
  }

  update(dt: number): void {
    for (const p of this.pool) {
      if (!p.sprite.visible) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.sprite.visible = false;
        continue;
      }
      p.vy -= p.fall * dt;
      p.sprite.position.x += p.vx * dt;
      p.sprite.position.y += p.vy * dt;
      p.sprite.position.z += p.vz * dt;
      p.sprite.scale.setScalar(Math.max(0.5, p.sprite.scale.x + p.grow * dt));
      p.sprite.material.opacity = (p.life / p.maxLife) * 0.8;
    }
  }

  clear(): void {
    for (const p of this.pool) p.sprite.visible = false;
  }
}

/** Per-car visual state: remembers the original paint so wrecks can be charred and repaired. */
export class CarFx {
  readonly light = new THREE.PointLight(0xff8a2a, 0, 70, 1.5);
  private readonly original: THREE.Color[];
  private emit = 0;
  private dustEmit = 0;

  /**
   * `fireLight: false` skips the flickering fire light: for cars that
   * come and go, since adding or removing a light recompiles every shader.
   */
  constructor(readonly mesh: CarMesh, fireLight = true) {
    this.original = mesh.userData.paint.map((m) => m.color.clone());
    this.light.position.set(0, 12, 0);
    if (fireLight) mesh.add(this.light);
  }

  /**
   * `condition` comes from the driving rules.
   * The fire light is always in the scene (intensity 0 when off) so turning it
   * on doesn't recompile shaders mid-drive.
   */
  /** `dust` (0…1): how hard the car is kicking up dust on rough ground (0 = none). */
  update(dt: number, condition: 'ok' | 'smoking' | 'burning' | 'wrecked', particles: Particles, dust = 0): void {
    const { x, y, z } = this.mesh.position;
    this.dustEmit -= dt;
    if (dust > 0 && this.dustEmit <= 0) {
      particles.dust(x, z, y);
      this.dustEmit = 0.2 - dust * 0.15;
    }
    this.emit -= dt;
    if (this.emit <= 0 && condition !== 'ok') {
      if (condition === 'smoking') {
        particles.smoke(x, z, false, y);
        this.emit = 0.18;
      } else if (condition === 'burning') {
        particles.flame(x, z, y);
        if (Math.random() < 0.5) particles.smoke(x, z, true, y);
        this.emit = 0.05;
      } else {
        particles.smoke(x, z, true, y);
        this.emit = 0.35;
      }
    }
    this.light.intensity = condition === 'burning' ? 120 + Math.random() * 80 : 0;

    const char = condition === 'wrecked' ? 0.22 : condition === 'burning' ? 0.6 : 1;
    this.mesh.userData.paint.forEach((m, i) => m.color.copy(this.original[i]).multiplyScalar(char));
  }
}

/** Debris steps a second: a fixed step, so a piece flies the same way live and again in the replay. */
const DEBRIS_HZ = 60;

interface Shed {
  /** the part on its car, hidden while it's off */
  part: THREE.Object3D;
  /** the copy thrown */
  obj: THREE.Object3D;
  /** race time it was torn off, and put back (a repair), if it has been */
  at: number;
  fixed?: number;
  /** as it was thrown, and where it is now (after `steps` steps) */
  start: Piece;
  piece: Piece;
  steps: number;
  /** still in the air or on the ground (not yet gone), live */
  live: boolean;
  /** its resting pose (lying as it lands), which its tumble turns */
  pose: THREE.Quaternion;
  /** px its origin stands above the ground, lying in that pose */
  lift: number;
}

/** s of throws kept, for the replay (longer than any replay looks back, and than a piece lies) */
const KEPT = 40;

/**
 * Parts torn off cars in big crashes (the nose, a wheel): each hidden on its car, and a copy thrown clear from where
 * it was, tumbling and bouncing (debris.ts) till it lies still, then sinking away. The car's paint is shared, so a
 * burning car's parts char with it. It runs on the race's clock, in fixed steps, and keeps its throws a while, so a
 * replay throws them again just as they flew (and takes the parts off the cars, and puts them back, when it did).
 * The scene's x and z are the ground plane, y up.
 */
export class DebrisLayer {
  readonly group = new THREE.Group();
  private readonly shed: Shed[] = [];
  private readonly turn = new THREE.Quaternion();
  private readonly euler = new THREE.Euler();

  /**
   * Tear `part` off its car (if it's still on) at race time `at`, moving with the car at (vx, vz) px/s; `power`
   * (0…1) throws it harder. `lies` turns its resting pose from the way it sat on the car (a wheel lies on its side).
   */
  tear(part: THREE.Object3D, at: number, vx: number, vz: number, power: number, lies?: THREE.Quaternion): void {
    if (!part.visible || !part.parent) return;
    const car = part.parent;
    car.updateWorldMatrix(true, true);
    const where = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    part.matrixWorld.decompose(where, quat, scale);
    const centre = car.getWorldPosition(new THREE.Vector3());
    const ox = where.x - centre.x;
    const oz = where.z - centre.z;
    const d = Math.hypot(ox, oz) || 1;
    const copy = part.clone();
    copy.visible = true;
    copy.scale.copy(scale);
    // (how high its origin stands lying in its resting pose: from its lowest point there)
    const pose = lies ? quat.clone().multiply(lies) : quat.clone();
    copy.position.set(0, 0, 0);
    copy.quaternion.copy(pose);
    copy.updateMatrixWorld(true);
    const lift = -new THREE.Box3().setFromObject(copy).min.y;
    copy.position.copy(where);
    copy.quaternion.copy(quat);
    this.group.add(copy);
    part.visible = false;
    // (it leaves as it sat on the car: its tumble starts from there, eased toward the resting pose as it slides)
    const start = fling(where.x, where.z, where.y - lift, vx, vz, { x: ox / d, y: oz / d }, power);
    this.shed.push({ part, obj: copy, at, start, piece: clonePiece(start), steps: 0, live: true, pose, lift });
  }

  /** The parts torn off `mesh` put back on at race time `at` (a repaired car). */
  refit(mesh: THREE.Object3D, at: number): void {
    for (const s of this.shed) {
      if (s.fixed !== undefined || !isPartOf(s.part, mesh)) continue;
      s.fixed = at;
      s.part.visible = true;
    }
  }

  /** Move the pieces on to race time `now`, over ground `ground(x, z)` px high. */
  update(now: number, ground: (x: number, z: number) => number): void {
    for (const s of this.shed) {
      if (!s.live) continue;
      s.steps = flyTo(s.piece, s.steps, (now - s.at) * DEBRIS_HZ, ground);
      if (gone(s.piece)) {
        s.live = false;
        this.group.remove(s.obj);
        continue;
      }
      this.place(s, s.piece);
    }
    // (throws long past: forgotten)
    for (let i = this.shed.length - 1; i >= 0; i--) if (!this.shed[i].live && now - this.shed[i].at > KEPT) this.shed.splice(i, 1);
  }

  /**
   * The pieces as they were at race time `t`, for the replay: each thrown again from where it was torn off and
   * flown on to then (or not yet torn off: back on its car). `back()` returns to the race as it is now.
   */
  replay(t: number, ground: (x: number, z: number) => number): void {
    for (const s of this.shed) {
      const off = s.at <= t && (s.fixed === undefined || s.fixed > t);
      // (the part on the car, then)
      s.part.visible = !this.offNow(s.part, t);
      if (!off) {
        s.obj.visible = false;
        continue;
      }
      // (flown on from its throw: from where the last frame left it, unless that's past `t`)
      const target = (t - s.at) * DEBRIS_HZ;
      let then = s.obj.userData.replay as { piece: Piece; steps: number } | undefined;
      if (!then || then.steps > target) then = s.obj.userData.replay = { piece: clonePiece(s.start), steps: 0 };
      then.steps = flyTo(then.piece, then.steps, target, ground);
      if (gone(then.piece)) {
        s.obj.visible = false;
        continue;
      }
      if (!s.obj.parent) this.group.add(s.obj);
      s.obj.visible = true;
      this.place(s, then.piece);
    }
  }

  /** Back from the replay: the pieces, and the parts on the cars, as they are now. */
  back(): void {
    for (const s of this.shed) {
      delete s.obj.userData.replay;
      s.part.visible = !this.offNow(s.part);
      if (!s.live) this.group.remove(s.obj);
      else {
        s.obj.visible = true;
        this.place(s, s.piece);
      }
    }
  }

  /** The pieces in the air or on the ground now. */
  get count(): number {
    return this.shed.filter((s) => s.live).length;
  }

  clear(): void {
    for (const s of this.shed) this.group.remove(s.obj);
    this.shed.length = 0;
  }

  /** Whether `part` is off its car at race time `t` (now, if none). */
  private offNow(part: THREE.Object3D, t = Infinity): boolean {
    return this.shed.some((s) => s.part === part && s.at <= t && (s.fixed === undefined || s.fixed > t));
  }

  private place(s: Shed, p: Piece): void {
    s.obj.position.set(p.x, p.h + s.lift - sunk(p) * (s.lift + 6), p.y);
    this.euler.set(p.rot[0], p.rot[1], p.rot[2]);
    s.obj.quaternion.copy(this.turn.setFromEuler(this.euler)).multiply(s.pose);
  }
}

const clonePiece = (p: Piece): Piece => ({ ...p, rot: [...p.rot], spin: [...p.spin] });

/** Fly `p` on from step `from` to step `to` (whole steps); the step it's at now. */
function flyTo(p: Piece, from: number, to: number, ground: (x: number, z: number) => number): number {
  let k = from;
  // (a hair's tolerance: the same race time gives the same step, whatever the sums that led to it)
  for (; k + 1 <= to + 1e-6; k++) stepPiece(p, 1 / DEBRIS_HZ, ground);
  return k;
}

const isPartOf = (part: THREE.Object3D, mesh: THREE.Object3D) => {
  for (let o: THREE.Object3D | null = part; o; o = o.parent) if (o === mesh) return true;
  return false;
};
