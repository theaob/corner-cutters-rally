// The champagne ceremony, as designed in the Podium Lab: parc fermé. The top
// three cars stand nose to the camera on a patch of tarmac in front of a wall
// in the winner's team colours (the circuit's name on it), each with a gold,
// silver or bronze board at its nose, the winner in the middle, second on its
// left, third on its right, and each driver up on their car. The ceremony
// plays in beats over CEREMONY.len s: the drivers climb up, lift their
// trophies (the confetti starts, the winner hops), then the corks pop and
// the champagne sprays (second and third at the winner, the winner at both)
// under fireworks. The camera holds on third, sweeps across to the winner and
// settles on the three of them, centred. It's a set of its own: the race
// hides the circuit while it's on, so nothing stands in the camera's way.
// (A circuit's podium deck over its main straight stays as scenery.)

import * as THREE from 'three';
import { groundAt } from '../engine/sim';
import { HALF_WIDTH, type Circuit } from './circuit';
import { GARAGE_ACROSS, PIT } from './pits';

export interface PodiumDriver {
  /** the team's colours: overalls and trim */
  body: string;
  trim: string;
  /** the helmet: gold for you */
  helmet: string;
  /** the car, in its livery (built by the race: it's the race's own model) */
  car?: THREE.Object3D;
}

export interface Ceremony {
  group: THREE.Group;
  /** Dress the top three (winner first): their cars, their colours, the wall in the winner's. */
  setDrivers(drivers: PodiumDriver[]): void;
  /** Animate: `t` seconds since the ceremony began, `dt` since the last frame. The cork pops, if one popped. */
  update(t: number, dt: number): { pop: boolean; firework: boolean };
  /** The camera at `t` s for a view `aspect` wide and `fov`° tall: where it is and where it looks, in the group's space. */
  view(t: number, aspect: number, fov: number): { eye: THREE.Vector3; at: THREE.Vector3 };
  /** Where place `k`'s name plate hangs (under its board), in the group's space. */
  plate(k: number): THREE.Vector3;
}

/** s: the ceremony's length and its beats (the trophies up, the champagne out), and the cork's pop after it's out */
export const CEREMONY = { len: 10, trophy: 2, spray: 4.5, pop: 0.35 };
/** px: x of each place's car (P1 in the middle, P2 to its left, P3 to its right), and how high a driver stands on it */
export const PARC_X = [0, -24, 24];
const STAND = 5.6;
/** px: the boards at the noses (how far out), and the wall behind (how far back, how wide, how tall) */
const BOARD_Z = 17;
const WALL = { z: -24, w: 112, h: 40 };
/** the camera: s on third, s across to the winner; the shots (half the width and height to show, round what); its rise (°) */
const SHOT = { hold: 1.4, sweep: 2.2, rise: 10 };
const CLOSE = { x: PARC_X[2], y: 9, halfW: 20, halfH: 14 };
const WIDE = { x: 0, y: 15, halfW: 40, halfH: 30 };

/** px: each step's height (P1, P2, P3) and size, the gap between the steps' centres */
const STEP = [16, 11, 7];
const STEP_W = 16;
const STEP_D = 14;
/** x of each place's step: P1 in the middle, P2 to its left, P3 to its right */
const PLACE_X = [0, -STEP_W, STEP_W];
const TOPS = [0xf2c14e, 0xc9ccd4, 0xc98a4b];

const DROPS = 900;
const FOAM = 60;
const CONFETTI = 500;
const BURSTS = 6;
const SPARKS = 70;

/** px: the deck reaches from behind the garages to this far past the centreline, away from the pits, and runs this far along the track */
const DECK = { tip: 14, back: GARAGE_ACROSS + 24, along: 84, thick: 8 };

/** The podium's steps, white topped in gold, silver and bronze, with a dark backboard behind them (facing +z). */
function podiumSteps(): THREE.Group {
  const group = new THREE.Group();
  const lambert = (color: THREE.ColorRepresentation) => new THREE.MeshLambertMaterial({ color });
  STEP.forEach((h, k) => {
    const step = new THREE.Mesh(new THREE.BoxGeometry(STEP_W, h, STEP_D), [lambert(0xe8e8ee), lambert(0xe8e8ee), lambert(TOPS[k]), lambert(0xe8e8ee), lambert(0xf4f4f8), lambert(0xe8e8ee)]);
    step.position.set(PLACE_X[k], h / 2, 0);
    step.castShadow = step.receiveShadow = true;
    group.add(step);
  });
  const board = new THREE.Mesh(new THREE.BoxGeometry(STEP_W * 3 + 10, 34, 2), lambert(0x1b1b26));
  board.position.set(0, 17, -STEP_D / 2 - 3);
  board.castShadow = true;
  group.add(board);
  return group;
}

