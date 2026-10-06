// A circuit in 3D: grass and gravel run-off, a smooth painted track with
// white edge lines and red-and-white kerbs, yellow track-limit strips inside
// the marked corners, the start line and grid boxes, all
// draped over the circuit's heights; tyre walls round the outside and
// grandstands along the main straight and round the bends; the pit lane beside it, with its
// wall, box markings and garages.

import * as THREE from 'three';
import { canvas } from '../engine/render/sprites';
import { pixelTexture } from '../engine/render/textures';
import { addDaylight, type Daylight } from '../engine/render/daylight';
import { groundAt } from '../engine/sim';
import { sectorStarts, type Pt } from './racing';
import { PETALS, PetalField, type PetalCar } from './petals';
import { buildGopher, type GopherRun } from './gopher';
import { buildYeti, yetiAvoids, type YetiRun } from './yeti';
import { buildTramway, tramwayOf } from './tramway';
import { buildMonsterTrucks } from './monsterTrucks';
import { buildCrowds } from './crowd3d';
import { GARAGE_ACROSS, PIT } from './pits';
import { HALF_WIDTH, KERB, LANE_IN, LANE_OUT, RUNOFF, TILE as T, kerbed, type Circuit } from './circuit';
import { markCorners } from './trackLimits';
import { DRY, type Weather } from './weather';
import { buildTown, inside, seaOf } from './town3d';
import { standsOf } from './stands';
import { createPodiumDeck } from './podium3d';
import { buildForest, type Tree } from './forest3d';
import { buildCamels } from './camels';
import { buildLakes } from './lakes';
import { BRIDGE, liftAt } from './bridge';

/** The flags on the grandstands: the teams' colours and white. */
const FLAG_COLORS = [0xd8323c, 0xf2c14e, 0x3d7fc4, 0xf4f4f8, 0x5fe0d0, 0xff5fb8, 0x3d9a5a];

export interface CircuitScene extends Daylight {
  scene: THREE.Scene;
  /** the track outline scaled into a small canvas, for the minimap */
  minimap(width: number, height: number): { canvas: HTMLCanvasElement; toMap: (x: number, y: number) => Pt };
  /** Move the scenery's people (a street circuit's swimmers and tennis players), `t` seconds on. */
  animate(t: number): void;
  /** The scenery that moves with the race, `dt` s on near `focus` (the camera's), with `cars` about: the cherry blossom's petals (layout.blossoms), falling and kicked up; the gopher (layout.gophers), scurrying across; the yeti (layout.yeti), giving chase; the tramway's cabins (layout.tramway); the monster trucks (layout.monsterTrucks); the crowds cheering (layout.crowds). */
  stepScenery(dt: number, cars: PetalCar[], focus: { x: number; y: number }): void;
  /** the gopher's crossings (a circuit with one: layout.gophers) */
  gopher?: GopherRun;
  /** the yeti's chases (a circuit with one: layout.yeti) */
  yeti?: YetiRun;
  /** Darken the ground (and the grass beyond) by `tint`, as the track wets or dries (weather.ts's look). */
  setGroundTint(tint: number): void;
}

function rng(seed: number): () => number {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

/** A petal's pinks (paler than the blossom on the trees: a petal's thin), and its size (px) */
const PETAL_PINKS = [0xfbd3de, 0xf7c6d4, 0xffe4ec, 0xf4b6c8, 0xfadbe4];
const PETAL_SIZE = { w: 5, h: 3.4 };

/** The petals of `trees` (cherry trees in blossom) in `scene`: one instanced mesh, redrawn each step. Gives back the step. */
function buildPetals(scene: THREE.Scene, circuit: Circuit, trees: Tree[]): (dt: number, cars: PetalCar[], focus: { x: number; y: number }) => void {
  const field = new PetalField(circuit.grid, circuit.track, trees);
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(PETAL_SIZE.w, PETAL_SIZE.h), new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide }), PETALS.max);
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  const colors = PETAL_PINKS.map((c) => new THREE.Color(c));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const at = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const draw = () => {
    field.petals.forEach((p, i) => {
      // (lying flat on the ground, turned its own way; in the air, tumbling)
      if (p.resting) e.set(-Math.PI / 2, 0, p.spin);
      else e.set(p.spin, p.spin * 0.7, p.spin * 0.3);
      m.compose(at.set(p.x, p.z + 0.4, p.y), q.setFromEuler(e), one);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, colors[p.shade % colors.length]);
    });
    mesh.count = field.petals.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  };
  draw();
  scene.add(mesh);
  return (dt, cars, focus) => {
    field.step(dt, cars, focus);
    draw();
  };
}

/** The sector lines' colour, and px wide (along the track) */
const SECTOR_LINE = '#f4f4f8';
const SECTOR_WIDTH = 3;

/** px across each square of the chequered start/finish line (as near as fits the track's width evenly) */
const START_SQUARE = 6;

