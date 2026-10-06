// A stage in 3D: the road painted over the ground (gravel and earth, packed
// snow, sand, or tarmac with white edge lines and red-and-white kerbs), yellow
// track-limit strips inside the marked corners, the start and finish lines and
// the split lines, all draped over the road's heights; the barriers along the
// run-off (hay bales on dirt, tyre walls on tarmac), and the scenery beyond: a
// forest, the mountains, the snow or the desert.

import * as THREE from 'three';
import { canvas } from '../engine/render/sprites';
import { pixelTexture } from '../engine/render/textures';
import { addDaylight, type Daylight } from '../engine/render/daylight';
import { groundAt } from '../engine/sim';
import { sectorStarts, type Pt } from './racing';
import { HALF_WIDTH, KERB, TILE as T, kerbed, type Circuit } from './circuit';
import { markCorners } from './trackLimits';
import { DRY, type Weather } from './weather';
import { buildForest } from './forest3d';
import { buildCamels } from './camels';

export interface CircuitScene extends Daylight {
  scene: THREE.Scene;
  /** the road scaled into a small canvas, for the minimap */
  minimap(width: number, height: number): { canvas: HTMLCanvasElement; toMap: (x: number, y: number) => Pt };
  /** Move the scenery's animals (the desert's camels), `t` seconds on. */
  animate(t: number): void;
  /** Darken the ground (and the ground beyond) by `tint`, as the road wets or dries (weather.ts's look). */
  setGroundTint(tint: number): void;
}

