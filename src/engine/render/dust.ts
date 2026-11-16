// The dust a car throws up: a plume off its rear wheels that billows out, drifts back and settles, coloured for the
// ground it's on (gravel, sand, powder snow, or earth off the grass beside a sealed road). Every puff is one
// instance of a single camera-facing quad, so however many cars are kicking up dust it's one draw call, and the
// puffs live in flat arrays, so nothing is made or thrown away while it runs.

import * as THREE from 'three';
import { canvas } from './sprites';

/** The ground a car's kicking up: a dirt stage's road (gravel, sand or snow), or grass and earth off a sealed one. */
export type DustKind = 'gravel' | 'sand' | 'snow' | 'grass';

export interface DustLook {
  /** two colours each puff is mixed between (sRGB) */
  colors: [number, number];
  /** s a puff lasts, from … to */
  life: [number, number];
  /** px across: as it's thrown up, and as it settles */
  size: [number, number];
  /** its opacity at its thickest */
  alpha: number;
  /** puffs a second off a car at full speed on a straight, and more while it slides (at full slide) */
  rate: number;
  slide: number;
  /** how much of the car's speed a puff keeps as it's thrown, px/s it's flung out to the side, and floats up */
  carry: number;
  spread: number;
  rise: number;
  /** how quickly it slows in the air (1/s) */
  drag: number;
}

/**
 * Each ground's dust. Gravel: a warm brown plume that hangs a moment behind the car. Sand: paler, thicker and
 * slower to settle. Snow: a bright powder, gone quickly. Grass: a little earth, off the road only.
 */
export const DUST: Record<DustKind, DustLook> = {
  gravel: { colors: [0xd9bb8e, 0xbf9b70], life: [1.4, 2.2], size: [10, 46], alpha: 0.5, rate: 26, slide: 30, carry: 0.22, spread: 26, rise: 7, drag: 1.6 },
  sand: { colors: [0xe6cd9c, 0xd2b07a], life: [2.0, 3.0], size: [12, 58], alpha: 0.6, rate: 30, slide: 34, carry: 0.2, spread: 30, rise: 6, drag: 1.3 },
  snow: { colors: [0xffffff, 0xe4ecf6], life: [1.0, 1.6], size: [10, 40], alpha: 0.9, rate: 30, slide: 38, carry: 0.3, spread: 34, rise: 10, drag: 2.4 },
  grass: { colors: [0xb8a07a, 0x9c8462], life: [0.9, 1.4], size: [8, 28], alpha: 0.42, rate: 16, slide: 18, carry: 0.2, spread: 18, rise: 6, drag: 2.0 },
};

/** The dust kind for a stage's ground: its road's, on dirt; grass and earth off a sealed road. */
export function dustKindOf(layout: { dirt?: boolean; snow?: boolean; desert?: boolean }): DustKind {
  if (!layout.dirt) return 'grass';
  return layout.snow ? 'snow' : layout.desert ? 'sand' : 'gravel';
}