/** A forest's floor, past the barriers */
const FOREST_FLOOR = '#2f5a2c';

/** The desert's colours: the sand (its run-off, beyond the barriers, and the specks in it), and the gravel traps, redder so they stand out from it */
const DESERT = { runoff: '#e4c896', runoffStripe: '#dcbf8a', sand: '#d8b47c', speck: '#c49e66', ripple: '#e8d0a2', gravel: '#c08a5e', gravelDot: ['#ad7a50', '#d29e72'] };

/** The mountains' colours beyond the barriers: alpine meadow, bare rock on the steep ground, and snow up high */
const MOUNTAIN = { meadow: '#5c7f3c', meadowDot: ['#4b6c31', '#7a7a58'], rock: '#7e7a72', rockDot: ['#69655e', '#99948b'], snow: '#eef2f6', snowDot: '#cdd6df' };
/** px up past which the ground beyond the barriers is snow; the steepness (rise per px) past which it's bare rock */
const SNOW_LINE = 150;
/** On dirt (layout.dirt): dirt everywhere. The track's wet, dark earth, its ruts deeper still where the cars run, wet
 * clods over it and puddles catching the light; the berms along its edges (in place of kerbs) drier; the pit lane's
 * packed earth; the run-off's dry earth, graded in stripes, and beyond the barriers the dry, rougher ground, stones
 * strewn over it; and the barriers hay bales */
const DIRT = {
  track: '#4e3220', rut: '#382214', clods: ['#5e3d28', '#3f2818'], puddle: '#5b5650', shine: '#8c8c96', berm: '#7a5332', lane: '#9a7048',
  graded: ['#b88a5a', '#b08254'], gradedDot: '#9c7148', ground: '#a87a4c', groundDot: ['#8e6440', '#c49464', '#d2b48c'], bale: ['#d9b25a', '#c39a40'],
};
/** Under snow (layout.snow): the run-off groomed in stripes, and the snow beyond the barriers, its shadows blue */
const SNOWFIELD = { groomed: ['#f4f7fa', '#e9eef3'], groomedDot: '#dbe3ea', snow: '#eef2f6', snowDot: ['#d2dbe4', '#c6d2de'], rockDot: '#8a8f96' };
const ROCK_STEEP = 0.45;

/** The banking's concrete, and the seams along it */
const CONCRETE = '#b4b2ac';
const SEAM = '#99978f';

/** The street circuits' colours: the pavement, the town's paving, the sea. */
const STREET = { pavement: '#9b9ba3', joint: '#8a8a93', town: '#c8b48f', townDot: '#b9a47e', sea: '#2a6ca6', wave: '#4b8ccc' };

/** samples either side of each that its painted normal is averaged over */
const NORMAL_SPAN = 4;

/**
 * The normals the track's lines and kerbs are painted along (unit vectors, its direction's right): each sample's
 * averaged with its neighbours', nearer ones counting more, so a sharp step from one sample to the next is spread
 * over a few and the edges and kerbs follow on round the bend unbroken.
 */
export function paintNormals(samples: { dir: number }[]): Pt[] {
  const n = samples.length;
  return samples.map((_, i) => {
    let x = 0;
    let y = 0;
    for (let k = -NORMAL_SPAN; k <= NORMAL_SPAN; k++) {
      const w = NORMAL_SPAN + 1 - Math.abs(k);
      const d = samples[(i + k + n) % n].dir;
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

/**
 * The tiles the barriers stand on (i, j): every wall tile that touches the run-off, but the ones behind the garages
 * (along the pit lane's entry and exit roads past them, the barriers carry on); beside the banking, its concrete
 * wall instead; and the pit wall's.
 */
export function barrierTiles(circuit: Circuit): { walls: [number, number][]; pitWall: [number, number][]; bankWall: [number, number][] } {
  const { width: W, height: H, cells } = circuit;
  const cell = (i: number, j: number) => (i >= 0 && j >= 0 && i < W && j < H ? cells[j * W + i] : 'wall');
  const garageAt = garageSpots(circuit);
  const byGarage = (i: number, j: number) => garageAt.some((g) => Math.hypot(g.x - (i + 0.5) * T, g.y - (j + 0.5) * T) < PIT.boxSpacing);
  const walls: [number, number][] = [];
  const pitWall: [number, number][] = [];
  /** the banking's: a concrete wall with a catch fence on top */
  const bankWall: [number, number][] = [];
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      if (cells[j * W + i] === 'pitwall') pitWall.push([i, j]);
      if (cells[j * W + i] !== 'wall') continue;
      let near = false;
      let byPits = false;
      let byApron = false;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const c = cell(i + di, j + dj);
          near ||= c !== 'wall' && c !== 'pitwall';
          byPits ||= c === 'pit';
          byApron ||= c === 'apron';
        }
      }
      if (near && !(byPits && byGarage(i, j))) (byApron ? bankWall : walls).push([i, j]);
    }
  }
  return { walls, pitWall, bankWall };
}

