// The F1 car in 3D: a low-poly open-wheel racer in its team paint, which
// darkens as the car burns.

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
  /** sidepods (the body colour when unset) */
  accent?: string;
  /** the pattern painted along the top of the car */
  pattern?: LiveryPattern;
  /**
   * the T-camera on top of the air intake: dark on a team's first car, bright
   * green on its second, so teammates tell apart (carbon when unset)
   */
  tcam?: string;
  /** the driver's helmet: plain white unless set; 'gold' is shiny metallic gold (the player's) */
  helmet?: string | 'gold';
  /** the driver's race number, on a white plate filling the engine cover (none when unset) */
  number?: number;
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

/**
 * The engine-cover texture (`w` x `h` world px): the pattern, 8 texels to a world px, and the race number on the part
 * of it seen from above (`seen`: left, top, width, height, as fractions; the rear wheels hide its sides, and the air
 * intake its front).
 */
function deckTexture(look: CarLook, second: string, w: number, h: number, seen?: [number, number, number, number]): THREE.CanvasTexture {
  const c = paintPattern(Math.round(w * 8), Math.round(h * 8), look.pattern ?? 'plain', look.body, second);
  if (look.number !== undefined) paintNumber(c, look.number, seen);
  return canvasTexture(c);
}

/** The digits as 3×5 pixel figures (rows top to bottom, 1 = lit): blocky, so they still read when the car is small. */
const DIGITS: Record<string, string[]> = {
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '011', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'],
  '7': ['111', '001', '010', '010', '010'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'],
};

/**
 * The race number on `c`, as big as it fits in `area` (the part of the canvas seen from above, as fractions of it:
 * left, top, width, height): dark pixel figures on a white plate edged in dark, so it reads on any livery. Upright
 * with the canvas's top (the car's front) at the top.
 */
function paintNumber(c: HTMLCanvasElement, n: number, area: [number, number, number, number] = [0, 0, 1, 1]): void {
  const x = c.getContext('2d')!;
  const text = String(n);
  const [ax, ay, aw, ah] = [area[0] * c.width, area[1] * c.height, area[2] * c.width, area[3] * c.height];
  // (figures 3 wide, a pixel apart, 5 tall; the plate a little margin round them)
  const wide = text.length * 4 - 1;
  const cell = Math.floor(Math.min(aw / (wide + 0.6), ah / 5.6));
  const [pw, ph] = [(wide + 0.6) * cell, 5.6 * cell];
  const [px, py] = [Math.round(ax + (aw - pw) / 2), Math.round(ay + (ah - ph) / 2)];
  x.fillStyle = '#f4f4f8';
  x.fillRect(px, py, pw, ph);
  x.lineWidth = Math.max(2, cell * 0.25);
  x.strokeStyle = '#1b1b26';
  x.strokeRect(px, py, pw, ph);
  x.fillStyle = '#1b1b26';
  const [left, top] = [px + cell * 0.3, py + cell * 0.3];
  [...text].forEach((d, k) =>
    DIGITS[d]?.forEach((row, ry) => [...row].forEach((on, rx) => on === '1' && x.fillRect(left + (k * 4 + rx) * cell, top + ry * cell, cell, cell))),
  );
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
    /** the red rain light at the back, for wet races: off (hidden) until shown */
    rainLight: THREE.Mesh;
    /** the parts a big crash can tear off: the nose (with the front wing) and each wheel (front left, front right, rear left, rear right) */
    parts: { nose: THREE.Group; wheels: THREE.Group[] };
  };
}

/**
 * The car facing north (−z): a narrow tub with a long nose, sidepods, cockpit
 * and helmet, front and rear wings, and fat exposed tyres (bigger at the back).
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
  // the pattern along the top of the tub, from the nose back
  const tubTop = look.pattern && look.pattern !== 'plain' ? painted(canvasTexture(paintPattern(8, 48, look.pattern, look.body, second))) : body;
  box(5, 3.5, L - 6, 3.5, 1, [body, body, tubTop, dark, body, body]); // tub
  box(3, 2.5, 8, 3, 0, [body, body, trim, dark, body, body], nose); // nose
  for (const x of [-4, 4]) {
    const pod = box(3, 3, 9, 3, 3, [pods, pods, pods, dark, pods, pods]);
    pod.position.x = x;
  }
  box(3.5, 1.5, 5, 5.8, 0, [carbon, carbon, carbon, dark, carbon, carbon]); // cockpit
  // the engine cover, spanning the sidepods behind the cockpit: the biggest surface seen from above,
  // carrying the team's pattern
  if (look.pattern || look.number !== undefined) box(11, 0.6, 8, 5.4, 7, [pods, pods, painted(deckTexture(look, second, 11, 8, [1.6 / 11, 1.2 / 8, 7.8 / 11, 6.6 / 8])), dark, pods, pods]);
  // the air intake above the driver's head, and the T-camera on it: dark, or bright green to mark the
  // team's second car (unlit, so it stays bright in shade and from afar)
  box(2.6, 2.4, 3, 7.6, 2.6, [body, body, body, dark, body, carbon]);
  const tcam = look.tcam ? new THREE.MeshBasicMaterial({ color: look.tcam, toneMapped: false }) : carbon;
  box(4.2, 1, 1.6, 9.3, 2.4, [tcam, tcam, tcam, dark, tcam, tcam]);
  // (the gold one shines: a bright highlight where the sun catches it, and a warm glow of its own)
  const helmetMat =
    look.helmet === 'gold'
      ? new THREE.MeshPhongMaterial({ color: 0xf5b82e, specular: 0xfff4c8, shininess: 90, emissive: 0x4a3000 })
      : mat(look.helmet ?? '#e8e8ee');
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(1.7, 12, 10), helmetMat);
  helmet.position.set(0, 7.2, 0.5);
  helmet.castShadow = true;
  car.add(helmet);
  box(W, 0.8, 3, 1.4, -(L / 2 - 1.5) - noseZ, [trim, trim, trim, dark, trim, trim], nose); // front wing
  box(W - 3, 0.8, 2.5, 8.5, L / 2 - 1.5, [trim, trim, body, dark, trim, trim]); // rear wing
  for (const x of [-(W - 3) / 2, (W - 3) / 2]) {
    const plate = box(0.6, 5, 3, 6.5, L / 2 - 1.5, [carbon, carbon, carbon, carbon, carbon, carbon]);
    plate.position.x = x;
  }

  // wheels: [z, radius, tyre width, half-track] per axle
  const axles: [number, number, number, number][] = [
    [-(L / 2 - 8), 3.2, 3, W / 2 - 1.5],
    [L / 2 - 6, 3.8, 3.6, W / 2 - 1.2],
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

  // the rain light: a red lamp at the back, under the rear wing (unlit, so it glows; the bloom picks it up)
  const rainLight = new THREE.Mesh(new THREE.BoxGeometry(2.8, 2, 1), new THREE.MeshBasicMaterial({ color: 0xff2a2a, toneMapped: false }));
  rainLight.position.set(0, 4.2, L / 2 - 0.2);
  rainLight.visible = false;
  car.add(rainLight);

  car.userData = { paint, tyreMark, rainLight, parts: { nose, wheels } };
  return car;
}
