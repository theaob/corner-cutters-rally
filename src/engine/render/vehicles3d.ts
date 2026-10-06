// The rally car in 3D: a low-poly hatchback in its crew's paint (the pattern over
// the bonnet and roof), its tail lights lit as it slows, which darkens as the car burns.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { carClass, type CarClassId } from '../driving';

const lambert = (extra: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial(extra);

/** How the second colour runs over the top of the car, so a team reads by shape as well as colour. */
export type LiveryPattern = 'plain' | 'stripe' | 'twin' | 'band' | 'chevron' | 'halves' | 'split' | 'nose';

export interface CarLook {
  body: string;
  /** wings and nose, and the pattern's colour */
  stripe?: string;
  /** the shell's sides (the body colour when unset) */
  accent?: string;
  /** the pattern painted along the top of the car */
  pattern?: LiveryPattern;
  /**
   * the T-camera on top of the air intake: dark on a team's first car, bright
   * green on its second, so teammates tell apart (carbon when unset)
   */
  tcam?: string;
  /** the roof scoop: the trim colour unless set; 'gold' is shiny metallic gold (the player's) */
  helmet?: string | 'gold';
}

/**
 * Paint `pattern` into a w x h canvas: body colour, with the second colour as a
 * stripe, twin stripes, bands, chevrons, halves, a split or a coloured nose.
 * The canvas top is the front of the car.
 */
function paintPattern(w: number, h: number, pattern: LiveryPattern, body: string, second: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d')!;
  x.fillStyle = body;
  x.fillRect(0, 0, w, h);
  x.fillStyle = second;
  switch (pattern) {
    case 'stripe':
      x.fillRect(w * 0.36, 0, w * 0.28, h);
      break;
    case 'twin':
      x.fillRect(w * 0.14, 0, w * 0.18, h);
      x.fillRect(w * 0.68, 0, w * 0.18, h);
      break;
    case 'band':
      for (let y = h * 0.12; y < h; y += h * 0.3) x.fillRect(0, y, w, h * 0.12);
      break;
    case 'chevron':
      x.lineWidth = Math.max(2, w * 0.18);
      x.strokeStyle = second;
      for (let y = h * 0.2; y < h + w; y += h * 0.34) {
        x.beginPath();
        x.moveTo(0, y + w * 0.5);
        x.lineTo(w / 2, y);
        x.lineTo(w, y + w * 0.5);
        x.stroke();
      }
      break;
    case 'halves':
      x.fillRect(0, 0, w, h / 2);
      break;
    case 'split':
      x.fillRect(w / 2, 0, w / 2, h);
      break;
    case 'nose':
      x.fillRect(0, 0, w, h * 0.34);
      break;
    case 'plain':
      break;
  }
  return c;
}

/** A crisp texture from a canvas. */
function canvasTexture(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** The roof's texture (`w` x `h` world px): the pattern, 8 texels to a world px. */
function deckTexture(look: CarLook, second: string, w: number, h: number): THREE.CanvasTexture {
  return canvasTexture(paintPattern(Math.round(w * 8), Math.round(h * 8), look.pattern ?? 'plain', look.body, second));
}

/** Off-road tyres: px more radius and width than the tarmac's, and their tread blocks (how many round, how proud) */
const OFF_ROAD = { radius: 0.7, width: 1, blocks: 14, proud: 0.45 };

/** A knobbly tyre's tread blocks round a tyre `wr` px in radius and `ww` wide (its axle along x): two staggered rows. */
function knobs(wr: number, ww: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < OFF_ROAD.blocks; k++) {
    const a = (k / OFF_ROAD.blocks) * Math.PI * 2;
    const r = wr + OFF_ROAD.proud / 2;
    const block = new THREE.BoxGeometry(ww * 0.42, OFF_ROAD.proud, ((Math.PI * 2 * wr) / OFF_ROAD.blocks) * 0.55);
    // (round to its place on the tread, and to one side or the other, in turn)
    block.translate((k % 2 === 0 ? -1 : 1) * ww * 0.24, r, 0);
    block.rotateX(a);
    parts.push(block);
  }
  return mergeGeometries(parts)!;
}

export const CAR_LOOKS: Record<CarClassId, CarLook> = {
  f1: { body: '#d8323c', stripe: '#f4f4f8' },
};

export interface CarMesh extends THREE.Group {
  userData: {
    /** materials whose colour darkens as the car burns */
    paint: THREE.MeshLambertMaterial[];
    /** the coloured band round each tyre's outer edge, marking its compound: set its colour */
    tyreMark: THREE.MeshBasicMaterial;
    /** the brake lights over the tail lights: off (hidden) until the car slows */
    brakeLights: THREE.Group;
    /** the parts a big crash can tear off: the nose (with the front wing) and each wheel (front left, front right, rear left, rear right) */
    parts: { nose: THREE.Group; wheels: THREE.Group[] };
  };
}

/**
 * The car facing north (−z): a hatchback shell, glass cabin and roof, a roof
 * scoop, a wing on the hatch, flared arches, and spotlights on the front bumper.
 * On `offRoad` tyres (a dirt circuit), bigger and wider, knobbly all round: a
 * staggered ring of tread blocks standing proud of each tyre.
 */
export function createCarMesh(id: CarClassId, livery?: string | Partial<CarLook>, offRoad = false): CarMesh {
  // a colour paints the body; a livery can set the trim and sidepods too
  const look: CarLook = { ...CAR_LOOKS[id], ...(typeof livery === 'string' ? { body: livery } : livery) };
  const { width: W, length: L } = carClass(id);
  const car = new THREE.Group() as CarMesh;
  const paint: THREE.MeshLambertMaterial[] = [];
  const mat = (color: THREE.ColorRepresentation) => {
    const m = lambert({ color });
    paint.push(m);
    return m;
  };
  const dark = lambert({ color: 0x111111 });
  // BoxGeometry faces: +x, −x, +y, −y, +z (back), −z (front)
  const box = (w: number, h: number, l: number, y: number, z: number, faces: THREE.Material[], on: THREE.Object3D = car) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), faces);
    m.position.set(0, y, z);
    m.castShadow = m.receiveShadow = true;
    on.add(m);
    return m;
  };
  /** a part of its own (one a crash can tear off), its origin at `z` along the car */
  const part = (z: number, x = 0, y = 0) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    car.add(g);
    return g;
  };
  const noseZ = -(L / 2 - 6);
  const nose = part(noseZ);

  const body = mat(look.body);
  const second = look.stripe ?? '#f4f4f8';
  const trim = mat(second);
  const pods = look.accent ? mat(look.accent) : body;
  const carbon = lambert({ color: 0x1b1b26 });
  // textured paint (white, so the texture shows as drawn; it still chars when the car burns)
  const painted = (tex: THREE.Texture) => {
    const m = lambert({ map: tex, color: 0xffffff });
    paint.push(m);
    return m;
  };
  // a rally car: a little hatchback, the shell in the crew's paint, the pattern over the bonnet and the roof, glass
  // all round the cabin, a roof scoop, a big wing on the hatch,
  // and a bank of spotlights on the front bumper (with the bumper, the part a crash tears off)
  const glass = lambert({ color: 0x26303c });
  const bonnetTop = look.pattern && look.pattern !== 'plain' ? painted(canvasTexture(paintPattern(12, 8, look.pattern, look.body, second))) : body;
  box(W - 2, 5, L - 5, 4.6, 0.5, [pods, pods, body, dark, body, body]); // the shell, sills to the waistline (its sides in the accent)
  box(W - 2.4, 0.5, 9, 7.3, -(L / 2 - 7.5), [body, body, bonnetTop, dark, body, body]); // the bonnet
  box(W - 3, 4.4, 13, 9.3, 2.5, [glass, glass, glass, dark, glass, glass]); // the cabin's glass
  // the roof: the pattern across it
  const roofTop = look.pattern && look.pattern !== 'plain' ? painted(deckTexture(look, second, W - 3.4, 11)) : body;
  box(W - 3.4, 0.7, 11, 11.7, 3, [body, body, roofTop, dark, body, body]);
  // pillars, so the cabin reads as a car's and not a box of glass
  for (const x of [-(W - 3.2) / 2, (W - 3.2) / 2]) for (const z of [-3.6, 8.6]) {
    const pillar = box(0.5, 4.4, 1, 9.3, z, [body, body, body, body, body, body]);
    pillar.position.x = x;
  }
  // wheel arches flared out over the tyres, in the trim colour
  for (const z of [-(L / 2 - 7), L / 2 - 7]) for (const x of [-(W / 2 - 0.4), W / 2 - 0.4]) {
    const arch = box(1.4, 1.2, 8, 6.4, z, [trim, trim, trim, dark, trim, trim]);
    arch.position.x = x;
  }
  // the roof scoop: the driver's own colour on it (yours gold, shining), and the light bar marking a team's second car
  const scoopMat =
    look.helmet === 'gold'
      ? new THREE.MeshPhongMaterial({ color: 0xf5b82e, specular: 0xfff4c8, shininess: 90, emissive: 0x4a3000 })
      : mat(look.helmet ?? second);
  box(3.2, 1.2, 3.4, 12.6, -1, [scoopMat, scoopMat, scoopMat, dark, scoopMat, scoopMat]);
  const tcam = look.tcam ? new THREE.MeshBasicMaterial({ color: look.tcam, toneMapped: false }) : carbon;
  box(W - 5, 0.8, 1, 12.4, -2.8, [tcam, tcam, tcam, dark, tcam, tcam]);
  // the rear wing on the hatch, on two stays
  box(W - 1.5, 0.7, 3, 13.4, L / 2 - 3, [trim, trim, trim, dark, trim, trim]);
  for (const x of [-(W - 6) / 2, (W - 6) / 2]) {
    const stay = box(0.6, 2.4, 1.6, 12, L / 2 - 3, [carbon, carbon, carbon, carbon, carbon, carbon]);
    stay.position.x = x;
  }
  // the front bumper, and the spotlight pod on it (unlit, so the lamps glow)
  box(W - 1.6, 2.6, 2.4, 3, -(L / 2 - 1.2) - noseZ, [carbon, carbon, carbon, dark, carbon, carbon], nose);
  const lamp = new THREE.MeshBasicMaterial({ color: 0xfff2c0, toneMapped: false });
  box(W - 4, 2, 1, 6.2, -(L / 2 - 1.6) - noseZ, [carbon, carbon, carbon, dark, carbon, carbon], nose);
  for (const x of [-4.2, -1.4, 1.4, 4.2]) {
    const l = box(2, 1.6, 0.4, 6.2, -(L / 2 - 1.05) - noseZ, [lamp, lamp, lamp, lamp, lamp, lamp], nose);
    l.position.x = x;
  }
  // mud flaps behind the rear wheels
  for (const x of [-(W / 2 - 1.5), W / 2 - 1.5]) {
    const flap = box(3, 2.6, 0.3, 1.6, L / 2 - 2.6, [carbon, carbon, carbon, carbon, carbon, carbon]);
    flap.position.x = x;
  }

  // wheels: [z, radius, tyre width, half-track] per axle
  const axles: [number, number, number, number][] = [
    [-(L / 2 - 7), 3.5, 3, W / 2 - 1.6],
    [L / 2 - 7, 3.5, 3, W / 2 - 1.6],
  ].map(([z, wr, ww, half]) => (offRoad ? [z, wr + OFF_ROAD.radius, ww + OFF_ROAD.width, half + OFF_ROAD.width / 2] : [z, wr, ww, half]));
  // (the tread blocks caked in earth, so the knobbly tread shows against the tyre)
  const tread = offRoad ? lambert({ color: 0x6a5038 }) : undefined;
  const wheelMat = lambert({ color: 0x151515 });
  // the compound's colour round the outer edge of each tread (unlit, so it reads from afar and in shade)
  const tyreMark = new THREE.MeshBasicMaterial({ color: 0xffd21f, toneMapped: false });
  const wheels: THREE.Group[] = [];
  for (const [z, wr, ww, half] of axles) {
    for (const x of [-half, half]) {
      // (each wheel a part of its own, centred on its hub)
      const hub = part(z, x, wr);
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(wr, wr, ww, 12), wheelMat);
      wheel.rotation.z = Math.PI / 2;
      hub.add(wheel);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(wr + 0.12, wr + 0.12, 0.8, 12, 1, true), tyreMark);
      band.rotation.z = Math.PI / 2;
      band.position.x = Math.sign(x) * (ww / 2 - 0.4);
      hub.add(band);
      // (off-road: the knobbly tread, its blocks staggered side to side round the tyre)
      if (tread) hub.add(new THREE.Mesh(knobs(wr, ww), tread));
      wheels.push(hub);
    }
  }

  // the tail lights: a lamp at each corner of the tailgate, dark red glass; over each, its brake light, bright red
  // (unlit, so it glows; the bloom picks it up), shown as the car slows
  const back = L / 2 - 2 + 0.5;
  const tailGlass = lambert({ color: 0x5a1416 });
  const lit = new THREE.MeshBasicMaterial({ color: 0xff2a2a, toneMapped: false });
  const brakeLights = new THREE.Group();
  for (const x of [-(W / 2 - 2.6), W / 2 - 2.6]) {
    const lamp = box(3.4, 1.8, 0.6, 6, back, [tailGlass, tailGlass, tailGlass, tailGlass, tailGlass, tailGlass]);
    lamp.position.x = x;
    const glow = new THREE.Mesh(new THREE.BoxGeometry(3.6, 2, 0.4), lit);
    glow.position.set(x, 6, back + 0.25);
    brakeLights.add(glow);
  }
  brakeLights.visible = false;
  car.add(brakeLights);

  car.userData = { paint, tyreMark, brakeLights, parts: { nose, wheels } };
  return car;
}