/** px across the garages' roofs (the lane's way) and deep, and how high they stand */
const GARAGE = { deep: 28, high: 22 };

/**
 * `word` across the garages' roofs: the word drawn once over the whole row, each roof showing its share of it, the
 * letters upright as the camera (looking down from the south) sees them and read left to right on the screen,
 * whichever way the lane runs; white roofs, the letters in blue over a band of the flag's blue, red and green.
 */
export function roofLetters(circuit: Circuit, word: string): THREE.Mesh[] {
  const ordered = roofOrder(circuit);
  if (!ordered.length) return [];
  const n = ordered.length;
  const cellW = 128;
  const cellH = 64;
  const [c, x] = canvas(cellW * n, cellH);
  x.fillStyle = '#f4f4f8';
  x.fillRect(0, 0, c.width, cellH);
  // (the flag's band along the back edge: blue, red, green)
  ['#00b5e2', '#ef3340', '#509e2f'].forEach((col, k) => {
    x.fillStyle = col;
    x.fillRect(0, 2 + k * 3, c.width, 3);
  });
  // (the letters spread evenly over the row, so each roof has its share whole)
  x.fillStyle = '#0a5ca8';
  x.font = `bold ${Math.round(cellH * 0.6)}px 'Arial Black', Arial, sans-serif`;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  const letters = [...word.toUpperCase()];
  letters.forEach((ch, k) => x.fillText(ch, ((k + 0.5) / letters.length) * c.width, cellH * 0.6));
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return ordered.map(({ g, tx, tz }, k) => {
    const piece = texture.clone();
    piece.repeat.set(1 / n, 1);
    piece.offset.set(k / n, 0);
    piece.needsUpdate = true;
    const roof = new THREE.Mesh(new THREE.PlaneGeometry(PIT.boxSpacing - 2, GARAGE.deep).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: piece }));
    roof.position.set(g.x, groundAt(circuit.grid, g.x, g.y).h + GARAGE.high + 0.3, g.y);
    // (its x along the lane, read left to right; its top edge away from the camera)
    roof.rotation.y = Math.atan2(-tz, tx);
    roof.receiveShadow = true;
    return roof;
  });
}

/**
 * The garages from the left of the screen to the right, each with the way to read along its roof (tx, tz: the lane's
 * way, turned to run east, or as near it as it goes, so the word reads left to right whichever way the race goes).
 */
export function roofOrder(circuit: Circuit): { g: { x: number; y: number }; tx: number; tz: number }[] {
  const along = garageSpots(circuit).map((g) => ({ g, tx: Math.sin(g.dir), tz: -Math.cos(g.dir) }));
  const flip = along.reduce((a, s) => a + s.tx, 0) < 0;
  const ordered = along.map((s) => ({ ...s, tx: flip ? -s.tx : s.tx, tz: flip ? -s.tz : s.tz }));
  return ordered.sort((a, b) => a.g.x * a.tx + a.g.y * a.tz - (b.g.x * b.tx + b.g.y * b.tz));
}

/** Where each garage stands (its middle, and the lane's direction there): behind the pit lane, one to each box. */
export function garageSpots(circuit: Circuit): { x: number; y: number; dir: number }[] {
  const { pit } = circuit;
  const back = GARAGE_ACROSS * pit.side;
  return pit.boxes.map((b) => {
    const q = pit.points.find((p) => p.s >= b)!;
    return { x: q.x + Math.cos(q.dir) * back, y: q.y + Math.sin(q.dir) * back, dir: q.dir };
  });
}

