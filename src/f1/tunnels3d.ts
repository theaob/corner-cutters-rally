// The Riviera's tunnels in 3D: a roof of rock over each (the ground's own rock rises round it to meet it:
// circuit.ts), and a stone arch at each mouth. The car would be out of sight under the roof, so while one is
// inside the roof turns to glass: it fades until the road and the car show through it, and comes back once the
// car's out. Visual only: the tunnel's walls are the circuit's own solid tiles.

import * as THREE from 'three';
import { groundAt } from '../engine/sim';
import { canvas } from '../engine/render/sprites';
import { pixelTexture } from '../engine/render/textures';
import { HALF_WIDTH, TILE, type Circuit } from './circuit';
import { RIVIERA } from './riviera';

export const TUNNEL_LOOK = {
  /** px past the walls the roof reaches, either side (over the rock that rises to it) */
  over: 20,
  /** the roof's opacity with a car under it, and the share of the way there it goes each second */
  glass: 0.22,
  ease: 6,
  /** the arch at each mouth: px thick (along the road), px its posts are wide, and px its lintel is high */
  arch: { thick: 8, post: 10, lintel: 9 },
};

/** The rock over a tunnel: the cliffs' red rock, a little maquis on it. */
function roofTexture(): THREE.Texture {
  const [c, x] = canvas(64, 64);
  let seed = 77;
  const r = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  x.fillStyle = '#c58a5c';
  x.fillRect(0, 0, 64, 64);
  x.fillStyle = '#9c6540';
  for (let k = 2; k < 64; k += 5) x.fillRect(0, k, 64, 1);
  for (let k = 0; k < 300; k++) {
    x.fillStyle = ['#a36c44', '#dba878', '#7d8a4a', '#6c7a40'][Math.floor(r() * 4)];
    x.fillRect(Math.floor(r() * 64), Math.floor(r() * 64), r() < 0.3 ? 3 : 2, r() < 0.5 ? 1 : 2);
  }
  const t = pixelTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export interface TunnelScene {
  group: THREE.Group;
  /** The roofs faded for the `cars` under them (and back for none), `dt` s on. */
  animate(dt: number, cars: { x: number; y: number }[]): void;
}

/** Whether (x, y) is on the road under a tunnel's roof. */
export function underRoof(circuit: Circuit, x: number, y: number): boolean {
  const i = Math.floor(x / TILE);
  const j = Math.floor(y / TILE);
  return !!circuit.roof && i >= 0 && j >= 0 && i < circuit.width && j < circuit.height && circuit.roof[j * circuit.width + i];
}

/** The roofs and arches of `circuit`'s tunnels (an empty group for a road without any). */
export function buildTunnels(circuit: Circuit): TunnelScene {
  const group = new THREE.Group();
  const { track, grid, tunnel } = circuit;
  if (!tunnel) return { group, animate: () => {} };
  const n = track.samples.length;
  const roof = new THREE.MeshLambertMaterial({ map: roofTexture(), transparent: true });
  const stone = new THREE.MeshLambertMaterial({ color: 0xd9d0bd });
  const dark = new THREE.MeshLambertMaterial({ color: 0x8f8778 });
  const half = HALF_WIDTH + RIVIERA.wall + TUNNEL_LOOK.over;
  const A = TUNNEL_LOOK.arch;
  for (let i = 0; i < n; i++) {
    if (!tunnel[i] || tunnel[i - 1]) continue;
    let end = i;
    while (end + 1 < n && tunnel[end + 1]) end++;
    // the roof: a ribbon over the road from one mouth to the other, at the height of the rock either side
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    for (let k = i; k <= end; k++) {
      const p = track.samples[k];
      const up = groundAt(grid, p.x, p.y).h + RIVIERA.roof + 0.6;
      for (const side of [-1, 1]) {
        const x = p.x + Math.cos(p.dir) * half * side;
        const y = p.y + Math.sin(p.dir) * half * side;
        pos.push(x, up, y);
        uv.push(x / 64, y / 64);
      }
      // (two triangles from this pair of points to the next, wound to face up)
      if (k < end) {
        const a = (k - i) * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, roof);
    mesh.receiveShadow = true;
    // (drawn after the cars and the road under it, so they show through it once it's glass)
    mesh.renderOrder = 5;
    group.add(mesh);
    // the arches: two posts and a lintel at each mouth, the lintel's top level with the roof
    for (const k of [i, end]) {
      const p = track.samples[k];
      const put = (across: number, up: number, w: number, h: number, material: THREE.Material) => {
        const x = p.x + Math.cos(p.dir) * across;
        const y = p.y + Math.sin(p.dir) * across;
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, A.thick), material);
        m.position.set(x, groundAt(grid, p.x, p.y).h + up + h / 2, y);
        m.rotation.y = -p.dir;
        m.castShadow = true;
        group.add(m);
      };
      const span = HALF_WIDTH + RIVIERA.wall + A.post / 2;
      for (const side of [-1, 1]) put(side * span, 0, A.post, RIVIERA.roof + 2, stone);
      put(0, RIVIERA.roof + 2 - A.lintel, span * 2 + A.post, A.lintel, stone);
      put(0, RIVIERA.roof + 2, span * 2 + A.post + 4, 2, dark);
    }
    i = end;
  }
  let shown = 1;
  return {
    group,
    animate: (dt, cars) => {
      const want = cars.some((c) => underRoof(circuit, c.x, c.y)) ? TUNNEL_LOOK.glass : 1;
      shown += (want - shown) * Math.min(1, dt * TUNNEL_LOOK.ease);
      if (Math.abs(want - shown) < 0.01) shown = want;
      roof.opacity = shown;
      // (whole, it hides what's under it as rock does; glass, it lets it through)
      roof.depthWrite = shown >= 1;
    },
  };
}
