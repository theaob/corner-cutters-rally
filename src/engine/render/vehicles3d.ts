// The rally car in 3D: a low-poly hatchback in its crew's paint (the pattern over
// the bonnet and roof), its tail lights lit as it slows, which darkens as the car burns.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { carClass, type CarClassId } from '../driving';
import { mergedByMaterial } from './merge';
import { BODIES, slanted, type BodyKit, type CarModel } from './carBodies';

export type { CarModel } from './carBodies';

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
  /** the car's body (carBodies.ts): the APEX R1 hatch when unset */
  model?: CarModel;
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

/**
 * A tyre `wr` px in radius and `ww` wide, its axle along x, with its compound band round the outer edge (`side`: −1 or
 * 1) and its rim on the outer face: the band's vertices marked (attribute `mark`: 1), the rim's 2.
 */
function tyreGeometry(wr: number, ww: number, side: number): THREE.BufferGeometry {
  const tread = new THREE.CylinderGeometry(wr, wr, ww, 12).rotateZ(Math.PI / 2);
  const band = new THREE.CylinderGeometry(wr + 0.12, wr + 0.12, 0.8, 12, 1, true).rotateZ(Math.PI / 2).translate(side * (ww / 2 - 0.4), 0, 0);
  const rim = new THREE.CylinderGeometry(wr * 0.6, wr * 0.6, 0.2, 10).rotateZ(Math.PI / 2).translate(side * (ww / 2 + 0.05), 0, 0);
  for (const [g, mark] of [[tread, 0], [band, 1], [rim, 2]] as const) {
    g.setAttribute('mark', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count).fill(mark), 1));
  }
  return mergeGeometries([tread, band, rim])!;
}