function paint(circuit: Circuit): HTMLCanvasElement {
  const { width: W, height: H, cells, track } = circuit;
  const [c, x] = canvas(W * T, H * T);
  const r = rng(11);
  const street = !!circuit.layout.street;
  const forest = !!circuit.layout.forest;
  const desert = !!circuit.layout.desert;
  const mountain = !!circuit.layout.mountain;
  const snowy = !!circuit.layout.snow;
  const dirt = !!circuit.layout.dirt;
  const sea = seaOf(circuit);
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
      if (street) {
        // a street circuit: pavement up to the barriers; beyond them the town's paving, or the sea
        const wet = cell === 'wall' && sea && inside(sea, px + T / 2, py + T / 2);
        x.fillStyle = cell === 'wall' ? (wet ? STREET.sea : STREET.town) : STREET.pavement;
        x.fillRect(px, py, T, T);
        if (cell !== 'wall') {
          x.fillStyle = STREET.joint;
          x.fillRect(px, py, T, 1);
          x.fillRect(px, py, 1, T);
        } else {
          for (let k = 0; k < (wet ? 2 : 4); k++) {
            x.fillStyle = wet ? STREET.wave : STREET.townDot;
            x.fillRect(px + Math.floor(r() * T), py + Math.floor(r() * T), wet ? 3 : 1, 1);
          }
        }
        continue;
      }
      // (the banking's concrete, also under the track's edge beside it)
      const byApron = cell === 'apron' || ((cell === 'track' || cell === 'kerb') && [-1, 0, 1].some((dj) => [-1, 0, 1].some((di) => cells[(j + dj) * W + i + di] === 'apron')));
      if (byApron) {
        x.fillStyle = CONCRETE;
        x.fillRect(px, py, T, T);
        for (let k = 0; k < 3; k++) {
          x.fillStyle = r() < 0.5 ? '#a8a6a0' : '#c0beb8';
          x.fillRect(px + Math.floor(r() * T), py + Math.floor(r() * T), 1, 1);
        }
      } else if (cell === 'gravel') {
        x.fillStyle = desert ? DESERT.gravel : '#d8c49a';
        x.fillRect(px, py, T, T);
        for (let k = 0; k < 10; k++) {
          x.fillStyle = desert ? DESERT.gravelDot[r() < 0.5 ? 0 : 1] : r() < 0.5 ? '#c4ae82' : '#e6d6b0';
          x.fillRect(px + Math.floor(r() * T), py + Math.floor(r() * T), 1, 1);
        }
      } else if (dirt) {
        // on dirt, dry earth: the run-off graded in stripes; beyond the barriers rougher, stones strewn over it
        const wall = cell === 'wall';
        x.fillStyle = wall ? DIRT.ground : DIRT.graded[(i + j) % 4 < 2 ? 0 : 1];
        x.fillRect(px, py, T, T);
        for (let k = 0; k < (wall ? 4 : 3); k++) {
          x.fillStyle = wall ? DIRT.groundDot[Math.floor(r() * 3)] : DIRT.gradedDot;
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
  const normal = paintNormals(pts);
  const offset = (off: number) => offsetLine(pts, normal, off);
  const path = (list: Pt[], closed = true) => {
    x.beginPath();
    list.forEach((p, i) => (i ? x.lineTo(p.x, p.y) : x.moveTo(p.x, p.y)));
    if (closed) x.closePath();
  };
  x.lineJoin = 'round';
  x.lineCap = 'butt';
  // the pit lane: asphalt under the track's, so the track's edge runs unbroken past the entry and exit
  const { pit } = circuit;
  const lane = (across: number) => pit.points.map((p) => ({ x: p.x + Math.cos(p.dir) * across * pit.side, y: p.y + Math.sin(p.dir) * across * pit.side }));
  /** a line along the lane, `across` px out, left out where it would fold back on itself (round the inside of a tight bend on an entry or exit road) */
  const laneLine = (across: number) => {
    const pts = lane(across);
    x.beginPath();
    let pen = false;
    pts.forEach((q, k) => {
      const d = pit.points[k].dir;
      const prev = pts[k - 1];
      const forward = prev ? (q.x - prev.x) * Math.sin(d) - (q.y - prev.y) * Math.cos(d) > 0 : false;
      if (pen && forward) x.lineTo(q.x, q.y);
      else x.moveTo(q.x, q.y);
      pen = true;
    });
  };
  x.strokeStyle = dirt ? DIRT.lane : '#4a4d59';
  x.lineWidth = LANE_IN + LANE_OUT;
  laneLine((LANE_OUT - LANE_IN) / 2);
  x.stroke();
  x.strokeStyle = '#e8e8ee';
  x.lineWidth = 2;
  laneLine(LANE_OUT - 4);
  x.stroke();
  // the boxes: a yellow frame each, beside the fast lane
  x.strokeStyle = '#f2c14e';
  for (const b of pit.boxes) {
    const q = pit.points.find((p) => p.s >= b)!;
    const across = PIT.boxLane * pit.side;
    const cx = q.x + Math.cos(q.dir) * across;
    const cy = q.y + Math.sin(q.dir) * across;
    x.save();
    x.translate(cx, cy);
    x.rotate(q.dir);
    x.strokeRect(-12, -22, 24, 44);
    x.restore();
  }
  // the speed-limit lines across the lane, where the pit wall starts and ends
  x.strokeStyle = '#f4f4f8';
  for (const at of [pit.wallFrom, pit.wallTo]) {
    const q = pit.points.find((p) => p.idx === at)!;
    const a = PIT.offset - LANE_IN;
    const b = PIT.offset + LANE_OUT;
    x.beginPath();
    x.moveTo(q.x + Math.cos(q.dir) * (a - PIT.offset) * pit.side, q.y + Math.sin(q.dir) * (a - PIT.offset) * pit.side);
    x.lineTo(q.x + Math.cos(q.dir) * (b - PIT.offset) * pit.side, q.y + Math.sin(q.dir) * (b - PIT.offset) * pit.side);
    x.stroke();
  }
  // asphalt (on dirt, wet earth: ruts worn deep along it where the cars run, wet clods strewn over it, puddles in
  // the ruts catching the light, and a berm of drier earth thrown up along each edge)
  x.strokeStyle = dirt ? DIRT.track : '#4a4d59';
  x.lineWidth = HALF_WIDTH * 2;
  path(pts);
  x.stroke();
  if (dirt) {
    x.strokeStyle = DIRT.berm;
    x.lineWidth = 6;
    for (const side of [-1, 1]) {
      path(offset(side * (HALF_WIDTH - 3)));
      x.stroke();
    }
    x.strokeStyle = DIRT.rut;
    x.lineWidth = 3;
    for (const off of [-24, -12, 12, 24]) {
      path(offset(off));
      x.stroke();
    }
    for (const p of pts) {
      for (let k = 0; k < 6; k++) {
        const across = (r() * 2 - 1) * (HALF_WIDTH - 4);
        x.fillStyle = DIRT.clods[r() < 0.6 ? 0 : 1];
        x.fillRect(Math.round(p.x + Math.cos(p.dir) * across + (r() - 0.5) * 8), Math.round(p.y + Math.sin(p.dir) * across + (r() - 0.5) * 8), r() < 0.3 ? 2 : 1, 1);
      }
    }
    // (puddles lying in the ruts here and there, along the track, a glint of sky on each)
    const ruts = [-24, -12, 12, 24].map(offset);
    for (let i = 0; i < pts.length; i++) {
      if (r() > 0.05) continue;
      const rut = ruts[Math.floor(r() * ruts.length)];
      const len = 2 + Math.floor(r() * 4);
      x.strokeStyle = DIRT.puddle;
      x.lineWidth = 4;
      x.beginPath();
      for (let k = 0; k <= len; k++) {
        const q = rut[(i + k) % pts.length];
        if (k) x.lineTo(q.x, q.y);
        else x.moveTo(q.x, q.y);
      }
      x.stroke();
      const q = rut[(i + 1) % pts.length];
      x.fillStyle = DIRT.shine;
      x.fillRect(Math.round(q.x), Math.round(q.y), 2, 1);
    }
  }
  // the banking: seams in its concrete running along the track, so it reads as a slope, out to the walls
  const banked = pts.map((_, i) => Math.abs(circuit.bank[i]) > 0.02);
  if (banked.some(Boolean)) {
    x.strokeStyle = SEAM;
    x.lineWidth = 1;
    // (a sample's banking rises toward its sign's side)
    const outside = Math.sign(circuit.bank.find((b) => b !== 0)!);
    for (const side of [-1, 1]) {
      for (let off = HALF_WIDTH + 12; off < HALF_WIDTH + RUNOFF; off += side === outside ? 12 : 24) {
        const line = offset(side * off);
        x.beginPath();
        pts.forEach((_, i) => {
          if (!banked[i]) return;
          if (banked[(i - 1 + pts.length) % pts.length]) x.lineTo(line[i].x, line[i].y);
          else x.moveTo(line[i].x, line[i].y);
        });
        x.stroke();
      }
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
  // a street circuit's tunnel: darker under the roof, with a row of lamps along each side
  const tunnel = circuit.layout.street?.tunnel;
  if (tunnel) {
    const [from, to] = tunnel.map((d) => Math.round(d / track.spacing));
    const run = pts.slice(from, to + 1);
    x.strokeStyle = '#2f3139';
    x.lineWidth = HALF_WIDTH * 2 - 6;
    path(run, false);
    x.stroke();
    x.fillStyle = '#f2d36b';
    for (const side of [-1, 1]) {
      const edge = offset(side * (HALF_WIDTH - 8));
      for (let k = from; k <= to; k += 3) x.fillRect(Math.round(edge[k].x) - 1, Math.round(edge[k].y) - 1, 3, 3);
    }
  }
  // grid boxes: a white bracket in front of each slot
  x.strokeStyle = '#f4f4f8';
  x.lineWidth = 2;
  for (const g of circuit.slots) {
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
  const s0 = pts[0];
  const across = Math.round((HALF_WIDTH * 2) / START_SQUARE);
  const sq = (HALF_WIDTH * 2) / across;
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
  return c;
}

function grandstand(len: number, roofColor = 0x3d7fc4): THREE.Mesh {
  const [c, x] = canvas(len, 20);
  x.fillStyle = '#6c707a';
  x.fillRect(0, 0, len, 20);
  const r = rng(len);
  const shirts = ['#d8323c', '#f2c14e', '#3d7fc4', '#f4f4f8', '#5fe0d0', '#ff5fb8', '#8a3cc8'];
  for (let row = 2; row < 18; row += 3) {
    for (let k = 1; k < len - 1; k += 2) {
      if (r() < 0.8) {
        x.fillStyle = shirts[Math.floor(r() * shirts.length)];
        x.fillRect(k, row, 1, 2);
      }
    }
  }
  const crowd = new THREE.MeshLambertMaterial({ map: pixelTexture(c) });
  const grey = new THREE.MeshLambertMaterial({ color: 0x8e929c });
  const roof = new THREE.MeshLambertMaterial({ color: roofColor });
  // a stepped stand is suggested by a tall box with the crowd painted on the face toward the track (−x)
  const m = new THREE.Mesh(new THREE.BoxGeometry(18, 22, len), [grey, crowd, roof, grey, grey, grey]);
  m.castShadow = m.receiveShadow = true;
  return m;
}

/** The circuit in `weather`: its sky and light, and the ground darker when it's wet. */
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
  const street = circuit.layout.street;
  const outerColor = new THREE.Color(street ? STREET.town : circuit.layout.forest ? FOREST_FLOOR : circuit.layout.desert ? DESERT.sand : circuit.layout.snow ? SNOWFIELD.snow : circuit.layout.dirt ? DIRT.ground : circuit.layout.mountain ? MOUNTAIN.meadow : 0x4b9444);
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: outerColor.clone().multiply(tint) }));
  outer.position.set((W * T) / 2, -1, (H * T) / 2);
  outer.receiveShadow = true;
  scene.add(ground, outer);

  // tyre walls: on every wall tile that touches the run-off, stacked red and white (the garages
  // stand behind the pit lane instead, where they are: along the lane's entry and exit roads, past them, the walls
  // carry on); concrete blocks along the pit wall
  const { walls, pitWall, bankWall } = barrierTiles(circuit);
  // (a street circuit: steel barriers, grey with red and white bands, in place of tyre stacks)
  const tyres = new THREE.InstancedMesh(street ? new THREE.BoxGeometry(T, 9, T) : new THREE.CylinderGeometry(7, 7, 7, 8), new THREE.MeshLambertMaterial({ color: 0xffffff }), walls.length);
  const m = new THREE.Matrix4();
  // (on dirt, hay bales instead: two straws)
  const dirtTrack = !!circuit.layout.dirt;
  const red = new THREE.Color(dirtTrack ? DIRT.bale[0] : '#d8323c');
  const white = new THREE.Color(dirtTrack ? DIRT.bale[1] : '#f4f4f8');
  const steel = new THREE.Color('#b8bcc6');
  walls.forEach(([i, j], k) => {
    const h = groundAt(grid, (i + 0.5) * T, (j + 0.5) * T).h;
    m.makeTranslation((i + 0.5) * T, h + (street ? 4.5 : 3.5), (j + 0.5) * T);
    tyres.setMatrixAt(k, m);
    tyres.setColorAt(k, street ? ((i + j) % 6 === 0 ? red : (i + j) % 6 === 3 ? white : steel) : (i + j) % 2 === 0 ? red : white);
  });
  tyres.castShadow = tyres.receiveShadow = true;
  scene.add(tyres);
  if (bankWall.length) {
    const concrete = new THREE.InstancedMesh(new THREE.BoxGeometry(T, 12, T), new THREE.MeshLambertMaterial({ color: 0xd4d2cc }), bankWall.length);
    const fence = new THREE.InstancedMesh(new THREE.BoxGeometry(T, 10, T), new THREE.MeshLambertMaterial({ color: 0x5d6270, transparent: true, opacity: 0.45, depthWrite: false }), bankWall.length);
    bankWall.forEach(([i, j], k) => {
      const h = groundAt(grid, (i + 0.5) * T, (j + 0.5) * T).h;
      m.makeTranslation((i + 0.5) * T, h + 6, (j + 0.5) * T);
      concrete.setMatrixAt(k, m);
      m.makeTranslation((i + 0.5) * T, h + 17, (j + 0.5) * T);
      fence.setMatrixAt(k, m);
    });
    concrete.castShadow = concrete.receiveShadow = true;
    scene.add(concrete, fence);
  }
  const blocks = new THREE.InstancedMesh(new THREE.BoxGeometry(T, 8, T), new THREE.MeshLambertMaterial({ color: 0xc9ccd4 }), pitWall.length);
  pitWall.forEach(([i, j], k) => {
    m.makeTranslation((i + 0.5) * T, groundAt(grid, (i + 0.5) * T, (j + 0.5) * T).h + 4, (j + 0.5) * T);
    blocks.setMatrixAt(k, m);
  });
  blocks.castShadow = blocks.receiveShadow = true;
  scene.add(blocks);

  // the garages: a row behind the pit lane, one open front facing each box, under one long roof
  const { pit } = circuit;
  const grey = new THREE.MeshLambertMaterial({ color: 0x8e929c });
  const door = new THREE.MeshLambertMaterial({ color: 0x23222e });
  const roof = new THREE.MeshLambertMaterial({ color: 0xf4f4f8 });
  // (turned to the track's direction, a box's +x face looks to the right of the way of the race)
  const faces = pit.side < 0 ? [door, grey, roof, grey, grey, grey] : [grey, door, roof, grey, grey, grey];
  for (const { x: gx, y: gy, dir } of garageSpots(circuit)) {
    const garage = new THREE.Mesh(new THREE.BoxGeometry(GARAGE.deep, GARAGE.high, PIT.boxSpacing - 2), faces);
    garage.position.set(gx, groundAt(grid, gx, gy).h + GARAGE.high / 2, gy);
    garage.rotation.y = -dir;
    garage.castShadow = garage.receiveShadow = true;
    scene.add(garage);
  }
  // (a word across the roofs, a few letters on each, read left to right from the camera)
  if (circuit.layout.pitRoof) for (const r of roofLetters(circuit, circuit.layout.pitRoof)) scene.add(r);

  // grandstands: along the main straight (behind the start line, across it from the pits), and on a circuit in
  // the country round the outside of the bends; each with its own roof colour and flags on top, waving
  const roofs = [0x3d7fc4, 0xd8323c, 0xf2c14e, 0x3d9a5a, 0x8a3cc8, 0xf4f4f8];
  const flags: { flag: THREE.Mesh; phase: number }[] = [];
  standsOf(circuit).forEach((s, k) => {
    const stand = grandstand(s.len, s.at === 'start' ? 0x3d7fc4 : roofs[k % roofs.length]);
    stand.position.set(s.x, groundAt(grid, s.x, s.y).h + 11, s.y);
    // (the crowd's face toward the track)
    stand.rotation.y = -s.dir + (s.side < 0 ? Math.PI : 0);
    scene.add(stand);
    // flags on poles along its back, in the teams' colours
    for (const along of [-0.35, 0, 0.35]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 10, 4), new THREE.MeshLambertMaterial({ color: 0xc9ccd4 }));
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(8, 5).translate(4, 0, 0), new THREE.MeshLambertMaterial({ color: FLAG_COLORS[(k * 3 + Math.round(along * 3) + 1) % FLAG_COLORS.length], side: THREE.DoubleSide }));
      // (in the stand's own space: its back is +x, away from the track; its length runs along z)
      pole.position.set(7, 16, along * s.len);
      flag.position.set(7, 18.5, along * s.len);
      stand.add(pole, flag);
      flags.push({ flag, phase: k * 1.7 + along * 5 });
    }
  });
  const town = street ? buildTown(scene, circuit) : undefined;
  // (at a circuit whose podium hangs over the main straight: its deck)
  const deck = createPodiumDeck(circuit);
  if (deck) scene.add(deck);
  // (at a circuit in a forest: the trees)
  const trees = buildForest(scene, circuit);
  // (the cherry trees in blossom: their petals, falling, drifting and kicked up by the cars)
  const petals = circuit.layout.blossoms ? buildPetals(scene, circuit, trees.filter((t) => t.kind === 'blossom')) : undefined;
  // (a gopher, now and then scurrying across the track near the camera)
  const gopher = circuit.layout.gophers ? buildGopher(scene, circuit.grid, circuit.track) : undefined;
  // (a yeti in the snow, now and then lying in wait up the road and giving chase)
  const yeti = circuit.layout.yeti ? buildYeti(scene, circuit.grid, circuit.track, yetiAvoids(circuit)) : undefined;
  // (the aerial tramway up to the summit, its two cabins going up and down)
  const tram = tramwayOf(circuit);
  const tramway = tram ? buildTramway(scene, circuit.grid, tram) : undefined;
  // (monster trucks jumping in the infield)
  const mt = circuit.layout.monsterTrucks;
  const trucks = mt ? buildMonsterTrucks(scene, circuit.grid, { x: mt.at[0], y: mt.at[1], angle: mt.angle }) : undefined;
  // (the crowd in the grandstands on its feet, cheering the cars by)
  const crowds = circuit.layout.crowds ? buildCrowds(scene, circuit.grid, standsOf(circuit)) : undefined;

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
    mx.closePath();
    mx.stroke();
    // the pit lane, thin and grey
    mx.strokeStyle = '#9d9ab8';
    mx.lineWidth = 1;
    mx.beginPath();
    circuit.pit.points.forEach((p, i) => {
      const q = toMap(p.x, p.y);
      if (i) mx.lineTo(q.x, q.y);
      else mx.moveTo(q.x, q.y);
    });
    mx.stroke();
    const s = toMap(track.samples[0].x, track.samples[0].y);
    mx.fillStyle = '#f2c14e';
    mx.fillRect(s.x - 3, s.y - 1, 6, 2);
    return { canvas: mc, toMap };
  };

  // (where the track crosses itself: the bridge)
  addBridge(scene, circuit);
  // (its lakes, if it has any)
  buildLakes(scene, circuit);
  // (at a desert circuit: its camels)
  const camels = circuit.layout.desert ? buildCamels(scene, circuit) : undefined;

  return {
    scene,
    ...light,
    minimap,
    animate: (t) => {
      town?.animate(t);
      camels?.animate(t);
      // the flags flap in the wind
      for (const f of flags) f.flag.rotation.y = Math.sin(t * 3 + f.phase) * 0.5 + Math.sin(t * 7.3 + f.phase) * 0.15;
    },
    gopher: gopher?.run,
    yeti: yeti?.run,
    stepScenery: (dt, cars, focus) => {
      petals?.(dt, cars, focus);
      gopher?.step(dt, cars, focus);
      yeti?.step(dt, focus);
      tramway?.(dt);
      trucks?.(dt);
      crowds?.(dt, cars);
    },
    setGroundTint: (t) => {
      (ground.material as THREE.MeshLambertMaterial).color.setHex(t);
      (outer.material as THREE.MeshLambertMaterial).color.copy(outerColor).multiply(new THREE.Color(t));
    },
  };
}