/**
 * Where the ceremony stands: on the run-off across the main straight, just
 * past the line, or, at a circuit with a podium deck, up on the deck over the
 * middle of the track (`raise` px above the ground).
 */
export function podiumSpot(circuit: Circuit): { x: number; y: number; h: number; raise: number } {
  const { track, pit, grid, layout } = circuit;
  const at = track.samples[pit.podium[1].idx];
  const lat = layout.podiumDeck ? 0 : -pit.side * (HALF_WIDTH + 34);
  const x = at.x + Math.cos(at.dir) * lat;
  const y = at.y + Math.sin(at.dir) * lat;
  return { x, y, h: groundAt(grid, x, y).h, raise: layout.podiumDeck ?? 0 };
}

/**
 * The podium deck (for a circuit with one): a slab hanging out over the main
 * straight from a tower behind the garages, a glass rail round it and a red
 * fascia toward the camera, and the steel beams under it.
 */
export function createPodiumDeck(circuit: Circuit): THREE.Group | undefined {
  const raise = circuit.layout.podiumDeck;
  if (!raise) return undefined;
  const { track, pit } = circuit;
  const spot = podiumSpot(circuit);
  const at = track.samples[pit.podium[1].idx];
  const group = new THREE.Group();
  group.position.set(spot.x, spot.h, spot.y);
  // (turned to the track's direction: +x is the right of the way of the race; the pits are on pit.side)
  group.rotation.y = -at.dir;
  const lambert = (color: THREE.ColorRepresentation) => new THREE.MeshLambertMaterial({ color });
  const reach = PIT.offset + DECK.back + DECK.tip;
  const mid = (PIT.offset + DECK.back - DECK.tip) / 2;
  const white = lambert(0xf0efe9);
  const red = lambert(0xc8202c);
  const steel = lambert(0x5d6270);
  const floor = lambert(0xcfccc4);
  // (the face at its tip, toward the far side of the track: +x when the pits are on the left)
  const tipFace = pit.side < 0 ? 0 : 1;
  const faces = [red, red, floor, steel, red, red];
  faces[1 - tipFace] = white;
  const slab = new THREE.Mesh(new THREE.BoxGeometry(reach, DECK.thick, DECK.along), faces);
  slab.position.set(mid * pit.side, raise - DECK.thick / 2, 0);
  // a white stripe round the fascia
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(reach + 0.4, 1.2, DECK.along + 0.4), white);
  stripe.position.set(mid * pit.side, raise - DECK.thick + 1.2, 0);
  // the beams under it, across the track, and the tower it hangs from, behind the garages
  const beams = [-0.4, 0, 0.4].map((k) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(reach, 4, 3), steel);
    b.position.set(mid * pit.side, raise - DECK.thick - 2, k * DECK.along);
    return b;
  });
  const towerX = (PIT.offset + DECK.back - 10) * pit.side;
  const tower = new THREE.Mesh(new THREE.BoxGeometry(20, raise + 18, DECK.along), [white, white, red, white, white, white]);
  tower.position.set(towerX, (raise + 18) / 2, 0);
  // a glass rail round the open edges
  const glass = new THREE.MeshLambertMaterial({ color: 0xbfe4f2, transparent: true, opacity: 0.35, depthWrite: false });
  const railFront = new THREE.Mesh(new THREE.BoxGeometry(1, 6, DECK.along), glass);
  railFront.position.set(-DECK.tip * pit.side, raise + 3, 0);
  const rails = [-1, 1].map((k) => {
    const r = new THREE.Mesh(new THREE.BoxGeometry(reach - 20, 6, 1), glass);
    r.position.set((mid - 10) * pit.side, raise + 3, (k * DECK.along) / 2);
    return r;
  });
  // the podium's steps, up on the deck over the middle of the track, facing the camera (as the ceremony does)
  const steps = podiumSteps();
  steps.position.set(0, raise, 0);
  steps.rotation.y = at.dir;
  for (const m of [slab, stripe, ...beams, tower]) m.castShadow = m.receiveShadow = true;
  group.add(slab, stripe, ...beams, tower, railFront, ...rails, steps);
  return group;
}