function rng(seed: number): () => number {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

/** The split lines' colour, and px wide (along the road) */
const SECTOR_LINE = '#f4f4f8';
const SECTOR_WIDTH = 3;

/** px across each square of the chequered start and finish lines (as near as fits the road's width evenly) */
const START_SQUARE = 6;

/** A forest's floor, past the barriers */
const FOREST_FLOOR = '#2f5a2c';

/** The desert's colours: the sand (its run-off, beyond the barriers, and the specks in it), and the gravel traps, redder so they stand out from it */
const DESERT = { runoff: '#e4c896', runoffStripe: '#dcbf8a', sand: '#d8b47c', speck: '#c49e66', ripple: '#e8d0a2', gravel: '#c08a5e', gravelDot: ['#ad7a50', '#d29e72'] };

/** The mountains' colours beyond the barriers: alpine meadow, bare rock on the steep ground, and snow up high */
const MOUNTAIN = { meadow: '#5c7f3c', meadowDot: ['#4b6c31', '#7a7a58'], rock: '#7e7a72', rockDot: ['#69655e', '#99948b'], snow: '#eef2f6', snowDot: '#cdd6df' };
/** px up past which the ground beyond the barriers is snow; the steepness (rise per px) past which it's bare rock */
const SNOW_LINE = 150;
/** On dirt (layout.dirt): dirt everywhere. The road's wet, dark earth, its ruts deeper still where the cars run, wet
 * clods over it and puddles catching the light; the berms along its edges (in place of kerbs) drier; the run-off's
 * dry earth, graded in stripes, and beyond the barriers the dry, rougher ground, stones strewn over it; and the
 * barriers hay bales */
const DIRT = {
  track: '#4e3220', rut: '#382214', clods: ['#5e3d28', '#3f2818'], puddle: '#5b5650', shine: '#8c8c96', berm: '#7a5332',
  graded: ['#b88a5a', '#b08254'], gradedDot: '#9c7148', ground: '#a87a4c', groundDot: ['#8e6440', '#c49464', '#d2b48c'], bale: ['#d9b25a', '#c39a40'],
};
/** Under snow (layout.snow): the run-off groomed in stripes, and the snow beyond the barriers, its shadows blue */
const SNOWFIELD = { groomed: ['#f4f7fa', '#e9eef3'], groomedDot: '#dbe3ea', snow: '#eef2f6', snowDot: ['#d2dbe4', '#c6d2de'], rockDot: '#8a8f96' };
/** A stage on snow (layout.dirt and layout.snow): packed snow and ice for the road, its ruts worn grey-blue,
 * clumps of snow thrown up over it, sheet ice catching the light; snow banks along its edges, and walls of snow */
const SNOW_ROAD: typeof DIRT = {
  track: '#c4ced8', rut: '#98a6b4', clods: ['#e8eef3', '#aebbc7'], puddle: '#9fc0de', shine: '#f4faff', berm: '#f2f6f9',
  graded: ['#f4f7fa', '#e9eef3'], gradedDot: '#dbe3ea', ground: '#eef2f6', groundDot: ['#d2dbe4', '#c6d2de', '#8a8f96'], bale: ['#f4f7fa', '#d6e0ea'],
};
/** A stage in the desert (layout.dirt and layout.desert): a sandy road, pale ruts and berms of drifted sand */
const SAND_ROAD: typeof DIRT = {
  track: '#b88a56', rut: '#9a6e40', clods: ['#caa070', '#8e6438'], puddle: '#c8a676', shine: '#e8d0a2', berm: '#dcbf8a',
  graded: ['#e4c896', '#dcbf8a'], gradedDot: '#c49e66', ground: '#d8b47c', groundDot: ['#c49e66', '#e8d0a2', '#b08a5a'], bale: ['#d9b25a', '#c39a40'],
};
/** The colours of a dirt road: gravel and earth, unless it's on snow or in the desert. */
const dirtOf = (layout: { snow?: boolean; desert?: boolean }): typeof DIRT => (layout.snow ? SNOW_ROAD : layout.desert ? SAND_ROAD : DIRT);
const ROCK_STEEP = 0.45;

/** samples either side of each that its painted normal is averaged over */
const NORMAL_SPAN = 4;

/**
 * The normals the track's lines and kerbs are painted along (unit vectors, its direction's right): each sample's
 * averaged with its neighbours', nearer ones counting more, so a sharp step from one sample to the next is spread
 * over a few and the edges and kerbs follow on round the bend unbroken.
 */
export function paintNormals(samples: { dir: number }[], open = false): Pt[] {
  const n = samples.length;
  // (round the loop; on an open road, held at its ends)
  const at = (i: number) => (open ? Math.max(0, Math.min(n - 1, i)) : (i + n) % n);
  return samples.map((_, i) => {
    let x = 0;
    let y = 0;
    for (let k = -NORMAL_SPAN; k <= NORMAL_SPAN; k++) {
      const w = NORMAL_SPAN + 1 - Math.abs(k);
      const d = samples[at(i + k)].dir;
      x += Math.cos(d) * w;
      y += Math.sin(d) * w;
    }
    const len = Math.hypot(x, y) || 1;
    return { x: x / len, y: y / len };
  });
}

/**
 * The line `off` px out from the track (along `normal`, + its right): where the bend is tighter than that inside it,
 * a point that would step back against the track's way round stays where the last one was, so the line bunches up
 * round the apex instead of folding back on itself.
 */
export function offsetLine(samples: { x: number; y: number; dir: number }[], normal: Pt[], off: number): Pt[] {
  const out: Pt[] = [];
  samples.forEach((p, i) => {
    const q = { x: p.x + normal[i].x * off, y: p.y + normal[i].y * off };
    const last = out[i - 1];
    // (the track's way round: its normal, its right, turned a quarter to the left)
    if (last && (q.x - last.x) * normal[i].y - (q.y - last.y) * normal[i].x < 0) out.push({ ...last });
    else out.push(q);
  });
  return out;
}

/** The tiles the barriers stand on (i, j): every wall tile that touches the run-off. */
export function barrierTiles(circuit: Circuit): [number, number][] {
  const { width: W, height: H, cells } = circuit;
  const cell = (i: number, j: number) => (i >= 0 && j >= 0 && i < W && j < H ? cells[j * W + i] : 'wall');
  const walls: [number, number][] = [];
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      if (cells[j * W + i] !== 'wall') continue;
      let near = false;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) near ||= cell(i + di, j + dj) !== 'wall';
      if (near) walls.push([i, j]);
    }
  }
  return walls;
}