/**
 * The bridge where the track crosses itself (track.levels): the deck along the stretch on it, at the height the
 * cars drive at, up its ramps and over the crossing, in the track's asphalt with its white edge lines; concrete
 * sides down to the ground, low concrete walls along its edges where it's off the ground, and pillars under it,
 * clear of the road that passes beneath.
 */
function addBridge(scene: THREE.Scene, circuit: Circuit): void {
  const { track, grid } = circuit;
  const l = track.levels;
  if (!l) return;
  const n = track.samples.length;
  const half = BRIDGE.deck + T / 2;
  const span: number[] = [];
  for (let i = l.from; i !== (l.to + 1) % n; i = (i + 1) % n) if (liftAt(track, l, i) > 1) span.push(i);
  // (its surface: the deck's own ground, a hair up, flat across)
  const top = (i: number) => groundAt(l.upper, track.samples[i].x, track.samples[i].y).h + 0.6;
  const base = (i: number) => groundAt(grid, track.samples[i].x, track.samples[i].y).h;
  const side = (i: number, a: number) => {
    const p = track.samples[i];
    return { x: p.x + Math.cos(p.dir) * a, y: p.y + Math.sin(p.dir) * a };
  };
  /** a strip along the span (or the run `over` of it), between `a` and `b` px across, at heights `ya`, `yb` */
  const strip = (a: number, b: number, ya: (i: number) => number, yb: (i: number) => number, color: number, over: number[] = span) => {
    const pos: number[] = [];
    const idx: number[] = [];
    over.forEach((i, k) => {
      const p = side(i, a);
      const q = side(i, b);
      pos.push(p.x, ya(i), p.y, q.x, yb(i), q.y);
      if (k) idx.push(2 * k - 2, 2 * k - 1, 2 * k, 2 * k - 1, 2 * k + 1, 2 * k);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  };
  // the deck, its white edge lines, and its sides down to the ground
  strip(-half, half, top, top, 0x4a4d59);
  for (const s of [-1, 1]) strip(s * (HALF_WIDTH - 3), s * (HALF_WIDTH - 1), (i) => top(i) + 0.1, (i) => top(i) + 0.1, 0xf4f4f8);
  for (const s of [-1, 1]) strip(s * half, s * half, top, (i) => Math.min(top(i), base(i)), 0xb4b2ac);
  // its walls, where it's off the ground: a low concrete wall each side, unbroken (its faces and top following the
  // deck round its bends, so no gap shows between blocks), where the walls that stop the cars are
  const walled = span.filter((i) => liftAt(track, l, i) >= BRIDGE.walled);
  const runs: number[][] = [];
  for (const i of walled) {
    const run = runs[runs.length - 1];
    if (run && (run[run.length - 1] + 1) % n === i) run.push(i);
    else runs.push([i]);
  }
  const up = (i: number) => top(i) + 8;
  for (const run of runs) {
    if (run.length < 2) continue;
    for (const s of [-1, 1]) {
      const inner = s * half;
      const outer = s * (half + 6);
      strip(inner, inner, top, up, 0xd4d2cc, run);
      strip(outer, outer, top, up, 0xc2c0ba, run);
      strip(inner, outer, up, up, 0xe2e0da, run);
    }
  }
  // pillars under it, wherever it's well off the ground and clear of the road beneath
  const under = track.samples;
  const pillar = new THREE.MeshLambertMaterial({ color: 0xa8a6a0 });
  for (let k = 0; k < span.length; k += 6) {
    const i = span[k];
    const lift = liftAt(track, l, i);
    if (lift < 14) continue;
    for (const s of [-1, 1]) {
      const at = side(i, s * (half - 6));
      // (clear of the other stretch's track and a margin either side)
      let clear = true;
      for (let j = 0; j < n && clear; j += 2) {
        if (Math.abs(j - i) < 60 || n - Math.abs(j - i) < 60) continue;
        if (Math.hypot(under[j].x - at.x, under[j].y - at.y) < HALF_WIDTH + 30) clear = false;
      }
      if (!clear) continue;
      const g = groundAt(grid, at.x, at.y).h;
      const h = top(i) - g - 3;
      const post = new THREE.Mesh(new THREE.BoxGeometry(8, h, 8), pillar);
      post.position.set(at.x, g + h / 2, at.y);
      post.rotation.y = -track.samples[i].dir;
      post.castShadow = true;
      scene.add(post);
    }
  }
}