/** One soft, lumpy cloud (white, its shape in the alpha), ringed by clear so it can turn without showing a corner. */
function cloudTexture(): THREE.Texture {
  const N = 64;
  const [c, x] = canvas(N, N);
  // (a few soft blobs about the middle, the same every time: a fixed little sequence, not Math.random)
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const blob = (bx: number, by: number, r: number, a: number) => {
    const g = x.createRadialGradient(bx, by, 0, bx, by, r);
    g.addColorStop(0, `rgba(255,255,255,${a})`);
    g.addColorStop(0.55, `rgba(255,255,255,${a * 0.55})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, N, N);
  };
  blob(32, 32, 26, 0.75);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + rnd() * 0.6;
    const d = 8 + rnd() * 6;
    blob(32 + Math.cos(a) * d, 32 + Math.sin(a) * d, 12 + rnd() * 6, 0.5);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

const VERTEX = /* glsl */ `
attribute vec3 offset;
attribute vec4 look; // size (px), alpha, turn, shade
attribute vec3 tint;
varying vec2 vUv;
varying float vAlpha;
varying float vTurn;
varying float vShade;
varying vec3 vTint;
void main() {
  vUv = uv;
  vAlpha = look.y;
  vTurn = look.z;
  vShade = look.w;
  vTint = tint;
  vec4 mv = viewMatrix * vec4(offset, 1.0);
  mv.xy += position.xy * look.x;
  gl_Position = projectionMatrix * mv;
}`;

const FRAGMENT = /* glsl */ `
uniform sampler2D map;
varying vec2 vUv;
varying float vAlpha;
varying float vTurn;
varying float vShade;
varying vec3 vTint;
void main() {
  // (the cloud turned, each puff its own way; the light on it isn't: from the top left of the screen, as the sun)
  vec2 p = vUv - 0.5;
  float c = cos(vTurn), s = sin(vTurn);
  float a = texture2D(map, vec2(c * p.x - s * p.y, s * p.x + c * p.y) + 0.5).a * vAlpha;
  if (a < 0.004) discard;
  float lit = 1.0 + (p.y - p.x) * 0.35;
  gl_FragColor = vec4(vTint * vShade * lit, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** Puffs at most (all the cars' together): when they run out the oldest goes first. */
export const DUST_MAX = 360;

/**
 * Every car's dust, one instanced mesh. Call `kick` for each car each frame it's on the ground, and `update` once a
 * frame to move it on. The scene's x and z are the ground, y up.
 */
export class DustLayer {
  readonly mesh: THREE.Mesh;
  /** 0…1: fewer puffs (a slow phone's picture at a lower quality level) */
  density = 1;
  private readonly geo: THREE.InstancedBufferGeometry;
  private readonly offset: THREE.InstancedBufferAttribute;
  private readonly look: THREE.InstancedBufferAttribute;
  private readonly tint: THREE.InstancedBufferAttribute;
  // each puff: where (x, y, z), its way (vx, vy, vz), age and life (s), size thrown and settled, its peak opacity,
  // turn and spin, shade; its colour's in `tint`
  private readonly px = new Float32Array(DUST_MAX * 3);
  private readonly pv = new Float32Array(DUST_MAX * 3);
  private readonly age = new Float32Array(DUST_MAX);
  private readonly life = new Float32Array(DUST_MAX);
  private readonly size0 = new Float32Array(DUST_MAX);
  private readonly size1 = new Float32Array(DUST_MAX);
  private readonly peak = new Float32Array(DUST_MAX);
  private readonly turn = new Float32Array(DUST_MAX);
  private readonly spin = new Float32Array(DUST_MAX);
  private readonly shade = new Float32Array(DUST_MAX);
  private readonly drag = new Float32Array(DUST_MAX);
  private readonly rgb = new Float32Array(DUST_MAX * 3);
  /** puffs alive: the first `live` of the arrays */
  private live = 0;
  /** puffs owed to each car (a fraction carried to the next frame), and the wheel the next comes off */
  private readonly owed = new Map<number, number>();
  private readonly side = new Map<number, number>();
  private readonly colour = new THREE.Color();
  private readonly other = new THREE.Color();

  constructor() {
    const quad = new THREE.PlaneGeometry(1, 1);
    this.geo = new THREE.InstancedBufferGeometry();
    this.geo.index = quad.index;
    this.geo.setAttribute('position', quad.attributes.position);
    this.geo.setAttribute('uv', quad.attributes.uv);
    const attr = (n: number) => new THREE.InstancedBufferAttribute(new Float32Array(DUST_MAX * n), n).setUsage(THREE.DynamicDrawUsage);
    this.offset = attr(3);
    this.look = attr(4);
    this.tint = attr(3);
    this.geo.setAttribute('offset', this.offset);
    this.geo.setAttribute('look', this.look);
    this.geo.setAttribute('tint', this.tint);
    this.geo.instanceCount = 0;
    const material = new THREE.ShaderMaterial({
      uniforms: { map: { value: cloudTexture() } },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(this.geo, material);
    // (it's everywhere the cars are: its bounds aren't kept up)
    this.mesh.frustumCulled = false;
    // (after the scene's other see-through things: the skid marks under it)
    this.mesh.renderOrder = 2;
  }

  /** Puffs alive now. */
  get count(): number {
    return this.live;
  }

  /**
   * Car `id` at (x, z), its underside `base` px up, facing `heading` and going (vx, vz) px/s, over `dt` s: dust off
   * its rear wheels, `amount` (0…1) of the most at speed and more for `slide` (0…1) of a full slide. `size` is the
   * car's (px), for where its wheels are.
   */
  kick(id: number, kind: DustKind, x: number, z: number, base: number, heading: number, vx: number, vz: number, amount: number, slide: number, dt: number, size = { width: 14, length: 26 }): void {
    const L = DUST[kind];
    let owed = (this.owed.get(id) ?? 0) + (L.rate * amount + L.slide * slide) * this.density * dt;
    if (owed < 1) {
      this.owed.set(id, owed);
      return;
    }
    const fx = Math.sin(heading);
    const fz = -Math.cos(heading);
    const back = size.length / 2 - 3;
    const half = size.width / 2;
    let side = this.side.get(id) ?? 1;
    for (; owed >= 1; owed--) {
      side = -side;
      // (off a rear wheel, a little behind it, thrown out to its side)
      const wx = x - fx * back - fz * side * half;
      const wz = z - fz * back + fx * side * half;
      const out = (0.4 + Math.random()) * L.spread;
      this.spawn(
        L,
        wx - fx * Math.random() * 4,
        base + 2,
        wz - fz * Math.random() * 4,
        vx * L.carry - fz * side * out + (Math.random() - 0.5) * 10,
        L.rise * (0.6 + Math.random() * 0.8),
        vz * L.carry + fx * side * out + (Math.random() - 0.5) * 10,
      );
    }
    this.owed.set(id, owed);
    this.side.set(id, side);
  }

  /** A burst of dust at (x, z) (a hard landing, a car off into the scenery): `n` puffs out every way. */
  burst(kind: DustKind, x: number, z: number, base: number, n: number): void {
    const L = DUST[kind];
    for (let k = 0; k < Math.round(n * this.density); k++) {
      const a = Math.random() * Math.PI * 2;
      const out = (0.5 + Math.random()) * L.spread * 1.6;
      this.spawn(L, x, base + 2, z, Math.cos(a) * out, L.rise * 1.5, Math.sin(a) * out);
    }
  }

  private spawn(L: DustLook, x: number, y: number, z: number, vx: number, vy: number, vz: number): void {
    // (full: the oldest puff makes way, moved to the front's end and taken over)
    let i = this.live;
    if (i >= DUST_MAX) {
      let oldest = 0;
      for (let k = 1; k < DUST_MAX; k++) if (this.age[k] / this.life[k] > this.age[oldest] / this.life[oldest]) oldest = k;
      i = oldest;
    } else this.live++;
    this.px.set([x, y, z], i * 3);
    this.pv.set([vx, vy, vz], i * 3);
    this.age[i] = 0;
    this.life[i] = L.life[0] + Math.random() * (L.life[1] - L.life[0]);
    const big = 0.8 + Math.random() * 0.4;
    this.size0[i] = L.size[0] * big;
    this.size1[i] = L.size[1] * big;
    this.peak[i] = L.alpha * (0.75 + Math.random() * 0.25);
    this.turn[i] = Math.random() * Math.PI * 2;
    this.spin[i] = (Math.random() - 0.5) * 1.2;
    this.shade[i] = 0.92 + Math.random() * 0.12;
    this.drag[i] = L.drag;
    this.colour.setHex(L.colors[0]).lerp(this.other.setHex(L.colors[1]), Math.random());
    this.rgb.set([this.colour.r, this.colour.g, this.colour.b], i * 3);
  }

  /** Move the dust on `dt` s: drifting, slowing, swelling and thinning out, and gone when it's settled. */
  update(dt: number): void {
    const { px, pv } = this;
    for (let i = 0; i < this.live; ) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) {
        this.move(--this.live, i);
        continue;
      }
      const slow = Math.exp(-this.drag[i] * dt);
      for (let k = 0; k < 3; k++) {
        pv[i * 3 + k] *= slow;
        px[i * 3 + k] += pv[i * 3 + k] * dt;
      }
      this.turn[i] += this.spin[i] * dt;
      i++;
    }
    const off = this.offset.array as Float32Array;
    const look = this.look.array as Float32Array;
    const tint = this.tint.array as Float32Array;
    for (let i = 0; i < this.live; i++) {
      const t = this.age[i] / this.life[i];
      // (swells fast and then slowly; thickens in a moment, thins out slowly)
      const grow = 1 - (1 - t) * (1 - t) * (1 - t);
      const size = this.size0[i] + (this.size1[i] - this.size0[i]) * grow;
      const alpha = this.peak[i] * Math.min(1, t / 0.08) * (1 - t) * (1 - t);
      off[i * 3] = px[i * 3];
      // (its middle lifted as it swells, so a big puff doesn't cut into the ground as the camera tilts)
      off[i * 3 + 1] = px[i * 3 + 1] + size * 0.2;
      off[i * 3 + 2] = px[i * 3 + 2];
      look[i * 4] = size;
      look[i * 4 + 1] = alpha;
      look[i * 4 + 2] = this.turn[i];
      look[i * 4 + 3] = this.shade[i];
      tint[i * 3] = this.rgb[i * 3];
      tint[i * 3 + 1] = this.rgb[i * 3 + 1];
      tint[i * 3 + 2] = this.rgb[i * 3 + 2];
    }
    this.geo.instanceCount = this.live;
    if (this.live > 0) {
      for (const a of [this.offset, this.look, this.tint]) {
        a.clearUpdateRanges();
        a.addUpdateRange(0, this.live * a.itemSize);
        a.needsUpdate = true;
      }
    }
  }

  /** Puff `from` moved into slot `to` (the last alive filling the gap one left). */
  private move(from: number, to: number): void {
    if (from === to) return;
    this.px.copyWithin(to * 3, from * 3, from * 3 + 3);
    this.pv.copyWithin(to * 3, from * 3, from * 3 + 3);
    this.rgb.copyWithin(to * 3, from * 3, from * 3 + 3);
    for (const a of [this.age, this.life, this.size0, this.size1, this.peak, this.turn, this.spin, this.shade, this.drag]) a[to] = a[from];
  }

  clear(): void {
    this.live = 0;
    this.geo.instanceCount = 0;
    this.owed.clear();
    this.side.clear();
  }
}