function paint(circuit: Circuit): HTMLCanvasElement {
  const { width: W, height: H, cells, track } = circuit;
  const [c, x] = canvas(W * T, H * T);
  const r = rng(11);
  const forest = !!circuit.layout.forest;
  const desert = !!circuit.layout.desert;
  const mountain = !!circuit.layout.mountain;
  const snowy = !!circuit.layout.snow;
  const dirt = !!circuit.layout.dirt;
  const D = dirtOf(circuit.layout);
  /** a tile's height (its corners' average) and steepness (its corners' spread over its width) */
  const relief = (i: number, j: number) => {
    const hs = circuit.grid.heights!;
    const row = W + 1;
    const c = [hs[j * row + i], hs[j * row + i + 1], hs[(j + 1) * row + i], hs[(j + 1) * row + i + 1]];
    return { h: (c[0] + c[1] + c[2] + c[3]) / 4, steep: (Math.max(...c) - Math.min(...c)) / T };
  };
  // run-off and surroundings, tile by tile
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const cell = cells[j * W + i];
      const px = i * T;
      const py = j * T;
      if (cell === 'gravel' && !(dirt && snowy)) {
        // (a snow stage's run-off is snow all through: its own branch, below)
        x.fillStyle = desert ? DESERT.gravel : '#d8c49a';
        x.fillRect(px, py, T, T);
        for (let k = 0; k < 10; k++) {
          x.fillStyle = desert ? DESERT.gravelDot[r() < 0.5 ? 0 : 1] : r() < 0.5 ? '#c4ae82' : '#e6d6b0';
          x.fillRect(px + Math.floor(r() * T), py + Math.floor(r() * T), 1, 1);
        }
      } else if (dirt && !snowy && !desert) {
        // on dirt, dry earth: the run-off graded in stripes; beyond the barriers rougher, stones strewn over it
        const wall = cell === 'wall';
        x.fillStyle = wall ? D.ground : D.graded[(i + j) % 4 < 2 ? 0 : 1];
        x.fillRect(px, py, T, T);
        for (let k = 0; k < (wall ? 4 : 3); k++) {
          x.fillStyle = wall ? D.groundDot[Math.floor(r() * 3)] : D.gradedDot;
          x.fillRect(px + Math.floor(r() * T), py + Math.floor(r() * T), wall ? 2 : 1, 1);
        }
      } else if (snowy) {
        // under snow: the run-off groomed in stripes; beyond the barriers deep snow, the steep ground's rock showing through it
        const { steep } = relief(i, j);
        const wall = cell === 'wall';
        const rock = wall && steep > ROCK_STEEP;
        x.fillStyle = wall ? SNOWFIELD.snow : SNOWFIELD.groomed[(i + j) % 4 < 2 ? 0 : 1];
        x.fillRect(px, py, T, T);
        for (let k = 0; k < (rock ? 5 : 3); k++) {
          x.fillStyle = rock && r() < 0.7 ? SNOWFIELD.rockDot : wall ? SNOWFIELD.snowDot[r() < 0.6 ? 0 : 1] : SNOWFIELD.groomedDot;
          x.fillRect(px + Math.floor(r() * T), py + Math.floor(r() * T), wall ? 2 : 1, 1);
        }
      } else if (mountain && cell === 'wall') {
        // in the mountains, beyond the barriers: snow up high, bare rock where it's steep, alpine meadow elsewhere
        const { h, steep } = relief(i, j);
        const snow = h > SNOW_LINE;
        const rock = !snow && steep > ROCK_STEEP;
        x.fillStyle = snow ? MOUNTAIN.snow : rock ? MOUNTAIN.rock : MOUNTAIN.meadow;
        x.fillRect(px, py, T, T);
        for (let k = 0; k < 3; k++) {
          x.fillStyle = snow ? (steep > ROCK_STEEP && r() < 0.6 ? MOUNTAIN.rockDot[0] : MOUNTAIN.snowDot) : rock ? MOUNTAIN.rockDot[r() < 0.5 ? 0 : 1] : MOUNTAIN.meadowDot[r() < 0.7 ? 0 : 1];
          x.fillRect(px + Math.floor(r() * T), py + Math.floor(r() * T), rock ? 2 : 1, rock ? 1 : 2);
        }
      } else if (desert) {
        // in the desert, sand: smoothed and striped on the run-off, rippled beyond the barriers
        x.fillStyle = cell === 'wall' ? DESERT.sand : (i + j) % 4 < 2 ? DESERT.runoff : DESERT.runoffStripe;
        x.fillRect(px, py, T, T);
        for (let k = 0; k < 3; k++) {
          x.fillStyle = cell === 'wall' && r() < 0.5 ? DESERT.ripple : DESERT.speck;
          x.fillRect(px + Math.floor(r() * T), py + Math.floor(r() * T), cell === 'wall' ? 3 : 1, 1);
        }
      } else {
        // grass everywhere else (the track is painted over it); mown stripes on the run-off; in a forest, its dark floor past the barriers
        x.fillStyle = cell === 'wall' ? (forest ? FOREST_FLOOR : '#4b9444') : (i + j) % 4 < 2 ? '#5aa84f' : '#62b156';
        x.fillRect(px, py, T, T);
        for (let k = 0; k < 3; k++) {
          x.fillStyle = cell === 'wall' && forest ? (r() < 0.5 ? '#3a5a2a' : '#5a4a2e') : '#3f8a3c';
          x.fillRect(px + Math.floor(r() * T), py + Math.floor(r() * T), 1, 2);
        }
      }
    }
  }
  const pts = track.samples;
  // (out from the track along its normals smoothed a little: a sharp step in the centreline would fold the lines and
  // kerbs painted just inside the edge back on themselves)
  const normal = paintNormals(pts, !!track.open);
  const offset = (off: number) => offsetLine(pts, normal, off);
  // (a rally's stage: a road with two ends, never joined up)
  const path = (list: Pt[], closed = !track.open) => {
    x.beginPath();
    list.forEach((p, i) => (i ? x.lineTo(p.x, p.y) : x.moveTo(p.x, p.y)));
    if (closed) x.closePath();
  };
  x.lineJoin = 'round';
  x.lineCap = 'butt';
  // asphalt (on dirt, wet earth: ruts worn deep along it where the cars run, wet clods strewn over it, puddles in
  // the ruts catching the light, and a berm of drier earth thrown up along each edge)
  x.strokeStyle = dirt ? D.track : '#4a4d59';
  x.lineWidth = HALF_WIDTH * 2;
  path(pts);
  x.stroke();
  if (dirt) {
    x.strokeStyle = D.berm;
    x.lineWidth = 6;
    for (const side of [-1, 1]) {
      path(offset(side * (HALF_WIDTH - 3)));
      x.stroke();
    }
    x.strokeStyle = D.rut;
    x.lineWidth = 3;
    for (const off of [-24, -12, 12, 24]) {
      path(offset(off));
      x.stroke();
    }
    for (const p of pts) {
      for (let k = 0; k < 6; k++) {
        const across = (r() * 2 - 1) * (HALF_WIDTH - 4);
        x.fillStyle = D.clods[r() < 0.6 ? 0 : 1];
        x.fillRect(Math.round(p.x + Math.cos(p.dir) * across + (r() - 0.5) * 8), Math.round(p.y + Math.sin(p.dir) * across + (r() - 0.5) * 8), r() < 0.3 ? 2 : 1, 1);
      }
    }
    // (puddles lying in the ruts here and there, along the track, a glint of sky on each)
    const ruts = [-24, -12, 12, 24].map(offset);
    for (let i = 0; i < pts.length; i++) {
      if (r() > 0.05) continue;
      const rut = ruts[Math.floor(r() * ruts.length)];
      const len = 2 + Math.floor(r() * 4);
      x.strokeStyle = D.puddle;
      x.lineWidth = 4;
      x.beginPath();
      for (let k = 0; k <= len; k++) {
        const q = rut[Math.min(pts.length - 1, i + k)];
        if (k) x.lineTo(q.x, q.y);
        else x.moveTo(q.x, q.y);
      }
      x.stroke();
      const q = rut[Math.min(pts.length - 1, i + 1)];
      x.fillStyle = D.shine;
      x.fillRect(Math.round(q.x), Math.round(q.y), 2, 1);
    }
  }
  // white edge lines (none on dirt: its berms are its edges)
  x.strokeStyle = '#e8e8ee';
  x.lineWidth = 2;
  for (const side of dirt ? [] : [-1, 1]) {
    path(offset(side * (HALF_WIDTH - 2)));
    x.stroke();
  }
  // kerbs on the bends: a red-and-white band just inside each edge along every kerbed stretch (KERB), its stripes
  // all the same length measured along the kerb itself (so as long round the inside of a bend as round the
  // outside), each kerb starting on red; drawn as quads that share their edges, so there are no gaps on a curve
  // (none on dirt: its berms instead)
  const kerbs = dirt ? track.samples.map(() => false) : kerbed(track);
  const n = pts.length;
  for (const side of [-1, 1]) {
    const inner = offset(side * KERB.inner);
    const outer = offset(side * KERB.outer);
    const mid = offset(side * (KERB.inner + KERB.outer) * 0.5);
    // each kerbed stretch, from its first sample to its last
    for (let i = 0; i < n; i++) {
      if (!kerbs[i] || kerbs[(i - 1 + n) % n]) continue;
      let end = i;
      while (kerbs[(end + 1) % n] && (end + 1) % n !== i) end++;
      let along = 0;
      for (let k = i; k < end; k++) {
        const a = k % n;
        const b = (k + 1) % n;
        const seg = Math.hypot(mid[b].x - mid[a].x, mid[b].y - mid[a].y);
        // this step cut where the stripes change, each piece filled in its stripe's colour
        let t0 = 0;
        while (t0 < 1 - 1e-6) {
          const stripe = Math.floor((along + t0 * seg) / KERB.stripe + 1e-6);
          const t1 = seg > 0 ? Math.min(1, ((stripe + 1) * KERB.stripe - along) / seg) : 1;
          const lerp = (p: Pt[], t: number) => ({ x: p[a].x + (p[b].x - p[a].x) * t, y: p[a].y + (p[b].y - p[a].y) * t });
          const q = [lerp(inner, t0), lerp(outer, t0), lerp(outer, t1), lerp(inner, t1)];
          x.fillStyle = stripe % 2 === 0 ? '#d8323c' : '#f4f4f8';
          x.beginPath();
          q.forEach((v, j) => (j ? x.lineTo(v.x, v.y) : x.moveTo(v.x, v.y)));
          x.closePath();
          x.fill();
          t0 = t1;
        }
        along += seg;
      }
    }
  }
  // track limits: a yellow-and-black strip round each marked corner's apex, just off the inside edge (past it is a cut)
  x.lineWidth = 4;
  for (const k of markCorners(track)) {
    const edge = offset(k.side * (HALF_WIDTH + 6));
    for (let j = -5; j < 5; j++) {
      const a = edge[(k.apex + j + pts.length) % pts.length];
      const b = edge[(k.apex + j + 1 + pts.length) % pts.length];
      x.strokeStyle = (j + 5) % 2 === 0 ? '#f2c14e' : '#1b1b26';
      x.beginPath();
      x.moveTo(a.x, a.y);
      x.lineTo(b.x, b.y);
      x.stroke();
    }
  }
  // grid boxes: a white bracket in front of each slot
  x.strokeStyle = '#f4f4f8';
  x.lineWidth = 2;
  // (a rally's stage: one car on the line at a time, so one box)
  for (const g of circuit.layout.stage ? circuit.slots.slice(0, 1) : circuit.slots) {
    const gfx = Math.sin(g.heading);
    const gfy = -Math.cos(g.heading);
    const grx = Math.cos(g.heading);
    const gry = Math.sin(g.heading);
    const front = { x: g.x + gfx * 16, y: g.y + gfy * 16 };
    x.beginPath();
    x.moveTo(front.x - grx * 9 - gfx * 6, front.y - gry * 9 - gfy * 6);
    x.lineTo(front.x - grx * 9, front.y - gry * 9);
    x.lineTo(front.x + grx * 9, front.y + gry * 9);
    x.lineTo(front.x + grx * 9 - gfx * 6, front.y + gry * 9 - gfy * 6);
    x.stroke();
  }
  // a white line across the track where each sector after the first starts (the start/finish line is the first's:
  // chequered, below), edge to edge, square to the track
  for (const k of sectorStarts(track)) {
    const p = pts[k];
    x.save();
    x.translate(p.x, p.y);
    x.rotate(p.dir);
    x.fillStyle = SECTOR_LINE;
    x.fillRect(-HALF_WIDTH, -SECTOR_WIDTH / 2, HALF_WIDTH * 2, SECTOR_WIDTH);
    x.restore();
  }
  // the chequered start/finish line across the track at sample 0: squares in the track's own frame (turned with
  // it, so as even on a straight at an angle as on one up the map), edge to edge, two rows centred on the line (over the pole's grid box, should they touch)
  // (a rally's stage: its start line, and its flying finish far along the road)
  const stage = track.stage;
  const lines = stage ? [stage.start, stage.finish].map((d) => Math.round(d / track.spacing)) : [0];
  const across = Math.round((HALF_WIDTH * 2) / START_SQUARE);
  const sq = (HALF_WIDTH * 2) / across;
  for (const at of lines) {
    const s0 = pts[at];
    x.save();
    x.translate(s0.x, s0.y);
    // (local x: across the track, to the right of the way of the race; local y: back down the track)
    x.rotate(s0.dir);
    for (let k = 0; k < across; k++) {
      for (let row = 0; row < 2; row++) {
        x.fillStyle = (k + row) % 2 === 0 ? '#f4f4f8' : '#1b1b26';
        x.fillRect(-HALF_WIDTH + k * sq, (row - 1) * sq, sq + 0.5, sq + 0.5);
      }
    }
    x.restore();
  }
  return c;
}

