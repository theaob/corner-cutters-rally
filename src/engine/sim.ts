// Tile collision for circles (the player and cars). Pure, no rendering.
// The car itself lives in ../driving.ts.

export interface Grid {
  width: number;
  height: number;
  tile: number;
  solid: boolean[];
  /** ground that slows road vehicles (grass, dirt, fields); missing = all smooth */
  rough?: boolean[];
  /**
   * Ground height in px at each tile corner, (width + 1) × (height + 1), row by
   * row; missing = flat at 0. Heights blend smoothly across each tile.
   */
  heights?: number[];
}

export interface Ground {
  /** height in px */
  h: number;
  /** slope: height change per px moved east (gx) and south (gy) */
  gx: number;
  gy: number;
}

const FLAT: Ground = { h: 0, gx: 0, gy: 0 };

/** Ground height and slope under world point (x, y), blended from the tile's corners. */
export function groundAt(g: Grid, x: number, y: number): Ground {
  if (!g.heights) return FLAT;
  const t = g.tile;
  const fx = Math.min(g.width - 1e-6, Math.max(0, x / t));
  const fy = Math.min(g.height - 1e-6, Math.max(0, y / t));
  const tx = Math.floor(fx);
  const ty = Math.floor(fy);
  const u = fx - tx;
  const v = fy - ty;
  const row = g.width + 1;
  const h00 = g.heights[ty * row + tx];
  const h10 = g.heights[ty * row + tx + 1];
  const h01 = g.heights[(ty + 1) * row + tx];
  const h11 = g.heights[(ty + 1) * row + tx + 1];
  return {
    h: h00 * (1 - u) * (1 - v) + h10 * u * (1 - v) + h01 * (1 - u) * v + h11 * u * v,
    gx: ((h10 - h00) * (1 - v) + (h11 - h01) * v) / t,
    gy: ((h01 - h00) * (1 - u) + (h11 - h10) * u) / t,
  };
}

/** Is the ground under world point (x, y) rough? Outside the map counts as smooth. */
export function isRough(g: Grid, x: number, y: number): boolean {
  if (!g.rough) return false;
  const tx = Math.floor(x / g.tile);
  const ty = Math.floor(y / g.tile);
  if (tx < 0 || ty < 0 || tx >= g.width || ty >= g.height) return false;
  return g.rough[ty * g.width + tx];
}

/** Outside the map counts as solid. */
export function isSolidTile(g: Grid, tx: number, ty: number): boolean {
  if (tx < 0 || ty < 0 || tx >= g.width || ty >= g.height) return true;
  return g.solid[ty * g.width + tx];
}

/** Does a circle at (x, y) with radius r overlap any solid tile? */
export function circleBlocked(g: Grid, x: number, y: number, r: number): boolean {
  const t = g.tile;
  for (let ty = Math.floor((y - r) / t); ty <= Math.floor((y + r) / t); ty++) {
    for (let tx = Math.floor((x - r) / t); tx <= Math.floor((x + r) / t); tx++) {
      if (!isSolidTile(g, tx, ty)) continue;
      const nx = Math.max(tx * t, Math.min(x, tx * t + t));
      const ny = Math.max(ty * t, Math.min(y, ty * t + t));
      if ((x - nx) ** 2 + (y - ny) ** 2 < r * r) return true;
    }
  }
  return false;
}

/** A circle's contact with the solid tiles: the way out of the deepest (unit normal, from the tile to the circle), how far in it is, and the point touched. */
export interface Contact {
  nx: number;
  ny: number;
  depth: number;
  px: number;
  py: number;
}

/** Where a circle at (x, y) with radius r digs deepest into a solid tile (undefined: it touches none). */
export function circleContact(g: Grid, x: number, y: number, r: number): Contact | undefined {
  const t = g.tile;
  let best: Contact | undefined;
  for (let ty = Math.floor((y - r) / t); ty <= Math.floor((y + r) / t); ty++) {
    for (let tx = Math.floor((x - r) / t); tx <= Math.floor((x + r) / t); tx++) {
      if (!isSolidTile(g, tx, ty)) continue;
      const px = Math.max(tx * t, Math.min(x, tx * t + t));
      const py = Math.max(ty * t, Math.min(y, ty * t + t));
      const d = Math.hypot(x - px, y - py);
      if (d >= r) continue;
      let k: Contact;
      if (d > 1e-9) k = { nx: (x - px) / d, ny: (y - py) / d, depth: r - d, px, py };
      else {
        // (its middle inside the tile: out through the nearest face)
        const faces = [
          { nx: -1, ny: 0, d: x - tx * t },
          { nx: 1, ny: 0, d: tx * t + t - x },
          { nx: 0, ny: -1, d: y - ty * t },
          { nx: 0, ny: 1, d: ty * t + t - y },
        ].sort((a, b) => a.d - b.d)[0];
        k = { nx: faces.nx, ny: faces.ny, depth: r + faces.d, px: x + faces.nx * faces.d, py: y + faces.ny * faces.d };
      }
      if (!best || k.depth > best.depth) best = k;
    }
  }
  return best;
}

export interface MoveResult {
  x: number;
  y: number;
  hitX: boolean;
  hitY: boolean;
}

/** Move a circle by (dx, dy), sliding along walls. Sub-steps so fast movers can't tunnel. */
export function moveCircle(g: Grid, x: number, y: number, dx: number, dy: number, r: number): MoveResult {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / (r * 0.5)));
  let hitX = false;
  let hitY = false;
  for (let i = 0; i < steps; i++) {
    if (!hitX) {
      const nx = x + dx / steps;
      if (circleBlocked(g, nx, y, r)) hitX = true;
      else x = nx;
    }
    if (!hitY) {
      const ny = y + dy / steps;
      if (circleBlocked(g, x, ny, r)) hitY = true;
      else y = ny;
    }
  }
  return { x, y, hitX, hitY };
}