/** The tyre's material: dark rubber (lit), its band in `mark`'s colour and its rim in `rim`'s instead (unlit: a lamp's glow doesn't dim them). */
function tyreMaterial(mark: THREE.Color, rim: THREE.Color): THREE.MeshLambertMaterial {
  const m = lambert({ color: 0x151515 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uMark = { value: mark };
    shader.uniforms.uRim = { value: rim };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float mark; varying float vMark;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMark = mark;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uMark; uniform vec3 uRim; varying float vMark;')
      .replace('#include <opaque_fragment>', 'outgoingLight = vMark > 1.5 ? uRim : mix(outgoingLight, uMark, vMark);\n#include <opaque_fragment>');
  };
  m.customProgramCacheKey = () => 'tyre-mark';
  return m;
}

export const CAR_LOOKS: Record<CarClassId, CarLook> = {
  f1: { body: '#d8323c', stripe: '#f4f4f8' },
};

export interface CarMesh extends THREE.Group {
  userData: {
    /** materials whose colour darkens as the car burns */
    paint: THREE.MeshLambertMaterial[];
    /** the coloured band round each tyre's outer edge, marking its compound: set its colour */
    tyreMark: { color: THREE.Color };
    /** the brake lights over the tail lights: off (hidden) until the car slows */
    brakeLights: THREE.Group;
    /** the parts a big crash can tear off: the nose (with the front wing) and each wheel (front left, front right, rear left, rear right) */
    parts: { nose: THREE.Group; wheels: THREE.Group[] };
  };
}

/**
 * The car facing north (−z), in its body (`livery.model`, carBodies.ts: the APEX R1 hatch unless set): the shell, glass
 * cabin and roof, arches, spotlights on the front bumper, the wheels and tail lights where its body puts them.
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
  // BoxGeometry faces: +x, −x, +y, −y, +z (back), −z (front). The boxes are gathered by the part they're on, and
  // each part's made one mesh at the end, its faces grouped by material: a draw call a material, not one a face
  // (a box of six materials is six draw calls, and six again for its shadow; a car of them, too many for a phone)
  const boxes = new Map<THREE.Object3D, { geometry: THREE.BufferGeometry; faces: THREE.Material[] }[]>();
  const box = (w: number, h: number, l: number, y: number, z: number, faces: THREE.Material[], on: THREE.Object3D = car, x = 0) => {
    const list = boxes.get(on) ?? [];
    list.push({ geometry: new THREE.BoxGeometry(w, h, l).translate(x, y, z), faces });
    boxes.set(on, list);
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
  const glass = lambert({ color: 0x26303c });
  const lamp = new THREE.MeshBasicMaterial({ color: 0xfff2c0, toneMapped: false });
  const chrome = lambert({ color: 0xc4c8ce });
  const patterned = look.pattern && look.pattern !== 'plain';
  // the roof scoop: the driver's own colour on it (yours gold, shining), and the light bar marking a team's second car
  const scoop =
    look.helmet === 'gold'
      ? new THREE.MeshPhongMaterial({ color: 0xf5b82e, specular: 0xfff4c8, shininess: 90, emissive: 0x4a3000 })
      : mat(look.helmet ?? second);
  const tcam = look.tcam ? new THREE.MeshBasicMaterial({ color: look.tcam, toneMapped: false }) : carbon;
  const kit: BodyKit = {
    W, L, body, trim, pods, dark, carbon, glass, lamp, chrome, scoop, tcam,
    box,
    slant: (w, h, l, y, z, faces, drop, on = car, x = 0) => {
      const list = boxes.get(on) ?? [];
      list.push({ geometry: slanted(new THREE.BoxGeometry(w, h, l), drop).translate(x, y, z), faces });
      boxes.set(on, list);
    },
    front: (w, h, l, y, z, faces, x = 0) => box(w, h, l, y, z - noseZ, faces, nose, x),
    deck: (w, l) => (patterned ? painted(deckTexture(look, second, w, l)) : body),
    all: (m) => [m, m, m, m, m, m],
  };
  const spec = BODIES[look.model ?? 'apex'](kit);

  // wheels: [z, radius, tyre width, half-track] per axle
  const axles: [number, number, number, number][] = spec.axles
    .map((z) => [z, spec.wheel.radius, spec.wheel.width, spec.wheel.half])
    .map(([z, wr, ww, half]) => (offRoad ? [z, wr + OFF_ROAD.radius, ww + OFF_ROAD.width, half + OFF_ROAD.width / 2] : [z, wr, ww, half]));
  // (the tread blocks caked in earth, so the knobbly tread shows against the tyre)
  const tread = offRoad ? lambert({ color: 0x6a5038 }) : undefined;
  // a tyre, its compound band and its rim are one mesh in one draw call: the band's and rim's vertices are marked, and
  // drawn in their colours, unlit, so they still read from afar and in shade
  const tyreMark = { color: new THREE.Color(0xffd21f) };
  const wheelMat = tyreMaterial(tyreMark.color, new THREE.Color(spec.wheel.rim));
  const wheels: THREE.Group[] = [];
  for (const [z, wr, ww, half] of axles) {
    for (const x of [-half, half]) {
      // (each wheel a part of its own, centred on its hub)
      const hub = part(z, x, wr);
      hub.add(new THREE.Mesh(tyreGeometry(wr, ww, Math.sign(x)), wheelMat));
      // (off-road: the knobbly tread, its blocks staggered side to side round the tyre)
      if (tread) hub.add(new THREE.Mesh(knobs(wr, ww), tread));
      wheels.push(hub);
    }
  }

  // the tail lights: a lamp at each corner of the tail, dark red glass; over each, its brake light, bright red
  // (unlit, so it glows; the bloom picks it up), shown as the car slows
  const { z: back, y: tailY, x: tailX, w: tailW, h: tailH } = spec.tail;
  const tailGlass = lambert({ color: 0x5a1416 });
  const lit = new THREE.MeshBasicMaterial({ color: 0xff2a2a, toneMapped: false });
  const brakeLights = new THREE.Group();
  for (const x of [-tailX, tailX]) {
    box(tailW, tailH, 0.6, tailY, back, kit.all(tailGlass), car, x);
    const glow = new THREE.Mesh(new THREE.BoxGeometry(tailW + 0.2, tailH + 0.2, 0.4), lit);
    glow.position.set(x, tailY, back + 0.25);
    brakeLights.add(glow);
  }
  brakeLights.visible = false;
  car.add(brakeLights);
  for (const [on, list] of boxes) {
    const m = mergedByMaterial(list);
    m.castShadow = m.receiveShadow = true;
    on.add(m);
  }

  car.userData = { paint, tyreMark, brakeLights, parts: { nose, wheels } };
  return car;
}