/** The stage in `weather`: its sky and light, and the ground darker when it's wet. */
export function createCircuitScene(circuit: Circuit, weather: Weather = DRY): CircuitScene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#8fb8e8');
  const light = addDaylight(scene);
  light.setSky(weather.sky);
  const { width: W, height: H, grid, track } = circuit;

  const geo = new THREE.PlaneGeometry(W * T, H * T, W, H).rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, grid.heights![i]);
  geo.computeVertexNormals();
  const tint = new THREE.Color(weather.groundTint);
  const ground = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: pixelTexture(paint(circuit)), color: tint }));
  ground.position.set((W * T) / 2, 0, (H * T) / 2);
  ground.receiveShadow = true;
  const outerColor = new THREE.Color(circuit.layout.forest ? FOREST_FLOOR : circuit.layout.desert ? DESERT.sand : circuit.layout.snow ? SNOWFIELD.snow : circuit.layout.dirt ? DIRT.ground : circuit.layout.mountain ? MOUNTAIN.meadow : 0x4b9444);
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: outerColor.clone().multiply(tint) }));
  outer.position.set((W * T) / 2, -1, (H * T) / 2);
  outer.receiveShadow = true;
  scene.add(ground, outer);

  // the barriers: on every wall tile that touches the run-off, tyre walls stacked red and white (on dirt, hay bales: two straws)
  const walls = barrierTiles(circuit);
  const tyres = new THREE.InstancedMesh(new THREE.CylinderGeometry(7, 7, 7, 8), new THREE.MeshLambertMaterial({ color: 0xffffff }), walls.length);
  const m = new THREE.Matrix4();
  const dirtTrack = !!circuit.layout.dirt;
  const red = new THREE.Color(dirtTrack ? dirtOf(circuit.layout).bale[0] : '#d8323c');
  const white = new THREE.Color(dirtTrack ? dirtOf(circuit.layout).bale[1] : '#f4f4f8');
  walls.forEach(([i, j], k) => {
    const h = groundAt(grid, (i + 0.5) * T, (j + 0.5) * T).h;
    m.makeTranslation((i + 0.5) * T, h + 3.5, (j + 0.5) * T);
    tyres.setMatrixAt(k, m);
    tyres.setColorAt(k, (i + j) % 2 === 0 ? red : white);
  });
  tyres.castShadow = tyres.receiveShadow = true;
  scene.add(tyres);
  // (in a forest, or in the mountains: the trees)
  buildForest(scene, circuit);

  const minimap = (mw: number, mh: number) => {
    const [mc, mx] = canvas(mw, mh);
    const scale = Math.min((mw - 8) / (W * T), (mh - 8) / (H * T));
    const toMap = (x: number, y: number) => ({ x: 4 + x * scale, y: 4 + y * scale });
    mx.strokeStyle = '#f4f2fa';
    mx.lineWidth = 2;
    mx.beginPath();
    track.samples.forEach((p, i) => {
      const q = toMap(p.x, p.y);
      if (i) mx.lineTo(q.x, q.y);
      else mx.moveTo(q.x, q.y);
    });
    // (a rally's stage: from its start to its end, not joined up)
    if (!track.open) mx.closePath();
    mx.stroke();
    // (the start line, in gold)
    const start = track.samples[Math.round((track.stage?.start ?? 0) / track.spacing)];
    const s = toMap(start.x, start.y);
    mx.fillStyle = '#f2c14e';
    mx.fillRect(s.x - 3, s.y - 1, 6, 2);
    return { canvas: mc, toMap };
  };

  // (in the desert: its camels)
  const camels = circuit.layout.desert ? buildCamels(scene, circuit) : undefined;

  return {
    scene,
    ...light,
    minimap,
    animate: (t) => camels?.animate(t),
    setGroundTint: (t) => {
      (ground.material as THREE.MeshLambertMaterial).color.setHex(t);
      (outer.material as THREE.MeshLambertMaterial).color.copy(outerColor).multiply(new THREE.Color(t));
    },
  };
}
