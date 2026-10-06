// Lakes beyond the barriers (layout.lakes): each a polygon of water, flat, on
// a narrow sandy shore, out past the run-off where nothing races; the
// grandstands keep out of them. Twin Lakes has its two.

import * as THREE from 'three';
import { groundAt } from '../engine/sim';
import type { Circuit } from './circuit';
import type { Pt } from './racing';

export const LAKE = {
  /** px of sandy shore round the water */
  shore: 12,
  /** the water's colour, and its shore's */
  water: 0x2f74b8,
  sand: 0xd8c49a,
};

/** A circuit's lakes, on the map (none for most). */
export function lakesOf(circuit: Circuit): Pt[][] {
  const { scale } = circuit.layout;
  const { offset } = circuit;
  return (circuit.layout.lakes ?? []).map((lake) => lake.map((p) => ({ x: p.x * scale - offset.x, y: p.y * scale - offset.y })));
}

/** Whether (x, y) is in `poly`. */
function inside(poly: Pt[], x: number, y: number): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > y !== b.y > y && x < a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y)) c = !c;
  }
  return c;
}

/** px from (x, y) to `poly`'s edge. */
function toEdge(poly: Pt[], x: number, y: number): number {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j];
    const b = poly[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy)));
    best = Math.min(best, Math.hypot(a.x + t * dx - x, a.y + t * dy - y));
  }
  return best;
}

/** Whether (x, y) is in one of the circuit's lakes, or within `margin` px of its shore. */
export function inLake(lakes: Pt[][], x: number, y: number, margin = 0): boolean {
  return lakes.some((l) => inside(l, x, y) || toEdge(l, x, y) < margin);
}

/** The circuit's lakes in `scene`: the water, flat at the height of the ground under its highest point (so no hill shows through it), on its shore. */
export function buildLakes(scene: THREE.Scene, circuit: Circuit): void {
  for (const lake of lakesOf(circuit)) {
    const cx = lake.reduce((a, p) => a + p.x, 0) / lake.length;
    const cy = lake.reduce((a, p) => a + p.y, 0) / lake.length;
    // (the highest ground under it, sampled over it)
    const xs = lake.map((p) => p.x);
    const ys = lake.map((p) => p.y);
    let level = -Infinity;
    for (let y = Math.min(...ys); y <= Math.max(...ys); y += 24) {
      for (let x = Math.min(...xs); x <= Math.max(...xs); x += 24) if (inside(lake, x, y)) level = Math.max(level, groundAt(circuit.grid, x, y).h);
    }
    if (!Number.isFinite(level)) level = groundAt(circuit.grid, cx, cy).h;
    const sheet = (poly: Pt[], y: number, color: number) => {
      // (a shape in x, −z, laid flat: the map's y is the world's z)
      const shape = new THREE.Shape(poly.map((p) => new THREE.Vector2(p.x, -p.y)));
      const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }));
      mesh.position.y = y;
      mesh.receiveShadow = true;
      scene.add(mesh);
    };
    // its shore, a little wider all round, and the water on it
    const wider = lake.map((p) => {
      const d = Math.hypot(p.x - cx, p.y - cy) || 1;
      return { x: p.x + ((p.x - cx) / d) * LAKE.shore, y: p.y + ((p.y - cy) / d) * LAKE.shore };
    });
    sheet(wider, level + 0.3, LAKE.sand);
    sheet(lake, level + 0.6, LAKE.water);
  }
}