/** A canvas `w` x `h` drawn by `draw`, as a crisp texture (none outside a browser). */
function paintedTexture(w: number, h: number, draw: (x: CanvasRenderingContext2D) => void): THREE.CanvasTexture | undefined {
  if (typeof document === 'undefined') return undefined;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d');
  if (!x) return undefined;
  draw(x);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return t;
}

/** 0 to 1 as `k` goes 0 to 1, easing in and out (held at either end). */
const smooth = (k: number) => {
  const u = Math.min(1, Math.max(0, k));
  return u * u * (3 - 2 * u);
};

/** The parc fermé ceremony, facing +z (the camera's side), the wall reading `title` (the circuit's name). */
export function createCeremony(title = ''): Ceremony {
  const group = new THREE.Group();
  // (everything that moves stands on the stage)
  const stage = new THREE.Group();
  group.add(stage);
  const lambert = (color: THREE.ColorRepresentation) => new THREE.MeshLambertMaterial({ color });
  const box = (w: number, h: number, d: number, mat: THREE.Material | THREE.Material[], x: number, y: number, z: number, on: THREE.Object3D = group) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    on.add(m);
    return m;
  };
  // (seeded, so the ceremony plays the same every time)
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  // the set: grass, the parc fermé's tarmac with its bays, the main straight in front and its kerb
  box(1600, 2, 1600, lambert(0x3f7d38), 0, -1, 0).castShadow = false;
  box(124, 0.4, 66, lambert(0x3a3946), 0, 0.2, 2);
  for (const x of [-36, -12, 12, 36]) box(0.8, 0.5, 32, lambert(0xf4f4f8), x, 0.25, 0);
  box(1600, 0.4, 56, lambert(0x2b2a33), 0, 0.2, 72);
  const kerbRed = lambert(0xd8323c);
  const kerbWhite = lambert(0xf4f4f8);
  for (let x = -240; x < 240; x += 10) box(10, 0.5, 3, (x / 10) % 2 ? kerbRed : kerbWhite, x + 5, 0.25, 42);

  // the wall behind, in the winner's colours (painted in setDrivers), a stripe of their trim along its top
  const wallFace = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const wallSide = lambert(0x26253a);
  box(WALL.w, WALL.h, 3, [wallSide, wallSide, wallSide, wallSide, wallFace, wallSide], 0, WALL.h / 2, WALL.z);
  const wallTrim = lambert(0xf4f4f8);
  box(WALL.w + 1, 2, 3.4, wallTrim, 0, WALL.h + 1, WALL.z);

  // the boards at the noses: the place's number on gold, silver or bronze
  TOPS.forEach((color, k) => {
    const tex = paintedTexture(48, 30, (x) => {
      x.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
      x.fillRect(0, 0, 48, 30);
      x.fillStyle = '#1b1b26';
      x.font = 'bold 26px monospace';
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillText(`${k + 1}`, 24, 16);
    });
    const face = tex ? new THREE.MeshLambertMaterial({ map: tex }) : lambert(color);
    const edge = lambert(color);
    box(10, 6, 0.8, [edge, edge, edge, edge, face, edge], PARC_X[k], 5.5, BOARD_Z);
    for (const s of [-3.5, 3.5]) box(0.6, 2.6, 0.6, lambert(0x5d6270), PARC_X[k] + s, 1.3, BOARD_Z);
  });

  // the cars' bays (the race's cars go in, turned nose to the camera)
  const bays = PARC_X.map((x) => {
    const bay = new THREE.Group();
    bay.position.set(x, 0, 0);
    bay.rotation.y = Math.PI;
    group.add(bay);
    return bay;
  });

  // the drivers: dark legs, the suit in the team's colour with its trim, arms (to raise), a helmet with its visor;
  // each with a trophy and a bottle
  const dark = lambert(0x26253a);
  const drivers = [0, 1, 2].map((k) => {
    const body = lambert(0xffffff);
    const trim = lambert(0xffffff);
    const helmet = lambert(0xffffff);
    const figure = new THREE.Group();
    figure.name = 'driver';
    for (const x of [-1.1, 1.1]) box(1.8, 4.5, 1.8, dark, x, 2.25, 0, figure);
    box(4.6, 5, 2.8, body, 0, 7, 0, figure);
    box(4.7, 1, 2.9, trim, 0, 5.6, 0, figure);
    box(3.6, 3.6, 3.6, helmet, 0, 11.4, 0, figure);
    box(3.7, 1.1, 1.2, dark, 0, 11.7, 1.4, figure);
    // (arms pivot at the shoulders, hanging down: turned about z, out and up; +x's arm and -x's)
    const arm = (side: number) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 3, 9.2, 0);
      box(1.4, 4.6, 1.4, body, 0, -2.1, 0, pivot);
      figure.add(pivot);
      return pivot;
    };
    const plus = arm(1);
    const minus = arm(-1);
    stage.add(figure);
    const trophy = new THREE.Group();
    const gold = lambert(0xf2c14e);
    box(2.2, 2.6, 2.2, gold, 0, 1.9, 0, trophy);
    box(0.8, 1.3, 0.8, gold, 0, 0.4, 0, trophy);
    box(2, 0.5, 2, lambert(0xd9a830), 0, -0.25, 0, trophy);
    if (k === 0) trophy.scale.setScalar(1.4);
    stage.add(trophy);
    const bottle = new THREE.Group();
    box(1.1, 3.2, 1.1, lambert(0x1f5a2e), 0, 0, 0, bottle);
    box(0.6, 1.1, 0.6, gold, 0, 2.1, 0, bottle);
    stage.add(bottle);
    const cork = box(0.7, 0.9, 0.7, lambert(0xd9b07a), 0, -999, 0, stage);
    // (second, on the winner's left, sprays from its +x hand, toward the winner; third from its -x; the winner from
    // its -x, at both)
    const side = k === 1 ? 1 : -1;
    return { figure, body, trim, helmet, trophy, bottle, cork, sprays: side > 0 ? plus : minus, lifts: side > 0 ? minus : plus, side, corkVel: new THREE.Vector3() };
  });

  // champagne (the foam at the pop, then the jets) and confetti: points
  const makePoints = (count: number, size: number, colors: number[]) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3).fill(-999), 3));
    const col = new Float32Array(count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      c.set(colors[i % colors.length]);
      col.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const material = new THREE.PointsMaterial({ size, vertexColors: true, sizeAttenuation: true, toneMapped: false, transparent: true, depthWrite: false });
    const points = new THREE.Points(geo, material);
    points.frustumCulled = false;
    stage.add(points);
    return { points, material, pos: geo.attributes.position as THREE.BufferAttribute, vel: new Float32Array(count * 3), count, next: 0 };
  };
  type Pool = ReturnType<typeof makePoints>;
  const spray = makePoints(DROPS + FOAM * 3, 2.2, [0xfff1a8, 0xf2d36b, 0xffffff, 0xfff8dc]);
  const confetti = makePoints(CONFETTI, 1.8, [0xd8323c, 0x3d7fc4, 0xf2c14e, 0x5fe0d0, 0xff5fb8, 0xf4f4f8]);
  const FIREWORK_COLORS = [0xff4fd8, 0xf2c14e, 0x5fe0d0, 0xd8323c, 0xf4f4f8];
  const bursts = Array.from({ length: BURSTS }, (_, n) => ({ pool: makePoints(SPARKS, 2.4, [FIREWORK_COLORS[n % FIREWORK_COLORS.length]]), age: 9 }));
  /** Send drop `i` of `p` from `at` at `v`. */
  const launch = (p: Pool, at: THREE.Vector3, vx: number, vy: number, vz: number) => {
    const i = p.next;
    p.next = (p.next + 1) % p.count;
    p.pos.setXYZ(i, at.x, at.y, at.z);
    p.vel.set([vx, vy, vz], i * 3);
  };
  /** Move `p`'s drops on `dt` s under `gravity` (slowed by `drag`, falling no faster than `fall`); those landed parked. */
  const fly = (p: Pool, dt: number, gravity: number, drag = 0, fall = Infinity, sway = 0, t = 0) => {
    for (let i = 0; i < p.count; i++) {
      const y = p.pos.getY(i);
      if (y < -500) continue;
      const v = p.vel;
      v[i * 3 + 1] = Math.max(-fall, v[i * 3 + 1] - gravity * dt);
      if (drag) {
        v[i * 3] *= 1 - drag * dt;
        v[i * 3 + 2] *= 1 - drag * dt;
      }
      const ny = y + v[i * 3 + 1] * dt;
      if (ny < 0) p.pos.setXYZ(i, 0, -999, 0);
      else p.pos.setXYZ(i, p.pos.getX(i) + (v[i * 3] + Math.sin(t * 2 + i) * sway) * dt, ny, p.pos.getZ(i) + v[i * 3 + 2] * dt);
    }
    p.pos.needsUpdate = true;
  };
  const park = (p: Pool) => {
    (p.pos.array as Float32Array).fill(-999);
    p.pos.needsUpdate = true;
    p.next = 0;
  };

  let lastT = -1;
  let confettiDue = 0;
  let fireworkDue = 0;
  const hand = new THREE.Vector3();
  /** Where `pivot`'s hand is, in the stage's space. */
  const handOf = (pivot: THREE.Object3D) => {
    hand.set(0, -4.4, 0);
    pivot.localToWorld(hand);
    return stage.worldToLocal(hand);
  };
  /** Which way each place sprays, at `t`: second at the winner (+x), third at the winner (-x), the winner at both. */
  const aim = (k: number, t: number) => (k === 0 ? Math.sin(t * 2.2) : k === 1 ? 1 : -1);

  const ceremony: Ceremony = {
    group,
    setDrivers(list) {
      drivers.forEach((d, k) => {
        const who = list[k];
        d.figure.visible = !!who;
        bays[k].clear();
        if (!who) return;
        d.body.color.set(who.body);
        d.trim.color.set(who.trim);
        d.helmet.color.set(who.helmet);
        if (who.car) {
          // (the driver's out of it: no helmet in the cockpit)
          who.car.traverse((o) => {
            if (o instanceof THREE.Mesh && o.geometry instanceof THREE.SphereGeometry) o.visible = false;
          });
          bays[k].add(who.car);
        }
      });
      // the wall: the winner's colour, the circuit's name and GRAND PRIX across its top half (over the drivers' heads)
      // in white (or ink, on a light colour), their trim along the top
      const winner = list[0];
      if (winner) {
        wallTrim.color.set(winner.trim);
        const tex = paintedTexture(512, 184, (x) => {
          x.fillStyle = winner.body;
          x.fillRect(0, 0, 512, 184);
          const hsl = { h: 0, s: 0, l: 0 };
          new THREE.Color(winner.body).getHSL(hsl);
          x.fillStyle = hsl.l > 0.55 ? '#1b1b26' : '#f4f4f8';
          x.textAlign = 'center';
          x.textBaseline = 'middle';
          const lines = [title, 'GRAND PRIX'].filter(Boolean);
          let size = 40;
          x.font = `bold ${size}px monospace`;
          while (size > 20 && Math.max(...lines.map((l) => x.measureText(l).width)) > 470) x.font = `bold ${(size -= 2)}px monospace`;
          lines.forEach((l, i) => x.fillText(l, 256, 62 + (i - (lines.length - 1) / 2) * size * 1.15));
        });
        wallFace.map?.dispose();
        wallFace.map = tex ?? null;
        wallFace.color.set(tex ? 0xffffff : winner.body);
        wallFace.needsUpdate = true;
      }
      // (from the top)
      for (const p of [spray, confetti, ...bursts.map((b) => b.pool)]) park(p);
      for (const b of bursts) b.age = 9;
      for (const d of drivers) d.cork.position.y = -999;
      lastT = -1;
      confettiDue = fireworkDue = 0;
      seed = 11;
    },
    update(t, dt) {
      const b = CEREMONY;
      const popAt = b.spray + b.pop;
      const pop = lastT < popAt && t >= popAt;
      let firework = false;
      drivers.forEach((d, k) => {
        if (!d.figure.visible) return;
        // climbing up onto the car (one after the other), then standing; the winner hopping from the trophy on
        const climb = smooth((t - k * 0.2) / 0.6);
        let y = STAND - (1 - climb) * 5;
        if (k === 0 && t > b.trophy) y += Math.abs(Math.sin((t - b.trophy) * 6)) * 1.8;
        d.figure.position.set(PARC_X[k], y, 2.5);
        // both arms up at the trophy; from the champagne, the bottle's arm out at the one they're spraying
        const up = smooth((t - b.trophy) * 4);
        const out = t > b.spray;
        // (an arm's turned toward its own side: + for the +x arm)
        d.lifts.rotation.z = -d.side * up * 2.8;
        d.sprays.rotation.z = d.side * (out ? (k === 0 ? 2.3 + Math.sin(t * 2.2) * 0.3 : 1.7) : up * 2.6 + Math.sin(t * 6 + k) * 0.2 * up);
        // (second and third turn a touch toward the winner)
        d.figure.rotation.y = out && k > 0 ? (k === 1 ? 0.35 : -0.35) : 0;
        d.figure.updateMatrixWorld(true);
        // the trophy in the lifted hand, upright; the bottle in the other, its neck toward the one being sprayed
        d.trophy.visible = t > b.trophy;
        d.trophy.position.copy(handOf(d.lifts)).y += 0.4;
        d.bottle.visible = out;
        d.bottle.position.copy(handOf(d.sprays)).y += 1;
        d.bottle.rotation.z = -aim(k, t) * 0.7;
        const neck = new THREE.Vector3(0, 2.7, 0).applyEuler(d.bottle.rotation).add(d.bottle.position);
        // the pop: the cork flies, the foam bursts out
        if (pop) {
          d.cork.position.copy(neck);
          d.corkVel.set(aim(k, t) * 10 + (rnd() - 0.5) * 6, 46 + rnd() * 10, 6);
          for (let j = 0; j < FOAM; j++) {
            const a = rnd() * Math.PI * 2;
            const s = 8 + rnd() * 14;
            launch(spray, neck, Math.cos(a) * s, 10 + rnd() * 22, Math.sin(a) * s + 4);
          }
        }
        if (d.cork.position.y > -500) {
          d.corkVel.y -= 60 * dt;
          d.cork.position.addScaledVector(d.corkVel, dt);
          d.cork.rotation.x += dt * 14;
          if (d.cork.position.y < 0) d.cork.position.y = -999;
        }
        // the jets: from the pop to the end
        if (t >= popAt && t < b.len) {
          const n = Math.max(2, Math.round(260 * dt));
          const dir = aim(k, t);
          for (let j = 0; j < n; j++) launch(spray, neck, dir * (24 + rnd() * 10) + (rnd() - 0.5) * 6, 20 + rnd() * 12, 5 + (rnd() - 0.5) * 8);
        }
      });
      fly(spray, dt, 50);
      // confetti: from the trophy on, falling from above, swaying
      if (t > b.trophy && t < b.len) {
        confettiDue += dt * 150;
        for (; confettiDue >= 1; confettiDue--) {
          const at = new THREE.Vector3((rnd() - 0.5) * 120, 70 + rnd() * 25, -14 + rnd() * 40);
          launch(confetti, at, (rnd() - 0.5) * 8, -6 - rnd() * 6, (rnd() - 0.5) * 8);
        }
      }
      fly(confetti, dt, 6, 1.5, 12, 4, t);
      // fireworks: from the champagne on, a burst over the wall every so often
      if (t > b.spray && t < b.len) {
        fireworkDue -= dt;
        if (fireworkDue <= 0) {
          fireworkDue = 0.6 + rnd() * 0.6;
          const burst = bursts.reduce((a, c) => (c.age > a.age ? c : a));
          burst.age = 0;
          park(burst.pool);
          const at = new THREE.Vector3((rnd() - 0.5) * 100, 54 + rnd() * 22, WALL.z - 20);
          for (let j = 0; j < SPARKS; j++) {
            const a = rnd() * Math.PI * 2;
            const e = rnd() * Math.PI - Math.PI / 2;
            const s = 22 + rnd() * 8;
            launch(burst.pool, at, Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s, Math.sin(a) * Math.cos(e) * s);
          }
          firework = true;
        }
      }
      for (const burst of bursts) {
        burst.age += dt;
        burst.pool.material.opacity = Math.max(0, 1 - burst.age / 1.6);
        if (burst.age < 1.6) fly(burst.pool, dt, 14);
        else if (burst.pool.pos.getY(0) > -500) park(burst.pool);
      }
      lastT = t;
      return { pop, firework };
    },
    view(t, aspect, fov) {
      // on third, then across to the winner, pulling back to the three of them, centred
      const k = smooth((t - SHOT.hold) / SHOT.sweep);
      const mix = (a: number, b: number) => a + (b - a) * k;
      const tanV = Math.tan(THREE.MathUtils.degToRad(fov / 2));
      const halfW = mix(CLOSE.halfW, WIDE.halfW);
      const halfH = mix(CLOSE.halfH, WIDE.halfH);
      const d = Math.max(halfH / tanV, halfW / (tanV * aspect));
      const rise = THREE.MathUtils.degToRad(SHOT.rise);
      const at = new THREE.Vector3(mix(CLOSE.x, WIDE.x), mix(CLOSE.y, WIDE.y), 2);
      return { eye: at.clone().add(new THREE.Vector3(0, Math.sin(rise) * d, Math.cos(rise) * d)), at };
    },
    plate: (k) => new THREE.Vector3(PARC_X[k], 1.2, BOARD_Z + 1),
  };
  ceremony.setDrivers([]);
  return ceremony;
}
