// The rally cars' bodies (cars.ts names them; vehicles3d.ts builds a car round one): six low-poly shells, one an era,
// each with the silhouette that era's rally cars are known by, seen from above (the stage's camera) as much as from the
// side. All invented: no maker's lines, lamps, grille or badge copied, only the shape of the time.
//
// Each body is built from boxes (some slanted, for a raked screen or a wedge nose) in the car's own frame: facing
// north (−z), y up, the ground at 0, about W (14) px wide and L (30) long like the car the physics drives. It returns
// where its wheels and tail lights go. BoxGeometry faces: +x, −x, +y, −y, +z (back), −z (front).

import * as THREE from 'three';

export type CarModel = 'mini' | 'fulvia' | 'alpine' | 'brisk' | 'stiletto' | 'volta' | 'raia' | 'saetta' | 'quadra' | 'kestrel' | 'merlin' | 'vortice' | 'corsaro' | 'typhoon' | 'falco' | 'leone' | 'zefiro' | 'apex';

type Faces = THREE.Material[];

/** What a body is built with: the car's size, its materials, and ways to add boxes. */
export interface BodyKit {
  W: number;
  L: number;
  /** the paint: the body colour, the second (trim) colour, the sides (accent, else body) */
  body: THREE.Material;
  trim: THREE.Material;
  pods: THREE.Material;
  dark: THREE.Material;
  carbon: THREE.Material;
  glass: THREE.Material;
  /** a spotlight's lens (unlit, so it glows) */
  lamp: THREE.Material;
  chrome: THREE.Material;
  /** the roof scoop (the player's gold) and the light bar over the screen */
  scoop: THREE.Material;
  tcam: THREE.Material;
  /** a box `w` x `h` x `l`, its middle `y` up and `z` along (and `x` across) */
  box(w: number, h: number, l: number, y: number, z: number, faces: Faces, on?: THREE.Object3D, x?: number): void;
  /** the same, its top edges lowered: `front` at the nose end, `back` at the tail, `inset` in at each side */
  slant(w: number, h: number, l: number, y: number, z: number, faces: Faces, drop: Slant, on?: THREE.Object3D, x?: number): void;
  /** a box on the nose (the part a crash tears off), placed in the car's frame */
  front(w: number, h: number, l: number, y: number, z: number, faces: Faces, x?: number): void;
  /** a top `w` x `l` px in the livery's pattern (plain paint when it has none) */
  deck(w: number, l: number): THREE.Material;
  /** one material on every face */
  all(m: THREE.Material): Faces;
  /** any geometry (in the car's frame), a material for each of its groups */
  add(g: THREE.BufferGeometry, faces: Faces, on?: THREE.Object3D): void;
  /** a paint of the car's own (it chars with the rest when the car burns) */
  paint(color: THREE.ColorRepresentation): THREE.Material;
  /** the nose part (a crash tears it off) and where it sits along the car */
  nose: THREE.Object3D;
  noseZ: number;
  /** the car wears its night floodlights (a night or evening rally), not by day */
  floodlights: boolean;
}

export interface Slant {
  front?: number;
  back?: number;
  inset?: number;
}

/** Where a body puts its wheels and tail lights. */
export interface BodySpec {
  /** each axle's z */
  axles: [number, number];
  /** px: radius, tyre width, the hub's distance out from the middle; the rim's colour */
  wheel: { radius: number; width: number; half: number; rim: string };
  /** the tail lights: their z, y, distance out, width and height */
  tail: { z: number; y: number; x: number; w: number; h: number };
  /** where the exhaust comes out (its flames pop from there): low at the tail, off to one side when unset */
  exhaust?: { x: number; y: number; z: number };
}

/** `g` (a box, its middle at 0) with its top edges lowered and drawn in (Slant), its faces' shading made to match. */
export function slanted(g: THREE.BoxGeometry, { front = 0, back = 0, inset = 0 }: Slant): THREE.BoxGeometry {
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) <= 0) continue;
    const z = p.getZ(i);
    if (z < 0) p.setY(i, p.getY(i) - front);
    if (z > 0) p.setY(i, p.getY(i) - back);
    p.setX(i, p.getX(i) - Math.sign(p.getX(i)) * inset);
  }
  p.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

/**
 * A side profile drawn in (z, y) by `draw` (z along the car, the front negative; y up), extruded `depth` across the car
 * and centred on it, its edges rounded over `bevel`. Groups: 0 the two flat sides, 1 round the edge.
 */
export function profile(draw: (s: THREE.Shape) => void, depth: number, bevel = 0, segments = 6): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  draw(shape);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.01, depth - 2 * bevel), bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelOffset: -bevel, bevelSegments: 2, curveSegments: segments,
  });
  // (shape x along the car, its extrusion across: x' = −z, z' = x)
  g.rotateY(-Math.PI / 2);
  g.translate((depth - 2 * bevel) / 2, 0, 0);
  return g;
}

/** A disc or drum `r` in radius and `len` long round `axis`, its middle at (x, y, z). Groups: 0 round, 1 and 2 its ends. */
export function drum(r: number, len: number, axis: 'x' | 'y' | 'z', x: number, y: number, z: number, segments = 12): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r, len, segments);
  if (axis === 'x') g.rotateZ(Math.PI / 2);
  if (axis === 'z') g.rotateX(Math.PI / 2);
  return g.translate(x, y, z);
}

/** A top's faces: `top` on it, `side` round it, dark under. */
const capped = (side: THREE.Material, top: THREE.Material, dark: THREE.Material): Faces => [side, side, top, dark, side, side];

export const BODIES: Record<CarModel, (k: BodyKit) => BodySpec> = {
  /**
   * BANTAM S, after the Mini Cooper S that won the Monte Carlo Rally in the sixties: tiny, the wheels right out at the
   * corners under black arch extensions, a rounded two-box body with its seams on the outside, an upright glasshouse
   * under a white roof, round headlamps either side of a chrome grille with two spotlights before it, chrome bumpers,
   * a white roundel on each door and a swivelling spotlight on the roof. Its own paint: red, the roof white.
   */
  mini(k) {
    const w = 11.6;
    const front = -10.5;
    const back = 10.5;
    const black = k.paint(0x16171b);
    const white = k.paint(0xf3f1ea);
    // the body: a rounded box from the sills to the waist, the bonnet curving down to the grille and the boot to the tail
    k.add(profile((s) => {
      s.moveTo(front + 0.6, 1.6);
      s.lineTo(back - 0.6, 1.6);
      s.quadraticCurveTo(back, 1.7, back, 2.6);
      s.lineTo(back, 5.4);
      s.quadraticCurveTo(back - 0.1, 6.2, back - 1, 6.3);
      s.lineTo(-5.2, 6.5);
      s.quadraticCurveTo(front + 3, 6.3, front + 1.2, 5.6);
      s.quadraticCurveTo(front + 0.1, 5.3, front, 4.6);
      s.lineTo(front, 2.6);
      s.quadraticCurveTo(front, 1.7, front + 0.6, 1.6);
    }, w, 0.7), [k.pods, k.body]);
    // the seams on the outside, down the body at the screen's foot
    for (const x of [-(w / 2 + 0.05), w / 2 + 0.05]) k.box(0.3, 4, 0.3, 4.4, -5.3, k.all(k.body), undefined, x);
    // the glasshouse, upright, the screen a little raked; the pillars in the body colour
    k.add(profile((s) => {
      s.moveTo(-5.3, 6.3);
      s.lineTo(-4.1, 9.7);
      s.lineTo(6.6, 9.7);
      s.lineTo(7.3, 6.3);
    }, w - 1.6), [k.glass, k.glass]);
    for (const [z0, z1] of [[-5.35, -4.15], [7.35, 6.65]] as const) {
      for (const x of [-(w - 1.6) / 2, (w - 1.6) / 2]) {
        k.add(profile((s) => {
          s.moveTo(z0 - 0.4, 6.3);
          s.lineTo(z1 - 0.4, 9.7);
          s.lineTo(z1 + 0.5, 9.7);
          s.lineTo(z0 + 0.5, 6.3);
        }, 0.4).translate(x, 0, 0), [k.body, k.body]);
      }
    }
    for (const x of [-(w - 1.6) / 2, (w - 1.6) / 2]) k.box(0.4, 3.4, 0.7, 8, 1.2, k.all(k.body), undefined, x); // the door pillars
    // the roof: white, domed, its gutter overhanging the glass
    k.add(profile((s) => {
      s.moveTo(-4.5, 9.6);
      s.lineTo(7, 9.6);
      s.quadraticCurveTo(7, 10.3, 6, 10.4);
      s.lineTo(-3.4, 10.4);
      s.quadraticCurveTo(-4.5, 10.3, -4.5, 9.6);
    }, w - 1.1, 0.35), [k.trim, k.trim]);
    // the swivelling spotlight on the roof, its housing the driver's colour (yours gold)
    k.add(drum(0.75, 1.3, 'z', 0, 11.15, -2.9, 10), [k.scoop, k.scoop, k.scoop]);
    k.add(drum(0.55, 0.12, 'z', 0, 11.15, -3.6, 10), [k.lamp, k.lamp, k.lamp]);
    k.box(0.5, 0.5, 0.5, 10.6, -2.9, k.all(black));
    // black arch extensions over the wheels
    for (const z of [-7.3, 7.3]) for (const x of [-(w / 2 + 0.25), w / 2 + 0.25]) {
      k.add(profile((s) => {
        s.moveTo(z - 3.5, 2.2);
        s.quadraticCurveTo(z - 3.4, 6.1, z, 6.2);
        s.quadraticCurveTo(z + 3.4, 6.1, z + 3.5, 2.2);
        s.lineTo(z + 2.8, 2.2);
        s.quadraticCurveTo(z + 2.7, 5.5, z, 5.6);
        s.quadraticCurveTo(z - 2.7, 5.5, z - 2.8, 2.2);
      }, 0.8).translate(x, 0, 0), [black, black]);
    }
    // a white roundel on each door, for the rally number
    for (const x of [-(w / 2 + 0.04), w / 2 + 0.04]) k.add(drum(1.5, 0.1, 'x', x, 4.2, -1.9, 14), [white, white, white]);
    // the nose: a chrome grille, round headlamps in chrome rings, two spotlights before the grille (on a
    // night or evening rally), a chrome bumper
    k.front(5.6, 2.8, 0.3, 4.3, front - 0.05, k.all(k.chrome));
    k.front(4.8, 2.2, 0.3, 4.3, front - 0.12, k.all(black));
    for (const y of [3.7, 4.3, 4.9]) k.front(4.8, 0.16, 0.3, y, front - 0.2, k.all(k.chrome));
    for (const x of [-3.9, 3.9]) {
      // (each in a pod of the wing, standing out in front of the body: the wing's curve never cuts into the lamp)
      k.add(drum(1.2, 2, 'z', x, 4.9, front + 0.5 - k.noseZ, 14), [k.body, k.body, k.body], k.nose);
      k.add(drum(1.05, 0.4, 'z', x, 4.9, front - 0.65 - k.noseZ, 14), [k.chrome, k.chrome, k.chrome], k.nose);
      k.add(drum(0.85, 0.2, 'z', x, 4.9, front - 0.8 - k.noseZ, 14), [k.lamp, k.lamp, k.lamp], k.nose);
    }
    if (k.floodlights) for (const x of [-1.5, 1.5]) {
      k.add(drum(0.9, 0.9, 'z', x, 3.3, front - 0.9 - k.noseZ, 12), [black, black, black], k.nose);
      k.add(drum(0.75, 0.15, 'z', x, 3.3, front - 1.4 - k.noseZ, 12), [k.lamp, k.lamp, k.lamp], k.nose);
    }
    k.front(w + 0.2, 0.7, 0.7, 2.3, front - 0.3, k.all(k.chrome));
    for (const x of [-2.9, 2.9]) k.front(0.5, 1.6, 0.6, 2.9, front - 0.55, k.all(k.chrome), x);
    // the tail: a chrome bumper with its overriders, the number plate, the boot handle
    k.box(w + 0.2, 0.7, 0.7, 2.3, back + 0.3, k.all(k.chrome));
    for (const x of [-2.9, 2.9]) k.box(0.5, 1.6, 0.6, 2.9, back + 0.55, k.all(k.chrome), undefined, x);
    k.box(3.6, 1.1, 0.15, 3.6, back + 0.05, k.all(white));
    k.box(1.6, 0.3, 0.3, 5, back + 0.1, k.all(k.chrome));
    // mud flaps behind the wheels
    for (const z of [-4.2, 10.2]) for (const x of [-(w / 2 - 0.9), w / 2 - 0.9]) k.box(1.8, 1.6, 0.2, 1.3, z, k.all(black), undefined, x);
    return {
      axles: [-7.3, 7.3],
      wheel: { radius: 2.4, width: 2.2, half: w / 2 - 0.75, rim: '#a7adb5' },
      tail: { z: back + 0.05, y: 4.6, x: w / 2 - 0.9, w: 0.9, h: 1.7 },
    };
  },

  /**
   * VELA 1600, after the Lancia Fulvia coupé that won the rallies of the late sixties and the 1972 Monte Carlo: low,
   * slim and crisp, a flat bonnet and boot, a light airy glasshouse on thin pillars sloping down to the tail, four round
   * headlamps across a wide flat grille, and, as the works cars ran, no bumpers, a matt black bonnet held by two
   * straps and a pair of big spotlights before the grille. Its own paint: deep wine red, the bonnet black.
   */
  fulvia(k) {
    const w = 11.6;
    const front = -13.5;
    const back = 13.5;
    const black = k.paint(0x16171b);
    const matt = k.paint(0x1d1e22);
    const white = k.paint(0xf1efe6);
    // the body: low and crisp, a flat bonnet falling a little to the grille, a flat boot, square ends
    k.add(profile((s) => {
      s.moveTo(front + 0.4, 1.4);
      s.lineTo(back - 0.4, 1.4);
      s.lineTo(back, 2.2);
      s.lineTo(back, 4.6);
      s.lineTo(back - 0.5, 5);
      s.lineTo(4.2, 5.1);
      s.lineTo(-3.2, 5.1);
      s.lineTo(front + 0.5, 4.65);
      s.lineTo(front, 4.3);
      s.lineTo(front, 2.2);
    }, w, 0.35, 2), [k.pods, k.body]);
    // the bonnet: matt black, with its two leather straps at the front
    k.add(profile((s) => {
      s.moveTo(front + 0.5, 4.65);
      s.lineTo(-3.2, 5.1);
      s.lineTo(-3.2, 5.25);
      s.lineTo(front + 0.5, 4.8);
    }, w - 1.2), [matt, matt]);
    // a small tricolore stripe along the bonnet's left side (left of the driver: −x), green outboard, red inboard
    const tricolore = [k.paint(0x169b46), k.paint(0xf4f4f0), k.paint(0xd2232a)];
    tricolore.forEach((m, i) => k.add(profile((s) => {
      s.moveTo(front + 0.6, 4.81);
      s.lineTo(-3.4, 5.26);
      s.lineTo(-3.4, 5.31);
      s.lineTo(front + 0.6, 4.86);
    }, 0.4).translate(-4.2 + i * 0.4, 0, 0), [m, m]));
    // (the straps in the driver's colour: leather on the rivals' cars, gold on yours)
    for (const x of [-2.6, 2.6]) k.box(0.8, 0.14, 1.8, 4.93, front + 1.9, k.all(k.scoop), undefined, x);
    // the glasshouse: light, thin pillars, the screen raked, the back window sloping down to the boot
    k.add(profile((s) => {
      s.moveTo(-3.2, 5.05);
      s.lineTo(-0.6, 8.1);
      s.lineTo(3.4, 8.1);
      s.lineTo(9.4, 5.05);
    }, w - 1.6), [k.glass, k.glass]);
    // the roof, in the body colour, a little overhanging
    k.add(profile((s) => {
      s.moveTo(-0.9, 8);
      s.lineTo(3.8, 8);
      s.lineTo(3.5, 8.5);
      s.lineTo(-0.6, 8.5);
    }, w - 1.4, 0.2, 2), [k.body, k.body]);
    // the pillars: thin at the screen and the door, broader at the back
    const half = (w - 1.6) / 2;
    for (const x of [-half, half]) {
      k.add(profile((s) => {
        s.moveTo(-3.4, 5.05);
        s.lineTo(-0.8, 8.1);
        s.lineTo(-0.4, 8.1);
        s.lineTo(-2.9, 5.05);
      }, 0.3).translate(x, 0, 0), [k.body, k.body]);
      k.box(0.3, 3, 0.35, 6.6, 1.8, k.all(k.body), undefined, x);
      k.add(profile((s) => {
        s.moveTo(6.4, 5.05);
        s.lineTo(3, 8.1);
        s.lineTo(3.8, 8.1);
        s.lineTo(8.4, 5.05);
      }, 0.3).translate(x, 0, 0), [k.body, k.body]);
    }
    // a white roundel on each door, for the rally number
    for (const x of [-(w / 2 + 0.04), w / 2 + 0.04]) k.add(drum(1.3, 0.1, 'x', x, 3.3, -0.6, 14), [white, white, white]);
    // the nose: a wide flat grille with a thin chrome frame, four round headlamps across it, two big spotlights before
    // it at night or in the evening
    k.front(w - 0.8, 1.9, 0.3, 3.6, front - 0.05, k.all(k.chrome));
    k.front(w - 1.2, 1.5, 0.3, 3.6, front - 0.12, k.all(black));
    for (const x of [-4.4, -2.4, 2.4, 4.4]) {
      k.add(drum(0.82, 0.3, 'z', x, 3.6, front - 0.25 - k.noseZ, 14), [k.chrome, k.chrome, k.chrome], k.nose);
      k.add(drum(0.66, 0.12, 'z', x, 3.6, front - 0.42 - k.noseZ, 14), [k.lamp, k.lamp, k.lamp], k.nose);
    }
    if (k.floodlights) for (const x of [-1.25, 1.25]) {
      k.add(drum(1.05, 0.9, 'z', x, 2.7, front - 0.95 - k.noseZ, 14), [black, black, black], k.nose);
      k.add(drum(0.88, 0.15, 'z', x, 2.7, front - 1.45 - k.noseZ, 14), [k.lamp, k.lamp, k.lamp], k.nose);
      k.front(0.4, 1, 0.4, 1.9, front - 0.7, k.all(black), x); // its stalk
    }
    k.front(w - 2, 0.5, 1, 1.5, front + 0.2, k.all(black)); // the sump guard under the nose
    // the tail: no bumper, the number plate, the boot lock
    k.box(3.4, 1, 0.12, 3.2, back + 0.05, k.all(white));
    k.box(0.5, 0.3, 0.2, 4.1, back + 0.08, k.all(k.chrome));
    // mud flaps behind the wheels
    for (const z of [-5.6, 10.2]) for (const x of [-(w / 2 - 1), w / 2 - 1]) k.box(1.8, 1.5, 0.2, 1.2, z, k.all(black), undefined, x);
    return {
      axles: [-8.4, 7.6],
      wheel: { radius: 2.1, width: 2.1, half: w / 2 - 1.25, rim: '#c4c8ce' },
      tail: { z: back + 0.05, y: 4.1, x: w / 2 - 1.3, w: 2, h: 0.9 },
    };
  },

  /**
   * BERLINA 1600, after the Alpine A110 that won the first world rally championship in 1973: tiny and very low, the
   * engine in the tail, a long rounded nose falling to four round lamps (two in the wings, two in the nose), a steeply
   * raked screen, a fastback sloping to a short tail with louvres over the engine, fat flares, no bumpers. Its own
   * paint: French blue.
   */
  alpine(k) {
    const w = 11.2;
    const front = -13;
    const back = 13;
    const black = k.paint(0x16171b);
    const white = k.paint(0xf4f4f0);
    // the body: the nose low and round, rising to the screen; the tail falling from the fastback to a short square end
    k.add(profile((s) => {
      s.moveTo(front + 1, 1.3);
      s.lineTo(back - 0.6, 1.3);
      s.lineTo(back, 2);
      s.lineTo(back, 4.1);
      s.quadraticCurveTo(back - 0.2, 4.6, back - 1, 4.65);
      s.lineTo(8.4, 4.95);
      s.lineTo(-3.8, 4.95);
      s.quadraticCurveTo(-9, 4.5, front + 0.6, 3.3);
      s.quadraticCurveTo(front - 0.1, 2.8, front, 2.1);
      s.quadraticCurveTo(front + 0.1, 1.4, front + 1, 1.3);
    }, w, 0.8), [k.pods, k.body]);
    // the wings over the front wheels, standing a little proud of the bonnet, each ending in its headlamp fairing
    for (const x of [-(w / 2 - 1.3), w / 2 - 1.3]) {
      k.add(profile((s) => {
        s.moveTo(front + 0.7, 3.2);
        s.quadraticCurveTo(-10, 5, -6.5, 5.2);
        s.quadraticCurveTo(-4.6, 5.2, -3.6, 4.9);
        s.lineTo(-3.6, 4.4);
        s.lineTo(front + 0.7, 2.6);
      }, 2.6, 0.5).translate(x, 0, 0), [k.body, k.body]);
    }
    // the glasshouse: a steep screen, a short roof, the fastback's side windows
    k.add(profile((s) => {
      s.moveTo(-3.9, 4.9);
      s.lineTo(-0.9, 7.5);
      s.lineTo(3, 7.5);
      s.lineTo(7.6, 4.9);
    }, w - 2.2), [k.glass, k.glass]);
    // the roof and the fastback, in the body colour: a small back window set in it
    k.add(profile((s) => {
      s.moveTo(-1.1, 7.35);
      s.lineTo(3.2, 7.35);
      s.lineTo(9.2, 4.9);
      s.lineTo(9.8, 4.9);
      s.lineTo(3.4, 7.85);
      s.lineTo(-0.8, 7.85);
    }, w - 1.9, 0.3, 2), [k.body, k.body]);
    k.add(profile((s) => {
      s.moveTo(4.2, 7.5);
      s.lineTo(7.4, 6.2);
      s.lineTo(7.5, 6.35);
      s.lineTo(4.3, 7.65);
    }, w - 4.6), [k.glass, k.glass]);
    // the screen's pillars
    for (const x of [-(w - 2.2) / 2, (w - 2.2) / 2]) {
      k.add(profile((s) => {
        s.moveTo(-4.1, 4.9);
        s.lineTo(-1.1, 7.5);
        s.lineTo(-0.7, 7.5);
        s.lineTo(-3.6, 4.9);
      }, 0.3).translate(x, 0, 0), [k.body, k.body]);
    }
    // louvres over the engine, in the driver's colour (yours gold)
    for (let i = 0; i < 4; i++) k.box(w - 4.6, 0.12, 0.45, 4.92 - i * 0.07, 9.6 + i * 0.75, k.all(k.scoop));
    // fat flares over all four wheels
    for (const z of [-8.3, 8]) for (const x of [-(w / 2 + 0.1), w / 2 + 0.1]) {
      k.add(profile((s) => {
        s.moveTo(z - 3.3, 1.9);
        s.quadraticCurveTo(z - 3.1, 5.4, z, 5.5);
        s.quadraticCurveTo(z + 3.1, 5.4, z + 3.3, 1.9);
        s.lineTo(z + 2.7, 1.9);
        s.quadraticCurveTo(z + 2.6, 4.9, z, 5);
        s.quadraticCurveTo(z - 2.6, 4.9, z - 2.7, 1.9);
      }, 1, 0.3).translate(x, 0, 0), [k.body, k.body]);
    }
    // a white roundel on each door, for the rally number
    for (const x of [-(w / 2 + 0.04), w / 2 + 0.04]) k.add(drum(1.25, 0.1, 'x', x, 3.2, 0.2, 14), [white, white, white]);
    // the nose: two lamps in the wings' fairings, two set into the nose between them, a small black intake below
    for (const x of [-(w / 2 - 1.3), w / 2 - 1.3]) {
      // (each in a pod of the wing, standing out in front of it: the bodywork never cuts into the lamp)
      k.add(drum(1.1, 1.6, 'z', x, 3.05, front + 0.8 - k.noseZ, 14), [k.body, k.body, k.body], k.nose);
      k.add(drum(0.95, 0.4, 'z', x, 3.05, front - 0.1 - k.noseZ, 14), [k.chrome, k.chrome, k.chrome], k.nose);
      k.add(drum(0.8, 0.15, 'z', x, 3.05, front - 0.33 - k.noseZ, 14), [k.lamp, k.lamp, k.lamp], k.nose);
    }
    for (const x of [-1.55, 1.55]) {
      k.add(drum(0.85, 0.5, 'z', x, 2.55, front - 0.25 - k.noseZ, 14), [k.chrome, k.chrome, k.chrome], k.nose);
      k.add(drum(0.7, 0.15, 'z', x, 2.55, front - 0.55 - k.noseZ, 14), [k.lamp, k.lamp, k.lamp], k.nose);
    }
    k.front(4.4, 0.6, 0.3, 1.6, front + 0.1, k.all(black));
    // the tail: a black panel across it, the number plate
    k.box(w - 2.4, 1.3, 0.15, 3, back + 0.03, k.all(black));
    k.box(3.2, 0.9, 0.12, 3, back + 0.12, k.all(white));
    // mud flaps behind the wheels
    for (const z of [-4.8, 11.4]) for (const x of [-(w / 2 - 1), w / 2 - 1]) k.box(1.8, 1.4, 0.2, 1.1, z, k.all(black), undefined, x);
    return {
      axles: [-8.3, 8],
      wheel: { radius: 2.1, width: 2.3, half: w / 2 - 0.8, rim: '#c4c8ce' },
      tail: { z: back + 0.08, y: 3.9, x: w / 2 - 1.6, w: 1.4, h: 1 },
    };
  },

  /**
   * BRISK 1800, after the Ford Escort RS1800 that won on gravel through the late 1970s: a plain two-door saloon, square
   * and upright, rear driven. A long flat bonnet, a square nose with a black grille and round headlamps, four big chrome
   * spotlights before it, a tall glasshouse with thick rear pillars, a flat boot, bolt-on box flares. Its own
   * paint: white, blue and light blue bands across the bonnet and along the waist; the door roundels ringed in the
   * driver's colour (yours gold).
   */
  brisk(k) {
    const w = 11;
    const front = -13.6;
    const back = 13.6;
    const black = k.paint(0x16171b);
    const white = k.paint(0xf4f4f0);
    const amber = k.paint(0xf08a1c);
    // the body: a square nose, the bonnet flat and long, the waist level to a flat boot and a square tail
    k.add(profile((s) => {
      s.moveTo(front + 0.5, 1.8);
      s.lineTo(back - 0.5, 1.8);
      s.lineTo(back, 2.4);
      s.lineTo(back, 5);
      s.lineTo(back - 0.4, 5.5);
      s.lineTo(-3.6, 5.5);
      s.lineTo(front + 0.4, 5.2);
      s.lineTo(front, 4.9);
      s.lineTo(front, 2.3);
    }, w, 0.4, 2), [k.pods, k.body]);
    // the glasshouse: an upright screen, a long flat roof, a raked back window
    k.add(profile((s) => {
      s.moveTo(-3.6, 5.45);
      s.lineTo(-0.9, 9.1);
      s.lineTo(4.6, 9.1);
      s.lineTo(7.6, 5.45);
    }, w - 1.6), [k.glass, k.glass]);
    // the roof, and the thick rear pillars falling to the boot, in the body colour
    k.add(profile((s) => {
      s.moveTo(-1.1, 9);
      s.lineTo(4.8, 9);
      s.lineTo(4.8, 9.6);
      s.lineTo(-0.8, 9.6);
    }, w - 1.3, 0.25, 2), [k.body, k.body]);
    for (const x of [-(w - 1.6) / 2, (w - 1.6) / 2]) {
      // (the screen's pillar, the door's, and the broad rear one)
      k.add(profile((s) => {
        s.moveTo(-3.8, 5.45);
        s.lineTo(-1.1, 9.1);
        s.lineTo(-0.6, 9.1);
        s.lineTo(-3.3, 5.45);
      }, 0.3).translate(x, 0, 0), [k.body, k.body]);
      k.add(profile((s) => {
        s.moveTo(1.9, 5.45);
        s.lineTo(1.9, 9.1);
        s.lineTo(2.3, 9.1);
        s.lineTo(2.3, 5.45);
      }, 0.3).translate(x, 0, 0), [k.body, k.body]);
      k.add(profile((s) => {
        s.moveTo(4.4, 9.1);
        s.lineTo(4.9, 9.1);
        s.lineTo(8.2, 5.45);
        s.lineTo(5.6, 5.45);
      }, 0.3).translate(x, 0, 0), [k.body, k.body]);
    }
    // the works colours: a blue band across the bonnet, light blue behind it, the two running on along the waist to the
    // tail (over the flares too), a thin blue line under them
    const sky = k.paint(0x2f8fd6);
    const bonnet = (z: number) => 5.15 + ((z - front - 0.35) * 0.32) / (-3.6 - front - 0.35);
    for (const [z0, z1, m] of [[-11.9, -9, k.trim], [-9, -7.5, sky]] as const) {
      k.add(profile((s) => {
        s.moveTo(z0, bonnet(z0) - 0.05);
        s.lineTo(z1, bonnet(z1) - 0.05);
        s.lineTo(z1, bonnet(z1) + 0.08);
        s.lineTo(z0, bonnet(z0) + 0.08);
      }, w - 0.8), [m, m]);
    }
    const bands = (x: number, z0: number, z1: number) => {
      k.box(0.12, 0.35, z1 - z0, 5.08, (z0 + z1) / 2, k.all(sky), undefined, x);
      k.box(0.12, 0.75, z1 - z0, 4.5, (z0 + z1) / 2, k.all(k.trim), undefined, x);
      k.box(0.12, 0.16, z1 - z0, 3.85, (z0 + z1) / 2, k.all(k.trim), undefined, x);
    };
    for (const side of [-1, 1]) {
      bands(side * (w / 2 + 0.03), front + 0.4, back - 0.4);
      for (const z of [-8.6, 7.9]) bands(side * (w / 2 + 0.63), z - 2.2, z + 2.2);
    }
    // a black panel across the tail
    k.box(w - 1.2, 1.4, 0.12, 3.6, back + 0.03, k.all(black));
    // bolt-on box flares over all four wheels
    for (const z of [-8.6, 7.9]) for (const x of [-(w / 2 + 0.1), w / 2 + 0.1]) {
      k.add(profile((s) => {
        s.moveTo(z - 3.3, 1.9);
        s.lineTo(z - 3.3, 3.6);
        s.quadraticCurveTo(z - 3.2, 5.35, z - 1.6, 5.4);
        s.lineTo(z + 1.6, 5.4);
        s.quadraticCurveTo(z + 3.2, 5.35, z + 3.3, 3.6);
        s.lineTo(z + 3.3, 1.9);
        s.lineTo(z + 2.75, 1.9);
        s.lineTo(z + 2.75, 3.5);
        s.quadraticCurveTo(z + 2.7, 4.9, z + 1.4, 4.95);
        s.lineTo(z - 1.4, 4.95);
        s.quadraticCurveTo(z - 2.7, 4.9, z - 2.75, 3.5);
        s.lineTo(z - 2.75, 1.9);
      }, 1, 0.2, 4).translate(x, 0, 0), [k.body, k.body]);
    }
    // a white roundel on each door, for the rally number, ringed in the driver's colour (yours gold)
    for (const x of [-(w / 2 + 0.06), w / 2 + 0.06]) {
      k.add(drum(1.55, 0.08, 'x', x, 3.3, -0.6, 14), [k.scoop, k.scoop, k.scoop]);
      k.add(drum(1.3, 0.1, 'x', x + Math.sign(x) * 0.03, 3.3, -0.6, 14), [white, white, white]);
    }
    // the nose: a black grille across it, a round headlamp in a chrome ring at each end, at night or in the evening
    // two big chrome spotlights standing before the grille and two more below the slim black bumper, amber indicators at its corners
    k.front(w - 1.4, 2, 0.2, 4.05, front - 0.05, k.all(black));
    const lamp = (x: number, y: number, z: number, r: number, depth: number, shell: THREE.Material) => {
      k.add(drum(r, depth, 'z', x, y, z + depth / 2 - k.noseZ, 14), [shell, shell, shell], k.nose);
      k.add(drum(r - 0.15, 0.15, 'z', x, y, z - 0.05 - k.noseZ, 14), [k.lamp, k.lamp, k.lamp], k.nose);
    };
    for (const side of [-1, 1]) {
      lamp(side * (w / 2 - 1.55), 4.05, front - 0.25, 0.85, 0.2, k.chrome);
      if (k.floodlights) {
        lamp(side * 1.75, 4.05, front - 1.15, 1.05, 1, k.chrome);
        lamp(side * 1.75, 1.75, front - 1.15, 0.85, 0.9, k.chrome);
      }
      k.front(1, 0.4, 0.2, 1.9, front - 0.55, k.all(amber), side * (w / 2 - 0.6));
    }
    k.front(w + 0.2, 0.6, 0.6, 1.9, front - 0.2, k.all(black));
    // the tail: a slim black bumper, the number plate
    k.box(w + 0.2, 0.6, 0.6, 2, back + 0.2, k.all(black));
    k.box(3.2, 0.9, 0.12, 3.2, back + 0.08, k.all(white));
    // mud flaps behind the wheels
    for (const z of [-4.9, 11.6]) for (const x of [-(w / 2 - 0.9), w / 2 - 0.9]) k.box(1.8, 1.6, 0.2, 1.3, z, k.all(black), undefined, x);
    return {
      axles: [-8.6, 7.9],
      wheel: { radius: 2.1, width: 2.4, half: w / 2 - 0.75, rim: '#c4c8ce' },
      tail: { z: back + 0.05, y: 3.6, x: w / 2 - 1.3, w: 1.8, h: 1.2 },
    };
  },

  /**
   * STILETTO, after the Lancia Stratos HF, the first car built only to win rallies (world champion 1974 to 1976): tiny,
   * wide and low, the engine behind the seats. A sharp wedge nose with the front wings bulging over the wheels, a
   * wraparound visor of a screen, a short round roof with a spoiler, the louvred engine cover sloping from it to a
   * ducktail, a pod of five spotlights on the nose, yellow fog lamps in its lip. Its own paint, after its famous works
   * colours: white, the nose's lip and the sills green, green and red stripes sweeping up the bonnet and the doors,
   * gold wheels; the roof's spoiler in the driver's colour (yours gold).
   */
  stiletto(k) {
    const w = 11.6;
    const front = -12.8;
    const back = 12.8;
    const black = k.paint(0x16171b);
    const white = k.paint(0xf4f4f0);
    const red = k.paint(0xd42a2a);
    const yellow = k.paint(0xf2c21c);
    /** the bonnet's height at `z`, from the nose up to the screen */
    const nose = (z: number) => 2.9 + ((z - front - 0.6) * 1.9) / (-3.9 - front - 0.6);
    /** the engine cover's height at `z`, from the roof down to the tail */
    const deck = (z: number) => 7.4 - ((z - 3.6) * 1.5) / (back - 0.6 - 3.6);
    // the body: the wedge nose rising to the screen, the waist level past the doors, the engine cover falling from the
    // roof to a short high tail
    k.add(profile((s) => {
      s.moveTo(front + 0.6, 1.5);
      s.lineTo(back - 0.5, 1.5);
      s.lineTo(back, 2.1);
      s.lineTo(back, 5.5);
      s.lineTo(back - 0.6, deck(back - 0.6));
      s.lineTo(5.2, deck(5.2));
      s.quadraticCurveTo(3.3, 7.2, 2.6, 4.95);
      s.lineTo(-3.9, 4.8);
      s.lineTo(front + 0.6, 2.9);
      s.quadraticCurveTo(front, 2.8, front, 2.2);
      s.quadraticCurveTo(front, 1.6, front + 0.6, 1.5);
    }, w, 0.6), [k.pods, k.body]);
    // the front wings, bulging over the wheels above the bonnet
    for (const x of [-(w / 2 - 1.3), w / 2 - 1.3]) {
      k.add(profile((s) => {
        s.moveTo(front + 1.2, nose(front + 1.2) - 0.6);
        s.quadraticCurveTo(-10.6, 5.3, -7.6, 5.35);
        s.quadraticCurveTo(-5, 5.3, -3.6, 4.85);
        s.lineTo(-3.6, 4.2);
        s.lineTo(front + 1.2, 2.2);
      }, 2.6, 0.5).translate(x, 0, 0), [k.body, k.body]);
    }
    // the screen: a visor curving from the bonnet over to the roof; the side windows behind it
    k.add(profile((s) => {
      s.moveTo(-4.1, 4.75);
      s.quadraticCurveTo(-2.6, 7.5, -0.5, 7.7);
      s.lineTo(3.6, 7.7);
      s.lineTo(4.4, 7.1);
      s.lineTo(3, 4.9);
    }, w - 1.6, 0, 8), [k.glass, k.glass]);
    // the roof, rounded, in the body colour; its spoiler across the back of it
    k.add(profile((s) => {
      s.moveTo(-0.9, 7.6);
      s.lineTo(3.8, 7.6);
      s.lineTo(3.8, 8.05);
      s.quadraticCurveTo(1.4, 8.35, -0.6, 8.1);
    }, w - 1.4, 0.35, 4), [k.body, k.body]);
    k.add(profile((s) => {
      s.moveTo(3, 8.05);
      s.lineTo(4.3, 8.0);
      s.lineTo(4.5, 8.6);
      s.lineTo(3.4, 8.55);
    }, w - 2, 0.1, 2), [k.scoop, k.scoop]);
    // the door's rear pillar
    for (const x of [-(w - 1.6) / 2, (w - 1.6) / 2]) k.box(0.3, 2.6, 0.5, 6.3, 2.2, k.all(k.body), undefined, x);
    // the engine cover's works colours: a green and a red band from each side of the roof meeting in a V at the tail,
    // the louvres over it painted to match
    const onDeck = (pts: [number, number][], lift: number, m: THREE.Material) => {
      const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, z)));
      const g = new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: false }).rotateX(Math.PI / 2);
      const pos = g.getAttribute('position');
      for (let i = 0; i < pos.count; i++) pos.setY(i, pos.getY(i) + deck(pos.getZ(i)) + lift);
      g.computeVertexNormals();
      k.add(g, [m, m]);
    };
    const z0 = 4.4;
    const z1 = back - 0.6;
    for (const side of [-1, 1]) {
      onDeck([[side * 5, z0], [side * 3.5, z0], [side * 0.9, z1], [side * 2.4, z1]], 0.1, k.trim);
      onDeck([[side * 3.3, z0], [side * 2.5, z0], [side * 0, z1], [side * 0.8, z1]], 0.1, red);
    }
    // (the louvres painted through: green and red where the bands cross them, white between)
    const across = (a: number, b: number, z: number) => a + ((b - a) * (z - z0)) / (z1 - z0);
    const half = (w - 3.4) / 2;
    for (let i = 0; i < 6; i++) {
      const z = 5 + i * 1.05;
      const cuts = [0, across(2.5, 0, z), across(3.3, 0.8, z), across(3.5, 0.9, z), across(5, 2.4, z), half];
      const mats = [k.body, red, k.body, k.trim, k.body];
      for (let j = 0; j < 5; j++) {
        const a = Math.min(cuts[j], half);
        const b = Math.min(cuts[j + 1], half);
        if (b - a < 0.05) continue;
        for (const side of [-1, 1]) k.box(b - a, 0.18, 0.5, deck(z) + 0.24, z, k.all(mats[j]), undefined, side * (a + b) / 2);
      }
    }
    // the ducktail spoiler across the tail
    k.add(profile((s) => {
      s.moveTo(back - 1.8, deck(back - 1.8) - 0.1);
      s.lineTo(back + 0.2, 5.3);
      s.lineTo(back + 0.4, 6.6);
      s.lineTo(back - 0.4, deck(back - 0.4) + 0.4);
    }, w - 0.6, 0.15, 2), [black, black]);
    // round flares over all four wheels
    for (const z of [-7.6, 7.4]) for (const x of [-(w / 2 + 0.1), w / 2 + 0.1]) {
      k.add(profile((s) => {
        s.moveTo(z - 3.3, 1.8);
        s.quadraticCurveTo(z - 3.1, 5.4, z, 5.5);
        s.quadraticCurveTo(z + 3.1, 5.4, z + 3.3, 1.8);
        s.lineTo(z + 2.7, 1.8);
        s.quadraticCurveTo(z + 2.6, 4.9, z, 5);
        s.quadraticCurveTo(z - 2.6, 4.9, z - 2.7, 1.8);
      }, 1, 0.3).translate(x, 0, 0), [k.body, k.body]);
    }
    // the works colours: the sills green, and on the nose its lip
    for (const x of [-(w / 2 + 0.03), w / 2 + 0.03]) k.box(0.1, 1.2, back - front - 1.4, 2.25, 0, k.all(k.trim), undefined, x);
    k.front(w - 1, 1.1, 0.12, 2.2, front - 0.03, k.all(k.trim));
    // a green and a red stripe up each side of the bonnet, from behind the lamp pod to the screen
    for (const side of [-1, 1]) {
      for (const [x, wide, m] of [[2.1, 1.1, k.trim], [1.15, 0.5, red]] as const) {
        k.add(profile((s) => {
          s.moveTo(front + 3.8, nose(front + 3.8) - 0.05);
          s.lineTo(-4.2, nose(-4.2) - 0.05);
          s.lineTo(-4.2, nose(-4.2) + 0.08);
          s.lineTo(front + 3.8, nose(front + 3.8) + 0.08);
        }, wide).translate(side * x, 0, 0), [m, m]);
      }
      // and slanting up each door, green then red
      const sx = side * (w / 2 + 0.05);
      for (const [z0, z1, m] of [[-3.4, -2, k.trim], [-1.7, -1.1, red]] as const) {
        k.add(profile((s) => {
          s.moveTo(z0, 2.85);
          s.lineTo(z1, 2.85);
          s.lineTo(z1 + 2, 4.55);
          s.lineTo(z0 + 2, 4.55);
        }, 0.1).translate(sx, 0, 0), [m, m]);
      }
    }
    // a white roundel on each door, for the rally number
    for (const x of [-(w / 2 + 0.06), w / 2 + 0.06]) k.add(drum(1.1, 0.1, 'x', x, 3.5, 2.2, 14), [white, white, white]);
    // the nose: the black pod of five spotlights on the bonnet (night and evening rallies), a yellow fog lamp at each end of the lip
    const podZ = front + 2.4;
    const podY = nose(podZ);
    if (k.floodlights) k.add(profile((s) => {
      s.moveTo(podZ - 0.8, nose(podZ - 0.8) - 0.4);
      s.lineTo(podZ + 0.8, nose(podZ + 0.8) - 0.4);
      s.lineTo(podZ + 0.8, podY + 1.9);
      s.lineTo(podZ - 0.5, podY + 1.9);
      s.lineTo(podZ - 0.8, podY + 1.6);
    }, w - 1.8, 0.15, 2).translate(0, 0, -k.noseZ), [black, black], k.nose);
    if (k.floodlights) for (let i = 0; i < 5; i++) {
      const x = (i - 2) * 1.95;
      k.add(drum(0.82, 0.25, 'z', x, podY + 0.9, podZ - 0.9 - k.noseZ, 14), [k.chrome, k.chrome, k.chrome], k.nose);
      k.add(drum(0.68, 0.12, 'z', x, podY + 0.9, podZ - 1.06 - k.noseZ, 14), [k.lamp, k.lamp, k.lamp], k.nose);
    }
    for (const x of [-(w / 2 - 1.3), w / 2 - 1.3]) {
      k.add(drum(0.6, 0.3, 'z', x, 2.2, front - 0.1 - k.noseZ, 12), [k.chrome, k.chrome, k.chrome], k.nose);
      k.add(drum(0.48, 0.1, 'z', x, 2.2, front - 0.28 - k.noseZ, 12), [yellow, yellow, yellow], k.nose);
    }
    // the tail: a black panel, the number plate
    k.box(w - 1.6, 1.6, 0.12, 3.8, back + 0.03, k.all(black));
    k.box(3, 0.9, 0.12, 2.3, back + 0.06, k.all(white));
    // mud flaps behind the wheels
    for (const z of [-4, 11]) for (const x of [-(w / 2 - 0.9), w / 2 - 0.9]) k.box(1.8, 1.5, 0.2, 1.2, z, k.all(black), undefined, x);
    return {
      axles: [-7.6, 7.4],
      wheel: { radius: 2.15, width: 2.6, half: w / 2 - 0.85, rim: '#e8b21a' },
      tail: { z: back + 0.1, y: 4.5, x: w / 2 - 1.5, w: 1.5, h: 1.1 },
    };
  },

  /**
   * VOLTA 2000, after the Fiat 131 Abarth that won the world championship three times (1977, 1978, 1980): a plain
   * three-box saloon made fierce, square and upright with a flat bonnet and boot, big blistered flares, a spoiler on
   * the roof's edge and one on the boot, four round headlamps in a black grille and four spotlights in white covers on
   * the bumper. Its own paint, after its famous works colours: white, the sills and the bumpers' feet green, a green
   * stripe with an orange one inside it slanting up behind each door, the roof red-orange with dark stripes, a green
   * band and orange wedges on the bonnet and the boot, gold wheels; the roof's spoiler in the driver's
   * colour (yours gold).
   */
  volta(k) {
    const w = 11.4;
    const front = -14.6;
    const back = 14.6;
    const black = k.paint(0x16171b);
    const white = k.paint(0xf4f4f0);
    const orange = k.paint(0xf2662a);
    const red = k.paint(0xd8322a);
    // the body: a square nose, the bonnet flat, the waist level to a flat boot and a square tail
    k.add(profile((s) => {
      s.moveTo(front + 0.5, 1.7);
      s.lineTo(back - 0.5, 1.7);
      s.lineTo(back, 2.3);
      s.lineTo(back, 5.2);
      s.lineTo(back - 0.4, 5.6);
      s.lineTo(-4.2, 5.6);
      s.lineTo(front + 0.4, 5.35);
      s.lineTo(front, 5);
      s.lineTo(front, 2.2);
    }, w, 0.4, 2), [k.pods, k.body]);
    // the glasshouse: an upright screen, a long flat roof, a raked back window
    k.add(profile((s) => {
      s.moveTo(-4.3, 5.55);
      s.lineTo(-1.6, 9);
      s.lineTo(5, 9);
      s.lineTo(7.6, 5.55);
    }, w - 1.6), [k.glass, k.glass]);
    // the roof in the body colour, and the pillars: the screen's, the door's, the thick rear one
    k.add(profile((s) => {
      s.moveTo(-1.8, 8.9);
      s.lineTo(5.2, 8.9);
      s.lineTo(5.2, 9.5);
      s.lineTo(-1.5, 9.5);
    }, w - 1.3, 0.25, 2), [k.body, k.body]);
    for (const x of [-(w - 1.6) / 2, (w - 1.6) / 2]) {
      k.add(profile((s) => {
        s.moveTo(-4.5, 5.55);
        s.lineTo(-1.8, 9);
        s.lineTo(-1.3, 9);
        s.lineTo(-4, 5.55);
      }, 0.3).translate(x, 0, 0), [k.body, k.body]);
      k.add(profile((s) => {
        s.moveTo(1.9, 5.55);
        s.lineTo(1.9, 9);
        s.lineTo(2.3, 9);
        s.lineTo(2.3, 5.55);
      }, 0.3).translate(x, 0, 0), [k.body, k.body]);
      k.add(profile((s) => {
        s.moveTo(4.6, 9);
        s.lineTo(5.1, 9);
        s.lineTo(8.1, 5.55);
        s.lineTo(6.2, 5.55);
      }, 0.3).translate(x, 0, 0), [k.body, k.body]);
    }
    // the spoiler on the roof's back edge (in the driver's colour), and the one along the boot's tail
    k.add(profile((s) => {
      s.moveTo(4, 9.45);
      s.lineTo(5.6, 9.4);
      s.lineTo(5.9, 9.9);
      s.lineTo(4.4, 9.85);
    }, w - 1.6, 0.1, 2), [k.scoop, k.scoop]);
    k.add(profile((s) => {
      s.moveTo(back - 2, 5.6);
      s.lineTo(back - 0.2, 5.6);
      s.lineTo(back, 6.5);
      s.lineTo(back - 0.6, 6.5);
    }, w - 0.8, 0.15, 2), [k.body, k.body]);
    // big blistered flares over all four wheels
    for (const z of [-8.9, 8.3]) for (const x of [-(w / 2 + 0.1), w / 2 + 0.1]) {
      k.add(profile((s) => {
        s.moveTo(z - 3.5, 1.8);
        s.lineTo(z - 3.5, 3.6);
        s.quadraticCurveTo(z - 3.4, 5.7, z - 1.6, 5.75);
        s.lineTo(z + 1.6, 5.75);
        s.quadraticCurveTo(z + 3.4, 5.7, z + 3.5, 3.6);
        s.lineTo(z + 3.5, 1.8);
        s.lineTo(z + 2.9, 1.8);
        s.lineTo(z + 2.9, 3.6);
        s.quadraticCurveTo(z + 2.8, 5.2, z + 1.4, 5.25);
        s.lineTo(z - 1.4, 5.25);
        s.quadraticCurveTo(z - 2.8, 5.2, z - 2.9, 3.6);
        s.lineTo(z - 2.9, 1.8);
      }, 1, 0.25, 4).translate(x, 0, 0), [k.body, k.body]);
    }
    // the works colours: the sills green, and a green stripe slanting up behind each door with an orange one inside it
    for (const side of [-1, 1]) {
      const x = side * (w / 2 + 0.03);
      k.box(0.1, 1, back - front - 1.4, 2.3, 0, k.all(k.trim), undefined, x);
      for (const [z0, z1, m] of [[0.4, 2.6, k.trim], [-0.3, 0.3, orange]] as const) {
        k.add(profile((s) => {
          s.moveTo(z0, 2.8);
          s.lineTo(z1, 2.8);
          s.lineTo(z1 + 2.8, 5.5);
          s.lineTo(z0 + 2.8, 5.5);
        }, 0.1).translate(side * (w / 2 + 0.05), 0, 0), [m, m]);
      }
    }
    // on top, the works colours again: the roof red-orange with two dark green stripes down its middle; a green band
    // across the bonnet's back with an orange wedge at each end, and a bonnet scoop; the band and wedges again on the boot
    const flat = (pts: [number, number][], y: (z: number) => number, m: THREE.Material) => {
      const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, z)));
      const g = new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: false }).rotateX(Math.PI / 2);
      const pos = g.getAttribute('position');
      for (let n = 0; n < pos.count; n++) pos.setY(n, pos.getY(n) + y(pos.getZ(n)));
      g.computeVertexNormals();
      k.add(g, [m, m]);
    };
    const roof = () => 9.58;
    const bonnet = (z: number) => 5.35 + ((z - front - 0.4) * 0.25) / (-4.2 - front - 0.4) + 0.08;
    const rw = (w - 1.9) / 2;
    flat([[-rw, -1.3], [rw, -1.3], [rw, 5], [-rw, 5]], roof, orange);
    for (const x of [-0.45, 0.45]) flat([[x - 0.18, -1.3], [x + 0.18, -1.3], [x + 0.18, 5], [x - 0.18, 5]], () => 9.62, k.trim);
    const bw = w / 2 - 0.5;
    flat([[-bw, -11.8], [bw, -11.8], [bw, -4.5], [-bw, -4.5]], bonnet, k.trim);
    for (const side of [-1, 1]) {
      flat([[side * bw, -11.4], [side * bw, -4.7], [side * 1.4, -4.7]], (z) => bonnet(z) + 0.04, orange);
    }
    // the same on the boot, the wedges mirrored toward the back window
    flat([[-bw, 8], [bw, 8], [bw, back - 2.1], [-bw, back - 2.1]], () => 5.68, k.trim);
    for (const side of [-1, 1]) flat([[side * bw, 8.2], [side * bw, back - 2.3], [side * 1.7, 8.2]], () => 5.72, orange);
    k.add(profile((s) => {
      s.moveTo(-7.4, bonnet(-7.4) - 0.1);
      s.lineTo(-4.6, bonnet(-4.6) - 0.1);
      s.lineTo(-4.6, bonnet(-4.6) + 0.55);
      s.lineTo(-6.4, bonnet(-6.4) + 0.55);
    }, 2.6, 0.12, 2), [k.body, k.body]);
    // a white roundel on each front door, for the rally number
    for (const x of [-(w / 2 + 0.06), w / 2 + 0.06]) k.add(drum(1.2, 0.1, 'x', x, 3.8, -2.6, 14), [white, white, white]);
    // the nose: a black grille across it with two round headlamps in chrome rings at each end, a bumper with a green
    // foot, four spotlights in white covers standing on it (on a night or evening rally)
    k.front(w - 1.2, 1.9, 0.2, 4.25, front - 0.05, k.all(black));
    const lamp = (x: number, y: number, z: number, r: number, depth: number, shell: THREE.Material, lens: THREE.Material) => {
      k.add(drum(r, depth, 'z', x, y, z + depth / 2 - k.noseZ, 14), [shell, shell, shell], k.nose);
      k.add(drum(r - 0.12, 0.12, 'z', x, y, z - 0.04 - k.noseZ, 14), [lens, lens, lens], k.nose);
    };
    for (const side of [-1, 1]) {
      for (const x of [w / 2 - 1.4, w / 2 - 3.05]) lamp(side * x, 4.3, front - 0.2, 0.7, 0.2, k.chrome, k.lamp);
      if (k.floodlights) for (const x of [1.25, 3.7]) lamp(side * x, 3.05, front - 1.1, 0.8, 0.6, black, white);
    }
    k.front(w + 0.2, 0.5, 0.8, 2.45, front - 0.3, k.all(black));
    k.front(w, 0.8, 0.7, 1.8, front - 0.25, k.all(k.trim));
    // the tail: big tail-lamp clusters either side of a black panel, a black bumper, the number plate
    k.box(w - 1.4, 1.3, 0.12, 4.2, back + 0.03, k.all(black));
    k.box(w + 0.2, 0.6, 0.6, 2.2, back + 0.2, k.all(black));
    k.box(3, 0.9, 0.12, 3.1, back + 0.1, k.all(white));
    for (const x of [-(w / 2 - 1.5), w / 2 - 1.5]) k.box(2.4, 1.3, 0.15, 4.2, back + 0.06, k.all(red), undefined, x);
    // mud flaps behind the wheels
    for (const z of [-5.1, 11.9]) for (const x of [-(w / 2 - 0.9), w / 2 - 0.9]) k.box(1.8, 1.6, 0.2, 1.3, z, k.all(black), undefined, x);
    return {
      axles: [-8.9, 8.3],
      wheel: { radius: 2.2, width: 2.6, half: w / 2 - 0.85, rim: '#d8a628' },
      tail: { z: back + 0.12, y: 4.2, x: w / 2 - 1.5, w: 2.2, h: 1.1 },
    };
  },

  /**
   * RAIA 400, after the Opel Manta 400, the last rear-driven car to win in the four-wheel-drive Group B years: a long
   * low coupe, a sloping nose with a black slatted grille, a bulge on the long bonnet, a short
   * cabin, a sloping back window to a short boot with a lip spoiler, big bulging arches, a ducktail, a deep air dam, twin round
   * headlamps each side. Its own paint, after a famous privateer's: yellow, the lower body and the air dam blue, a red
   * band edged in white between them, a white roof, white wheels; the boot's spoiler in the driver's colour (yours
   * gold).
   */
  raia(k) {
    const w = 11.6;
    const front = -15.1;
    const back = 15.1;
    const black = k.paint(0x16171b);
    const white = k.paint(0xf4f4f0);
    const red = k.paint(0xc8202a);
    /** the bonnet's height at `z`, falling from the screen to the nose */
    const bonnet = (z: number) => 4.5 + ((z - front - 0.6) * 1) / (-4.4 - front - 0.6);
    // the body: a square nose under the bonnet's lip, the long bonnet rising to the screen, the waist level to the
    // boot, its ducktail rising at the tail
    k.add(profile((s) => {
      s.moveTo(front + 0.6, 1.6);
      s.lineTo(back - 0.5, 1.6);
      s.lineTo(back, 2.3);
      s.lineTo(back, 6.2);
      s.lineTo(back - 0.3, 6.6);
      s.lineTo(back - 2.2, 6.0);
      s.lineTo(9, 5.85);
      s.lineTo(-4.6, 5.45);
      s.lineTo(front + 0.9, 4.65);
      s.quadraticCurveTo(front - 0.1, 4.6, front, 4.1);
      s.lineTo(front, 2.2);
    }, w, 0.45, 2), [k.pods, k.body]);
    // the bonnet's bulge
    k.add(profile((s) => {
      s.moveTo(-12.6, bonnet(-12.6) - 0.2);
      s.lineTo(-4.6, bonnet(-4.6) - 0.2);
      s.lineTo(-4.6, bonnet(-4.6) + 0.45);
      s.lineTo(-10.6, bonnet(-10.6) + 0.45);
    }, 4.2, 0.2, 2), [k.body, k.body]);
    // the glasshouse: a raked screen, a flat roof, the long back window sloping to the boot
    k.add(profile((s) => {
      s.moveTo(-4.7, 5.4);
      s.lineTo(-1.6, 8.7);
      s.lineTo(3.4, 8.7);
      s.lineTo(9.2, 5.85);
      s.lineTo(4, 5.6);
    }, w - 1.6), [k.glass, k.glass]);
    // the roof (white) and the pillars: the screen's, and the broad rear one sloping with the back window
    k.add(profile((s) => {
      s.moveTo(-1.8, 8.6);
      s.lineTo(3.6, 8.6);
      s.lineTo(3.6, 9.15);
      s.lineTo(-1.5, 9.15);
    }, w - 1.3, 0.25, 2), [white, white]);
    for (const x of [-(w - 1.6) / 2, (w - 1.6) / 2]) {
      k.add(profile((s) => {
        s.moveTo(-4.9, 5.4);
        s.lineTo(-1.8, 8.7);
        s.lineTo(-1.3, 8.7);
        s.lineTo(-4.4, 5.4);
      }, 0.3).translate(x, 0, 0), [k.body, k.body]);
      k.add(profile((s) => {
        s.moveTo(2.2, 8.7);
        s.lineTo(3.6, 8.7);
        s.lineTo(9.4, 5.85);
        s.lineTo(6.6, 5.65);
      }, 0.3).translate(x, 0, 0), [k.body, k.body]);
      // (the door's pillar)
      k.box(0.3, 3.3, 0.4, 7.05, 1.4, k.all(k.body), undefined, x);
    }
    // a lip along the ducktail's edge, in the driver's colour (yours gold)
    k.box(w - 1.2, 0.2, 0.5, 6.68, back - 0.3, k.all(k.scoop));
    // bulging arches over all four wheels, blended into the sides: each a solid blister with the wheel's opening
    const R = 2.9;
    const hubY = 2.25;
    const reach = 4.3;
    for (const z of [-9.2, 8.2]) for (const x of [-(w / 2 + 0.05), w / 2 + 0.05]) {
      k.add(profile((s) => {
        const a = Math.asin((hubY - 1.8) / R);
        s.moveTo(z - reach, 1.8);
        s.lineTo(z - reach, 3.9);
        s.quadraticCurveTo(z - reach + 0.2, 5.75, z - 2.2, 5.8);
        s.lineTo(z + 2.2, 5.8);
        s.quadraticCurveTo(z + reach - 0.2, 5.75, z + reach, 3.9);
        s.lineTo(z + reach, 1.8);
        s.absarc(z, hubY, R, -a, Math.PI + a, false);
      }, 1.1, 0.3, 10).translate(x, 0, 0), [k.body, k.body]);
    }
    // the colours: the lower body blue, a red band over it edged in white, along the sides and over the flares
    const bands = (x: number, z0: number, z1: number) => {
      const l = z1 - z0;
      const z = (z0 + z1) / 2;
      k.box(0.1, 1.4, l, 2.4, z, k.all(k.trim), undefined, x);
      k.box(0.1, 0.16, l, 3.18, z, k.all(white), undefined, x);
      k.box(0.1, 0.7, l, 3.6, z, k.all(red), undefined, x);
      k.box(0.1, 0.16, l, 4.03, z, k.all(white), undefined, x);
    };
    for (const side of [-1, 1]) {
      bands(side * (w / 2 + 0.03), front + 0.6, back - 0.5);
      for (const z of [-9.2, 8.2]) {
        // (on each arch, either side of its opening)
        const x = side * (w / 2 + 0.63);
        k.box(0.1, 1.4, reach - R, 2.4, z - (reach + R) / 2, k.all(k.trim), undefined, x);
        k.box(0.1, 1.4, reach - R, 2.4, z + (reach + R) / 2, k.all(k.trim), undefined, x);
        for (const [y, h, m] of [[3.18, 0.16, white], [3.6, 0.7, red], [4.03, 0.16, white]] as const) {
          const open = Math.sqrt(R * R - (y - h / 2 - hubY) ** 2);
          k.box(0.1, h, reach - open, y, z - (reach + open) / 2, k.all(m), undefined, x);
          k.box(0.1, h, reach - open, y, z + (reach + open) / 2, k.all(m), undefined, x);
        }
      }
    }
    // a white roundel on each door, for the rally number
    for (const x of [-(w / 2 + 0.06), w / 2 + 0.06]) k.add(drum(1.25, 0.1, 'x', x, 3.6, -1.4, 14), [white, white, white]);
    // black vent slats on the bonnet's bulge
    for (const z of [-8.4, -7.7, -7]) k.box(3.4, 0.12, 0.3, bonnet(z) + 0.48, z, k.all(black));
    // the nose, all its lamps in a row high up: twin round headlamps set into the nose at each end, four round
    // spotlights between them (night and evening rallies), amber indicators under the headlamps; the grille a low
    // black slot in the blue air dam beneath, with a red and white stripe across the dam
    const amber = k.paint(0xf29a1a);
    for (const side of [-1, 1]) {
      for (const x of [w / 2 - 1.15, w / 2 - 2.6]) {
        k.add(drum(0.72, 0.14, 'z', side * x, 3.5, front - 0.03 - k.noseZ, 14), [black, black, black], k.nose);
        k.add(drum(0.56, 0.1, 'z', side * x, 3.5, front - 0.1 - k.noseZ, 14), [k.lamp, k.lamp, k.lamp], k.nose);
      }
      if (k.floodlights) for (const x of [0.72, 2.0]) {
        k.add(drum(0.6, 0.4, 'z', side * x, 3.5, front - 0.3 - k.noseZ, 14), [k.chrome, k.chrome, k.chrome], k.nose);
        k.add(drum(0.48, 0.12, 'z', side * x, 3.5, front - 0.52 - k.noseZ, 14), [k.lamp, k.lamp, k.lamp], k.nose);
      }
      k.front(1.2, 0.36, 0.1, 2.78, front - 0.05, k.all(amber), side * (w / 2 - 1.5));
    }
    k.front(w + 0.2, 1, 1, 2.1, front - 0.3, k.all(k.trim));
    k.front(w + 0.2, 0.12, 0.12, 2.52, front - 0.84, k.all(white));
    k.front(w + 0.2, 0.22, 0.12, 2.34, front - 0.84, k.all(red));
    k.front(6.4, 0.38, 0.12, 1.86, front - 0.84, k.all(black));
    // the tail: a black panel with red lamps at its ends, the number plate
    k.box(w - 1.2, 1.3, 0.12, 4.4, back + 0.03, k.all(black));
    for (const x of [-(w / 2 - 1.6), w / 2 - 1.6]) k.box(2.4, 1.1, 0.15, 4.4, back + 0.06, k.all(red), undefined, x);
    k.box(w + 0.2, 0.7, 0.6, 2.3, back + 0.2, k.all(black));
    k.box(3, 0.9, 0.12, 3.3, back + 0.1, k.all(white));
    // mud flaps behind the wheels
    for (const z of [-5.3, 12]) for (const x of [-(w / 2 - 0.9), w / 2 - 0.9]) k.box(1.8, 1.6, 0.2, 1.3, z, k.all(black), undefined, x);
    return {
      axles: [-9.2, 8.2],
      wheel: { radius: 2.25, width: 2.7, half: w / 2 - 0.85, rim: '#f0f0ee' },
      tail: { z: back + 0.1, y: 4.4, x: w / 2 - 1.6, w: 2.2, h: 1 },
    };
  },

  /**
   * SAETTA 037, 1980s: the last rear-drive car to win the title. Low and wide, a short sloping nose with twin round
   * headlamps each side of a split grille, a screen curving into a short roof, a long louvred engine deck ending in a
   * wide spoiler grown out of the rear wings; white, with dark blue, light blue and red stripes down the bonnet and along the sides.
   */
  saetta(k) {
    const w = 12;
    const front = -13.4;
    const back = 13.4;
    const black = k.paint(0x16171b);
    const red = k.paint(0xd42a2a);
    const light = k.paint(0x3a9ad9);
    const amber = k.paint(0xf29a1a);
    /** the bonnet's height at `z`, from the nose up to the screen */
    const nose = (z: number) => 4.8 + ((z - front - 0.6) * 0.3) / (-4.2 - front - 0.6);
    /** the engine deck's height at `z`, from the roof down to the tail */
    const deck = (z: number) => 7.2 - ((z - 3.4) * 1.5) / (back - 0.6 - 3.4);
    // the body: the low nose rising to the screen, the waist level past the doors, the long deck falling to the tail
    k.add(profile((s) => {
      s.moveTo(front + 0.6, 1.5);
      s.lineTo(back - 0.5, 1.5);
      s.lineTo(back, 2.1);
      s.lineTo(back, 5.4);
      s.lineTo(back - 0.6, deck(back - 0.6));
      s.lineTo(4.2, deck(4.2));
      s.quadraticCurveTo(3, 7.2, 2.4, 5.1);
      s.lineTo(-4.2, 5.1);
      s.lineTo(front + 0.6, 4.8);
      s.quadraticCurveTo(front, 4.75, front, 4.2);
      s.lineTo(front, 2.1);
      s.quadraticCurveTo(front, 1.6, front + 0.6, 1.5);
    }, w, 0.6), [k.pods, k.body]);
    // the screen curving up into the roof; the side windows behind it
    k.add(profile((s) => {
      s.moveTo(-4.4, 5.05);
      s.quadraticCurveTo(-2.6, 7.3, -0.6, 7.5);
      s.lineTo(3, 7.5);
      s.lineTo(3.8, 6.9);
      s.lineTo(2.6, 5);
    }, w - 1.8, 0, 8), [k.glass, k.glass]);
    k.add(profile((s) => {
      s.moveTo(-0.9, 7.4);
      s.lineTo(3.2, 7.4);
      s.lineTo(3.2, 7.85);
      s.quadraticCurveTo(1.2, 8.1, -0.6, 7.9);
    }, w - 1.6, 0.35, 4), [k.body, k.body]);
    for (const x of [-(w - 1.8) / 2, (w - 1.8) / 2]) k.box(0.3, 2.4, 0.5, 6.2, 1.9, k.all(k.body), undefined, x);
    // black louvres across the engine deck
    for (let i = 0; i < 5; i++) {
      const z = 5.4 + i * 0.9;
      k.box(w - 4.4, 0.16, 0.4, deck(z) + 0.1, z, k.all(black));
    }
    // the spoiler: a wide blade across the tail, growing out of the rear wings on each side, its lip in the
    // driver's colour (yours gold)
    k.add(profile((s) => {
      s.moveTo(back - 4.2, deck(back - 4.2) + 0.1);
      s.lineTo(back + 0.3, 7.75);
      s.lineTo(back + 0.3, 8.15);
      s.lineTo(back - 1.2, 8.1);
      s.lineTo(back - 4.2, deck(back - 4.2) + 0.45);
    }, w + 0.4, 0.1, 2), [k.body, k.body]);
    for (const x of [-(w / 2 - 0.05), w / 2 - 0.05]) {
      k.add(profile((s) => {
        s.moveTo(back - 5.4, deck(back - 5.4) - 0.6);
        s.lineTo(back - 0.4, 5.2);
        s.lineTo(back + 0.3, 5.6);
        s.lineTo(back + 0.3, 8.15);
        s.lineTo(back - 1.4, 8.1);
      }, 0.6, 0.2, 4).translate(x, 0, 0), [k.body, k.body]);
    }
    k.box(w + 0.4, 0.18, 0.25, 8.2, back + 0.2, k.all(k.scoop));
    // blistered arches over all four wheels, each a solid bulge with the wheel's opening
    const R = 2.85;
    const hubY = 2.2;
    const reach = 4.1;
    const axles = [-8.2, 8.4];
    for (const z of axles) for (const x of [-(w / 2 - 0.35), w / 2 - 0.35]) {
      const top = z < 0 ? 5.15 : 5.55;
      k.add(profile((s) => {
        const a = Math.asin((hubY - 1.8) / R);
        s.moveTo(z - reach, 1.8);
        s.lineTo(z - reach, 4.4);
        s.quadraticCurveTo(z - reach + 0.2, top - 0.05, z - 2.2, top);
        s.lineTo(z + 2.2, top);
        s.quadraticCurveTo(z + reach - 0.2, top - 0.05, z + reach, 4.4);
        s.lineTo(z + reach, 1.8);
        s.absarc(z, hubY, R, -a, Math.PI + a, false);
      }, 1.2, 0.2, 8).translate(x, 0, 0), [k.body, k.body]);
    }
    // the stripes along each side: red over dark blue over light blue, on the body and over the arches
    const stripes = [[3.95, 0.6, red], [3.3, 0.4, k.trim], [2.85, 0.3, light]] as const;
    for (const side of [-1, 1]) {
      const bx = side * (w / 2 + 0.03);
      for (const [y, h, m] of stripes) k.box(0.1, h, axles[1] - axles[0] - 2 * reach, y, (axles[0] + axles[1]) / 2, k.all(m), undefined, bx);
      for (const z of axles) {
        const x = side * (w / 2 + 0.29);
        for (const [y, h, m] of stripes) {
          const open = Math.sqrt(Math.max(0, R * R - (y - h / 2 - hubY) ** 2));
          k.box(0.1, h, reach - open, y, z - (reach + open) / 2, k.all(m), undefined, x);
          k.box(0.1, h, reach - open, y, z + (reach + open) / 2, k.all(m), undefined, x);
        }
      }
    }
    // and back along the outer edges of the bonnet from behind the headlamps to the screen
    const flat = (pts: [number, number][], m: THREE.Material) => {
      const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, z)));
      const g = new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: false }).rotateX(Math.PI / 2);
      const pos = g.getAttribute('position');
      for (let n = 0; n < pos.count; n++) pos.setY(n, pos.getY(n) + nose(pos.getZ(n)) + 0.08);
      g.computeVertexNormals();
      k.add(g, [m, m]);
    };
    for (const side of [-1, 1]) {
      for (const [a, b, m] of [[3.1, 3.45, light], [3.6, 3.95, k.trim], [4.1, 4.85, red]] as const) {
        flat([[side * a, front + 2.2], [side * b, front + 2.2], [side * b, -4.6], [side * a, -4.6]], m);
      }
    }
    // three black vents across the bonnet in front of the screen
    for (const x of [-2.6, 0, 2.6]) k.box(1.9, 0.12, 0.35, nose(-5.4) + 0.08, -5.4, k.all(black), undefined, x);
    // the nose: twin round headlamps in chrome rings at each end, a grille of two black openings between them,
    // a wide black intake under it, amber indicators and small vents under the headlamps
    for (const side of [-1, 1]) {
      for (const x of [w / 2 - 1.25, w / 2 - 2.7]) {
        k.add(drum(0.7, 0.2, 'z', side * x, 3.4, front - 0.05 - k.noseZ, 14), [k.chrome, k.chrome, k.chrome], k.nose);
        k.add(drum(0.58, 0.1, 'z', side * x, 3.4, front - 0.18 - k.noseZ, 14), [k.lamp, k.lamp, k.lamp], k.nose);
      }
      k.front(1.65, 0.8, 0.1, 3.4, front - 0.04, k.all(black), side * 1);
      k.front(0.9, 0.4, 0.1, 2.3, front - 0.04, k.all(amber), side * (w / 2 - 1.3));
      k.front(0.8, 0.3, 0.1, 2.3, front - 0.04, k.all(black), side * (w / 2 - 2.5));
    }
    k.front(5.4, 0.8, 0.1, 2.4, front - 0.04, k.all(black));
    k.front(w - 0.6, 0.18, 0.4, 1.5, front + 0.1, k.all(black));
    // the tail: a wide black panel with a big round lamp at each end; under it the white bumper with rows of
    // black vent slots either side of a black number plate, twin exhausts below; pale mud flaps
    const lamp = k.paint(0xe2481e);
    k.box(w - 1, 1.7, 0.12, 4.5, back + 0.03, k.all(black));
    for (const x of [-(w / 2 - 1.3), w / 2 - 1.3]) k.add(drum(0.75, 0.25, 'z', x, 4.5, back + 0.12, 14), [lamp, lamp, lamp]);
    for (const side of [-1, 1]) for (let i = 0; i < 7; i++) {
      k.box(0.16, 1, 0.1, 2.85, back + 0.03, k.all(black), undefined, side * (1.9 + i * 0.5));
    }
    k.box(2.8, 0.8, 0.1, 2.9, back + 0.05, k.all(black));
    for (const x of [0.9, 1.5]) k.add(drum(0.25, 0.8, 'z', x, 1.75, back + 0.1, 8), [k.chrome, k.chrome, k.dark]);
    const flap = k.paint(0xd8cfae);
    for (const z of [-3.8, 12.7]) for (const x of [-(w / 2 - 0.9), w / 2 - 0.9]) k.box(1.8, 1.5, 0.2, 1.2, z, k.all(flap), undefined, x);
    return {
      axles: [axles[0], axles[1]],
      wheel: { radius: 2.2, width: 2.7, half: w / 2 - 1.2, rim: '#c9ccd1' },
      tail: { z: back + 0.1, y: 4.5, x: w / 2 - 1.3, w: 1.5, h: 1.5 },
      exhaust: { x: 1.2, y: 1.75, z: back + 0.5 },
    };
  },

  /**
   * QUADRA S1, 1980s: the four-wheel-drive coupe that changed rallying, in its last short, winged form. Upright and
   * square, a short wheelbase, a deep wedge of a chin under a cluster of round lamps, a tall cabin, square arches,
   * radiators moved into a tall tail under a huge wing; white over yellow, a black swoosh over the front wings.
   */
  quadra(k) {
    const w = 12.4;
    const front = -14.2;
    const back = 13.8;
    const black = k.paint(0x16171b);
    const red = k.paint(0xc8202a);
    const amber = k.paint(0xf29a1a);
    const yellow = k.paint(0xf2c21c);
    const orange = k.paint(0xf05a28);
    const brown = k.paint(0x4a3a34);
    const mesh = k.paint(0x9a9ea4);
    /** the bonnet's height at `z`, from the nose up to the screen */
    const bonnet = (z: number) => 4.9 + ((z - front - 0.5) * 0.5) / (-4.3 - front - 0.5);
    // the body: a square nose, the bonnet rising gently to the screen, the waist level to the tail
    k.add(profile((s) => {
      s.moveTo(front + 0.5, 1.5);
      s.lineTo(back - 0.4, 1.5);
      s.lineTo(back, 2.1);
      s.lineTo(back, 5.9);
      s.lineTo(back - 0.4, 6.2);
      s.lineTo(7.2, 6.1);
      s.lineTo(-4.3, 5.4);
      s.lineTo(front + 0.5, 4.9);
      s.quadraticCurveTo(front, 4.85, front, 4.4);
      s.lineTo(front, 2.1);
      s.quadraticCurveTo(front, 1.6, front + 0.5, 1.5);
    }, w, 0.45, 2), [k.pods, k.body]);
    // the glasshouse: an upright screen, a flat roof, the rear window falling into the tall tail
    k.add(profile((s) => {
      s.moveTo(-4.4, 5.35);
      s.lineTo(-1.9, 8.9);
      s.lineTo(3.4, 8.9);
      s.lineTo(7.3, 6.05);
      s.lineTo(4, 5.6);
    }, w - 1.6), [k.glass, k.glass]);
    k.add(profile((s) => {
      s.moveTo(-2.1, 8.8);
      s.lineTo(3.6, 8.8);
      s.lineTo(3.6, 9.3);
      s.lineTo(-1.8, 9.3);
    }, w - 1.3, 0.25, 2), [k.body, k.body]);
    const px = (w - 1.6) / 2;
    for (const side of [-1, 1]) {
      const x = side * px;
      k.add(profile((s) => {
        s.moveTo(-4.6, 5.35);
        s.lineTo(-2.1, 8.9);
        s.lineTo(-1.6, 8.9);
        s.lineTo(-4.1, 5.35);
      }, 0.3).translate(x, 0, 0), [k.body, k.body]);
      // (the broad rear pillar, with orange and brown bands slanting down it)
      k.add(profile((s) => {
        s.moveTo(1.6, 8.9);
        s.lineTo(3.6, 8.9);
        s.lineTo(7.4, 6.05);
        s.lineTo(4.6, 5.8);
      }, 0.3).translate(x, 0, 0), [k.body, k.body]);
      for (const [a, b, m] of [[0.45, 0.95, orange], [0.95, 1.75, brown]] as const) {
        k.add(profile((s) => {
          s.moveTo(1.6 + a, 8.9);
          s.lineTo(1.6 + b, 8.9);
          s.lineTo(4.6 + b * 1.1, 5.9);
          s.lineTo(4.6 + a * 1.1, 5.85);
        }, 0.08).translate(side * (px + 0.17), 0, 0), [m, m]);
      }
      k.box(0.3, 3.4, 0.4, 7.2, 0.9, k.all(k.body), undefined, x);
    }
    // the tall tail housing the radiators, and the huge wing on top of it between two swept end plates, its lip in
    // the driver's colour (yours gold)
    k.add(profile((s) => {
      s.moveTo(5.6, 5.9);
      s.lineTo(back, 5.9);
      s.lineTo(back, 7.4);
      s.lineTo(back - 0.3, 7.7);
      s.lineTo(7.4, 7.7);
      s.lineTo(5.6, 6.6);
    }, w - 0.4, 0.3, 2), [k.body, k.body]);
    for (let i = 0; i < 4; i++) k.box(w - 4, 0.12, 0.3, 7.78, 8 + i * 0.6, k.all(black));
    k.add(profile((s) => {
      s.moveTo(back - 3.8, 8.3);
      s.quadraticCurveTo(back - 3.6, 8.85, back - 2.2, 8.85);
      s.lineTo(back + 0.6, 8.6);
      s.lineTo(back + 0.6, 8.3);
    }, w + 0.4, 0.05, 4), [k.body, k.body]);
    k.box(w + 0.4, 0.2, 0.25, 8.75, back + 0.55, k.all(k.scoop));
    for (const x of [-(w / 2 + 0.05), w / 2 + 0.05]) {
      k.add(profile((s) => {
        s.moveTo(back - 5.6, 6.2);
        s.lineTo(back - 0.2, 7.4);
        s.lineTo(back + 0.6, 8.3);
        s.lineTo(back + 0.6, 8.95);
        s.lineTo(back - 3.2, 8.95);
      }, 0.3, 0.1, 2).translate(x, 0, 0), [k.body, k.body]);
    }
    // square flared arches over all four wheels, each a solid bulge with the wheel's opening
    const R = 2.85;
    const hubY = 2.25;
    const reach = 4.1;
    const axles = [-7.4, 7.6];
    for (const z of axles) for (const x of [-(w / 2 - 0.35), w / 2 - 0.35]) {
      k.add(profile((s) => {
        const a = Math.asin((hubY - 1.8) / R);
        s.moveTo(z - reach, 1.8);
        s.lineTo(z - reach, 5.3);
        s.lineTo(z - reach + 0.6, 5.7);
        s.lineTo(z + reach - 0.6, 5.7);
        s.lineTo(z + reach, 5.3);
        s.lineTo(z + reach, 1.8);
        s.absarc(z, hubY, R, -a, Math.PI + a, false);
      }, 1.2, 0.2, 4).translate(x, 0, 0), [k.body, k.body]);
    }
    // the colours: white over yellow, two thin yellow lines over the yellow, round the arches too
    const paints = [[2.6, 2.2, yellow], [3.95, 0.12, yellow], [4.2, 0.12, yellow]] as const;
    for (const side of [-1, 1]) {
      const bx = side * (w / 2 + 0.03);
      for (const [z0, z1] of [[front + 0.5, axles[0] - reach], [axles[0] + reach, axles[1] - reach], [axles[1] + reach, back - 0.4]]) {
        for (const [y, h, m] of paints) k.box(0.1, h, z1 - z0, y, (z0 + z1) / 2, k.all(m), undefined, bx);
      }
      for (const z of axles) {
        const x = side * (w / 2 + 0.29);
        for (const [y, h, m] of paints) {
          const open = Math.sqrt(Math.max(0, R * R - (y + h / 2 - hubY) ** 2));
          k.box(0.1, h, reach - open, y, z - (reach + open) / 2, k.all(m), undefined, x);
          k.box(0.1, h, reach - open, y, z + (reach + open) / 2, k.all(m), undefined, x);
        }
      }
      // a black swoosh rising from the chin over the front wing to the door
      k.add(profile((s) => {
        const pts: [number, number][] = [];
        for (let i = 0; i <= 12; i++) {
          const t = i / 12;
          pts.push([
            (1 - t) ** 2 * (front + 0.6) + 2 * t * (1 - t) * -11.6 + t * t * -3.2,
            (1 - t) ** 2 * 2.0 + 2 * t * (1 - t) * 5.6 + t * t * 5.5,
          ]);
        }
        s.moveTo(pts[0][0], pts[0][1] - 0.4);
        for (const [z, y] of pts) s.lineTo(z, y - 0.4);
        for (const [z, y] of [...pts].reverse()) s.lineTo(z, y + 0.4);
      }, 0.1).translate(side * (w / 2 + 0.3), 0, 0), [black, black]);
      // a black vent up the side ahead of each rear arch
      k.box(0.12, 2.8, 0.8, 4.1, axles[1] - reach - 0.6, k.all(black), undefined, side * (w / 2 + 0.05));
    }
    // two orange bars on the bonnet in front of the screen
    for (const side of [-1, 1]) {
      const shape = new THREE.Shape([[1.6, -7.2], [4.4, -6.6], [4.4, -5.9], [1.6, -6.5]].map(([x, z]) => new THREE.Vector2(side * x, z)));
      const g = new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: false }).rotateX(Math.PI / 2);
      const pos = g.getAttribute('position');
      for (let n = 0; n < pos.count; n++) pos.setY(n, pos.getY(n) + bonnet(pos.getZ(n)) + 0.08);
      g.computeVertexNormals();
      k.add(g, [orange, orange]);
    }
    // the nose: a square headlamp at each end, a black grille between them with two big round lamps on it, four
    // round spotlights standing on the chin at night or in the evening, amber indicators under the square lamps;
    // the chin a long yellow wedge sloping forward to the ground
    for (const side of [-1, 1]) {
      k.front(1.5, 1, 0.12, 3.9, front - 0.04, k.all(k.lamp), side * (w / 2 - 1.3));
      k.front(1, 0.4, 0.1, 3.05, front - 0.04, k.all(amber), side * (w / 2 - 1.3));
      k.add(drum(0.85, 0.5, 'z', side * 1.9, 3.9, front - 0.35 - k.noseZ, 14), [k.chrome, k.chrome, k.chrome], k.nose);
      k.add(drum(0.72, 0.1, 'z', side * 1.9, 3.9, front - 0.62 - k.noseZ, 14), [k.lamp, k.lamp, k.lamp], k.nose);
      if (k.floodlights) for (const x of [0.85, 2.5]) {
        k.add(drum(0.72, 0.5, 'z', side * x, 3.35, front - 0.9 - k.noseZ, 14), [k.chrome, k.chrome, k.chrome], k.nose);
        k.add(drum(0.6, 0.1, 'z', side * x, 3.35, front - 1.17 - k.noseZ, 14), [k.lamp, k.lamp, k.lamp], k.nose);
      }
    }
    k.front(w - 3.4, 1.4, 0.1, 3.75, front - 0.04, k.all(black));
    k.add(profile((s) => {
      s.moveTo(front + 0.3, 1.35);
      s.lineTo(front - 2.4, 1.35);
      s.lineTo(front - 2.6, 1.95);
      s.lineTo(front - 0.1, 2.95);
      s.lineTo(front + 0.3, 2.95);
    }, w + 0.2, 0.08, 2).translate(0, 0, -k.noseZ), [yellow, yellow], k.nose);
    // (a black line along each side of it)
    for (const x of [-(w / 2 + 0.12), w / 2 + 0.12]) {
      k.add(profile((s) => {
        s.moveTo(front - 2.55, 1.75);
        s.lineTo(front + 0.3, 2.9);
        s.lineTo(front + 0.3, 2.5);
        s.lineTo(front - 2.45, 1.45);
      }, 0.06).translate(x, 0, -k.noseZ), [black, black], k.nose);
    }
    // the tail: two big black radiator grilles, dark lamps at the corners, a yellow band, a mesh panel below
    for (const x of [-2.6, 2.6]) k.box(4.6, 1.5, 0.12, 6.4, back + 0.03, k.all(black), undefined, x);
    for (const x of [-(w / 2 - 0.7), w / 2 - 0.7]) k.box(0.9, 1.7, 0.15, 6.35, back + 0.06, k.all(red), undefined, x);
    k.box(w - 0.4, 0.9, 0.1, 5.1, back + 0.03, k.all(yellow));
    k.box(w - 3, 0.9, 0.1, 3.3, back + 0.03, k.all(mesh));
    k.box(w + 0.2, 0.6, 0.6, 2.1, back + 0.2, k.all(yellow));
    // mud flaps behind the wheels: yellow at the front, black at the back
    for (const x of [-(w / 2 - 1.1), w / 2 - 1.1]) {
      k.box(1.8, 1.5, 0.2, 1.2, -3.1, k.all(yellow), undefined, x);
      k.box(1.8, 1.5, 0.2, 1.2, 11.9, k.all(black), undefined, x);
    }
    return {
      axles: [axles[0], axles[1]],
      wheel: { radius: 2.25, width: 2.7, half: w / 2 - 1.2, rim: '#f4f4f0' },
      tail: { z: back + 0.1, y: 6.35, x: w / 2 - 0.7, w: 0.9, h: 1.7 },
    };
  },

  /**
   * KESTREL T16, 1980s: a little hatchback with its engine moved behind the seats and all four wheels driven. Short
   * and wide, a short sloping bonnet, a steep screen, the roof ending under a big black wing over a sloping hatch,
   * square flared arches, an air intake in each rear flank; white, with red, navy, yellow and blue bands sweeping
   * over the wings and the bonnet, the lower doors blue.
   */
  kestrel(k) {
    const w = 12.2;
    const front = -12.6;
    const back = 11.8;
    const black = k.paint(0x16171b);
    const red = k.paint(0xd42a2a);
    const navy = k.paint(0x1c2a6a);
    const yellow = k.paint(0xf2c21c);
    const blue = k.paint(0x3a8fd8);
    const amber = k.paint(0xf29a1a);
    const white = k.paint(0xf4f4f0);
    /** the bonnet's height at `z`, from the nose up to the screen */
    const bonnet = (z: number) => 4.6 + ((z - front - 0.5) * 0.9) / (-5 - front - 0.5);
    // the body: a square nose, the short bonnet rising to the screen, the waist level to the tail
    k.add(profile((s) => {
      s.moveTo(front + 0.5, 1.5);
      s.lineTo(back - 0.4, 1.5);
      s.lineTo(back, 2.1);
      s.lineTo(back, 5.6);
      s.lineTo(back - 0.3, 5.9);
      s.lineTo(-5, 5.5);
      s.lineTo(front + 0.5, 4.6);
      s.quadraticCurveTo(front, 4.55, front, 4.1);
      s.lineTo(front, 2.1);
      s.quadraticCurveTo(front, 1.6, front + 0.5, 1.5);
    }, w, 0.45, 2), [k.pods, k.body]);
    // the glasshouse: a steep screen, the roof, the hatch sloping to the tail
    k.add(profile((s) => {
      s.moveTo(-5.1, 5.45);
      s.lineTo(-2.6, 8.95);
      s.lineTo(7, 8.95);
      s.lineTo(back - 0.7, 5.85);
      s.lineTo(0, 5.6);
    }, w - 1.6), [k.glass, k.glass]);
    k.add(profile((s) => {
      s.moveTo(-2.8, 8.85);
      s.lineTo(7.2, 8.85);
      s.lineTo(7, 9.3);
      s.lineTo(-2.5, 9.3);
    }, w - 1.3, 0.25, 2), [k.body, k.body]);
    for (const side of [-1, 1]) {
      const x = side * (w - 1.6) / 2;
      k.add(profile((s) => {
        s.moveTo(-5.3, 5.45);
        s.lineTo(-2.8, 8.95);
        s.lineTo(-2.3, 8.95);
        s.lineTo(-4.8, 5.45);
      }, 0.3).translate(x, 0, 0), [k.body, k.body]);
      k.box(0.3, 3.4, 0.4, 7.25, 1, k.all(k.body), undefined, x);
      // (the broad rear quarter, a small window ahead of it)
      k.add(profile((s) => {
        s.moveTo(4, 8.95);
        s.lineTo(7.1, 8.95);
        s.lineTo(back - 0.6, 5.85);
        s.lineTo(3.6, 5.7);
      }, 0.3).translate(x, 0, 0), [k.body, k.body]);
    }
    // the big black wing at the back of the roof, out over the hatch on two end plates, its lip in the driver's
    // colour (yours gold)
    k.add(profile((s) => {
      s.moveTo(6.2, 9.25);
      s.quadraticCurveTo(7, 9.8, 8.6, 9.85);
      s.lineTo(back + 0.4, 9.75);
      s.lineTo(back + 0.4, 9.4);
      s.lineTo(8.2, 9.35);
    }, w - 0.6, 0.08, 4), [black, black]);
    k.box(w - 0.6, 0.2, 0.25, 9.9, back + 0.3, k.all(k.scoop));
    for (const x of [-(w / 2 - 0.4), w / 2 - 0.4]) {
      k.add(profile((s) => {
        s.moveTo(7, 8.9);
        s.lineTo(back - 0.5, 6.3);
        s.lineTo(back + 0.4, 9.4);
        s.lineTo(back + 0.4, 10.1);
        s.lineTo(8.4, 10.1);
      }, 0.2).translate(x, 0, 0), [black, black]);
    }
    // square flared arches over all four wheels, each a solid bulge with the wheel's opening
    const R = 2.85;
    const hubY = 2.25;
    const reach = 3.9;
    const axles = [-8, 7.4];
    for (const z of axles) for (const x of [-(w / 2 - 0.35), w / 2 - 0.35]) {
      k.add(profile((s) => {
        const a = Math.asin((hubY - 1.8) / R);
        s.moveTo(z - reach, 1.8);
        s.lineTo(z - reach, 5.1);
        s.lineTo(z - reach + 0.6, 5.55);
        s.lineTo(z + reach - 0.6, 5.55);
        s.lineTo(z + reach, 5.1);
        s.lineTo(z + reach, 1.8);
        s.absarc(z, hubY, R, -a, Math.PI + a, false);
      }, 1.2, 0.2, 4).translate(x, 0, 0), [k.body, k.body]);
    }
    // the colours. The bands, top to bottom: red, navy, a thin yellow line, blue
    const bands = [[4.95, 5.45, red], [4.35, 4.95, navy], [4.18, 4.35, yellow], [3.2, 4.18, blue]] as const;
    /** a flat piece in the (z, y) plane on a side at `x` */
    const side2d = (pts: [number, number][], x: number, m: THREE.Material) => {
      k.add(profile((s) => {
        s.moveTo(pts[0][0], pts[0][1]);
        for (const [z, y] of pts.slice(1)) s.lineTo(z, y);
      }, 0.08).translate(x, 0, 0), [m, m]);
    };
    for (const side of [-1, 1]) {
      const bx = side * (w / 2 + 0.04);
      const ax = side * (w / 2 + 0.3);
      // behind the front wheel the bands sweep back and down into the blue of the doors
      const f0 = axles[0] + reach;
      const cut = (y: number) => -2.8 + (5.45 - y) * 1.2;
      for (const [y0, y1, m] of bands) {
        side2d([[f0, y0], [cut(y0), y0], [cut(y1), y1], [f0, y1]], bx, m);
        // (starting on the arch, behind its opening)
        const open = Math.sqrt(Math.max(0, R * R - (y0 - hubY) ** 2));
        side2d([[axles[0] + open, y0], [f0 - 0.05, y0], [f0 - 0.05, y1], [axles[0] + open, y1]], ax, m);
      }
      // the lower doors blue, to the sills
      const r0 = axles[1] - reach;
      side2d([[f0, 1.6], [r0, 1.6], [r0, 3.2], [f0, 3.2]], bx, blue);
      // ahead of the rear wheel they rise out of the blue and run back over the arch to the tail
      const rcut = (y: number) => 2.6 - (5.45 - y) * 0.9;
      for (const [y0, y1, m] of bands) {
        side2d([[rcut(y0), y0], [r0, y0], [r0, y1], [rcut(y1), y1]], bx, m);
        const open = Math.sqrt(Math.max(0, R * R - (y0 - hubY) ** 2));
        side2d([[r0 + 0.05, y0], [axles[1] - open, y0], [axles[1] - open, y1], [r0 + 0.05, y1]], ax, m);
        side2d([[axles[1] + open, y0], [axles[1] + reach - 0.05, y0], [axles[1] + reach - 0.05, y1], [axles[1] + open, y1]], ax, m);
        side2d([[axles[1] + reach, y0], [back - 0.4, y0], [back - 0.4, y1], [axles[1] + reach, y1]], bx, m);
      }
      // a black air intake slot in the rear flank, ahead of the arch
      k.box(0.12, 1.5, 0.8, 4.65, 2.6, k.all(black), undefined, side * (w / 2 + 0.1));
    }
    // a band of the same colours across the bonnet, slanting in front of the screen
    const onBonnet = (pts: [number, number][], m: THREE.Material) => {
      const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, z)));
      const g = new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: false }).rotateX(Math.PI / 2);
      const pos = g.getAttribute('position');
      for (let n = 0; n < pos.count; n++) pos.setY(n, pos.getY(n) + bonnet(pos.getZ(n)) + 0.08);
      g.computeVertexNormals();
      k.add(g, [m, m]);
    };
    let z0 = -8.2;
    for (const [, , m] of bands) {
      const d = m === yellow ? 0.25 : 0.7;
      onBonnet([[-3.6, z0], [3.2, z0 + 1.6], [3.2, z0 + 1.6 + d], [-3.6, z0 + d]], m);
      z0 += d;
    }
    // the nose: rectangular headlamps either side of a slatted grille, amber indicators outboard, a white bumper
    // with a wide black intake, a white splitter reaching forward
    for (const side of [-1, 1]) {
      k.front(2, 0.95, 0.12, 3.6, front - 0.04, k.all(k.lamp), side * (w / 2 - 2.1));
      k.front(0.7, 0.95, 0.12, 3.6, front - 0.04, k.all(amber), side * (w / 2 - 0.65));
    }
    k.front(3.6, 0.9, 0.1, 3.6, front - 0.04, k.all(black));
    for (let i = 0; i < 3; i++) k.front(3.6, 0.12, 0.1, 3.3 + i * 0.3, front - 0.1, k.all(white));
    k.front(w + 0.2, 1.3, 0.9, 2.3, front - 0.25, k.all(k.body));
    k.front(5.6, 0.8, 0.1, 2.3, front - 0.72, k.all(black));
    k.front(w + 0.6, 0.15, 1.6, 1.45, front - 0.5, k.all(white));
    // at night or in the evening, six round floodlights in an arch across the front, the outer ones lower
    if (k.floodlights) for (let i = 0; i < 6; i++) {
      const x = (i - 2.5) * 1.85;
      const y = 3.75 - 0.035 * x * x;
      k.add(drum(0.78, 0.5, 'z', x, y, front - 0.95 - k.noseZ, 14), [k.chrome, k.chrome, k.chrome], k.nose);
      k.add(drum(0.65, 0.1, 'z', x, y, front - 1.22 - k.noseZ, 14), [k.lamp, k.lamp, k.lamp], k.nose);
    }
    // the tail: red lamps at the corners, a black panel between, a white bumper
    k.box(w - 1, 1.1, 0.12, 4.6, back + 0.03, k.all(black));
    for (const x of [-(w / 2 - 1.4), w / 2 - 1.4]) k.box(2.4, 1.1, 0.15, 4.6, back + 0.06, k.all(red), undefined, x);
    k.box(w + 0.2, 1, 0.6, 2.2, back + 0.2, k.all(k.body));
    // red mud flaps behind the wheels
    for (const z of [-3.6, 11.5]) for (const x of [-(w / 2 - 1.1), w / 2 - 1.1]) k.box(1.8, 1.6, 0.2, 1.2, z, k.all(red), undefined, x);
    return {
      axles: [axles[0], axles[1]],
      wheel: { radius: 2.25, width: 2.7, half: w / 2 - 1.2, rim: '#f4f4f0' },
      tail: { z: back + 0.1, y: 4.6, x: w / 2 - 1.4, w: 2.2, h: 1 },
    };
  },

  /**
   * MERLIN 200, 1980s: the purpose-built mid-engined four-wheel-drive coupe of late Group B (the RS200's kind of car).
   * A low rounded nose, a big raked screen set well forward, a short roof with an intake on top, broad hips with
   * intakes ahead of the rear wheels, a long engine cover to a tail wing grown from the body.
   */
  merlin(k) {
    const w = 12.8;
    const front = -12.8;
    const back = 12.4;
    const black = k.paint(0x16171b);
    const blue = k.paint(0x1f4f9e);
    const white = k.paint(0xf4f4f0);
    const red = k.paint(0xd42a2a);
    const amber = k.paint(0xf29a1a);
    /** the bonnet's height at `z`, from the nose up to the screen */
    const bonnet = (z: number) => 4.75 + ((z - front - 0.3) * 1.05) / (-4.8 - front - 0.3);
    // the wheels sit in openings cut straight into the body: no arches stand out from the sides
    const hubY = 2.25;
    const axles = [-7.9, 8.3];
    const R = 2.85;
    const a = Math.asin((hubY - 1.4) / R);
    // the body in one piece: a low rounded nose, the bonnet rising gently to the screen, the sides level along the
    // doors, rising behind them to a short deck and a square tail
    k.add(profile((s) => {
      s.moveTo(front + 0.6, 1.4);
      s.lineTo(axles[0] - R * Math.cos(a), 1.4);
      s.absarc(axles[0], hubY, R, Math.PI + a, -a, true);
      s.lineTo(axles[1] - R * Math.cos(a), 1.4);
      s.absarc(axles[1], hubY, R, Math.PI + a, -a, true);
      s.lineTo(back - 0.4, 1.4);
      s.lineTo(back, 2);
      s.lineTo(back, 6.2);
      s.lineTo(back - 0.3, 6.35);
      s.lineTo(9.4, 6.7);
      s.lineTo(3.2, 5.6);
      s.lineTo(-4.8, 5.6);
      s.lineTo(front + 1.3, bonnet(front + 1.3));
      s.quadraticCurveTo(front, 4.75, front, 3.6);
      s.lineTo(front, 2.1);
      s.quadraticCurveTo(front, 1.5, front + 0.6, 1.4);
    }, w, 0.3, 24), [k.pods, k.body]);
    // a dark liner inside each wheel opening, so it reads as a wheel well
    for (const z of axles) {
      k.add(profile((s) => {
        s.moveTo(z + R * Math.cos(a), 1.4);
        s.absarc(z, hubY, R, -a, Math.PI + a, false);
        s.lineTo(z - (R - 0.12) * Math.cos(a), 1.4);
        s.absarc(z, hubY, R - 0.12, Math.PI + a, -a, true);
      }, w - 0.4, 0, 24), [black, black]);
    }
    // the glasshouse: a raked screen, a short low roof, a long back window sloping down to the deck
    k.add(profile((s) => {
      s.moveTo(-4.9, 5.5);
      s.lineTo(-1.6, 8.35);
      s.lineTo(2.6, 8.35);
      s.lineTo(9.3, 6.7);
      s.lineTo(9.3, 5.5);
    }, w - 2), [k.glass, k.glass]);
    k.add(profile((s) => {
      s.moveTo(-1.8, 8.25);
      s.lineTo(2.8, 8.25);
      s.lineTo(2.7, 8.7);
      s.lineTo(-1.5, 8.7);
    }, w - 1.7, 0.25, 2), [k.body, k.body]);
    // the roof intake at the back of the roof, its mouth facing forward, its back sloping down over the back window
    k.add(profile((s) => {
      s.moveTo(1.4, 8.6);
      s.lineTo(1.4, 9.3);
      s.lineTo(4.4, 9.3);
      s.lineTo(5.8, 7.6);
      s.lineTo(2.6, 8.3);
      s.lineTo(2.6, 8.6);
    }, 4.2, 0.12, 2), [blue, blue]);
    k.box(3.6, 0.5, 0.1, 8.95, 1.33, k.all(black));
    for (const side of [-1, 1]) {
      const x = side * (w - 2) / 2;
      // (the screen pillars; the broad rear quarter, solid from the doors back, a small window high in it)
      k.add(profile((s) => {
        s.moveTo(-5.1, 5.5);
        s.lineTo(-1.8, 8.35);
        s.lineTo(-1.3, 8.35);
        s.lineTo(-4.6, 5.5);
      }, 0.3).translate(x, 0, 0), [k.body, k.body]);
      k.add(profile((s) => {
        s.moveTo(2.6, 8.4);
        s.lineTo(9.4, 6.75);
        s.lineTo(9.4, 5.5);
        s.lineTo(2.9, 5.5);
      }, 0.3).translate(x, 0, 0), [k.body, k.body]);
      k.add(profile((s) => {
        s.moveTo(3.3, 6.5);
        s.lineTo(4.6, 6.5);
        s.lineTo(4.6, 7.75);
        s.lineTo(3.3, 8.05);
      }, 0.1).translate(x + side * 0.18, 0, 0), [black, black]);
    }
    // the tail wing grown from the deck, its tips rising, its lip in the driver's colour (yours gold)
    k.add(profile((s) => {
      s.moveTo(8.8, 6.75);
      s.lineTo(back + 0.4, 7.35);
      s.lineTo(back + 0.4, 6.95);
      s.lineTo(back - 0.4, 6.3);
    }, w - 0.2, 0.1, 3), [k.body, k.body]);
    k.box(w - 0.4, 0.18, 0.25, 7.4, back + 0.3, k.all(k.scoop));
    // the colours: white, the back half of the car blue from the doors on, a white notch in the doors, white stripes
    // slanting down and back across the blue ahead of the rear wheels
    /** a flat piece in the (z, y) plane on a side at `x` */
    const side2d = (pts: [number, number][], x: number, m: THREE.Material) => {
      k.add(profile((s) => {
        s.moveTo(pts[0][0], pts[0][1]);
        for (const [z, y] of pts.slice(1)) s.lineTo(z, y);
      }, 0.08).translate(x, 0, 0), [m, m]);
    };
    /** the top of the body side (under the windows) at `z` */
    const waist = (z: number) => (z < 3.2 ? 5.6 : z < 9.4 ? 5.6 + ((z - 3.2) * 1.1) / 6.2 : 6.7 - ((z - 9.4) * 0.35) / (back - 0.3 - 9.4)) - 0.15;
    for (const side of [-1, 1]) {
      const bx = side * (w / 2 + 0.04);
      // (the blue from the doors back, round the rear wheel's opening)
      k.add(profile((s) => {
        s.moveTo(-3.4, 1.6);
        s.lineTo(axles[1] - (R + 0.02) * Math.cos(a), 1.6);
        s.absarc(axles[1], hubY, R + 0.02, Math.PI + a, -a, true);
        s.lineTo(back - 0.4, 1.6);
        s.lineTo(back - 0.4, waist(back - 0.4));
        s.lineTo(9.4, waist(9.4));
        s.lineTo(3.2, waist(3.2));
        s.lineTo(-0.6, waist(-0.6));
        s.lineTo(-3.4, 3.9);
      }, 0.08, 0, 12).translate(bx, 0, 0), [blue, blue]);
      // (the white notch cut into the doors)
      side2d([[-2.4, 1.9], [-0.6, 1.9], [-0.6, 3.9], [-2.4, 3.9]], side * (w / 2 + 0.07), white);
      for (const z0 of [-0.4, 0.4, 1.2, 2]) {
        side2d([[z0, waist(z0)], [z0 + 0.4, waist(z0 + 0.4)], [z0 + 2.6, 1.6], [z0 + 2.2, 1.6]], side * (w / 2 + 0.07), white);
      }
    }
    // a small black vent in the middle of the bonnet's nose
    k.box(2, 0.1, 0.5, bonnet(front + 2.2) + 0.03, front + 2.2, k.all(black));
    // the nose: round headlamps set into the bonnet's rounded front, a white bumper below with a black grille, amber
    // indicators either side, black slots low, a black splitter
    for (const x of [-4.3, 4.3]) {
      k.add(drum(0.9, 0.6, 'z', x, 3.95, front + 0.1 - k.noseZ, 16), [black, black, black], k.nose);
      k.add(drum(0.72, 0.15, 'z', x, 3.95, front - 0.25 - k.noseZ, 16), [k.lamp, k.lamp, k.lamp], k.nose);
    }
    k.front(w - 1.4, 1.5, 0.5, 2.45, front - 0.05, k.all(k.body));
    k.front(4.4, 0.8, 0.1, 2.6, front - 0.33, k.all(black));
    for (const x of [-3.7, 3.7]) {
      k.front(1.4, 0.35, 0.1, 3.0, front - 0.33, k.all(amber), x);
      k.front(1.8, 0.4, 0.1, 2.0, front - 0.33, k.all(black), x);
    }
    k.front(w - 1, 0.15, 1.2, 1.45, front - 0.3, k.all(black));
    // at night or in the evening, two big round lamps on the bumper
    if (k.floodlights) for (const x of [-2.4, 2.4]) {
      k.add(drum(0.85, 0.5, 'z', x, 2.6, front - 0.6 - k.noseZ, 14), [k.chrome, k.chrome, k.chrome], k.nose);
      k.add(drum(0.72, 0.1, 'z', x, 2.6, front - 0.87 - k.noseZ, 14), [k.lamp, k.lamp, k.lamp], k.nose);
    }
    // the tail: a black mesh panel between round red lamps, twin exhausts low
    k.box(w - 1, 2.2, 0.12, 4.9, back + 0.03, k.all(black));
    for (const x of [-(w / 2 - 1.5), w / 2 - 1.5]) for (const dx of [-0.6, 0.6]) {
      k.add(drum(0.5, 0.15, 'z', x + dx, 5.3, back + 0.08, 12), [red, red, red]);
    }
    k.box(w + 0.2, 0.9, 0.5, 2.1, back + 0.15, k.all(black));
    for (const x of [0.9, 1.7]) k.add(drum(0.35, 0.8, 'z', x, 1.75, back + 0.3, 10), [black, black, black]);
    // mud flaps behind the wheels
    for (const z of [-4.2, 12.1]) for (const x of [-(w / 2 - 1.1), w / 2 - 1.1]) k.box(1.8, 1.6, 0.2, 1.2, z, k.all(blue), undefined, x);
    return {
      axles: [axles[0], axles[1]],
      wheel: { radius: 2.25, width: 2.7, half: w / 2 - 1.55, rim: '#c9ccd1' },
      tail: { z: back + 0.1, y: 5.3, x: w / 2 - 1.5, w: 2.2, h: 1 },
      exhaust: { x: 1.3, y: 1.75, z: back + 0.7 },
    };
  },

  /**
   * VORTICE EVO, 1990s: the boxy five-door four-wheel-drive hatch that ruled Group A (the Delta Integrale's kind of
   * car). Square lines, a tall glasshouse, squared-off flares, twin round headlamps either side of a slatted grille,
   * a wing over the hatch.
   */
  vortice(k) {
    const w = 12.8;
    const front = -12.4;
    const back = 11.8;
    const black = k.paint(0x16171b);
    const navy = k.paint(0x16306e);
    const sky = k.paint(0x3fa0dc);
    const red = k.paint(0xd0242a);
    const amber = k.paint(0xf29a1a);
    const waist = 5.7;
    /** the bonnet's height at `z`, from the nose up to the screen */
    const bonnet = (z: number) => 4.75 + ((z - front - 0.4) * 0.95) / (-4.7 - front - 0.4);
    // the body: a square nose, a short flat bonnet, level sides, a near-upright tail
    k.add(profile((s) => {
      s.moveTo(front + 0.4, 1.5);
      s.lineTo(back - 0.4, 1.5);
      s.lineTo(back, 2.1);
      s.lineTo(back, 5.55);
      s.lineTo(back - 0.4, 5.85);
      s.lineTo(-4.7, waist);
      s.lineTo(front + 0.4, 4.75);
      s.quadraticCurveTo(front, 4.75, front, 4.35);
      s.lineTo(front, 2);
      s.quadraticCurveTo(front, 1.5, front + 0.4, 1.5);
    }, w, 0.4, 3), [k.pods, k.body]);
    // the glasshouse: a raked screen, a long flat roof, a steep hatch
    k.add(profile((s) => {
      s.moveTo(-4.8, 5.6);
      s.lineTo(-1.5, 8.75);
      s.lineTo(7.6, 8.75);
      s.lineTo(back - 0.5, 5.8);
      s.lineTo(back - 0.5, 5.6);
    }, w - 1.8), [k.glass, k.glass]);
    k.add(profile((s) => {
      s.moveTo(-1.7, 8.65);
      s.lineTo(7.8, 8.65);
      s.lineTo(7.7, 9.1);
      s.lineTo(-1.4, 9.1);
    }, w - 1.5, 0.25, 2), [k.body, k.body]);
    // the roof wing over the hatch, its lip in the driver's colour (yours gold)
    k.add(profile((s) => {
      s.moveTo(6.6, 9.1);
      s.lineTo(8, 9.45);
      s.lineTo(9, 9.4);
      s.lineTo(9, 9.1);
      s.lineTo(7.8, 8.7);
    }, w - 1.6, 0.06, 2), [k.body, k.body]);
    k.box(w - 1.8, 0.16, 0.25, 9.45, 8.95, k.all(k.scoop));
    // the pillars: screen, door, and a broad rear pillar the stripes run up
    const px = (w - 1.8) / 2;
    for (const side of [-1, 1]) {
      const x = side * px;
      k.add(profile((s) => {
        s.moveTo(-5.05, 5.6);
        s.lineTo(-1.75, 8.75);
        s.lineTo(-1.25, 8.75);
        s.lineTo(-4.55, 5.6);
      }, 0.3).translate(x, 0, 0), [k.body, k.body]);
      k.box(0.3, 3.15, 0.45, 7.17, 2.2, k.all(k.body), undefined, x);
      k.add(profile((s) => {
        s.moveTo(6.9, 8.75);
        s.lineTo(7.6, 8.75);
        s.lineTo(back - 0.4, 5.8);
        s.lineTo(back - 0.4, 5.6);
        s.lineTo(6.9, 5.6);
      }, 0.3).translate(x, 0, 0), [k.body, k.body]);
    }
    // squared-off flares over all four wheels, barely proud of the sides
    const R = 2.85;
    const hubY = 2.25;
    const axles = [-7.6, 8.4];
    const reaches = [3.7, 3.2];
    for (let i = 0; i < 2; i++) for (const x of [-(w / 2 - 0.35), w / 2 - 0.35]) {
      const z = axles[i];
      const reach = reaches[i];
      k.add(profile((s) => {
        const a = Math.asin((hubY - 1.8) / R);
        s.moveTo(z - reach, 1.8);
        s.lineTo(z - reach, 5.0);
        s.lineTo(z - reach + 0.5, 5.45);
        s.lineTo(z + reach - 0.5, 5.45);
        s.lineTo(z + reach, 5.0);
        s.lineTo(z + reach, 1.8);
        s.absarc(z, hubY, R, -a, Math.PI + a, false);
      }, 1.2, 0.2, 6).translate(x, 0, 0), [k.body, k.body]);
    }
    // the colours: white, a red band low along the doors, and stripes (navy, light blue, red) sweeping up across the
    // doors, up the rear pillar and over the back of the roof; the same stripes along the bonnet's edges
    /** a flat piece in the (z, y) plane on a side at `x` */
    const side2d = (pts: [number, number][], x: number, m: THREE.Material) => {
      k.add(profile((s) => {
        s.moveTo(pts[0][0], pts[0][1]);
        for (const [z, y] of pts.slice(1)) s.lineTo(z, y);
      }, 0.08).translate(x, 0, 0), [m, m]);
    };
    const f0 = axles[0] + reaches[0];
    const r0 = axles[1] - reaches[1];
    const stripes = [[0, 0.7, navy], [0.7, 0.98, sky], [0.98, 1.45, red]] as const;
    const rise = (z: number) => 2.85 + (z - f0) * 0.15;
    for (const side of [-1, 1]) {
      const bx = side * (w / 2 + 0.04);
      side2d([[f0, 1.8], [r0, 1.8], [r0, 2.7], [f0, 2.7]], bx, red);
      for (const [d0, d1, m] of stripes) {
        side2d([[f0, rise(f0) + d0], [r0, rise(r0) + d0], [r0, Math.min(waist - 0.05, rise(r0) + d1)], [f0, rise(f0) + d1]], bx, m);
        // (up the rear pillar)
        side2d([[7 + d0 * 1.6, 5.6], [7 + d1 * 1.6, 5.6], [6.95 + d1 * 0.45, 8.7], [6.95 + d0 * 0.45, 8.7]], side * (px + 0.18), m);
      }
    }
    // (over the back of the roof)
    for (const [d0, d1, m] of stripes) k.box(w - 1.5, 0.06, (d1 - d0) * 1.2, 9.13, 4.6 + ((d0 + d1) / 2) * 1.2, k.all(m));
    const onBonnet = (pts: [number, number][], m: THREE.Material) => {
      const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, z)));
      const g = new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: false }).rotateX(Math.PI / 2);
      const pos = g.getAttribute('position');
      for (let n = 0; n < pos.count; n++) pos.setY(n, pos.getY(n) + bonnet(pos.getZ(n)) + 0.08);
      g.computeVertexNormals();
      k.add(g, [m, m]);
    };
    for (const side of [-1, 1]) {
      let x0 = 3.4;
      for (const [d0, d1, m] of stripes) {
        const dx = (d1 - d0) * 1.2;
        const a0 = side * x0;
        const a1 = side * (x0 + dx);
        onBonnet([[a0, front + 0.6], [a1, front + 0.6], [a1, -4.8], [a0, -4.8]], m);
        x0 += dx;
      }
    }
    // the nose: a black band with twin round headlamps either side of a slatted grille, a white bumper below with
    // black intakes, amber indicators at its corners, a black splitter
    k.front(w - 0.6, 1.3, 0.1, 4.0, front - 0.04, k.all(black));
    for (const x of [-4.75, -3.35, 3.35, 4.75]) {
      k.add(drum(0.6, 0.2, 'z', x, 4.0, front - 0.12 - k.noseZ, 14), [k.lamp, k.lamp, k.lamp], k.nose);
    }
    for (let i = 0; i < 3; i++) k.front(4.2, 0.12, 0.1, 3.6 + i * 0.4, front - 0.1, k.all(k.body));
    k.front(w + 0.2, 1.6, 0.8, 2.5, front - 0.2, k.all(k.body));
    k.front(5.4, 0.7, 0.1, 2.6, front - 0.62, k.all(black));
    for (const x of [-4.2, 4.2]) {
      k.front(1.8, 0.6, 0.1, 2.1, front - 0.62, k.all(black), x);
      k.front(1.1, 0.4, 0.1, 3.0, front - 0.62, k.all(amber), Math.sign(x) * (w / 2 - 0.8));
    }
    k.front(w, 0.15, 1.2, 1.5, front - 0.4, k.all(black));
    // at night or in the evening, four big round lamps bunched together on a black platform across the nose
    if (k.floodlights) {
      k.front(7.4, 0.3, 1.4, 4.4, front - 0.6, k.all(black));
      for (const x of [-2.7, -0.9, 0.9, 2.7]) {
        k.add(drum(0.88, 0.5, 'z', x, 5.4, front - 0.75 - k.noseZ, 14), [black, black, black], k.nose);
        k.add(drum(0.74, 0.1, 'z', x, 5.4, front - 1.02 - k.noseZ, 14), [k.lamp, k.lamp, k.lamp], k.nose);
      }
    }
    // the tail: red lamps at the corners on a black panel, a white bumper
    k.box(w - 1, 1.2, 0.12, 4.8, back + 0.03, k.all(black));
    for (const x of [-(w / 2 - 1.5), w / 2 - 1.5]) k.box(2.6, 1.2, 0.15, 4.8, back + 0.06, k.all(red), undefined, x);
    k.box(w + 0.2, 1.1, 0.6, 2.3, back + 0.2, k.all(k.body));
    // red mud flaps behind the wheels
    for (const z of [-3.6, 11.65]) for (const x of [-(w / 2 - 1.1), w / 2 - 1.1]) k.box(1.8, 1.6, 0.2, 1.2, z, k.all(red), undefined, x);
    return {
      axles: [axles[0], axles[1]],
      wheel: { radius: 2.25, width: 2.7, half: w / 2 - 1.3, rim: '#f4f4f0' },
      tail: { z: back + 0.1, y: 4.8, x: w / 2 - 1.5, w: 2.4, h: 1.1 },
    };
  },

  /**
   * CORSARO GT4, 1990s: the rounded turbo four-wheel-drive coupe of early-nineties Group A (the Celica GT-Four's kind
   * of car). A low rounded nose, a long raked screen, a long sloping back window, a tall wing on the tail, smooth
   * flanks with the wheel openings cut into them.
   */
  corsaro(k) {
    const w = 12.8;
    const front = -13;
    const back = 12.4;
    const black = k.paint(0x16171b);
    const red = k.paint(0xd0242a);
    const green = k.paint(0x0f6b3c);
    const amber = k.paint(0xf29a1a);
    /** the bonnet's height at `z`, from the nose up to the screen */
    const bonnet = (z: number) => 4.75 + ((z - front - 1.4) * 0.75) / (-4.4 - front - 1.4);
    const hubY = 2.25;
    const axles = [-7.6, 7.2];
    const R = 2.85;
    const a = Math.asin((hubY - 1.4) / R);
    const waist = 5.5;
    // the body in one piece: a low rounded nose, the bonnet rising to the screen, smooth level flanks, a high tail
    k.add(profile((s) => {
      s.moveTo(front + 0.8, 1.4);
      s.lineTo(axles[0] - R * Math.cos(a), 1.4);
      s.absarc(axles[0], hubY, R, Math.PI + a, -a, true);
      s.lineTo(axles[1] - R * Math.cos(a), 1.4);
      s.absarc(axles[1], hubY, R, Math.PI + a, -a, true);
      s.lineTo(back - 0.5, 1.4);
      s.lineTo(back, 2.1);
      s.lineTo(back, 5.6);
      s.lineTo(back - 0.5, 6.1);
      s.lineTo(8.8, 6.1);
      s.lineTo(-4.4, waist);
      s.lineTo(front + 1.4, bonnet(front + 1.4));
      s.quadraticCurveTo(front, 4.7, front, 3.85);
      s.lineTo(front, 2.2);
      s.quadraticCurveTo(front, 1.5, front + 0.8, 1.4);
    }, w, 0.45, 24), [k.pods, k.body]);
    for (const z of axles) {
      k.add(profile((s) => {
        s.moveTo(z + R * Math.cos(a), 1.4);
        s.absarc(z, hubY, R, -a, Math.PI + a, false);
        s.lineTo(z - (R - 0.12) * Math.cos(a), 1.4);
        s.absarc(z, hubY, R - 0.12, Math.PI + a, -a, true);
      }, w - 0.4, 0, 24), [black, black]);
    }
    // the glasshouse: a long raked screen, a short rounded roof, a long back window sloping down to the tail
    k.add(profile((s) => {
      s.moveTo(-4.5, 5.4);
      s.lineTo(-0.8, 8.2);
      s.quadraticCurveTo(1, 8.45, 3, 8.2);
      s.lineTo(9, 6.1);
      s.lineTo(9, 5.4);
    }, w - 2.2, 0, 8), [k.glass, k.glass]);
    k.add(profile((s) => {
      s.moveTo(-1, 8.1);
      s.quadraticCurveTo(1, 8.35, 3.2, 8.1);
      s.lineTo(3, 8.55);
      s.quadraticCurveTo(1, 8.8, -0.7, 8.55);
    }, w - 1.9, 0.25, 8), [k.body, k.body]);
    const px = (w - 2.2) / 2;
    for (const side of [-1, 1]) {
      const x = side * px;
      // (the screen pillars, the door pillar, and the rear pillar along the back window, a small quarter window ahead of it)
      k.add(profile((s) => {
        s.moveTo(-4.75, 5.4);
        s.lineTo(-1, 8.2);
        s.lineTo(-0.5, 8.2);
        s.lineTo(-4.25, 5.4);
      }, 0.3).translate(x, 0, 0), [k.body, k.body]);
      k.add(profile((s) => {
        s.moveTo(3, 8.22);
        s.lineTo(3.4, 8.2);
        s.lineTo(9.1, 6.1);
        s.lineTo(9.1, 5.4);
        s.lineTo(6.6, 5.4);
      }, 0.3).translate(x, 0, 0), [k.body, k.body]);
      k.box(0.3, 2.8, 0.4, 6.8, 1.4, k.all(k.body), undefined, x);
    }
    // the tall wing over the tail on two stays, its lip in the driver's colour (yours gold)
    k.add(profile((s) => {
      s.moveTo(back - 2.4, 7.55);
      s.lineTo(back + 0.2, 7.85);
      s.lineTo(back + 0.2, 7.5);
      s.lineTo(back - 2.2, 7.3);
    }, w - 1, 0.08, 3), [k.body, k.body]);
    k.box(w - 1.2, 0.18, 0.25, 7.9, back + 0.1, k.all(k.scoop));
    for (const x of [-(w / 2 - 1.6), w / 2 - 1.6]) k.box(0.3, 1.4, 0.7, 6.75, back - 1.2, k.all(k.body), undefined, x);
    // bonnet vents either side, close to the screen
    for (const x of [-2.6, 2.6]) for (let i = 0; i < 3; i++) k.box(2.2, 0.08, 0.25, bonnet(-6.4 + i * 0.55) + 0.05, -6.4 + i * 0.55, k.all(black), undefined, x);
    // the colours: white, with a red and a green swoosh sweeping up each flank from the doors to the rear quarter,
    // green arcs over the front wheels with red ahead of them, green and red on the bonnet corners and roof edges, and
    // red and green halves across the tail
    /** a flat piece in the (z, y) plane on a side at `x` */
    const side2d = (pts: [number, number][], x: number, m: THREE.Material) => {
      k.add(profile((s) => {
        s.moveTo(pts[0][0], pts[0][1]);
        for (const [z, y] of pts.slice(1)) s.lineTo(z, y);
      }, 0.08).translate(x, 0, 0), [m, m]);
    };
    /** the swoosh's leading edge at `t` (0 low on the door, 1 at the waist) */
    const sweep = (t: number): [number, number] => {
      const u = 1 - t;
      return [u * u * -3.5 + 2 * u * t * 2.5 + t * t * 4.2, u * u * 1.7 + 2 * u * t * 1.9 + t * t * 5.35];
    };
    const band = (d0: number, d1: number): [number, number][] => {
      const pts: [number, number][] = [];
      for (let n = 0; n <= 12; n++) {
        const [z, y] = sweep(n / 12);
        pts.push([z + d0, y]);
      }
      for (let n = 12; n >= 0; n--) {
        const [z, y] = sweep(n / 12);
        pts.push([z + d1, y]);
      }
      return pts;
    };
    /** a band round wheel opening `i`, from angle `a0` to `a1`, `r0` to `r1` from the hub */
    const arc = (i: number, r0: number, r1: number, a0: number, a1: number, x: number, m: THREE.Material) => {
      k.add(profile((s) => {
        s.absarc(axles[i], hubY, r1, a0, a1, false);
        s.absarc(axles[i], hubY, r0, a1, a0, true);
      }, 0.08, 0, 16).translate(x, 0, 0), [m, m]);
    };
    for (const side of [-1, 1]) {
      const bx = side * (w / 2 + 0.04);
      side2d(band(0, 1), bx, red);
      side2d(band(1.1, 1.85), bx, green);
      // (round the front wheel's opening ahead of and behind it, meeting the green along the bonnet's edges)
      arc(0, R + 0.1, R + 0.6, 2.2, 2.85, bx, green);
      arc(0, R + 0.1, R + 0.6, 0.3, 0.94, bx, green);
      side2d([[front + 0.7, 2.6], [axles[0] - R - 0.1, 2.6], [axles[0] - R - 0.1, 3.5], [front + 0.9, 3.7]], bx, red);
    }
    const onBonnet = (pts: [number, number][], m: THREE.Material, lift = 0.08, depth = 0.08) => {
      const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, z)));
      const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false }).rotateX(Math.PI / 2);
      const pos = g.getAttribute('position');
      for (let n = 0; n < pos.count; n++) pos.setY(n, pos.getY(n) + bonnet(pos.getZ(n)) + lift);
      g.computeVertexNormals();
      k.add(g, [m, m]);
    };
    for (const side of [-1, 1]) {
      onBonnet([[side * 5.55, front + 1.5], [side * 5.9, front + 1.5], [side * 5.9, -6.2], [side * 5.3, -5.6], [side * 5.3, front + 3.4], [side * 5.55, front + 3.4]], green);
      onBonnet([[side * 0.7, front + 1.5], [side * 2.4, front + 1.5], [side * 2.4, front + 3.4], [side * 1.1, front + 2.6]], red);
    }
    // pop-up headlamps at the bonnet's front corners: folded flush by day (a white lid in a black seam), raised at night
    // or in the evening, a square lamp facing forward in each, the open well black behind it
    const pop = { x0: 2.7, x1: 5.2, z0: front + 1.5, z1: front + 3.2 };
    for (const side of [-1, 1]) {
      const rect = (x0: number, x1: number, z0: number, z1: number): [number, number][] =>
        [[side * x0, z0], [side * x1, z0], [side * x1, z1], [side * x0, z1]];
      if (!k.floodlights) {
        onBonnet(rect(pop.x0 - 0.12, pop.x1 + 0.12, pop.z0 - 0.12, pop.z1 + 0.12), black, 0.06, 0.06);
        onBonnet(rect(pop.x0, pop.x1, pop.z0, pop.z1), k.body, 0.1, 0.1);
      } else {
        const x = (side * (pop.x0 + pop.x1)) / 2;
        const wide = pop.x1 - pop.x0;
        onBonnet(rect(pop.x0, pop.x1, pop.z0 + 0.9, pop.z1), black, 0.06, 0.06);
        const z = pop.z0 + 0.45;
        const y = bonnet(z);
        k.box(wide, 1.35, 0.9, y + 0.62, z, k.all(k.body), undefined, x);
        k.box(wide - 0.2, 1.05, 0.08, y + 0.62, z - 0.47, k.all(black), undefined, x);
        k.box(wide - 0.5, 0.75, 0.08, y + 0.62, z - 0.52, k.all(k.lamp), undefined, x);
      }
    }
    for (const [z, m] of [[-0.55, green], [-0.2, red], [2.6, red], [2.95, green]] as const) k.box(w - 2.6, 0.06, 0.32, 8.6, z, k.all(m));
    // the nose: a slim black grille across its top (the headlamps pop up from the bonnet), a white bumper below with
    // two wide black mesh intakes, amber indicators and small slots at its corners, a black splitter
    k.front(w - 3, 0.45, 0.1, 4.0, front - 0.03, k.all(black));
    for (const side of [-1, 1]) {
      k.front(1.1, 0.4, 0.1, 2.95, front - 0.06, k.all(amber), side * (w / 2 - 1));
      k.front(1.1, 0.4, 0.1, 2.05, front - 0.06, k.all(black), side * (w / 2 - 1));
    }
    k.front(6.6, 0.5, 0.1, 2.95, front - 0.06, k.all(black));
    k.front(6.6, 0.65, 0.1, 2.05, front - 0.06, k.all(black));
    k.front(w - 0.8, 0.15, 1.2, 1.45, front - 0.3, k.all(black));
    // at night or in the evening, four big round lamps on a bar across the nose
    if (k.floodlights) {
      k.front(7, 0.3, 1.2, 3.45, front - 0.5, k.all(black));
      for (const x of [-2.55, -0.85, 0.85, 2.55]) {
        k.add(drum(0.82, 0.5, 'z', x, 4.25, front - 0.65 - k.noseZ, 14), [black, black, black], k.nose);
        k.add(drum(0.7, 0.1, 'z', x, 4.25, front - 0.92 - k.noseZ, 14), [k.lamp, k.lamp, k.lamp], k.nose);
      }
    }
    // the tail: a full-width lamp band, red with amber ends, on a black panel; red and green halves below it
    k.box(w - 1, 1, 0.12, 4.9, back + 0.03, k.all(black));
    k.box(w - 3, 0.75, 0.15, 4.9, back + 0.06, k.all(red));
    for (const x of [-(w / 2 - 1.1), w / 2 - 1.1]) k.box(1.2, 0.75, 0.15, 4.9, back + 0.06, k.all(amber), undefined, x);
    k.box(w / 2 - 1, 0.9, 0.1, 3.65, back + 0.04, k.all(red), undefined, -(w / 4));
    k.box(w / 2 - 1, 0.9, 0.1, 3.65, back + 0.04, k.all(green), undefined, w / 4);
    k.box(w + 0.2, 1.1, 0.5, 2.2, back + 0.15, k.all(k.body));
    // red mud flaps behind the wheels
    for (const z of [-4.4, 10.3]) for (const x of [-(w / 2 - 1.1), w / 2 - 1.1]) k.box(1.8, 1.6, 0.2, 1.2, z, k.all(red), undefined, x);
    return {
      axles: [axles[0], axles[1]],
      wheel: { radius: 2.25, width: 2.7, half: w / 2 - 1.55, rim: '#f4f4f0' },
      tail: { z: back + 0.1, y: 4.9, x: w / 2 - 1.8, w: 3, h: 0.7 },
      exhaust: { x: 1.4, y: 1.75, z: back + 0.5 },
    };
  },

  /**
   * TYPHOON GT, 1990s: the compact four-door turbo four-wheel-drive saloon (the Impreza's kind of car). A short nose,
   * a scoop on the bonnet, a vent on the roof, a tall upright cabin, a short boot with a spoiler across it, squared
   * flares over all four wheels. Deep blue with yellow crescents, gold wheels.
   */
  typhoon(k) {
    const w = 12.8;
    const front = -12.6;
    const back = 12.2;
    const black = k.paint(0x16171b);
    const yellow = k.paint(0xf3c81a);
    const red = k.paint(0xc8202a);
    const amber = k.paint(0xf29a1a);
    const white = k.paint(0xf4f4f0);
    const sky = k.paint(0x5fb4ea);
    const waist = 5.8;
    /** the bonnet's height at `z`, from the nose up to the screen */
    const bonnet = (z: number) => 4.85 + ((z - front - 0.6) * 0.9) / (-4.6 - front - 0.6);
    // the body: a short rounded nose, the bonnet rising to the screen, level sides, a short boot, a near-upright tail
    k.add(profile((s) => {
      s.moveTo(front + 0.5, 1.5);
      s.lineTo(back - 0.4, 1.5);
      s.lineTo(back, 2.1);
      s.lineTo(back, 5.5);
      s.lineTo(back - 0.5, 6.05);
      s.lineTo(7.4, 6.05);
      s.lineTo(-4.6, waist);
      s.lineTo(front + 0.6, bonnet(front + 0.6));
      s.quadraticCurveTo(front, 4.85, front, 4.2);
      s.lineTo(front, 2.1);
      s.quadraticCurveTo(front, 1.5, front + 0.5, 1.5);
    }, w, 0.45, 6), [k.pods, k.body]);
    // the glasshouse: a raked screen, a short flat roof, a steep back window down to the boot
    k.add(profile((s) => {
      s.moveTo(-4.7, 5.7);
      s.lineTo(-1.3, 8.8);
      s.lineTo(4.4, 8.8);
      s.lineTo(7.5, 6.05);
      s.lineTo(7.5, 5.7);
    }, w - 1.9), [k.glass, k.glass]);
    k.add(profile((s) => {
      s.moveTo(-1.5, 8.7);
      s.lineTo(4.6, 8.7);
      s.lineTo(4.4, 9.15);
      s.lineTo(-1.2, 9.15);
    }, w - 1.6, 0.25, 2), [k.body, k.body]);
    const px = (w - 1.9) / 2;
    for (const side of [-1, 1]) {
      const x = side * px;
      // (the screen pillars, the door pillar, and the rear pillar down to the boot)
      k.add(profile((s) => {
        s.moveTo(-4.95, 5.7);
        s.lineTo(-1.55, 8.8);
        s.lineTo(-1.05, 8.8);
        s.lineTo(-4.45, 5.7);
      }, 0.3).translate(x, 0, 0), [k.body, k.body]);
      k.box(0.3, 3.1, 0.45, 7.25, 1.6, k.all(k.body), undefined, x);
      k.add(profile((s) => {
        s.moveTo(3.6, 8.8);
        s.lineTo(4.5, 8.8);
        s.lineTo(7.6, 6.05);
        s.lineTo(7.6, 5.7);
        s.lineTo(5.9, 5.7);
      }, 0.3).translate(x, 0, 0), [k.body, k.body]);
    }
    // the scoop on the bonnet, open at the front, black inside
    k.add(profile((s) => {
      s.moveTo(-7.2, bonnet(-7.2) - 0.1);
      s.lineTo(-7.2, bonnet(-7.2) + 0.65);
      s.lineTo(-5, bonnet(-5) + 0.35);
      s.lineTo(-5, bonnet(-5) - 0.1);
    }, 3.4, 0.15, 2), [k.body, k.body]);
    k.box(2.8, 0.45, 0.1, bonnet(-7.2) + 0.32, -7.27, k.all(black));
    // a spoiler across the boot lid on short stays, its lip in the driver's colour (yours gold)
    k.add(profile((s) => {
      s.moveTo(back - 2.6, 7.05);
      s.lineTo(back - 0.1, 7.3);
      s.lineTo(back - 0.1, 7.0);
      s.lineTo(back - 2.4, 6.85);
    }, w - 1.6, 0.08, 3), [k.body, k.body]);
    k.box(w - 1.8, 0.16, 0.22, 7.32, back - 0.15, k.all(k.scoop));
    for (const x of [-(w / 2 - 1.6), w / 2 - 1.6]) k.box(0.35, 0.9, 0.8, 6.5, back - 1.4, k.all(k.body), undefined, x);
    // a small vent on the front of the roof, open at the front
    k.box(2.2, 0.4, 1.6, 9.35, -0.4, k.all(k.body));
    k.box(1.8, 0.25, 0.08, 9.35, -1.22, k.all(black));
    // broad squared flares over all four wheels
    const R = 2.85;
    const hubY = 2.25;
    const axles = [-7.8, 7.6];
    const reaches = [3.6, 3.5];
    for (let i = 0; i < 2; i++) for (const x of [-(w / 2 - 0.35), w / 2 - 0.35]) {
      const z = axles[i];
      const reach = reaches[i];
      k.add(profile((s) => {
        const a = Math.asin((hubY - 1.8) / R);
        s.moveTo(z - reach, 1.8);
        s.lineTo(z - reach, 4.9);
        s.lineTo(z - reach + 0.7, 5.5);
        s.lineTo(z + reach - 0.7, 5.5);
        s.lineTo(z + reach, 4.9);
        s.lineTo(z + reach, 1.8);
        s.absarc(z, hubY, R, -a, Math.PI + a, false);
      }, 1.2, 0.25, 6).translate(x, 0, 0), [k.body, k.body]);
    }
    // the colours: deep blue with a yellow crescent and stars on each door and on the bonnet, swept lines over them (no
    // lettering); a yellow banner along the top of the screen, yellow strips low on the front bumper
    /** a flat piece in the (z, y) plane on a side at `x` */
    const side2d = (pts: [number, number][], x: number, m: THREE.Material) => {
      k.add(profile((s) => {
        s.moveTo(pts[0][0], pts[0][1]);
        for (const [z, y] of pts.slice(1)) s.lineTo(z, y);
      }, 0.08).translate(x, 0, 0), [m, m]);
    };
    /** a crescent round (`u`, `v`), `r` across, `thick` at its widest, its horns pointing to +u (backward on a side) */
    const crescent = (u: number, v: number, r: number, thick: number): [number, number][] => {
      const pts: [number, number][] = [];
      const n = 20;
      const a0 = Math.PI * 0.6;
      const a1 = Math.PI * 1.4;
      for (let i = 0; i <= n; i++) {
        const a = a0 + ((a1 - a0) * i) / n;
        pts.push([u + r * Math.cos(a), v + r * Math.sin(a)]);
      }
      for (let i = n; i >= 0; i--) {
        const a = a0 + ((a1 - a0) * i) / n;
        const rr = r - thick * Math.sin((Math.PI * i) / n);
        pts.push([u + rr * Math.cos(a), v + rr * Math.sin(a)]);
      }
      return pts;
    };
    /** a four-pointed star round (`u`, `v`), `r` to its points */
    const star = (u: number, v: number, r: number): [number, number][] => {
      const pts: [number, number][] = [];
      for (let n = 0; n < 8; n++) {
        const a = (n * Math.PI) / 4 + Math.PI / 2;
        const rr = n % 2 ? r * 0.32 : r;
        pts.push([u + rr * Math.cos(a), v + rr * Math.sin(a)]);
      }
      return pts;
    };
    /** a band `thick` wide along the curve from `p0` past `p1` to `p2` */
    const sweepBand = (p0: [number, number], p1: [number, number], p2: [number, number], thick: number): [number, number][] => {
      const at = (t: number): [number, number] => {
        const q = 1 - t;
        return [q * q * p0[0] + 2 * q * t * p1[0] + t * t * p2[0], q * q * p0[1] + 2 * q * t * p1[1] + t * t * p2[1]];
      };
      const top: [number, number][] = [];
      const bottom: [number, number][] = [];
      for (let n = 0; n <= 12; n++) {
        const [u, v] = at(n / 12);
        const taper = thick * (0.35 + 0.65 * (1 - n / 12));
        top.push([u, v + taper / 2]);
        bottom.push([u, v - taper / 2]);
      }
      return [...top, ...bottom.reverse()];
    };
    /**
     * the emblem, round (0, 0): a big crescent opening forward (to −u), a big star and three small ones in its hollow,
     * and a yellow and a light blue line sweeping forward from its top
     */
    const emblem = (): { m: THREE.Material; pts: [number, number][] }[] => [
      { m: yellow, pts: crescent(0, 0, 1.9, 0.8).map(([u, v]) => [-u, v]) },
      { m: yellow, pts: star(0.05, 0, 0.7) },
      { m: yellow, pts: star(-0.8, 0.75, 0.34) },
      { m: yellow, pts: star(-0.55, -0.8, 0.3) },
      { m: yellow, pts: star(-1.25, -0.05, 0.27) },
      { m: yellow, pts: sweepBand([0.55, 1.75], [-2.5, 2.05], [-5.3, 1.15], 0.24) },
      { m: sky, pts: sweepBand([0.15, 1.35], [-2.6, 1.6], [-5.2, 0.75], 0.2) },
    ];
    for (const side of [-1, 1]) {
      for (const { m, pts } of emblem()) side2d(pts.map(([u, v]) => [1.7 + u, 3.65 + v]), side * (w / 2 + 0.04), m);
    }
    // (the banner along the top of the screen)
    const sc = (t: number): [number, number] => [-4.7 + 3.4 * t + 0.06, 5.7 + 3.1 * t + 0.06];
    k.add(profile((s) => {
      s.moveTo(...sc(0.8));
      s.lineTo(...sc(0.97));
      s.lineTo(sc(0.97)[0] - 0.05, sc(0.97)[1] + 0.05);
      s.lineTo(sc(0.8)[0] - 0.05, sc(0.8)[1] + 0.05);
    }, w - 2.4), [yellow, yellow]);
    const onBonnet = (pts: [number, number][], m: THREE.Material) => {
      const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, z)));
      const g = new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: false }).rotateX(Math.PI / 2);
      const pos = g.getAttribute('position');
      for (let n = 0; n < pos.count; n++) pos.setY(n, pos.getY(n) + bonnet(pos.getZ(n)) + 0.08);
      g.computeVertexNormals();
      k.add(g, [m, m]);
    };
    // (on the bonnet, ahead of the scoop at one side, opening across the car)
    for (const { m, pts } of emblem()) onBonnet(pts.map(([u, v]) => [2.4 + u * 0.8, -9.9 + v * 0.8]), m);
    // the nose: a wide sloping headlamp at each corner, a black mesh grille between them, the bumper below with a broad
    // black intake, a round fog lamp in a black ring at each corner over a yellow strip, amber indicators above them,
    // a black splitter
    for (const x of [-(w / 2 - 2), w / 2 - 2]) {
      k.front(3, 0.9, 0.1, 4.05, front - 0.06, k.all(black), x);
      k.front(2.8, 0.7, 0.1, 4.05, front - 0.1, k.all(k.lamp), x);
    }
    k.front(3.6, 0.75, 0.1, 4.0, front - 0.06, k.all(black));
    for (let i = 0; i < 2; i++) k.front(3.4, 0.08, 0.1, 3.85 + i * 0.3, front - 0.1, k.all(k.body));
    k.front(w + 0.2, 1.7, 0.8, 2.5, front - 0.2, k.all(k.body));
    k.front(5, 1, 0.1, 2.45, front - 0.62, k.all(black));
    for (const side of [-1, 1]) {
      k.add(drum(0.72, 0.12, 'z', side * 4.4, 2.5, front - 0.64 - k.noseZ, 16), [black, black, black], k.nose);
      k.add(drum(0.5, 0.12, 'z', side * 4.4, 2.5, front - 0.7 - k.noseZ, 16), [k.lamp, k.lamp, k.lamp], k.nose);
      k.front(2.4, 0.3, 0.1, 1.85, front - 0.62, k.all(yellow), side * 4.4);
      k.front(1, 0.35, 0.1, 3.15, front - 0.62, k.all(amber), side * (w / 2 - 0.8));
    }
    k.front(w, 0.15, 1.2, 1.5, front - 0.4, k.all(black));
    // at night or in the evening, a black pod of four big round lamps on the front of the bonnet
    if (k.floodlights) {
      k.add(profile((s) => {
        s.moveTo(front + 0.3, bonnet(front + 0.6) - 0.2);
        s.lineTo(front + 0.3, bonnet(front + 0.6) + 1.7);
        s.lineTo(front + 1.6, bonnet(front + 1.6) + 1.5);
        s.lineTo(front + 2.4, bonnet(front + 2.4));
      }, 7.4, 0.15, 2), [black, black]);
      for (const x of [-2.7, -0.9, 0.9, 2.7]) {
        k.add(drum(0.74, 0.1, 'z', x, bonnet(front + 0.6) + 0.75, front + 0.22 - k.noseZ, 14), [k.lamp, k.lamp, k.lamp], k.nose);
      }
    }
    // the tail: red lamps across a black panel, the bumper below
    k.box(w - 1, 1.1, 0.12, 4.75, back + 0.03, k.all(black));
    for (const x of [-(w / 2 - 1.8), w / 2 - 1.8]) k.box(3.2, 1, 0.15, 4.75, back + 0.06, k.all(red), undefined, x);
    k.box(w + 0.2, 1.1, 0.6, 2.3, back + 0.2, k.all(k.body));
    // white mud flaps behind the wheels
    for (const z of [-4, 11.2]) for (const x of [-(w / 2 - 1.1), w / 2 - 1.1]) k.box(1.8, 1.6, 0.2, 1.2, z, k.all(white), undefined, x);
    return {
      axles: [axles[0], axles[1]],
      wheel: { radius: 2.25, width: 2.7, half: w / 2 - 1.3, rim: '#d4a72c' },
      tail: { z: back + 0.1, y: 4.75, x: w / 2 - 1.8, w: 3, h: 0.9 },
      exhaust: { x: -1.6, y: 1.75, z: back + 0.5 },
    };
  },

  /**
   * FALCO VI, late 1990s: the boxy four-door turbo four-wheel-drive saloon that won four titles in a row (the Lancer
   * Evolution's kind of car). A blunt nose with a big mesh intake, a vented bonnet, a tall upright cabin, a big wing
   * with tall end plates over the boot, squared flares over all four wheels. Red, a black and white waist stripe.
   */
  falco(k) {
    const w = 12.8;
    const front = -12.4;
    const back = 12;
    const black = k.paint(0x16171b);
    const red = k.paint(0xd0242a);
    const amber = k.paint(0xf29a1a);
    const white = k.paint(0xf4f4f0);
    const mesh = k.paint(0x6b6e75);
    const waist = 5.9;
    /** the bonnet's height at `z`, from the nose up to the screen */
    const bonnet = (z: number) => 5.0 + ((z - front - 0.4) * 0.8) / (-4.6 - front - 0.4);
    // the body: a blunt square nose, a near-flat bonnet, level sides, a short boot, an upright tail
    k.add(profile((s) => {
      s.moveTo(front + 0.4, 1.5);
      s.lineTo(back - 0.4, 1.5);
      s.lineTo(back, 2.1);
      s.lineTo(back, 5.7);
      s.lineTo(back - 0.4, 6.15);
      s.lineTo(7.2, 6.15);
      s.lineTo(-4.6, waist);
      s.lineTo(front + 0.4, bonnet(front + 0.4));
      s.quadraticCurveTo(front, 5.0, front, 4.6);
      s.lineTo(front, 2.0);
      s.quadraticCurveTo(front, 1.5, front + 0.4, 1.5);
    }, w, 0.4, 3), [k.pods, k.body]);
    // the glasshouse: an upright screen, a long flat roof, a steep back window down to the boot
    k.add(profile((s) => {
      s.moveTo(-4.7, 5.8);
      s.lineTo(-1.6, 8.95);
      s.lineTo(4.4, 8.95);
      s.lineTo(7.3, 6.15);
      s.lineTo(7.3, 5.8);
    }, w - 1.9), [k.glass, k.glass]);
    k.add(profile((s) => {
      s.moveTo(-1.8, 8.85);
      s.lineTo(4.6, 8.85);
      s.lineTo(4.4, 9.3);
      s.lineTo(-1.5, 9.3);
    }, w - 1.6, 0.25, 2), [k.body, k.body]);
    const px = (w - 1.9) / 2;
    for (const side of [-1, 1]) {
      const x = side * px;
      // (the screen pillars, the door pillar, and the rear pillar down to the boot)
      k.add(profile((s) => {
        s.moveTo(-4.95, 5.8);
        s.lineTo(-1.85, 8.95);
        s.lineTo(-1.35, 8.95);
        s.lineTo(-4.45, 5.8);
      }, 0.3).translate(x, 0, 0), [k.body, k.body]);
      k.box(0.3, 3.15, 0.45, 7.4, 1.5, k.all(k.body), undefined, x);
      k.add(profile((s) => {
        s.moveTo(3.5, 8.95);
        s.lineTo(4.5, 8.95);
        s.lineTo(7.4, 6.15);
        s.lineTo(7.4, 5.8);
        s.lineTo(5.6, 5.8);
      }, 0.3).translate(x, 0, 0), [k.body, k.body]);
    }
    // a big black vent in the middle of the bonnet, a small one at each side, a vent on the front of the roof
    for (let i = 0; i < 4; i++) k.box(4.2, 0.08, 0.3, bonnet(-8.6 + i * 0.6) + 0.05, -8.6 + i * 0.6, k.all(black));
    for (const x of [-4.4, 4.4]) for (let i = 0; i < 3; i++) k.box(1.6, 0.08, 0.25, bonnet(-6.6 + i * 0.5) + 0.05, -6.6 + i * 0.5, k.all(black), undefined, x);
    k.box(2.2, 0.4, 1.6, 9.5, -0.6, k.all(k.body));
    k.box(1.8, 0.25, 0.08, 9.5, -1.42, k.all(black));
    // the big wing over the boot on two tall stays, tall red end plates, its lip in the driver's colour (yours gold)
    k.add(profile((s) => {
      s.moveTo(back - 2.9, 8.15);
      s.lineTo(back + 0.1, 8.5);
      s.lineTo(back + 0.1, 8.1);
      s.lineTo(back - 2.7, 7.9);
    }, w - 1.2, 0.08, 3), [white, white]);
    k.box(w - 1.4, 0.16, 0.22, 8.56, back + 0.05, k.all(k.scoop));
    for (const x of [-(w / 2 - 0.55), w / 2 - 0.55]) k.box(0.15, 1.9, 3.2, 8.0, back - 1.3, k.all(k.body), undefined, x);
    for (const x of [-(w / 2 - 2.2), w / 2 - 2.2]) k.box(0.35, 2.0, 0.8, 7.0, back - 1.5, k.all(k.body), undefined, x);
    // squared flares over all four wheels
    const R = 2.85;
    const hubY = 2.25;
    const axles = [-7.6, 7.6];
    const reaches = [3.6, 3.5];
    for (let i = 0; i < 2; i++) for (const x of [-(w / 2 - 0.35), w / 2 - 0.35]) {
      const z = axles[i];
      const reach = reaches[i];
      k.add(profile((s) => {
        const a = Math.asin((hubY - 1.8) / R);
        s.moveTo(z - reach, 1.8);
        s.lineTo(z - reach, 5.0);
        s.lineTo(z - reach + 0.5, 5.5);
        s.lineTo(z + reach - 0.5, 5.5);
        s.lineTo(z + reach, 5.0);
        s.lineTo(z + reach, 1.8);
        s.absarc(z, hubY, R, -a, Math.PI + a, false);
      }, 1.2, 0.2, 6).translate(x, 0, 0), [k.body, k.body]);
    }
    // the colours: red all over, a black and a white stripe along the waist from the front door to the tail, kinked
    // down at the front door; white wheels
    /** a flat piece in the (z, y) plane on a side at `x` */
    const side2d = (pts: [number, number][], x: number, m: THREE.Material) => {
      k.add(profile((s) => {
        s.moveTo(pts[0][0], pts[0][1]);
        for (const [z, y] of pts.slice(1)) s.lineTo(z, y);
      }, 0.08).translate(x, 0, 0), [m, m]);
    };
    /** the stripes' top at `z`: under the body's top edge, a step down at the front of the door */
    const top = (z: number) => (z < 7.2 ? waist + ((z + 4.6) * 0.25) / 11.8 : 6.15) - 0.3 - (z < -2.6 ? 0.45 * Math.min(1, (-2.6 - z) / 1.2) : 0);
    const flareTop = 5.5;
    /** a stripe `d0` to `d1` under the top from `z0` to `z1`, cut to between `lo` and `hi` */
    const stripe = (z0: number, z1: number, d0: number, d1: number, lo: number, hi: number): [number, number][] => {
      const zs: number[] = [];
      for (let z = z0; z < z1; z += 0.4) zs.push(z);
      zs.push(z1);
      const clamp = (y: number) => Math.min(hi, Math.max(lo, y));
      return [...zs.map((z): [number, number] => [z, clamp(top(z) - d0)]), ...[...zs].reverse().map((z): [number, number] => [z, clamp(top(z) - d1)])];
    };
    const r1 = axles[1] - reaches[1];
    const r2 = axles[1] + reaches[1];
    for (const side of [-1, 1]) {
      for (const [d0, d1, m] of [[0, 0.3, white], [0.35, 0.57, black]] as const) {
        // (on the body along the doors and behind the rear flare; along the rear flare, on the flare's face up to its
        // top, on the body above it)
        side2d(stripe(axles[0] + reaches[0], r1, d0, d1, 0, 9), side * (w / 2 + 0.04), m);
        side2d(stripe(r2, back - 0.3, d0, d1, 0, 9), side * (w / 2 + 0.04), m);
        side2d(stripe(r1, r2, d0, d1, 0, flareTop), side * (w / 2 + 0.3), m);
        side2d(stripe(r1, r2, d0, d1, flareTop, 9), side * (w / 2 + 0.04), m);
      }
    }
    // the white front: the bonnet ahead of the vents, the tops of the front flares, the nose above the headlamps; the
    // dark stripe starts on the front flare behind the white
    const onBonnet = (pts: [number, number][], m: THREE.Material) => {
      const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, z)));
      const g = new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: false }).rotateX(Math.PI / 2);
      const pos = g.getAttribute('position');
      for (let n = 0; n < pos.count; n++) pos.setY(n, pos.getY(n) + bonnet(pos.getZ(n)) + 0.08);
      g.computeVertexNormals();
      k.add(g, [m, m]);
    };
    const ex = w / 2 - 0.3;
    onBonnet([[-ex, front + 0.3], [ex, front + 0.3], [ex, -8.9], [ex - 1, -8.5], [-(ex - 1), -8.5], [-ex, -8.9]], white);
    k.front(w - 0.8, 0.35, 0.1, 4.97, front - 0.03, k.all(white));
    for (const side of [-1, 1]) {
      const fx = side * (w / 2 + 0.3);
      side2d([[axles[0] - reaches[0] + 0.2, 5.15], [-8.6, 5.15], [-8.6, 5.5], [axles[0] - reaches[0] + 0.2, 5.5]], fx, white);
      side2d([[-8.4, 5.2], [axles[0] + reaches[0], 5.15], [axles[0] + reaches[0], 5.5], [-8.4, 5.5]], fx, black);
    }
    // the nose: slim headlamps either side of a slim black grille, a red bumper below with a big grey mesh intake in
    // the middle, black slots at its corners, amber indicators over them, a black splitter
    for (const x of [-(w / 2 - 2), w / 2 - 2]) {
      k.front(3, 0.75, 0.1, 4.55, front - 0.06, k.all(black), x);
      k.front(2.8, 0.55, 0.1, 4.55, front - 0.1, k.all(k.lamp), x);
    }
    k.front(3.4, 0.55, 0.1, 4.55, front - 0.06, k.all(black));
    k.front(w + 0.2, 2.4, 0.8, 2.65, front - 0.2, k.all(k.body));
    k.front(6, 1.5, 0.1, 2.5, front - 0.62, k.all(black));
    k.front(5.6, 1.2, 0.1, 2.5, front - 0.66, k.all(mesh));
    for (let i = 0; i < 4; i++) k.front(5.6, 0.06, 0.1, 2.05 + i * 0.3, front - 0.7, k.all(black));
    for (const side of [-1, 1]) {
      k.front(1.6, 0.9, 0.1, 2.3, front - 0.62, k.all(black), side * 4.6);
      k.front(1, 0.35, 0.1, 3.4, front - 0.62, k.all(amber), side * (w / 2 - 0.8));
    }
    k.front(w, 0.15, 1.2, 1.45, front - 0.4, k.all(black));
    // at night or in the evening, four big round lamps on a black bar across the front of the bonnet, the outer two lower
    if (k.floodlights) {
      k.front(7.8, 0.3, 1.4, 4.95, front - 0.5, k.all(black));
      for (const [x, y] of [[-2.85, 5.25], [-0.95, 5.75], [0.95, 5.75], [2.85, 5.25]] as const) {
        k.add(drum(0.85, 0.5, 'z', x, y, front - 0.75 - k.noseZ, 14), [black, black, black], k.nose);
        k.add(drum(0.72, 0.1, 'z', x, y, front - 1.02 - k.noseZ, 14), [k.lamp, k.lamp, k.lamp], k.nose);
      }
    }
    // the tail: red lamps at the corners on a black panel, a red bumper
    k.box(w - 1, 1.2, 0.12, 4.9, back + 0.03, k.all(black));
    for (const x of [-(w / 2 - 1.7), w / 2 - 1.7]) k.box(3, 1.1, 0.15, 4.9, back + 0.06, k.all(red), undefined, x);
    k.box(w + 0.2, 1.3, 0.6, 2.4, back + 0.2, k.all(k.body));
    // red mud flaps behind the wheels
    for (const z of [-3.8, 11.3]) for (const x of [-(w / 2 - 1.1), w / 2 - 1.1]) k.box(1.8, 1.6, 0.2, 1.2, z, k.all(red), undefined, x);
    return {
      axles: [axles[0], axles[1]],
      wheel: { radius: 2.25, width: 2.7, half: w / 2 - 1.3, rim: '#f4f4f0' },
      tail: { z: back + 0.1, y: 4.9, x: w / 2 - 1.7, w: 2.8, h: 1 },
      exhaust: { x: 1.8, y: 1.75, z: back + 0.5 },
    };
  },

  /**
   * LEONE S, around 2000: the short three-door hatch that won three makers' titles in a row (the 206 WRC's kind of
   * car). A rounded sloping nose with long swept-back headlamps and a wide grinning intake, a short bonnet, a long
   * screen, a domed roof, a steep hatch with a spoiler over it, round flares over all four wheels.
   */
  leone(k) {
    const w = 12.8;
    const front = -11.4;
    const back = 10.6;
    const black = k.paint(0x16171b);
    const blue = k.paint(0x1d3f9a);
    const red = k.paint(0xd0242a);
    const amber = k.paint(0xf29a1a);
    const mesh = k.paint(0x6b6e75);
    const waist = 5.7;
    /** the bonnet's height at `z`, from the nose up to the screen */
    const bonnet = (z: number) => 4.6 + ((z - front - 0.8) * 1.1) / (-3.8 - front - 0.8);
    // the body: a rounded sloping nose, a short bonnet, level sides, an upright tail
    k.add(profile((s) => {
      s.moveTo(front + 0.6, 1.5);
      s.lineTo(back - 0.4, 1.5);
      s.lineTo(back, 2.1);
      s.lineTo(back, 5.6);
      s.lineTo(back - 0.4, 6.0);
      s.lineTo(8.6, 6.0);
      s.lineTo(-3.8, waist);
      s.lineTo(front + 0.8, bonnet(front + 0.8));
      s.quadraticCurveTo(front, 4.6, front, 3.8);
      s.lineTo(front, 2.1);
      s.quadraticCurveTo(front, 1.5, front + 0.6, 1.5);
    }, w, 0.45, 8), [k.pods, k.body]);
    // the glasshouse: a long raked screen, a domed roof, a steep hatch
    k.add(profile((s) => {
      s.moveTo(-3.9, 5.6);
      s.lineTo(-0.6, 8.65);
      s.quadraticCurveTo(3, 9.0, 6.6, 8.65);
      s.lineTo(back - 0.6, 6.0);
      s.lineTo(back - 0.6, 5.6);
    }, w - 1.9, 0, 8), [k.glass, k.glass]);
    k.add(profile((s) => {
      s.moveTo(-0.8, 8.55);
      s.quadraticCurveTo(3, 8.9, 6.8, 8.55);
      s.lineTo(6.6, 9.0);
      s.quadraticCurveTo(3, 9.35, -0.5, 9.0);
    }, w - 1.6, 0.25, 8), [k.body, k.body]);
    const px = (w - 1.9) / 2;
    for (const side of [-1, 1]) {
      const x = side * px;
      // (the screen pillars, the door's rear edge, and the broad rear pillar down to the tail)
      k.add(profile((s) => {
        s.moveTo(-4.15, 5.6);
        s.lineTo(-0.85, 8.65);
        s.lineTo(-0.35, 8.65);
        s.lineTo(-3.65, 5.6);
      }, 0.3).translate(x, 0, 0), [k.body, k.body]);
      k.add(profile((s) => {
        s.moveTo(4.6, 8.75);
        s.lineTo(6.7, 8.65);
        s.lineTo(back - 0.5, 6.0);
        s.lineTo(back - 0.5, 5.6);
        s.lineTo(6.2, 5.6);
      }, 0.3).translate(x, 0, 0), [k.body, k.body]);
    }
    // the tall wing over the hatch on two stays, big end plates, reaching back over the tail, its
    // lip in the driver's colour (yours gold); a small vent on the front of the roof
    k.add(profile((s) => {
      s.moveTo(7.2, 9.85);
      s.lineTo(back + 0.3, 9.65);
      s.lineTo(back + 0.3, 9.3);
      s.lineTo(7.5, 9.55);
    }, w - 1.3, 0.1, 3), [k.body, k.body]);
    k.box(w - 1.5, 0.16, 0.22, 9.72, back + 0.25, k.all(k.scoop));
    for (const x of [-(w / 2 - 0.75), w / 2 - 0.75]) {
      k.add(profile((s) => {
        s.moveTo(7, 9.0);
        s.lineTo(7, 10.15);
        s.lineTo(back + 0.4, 9.95);
        s.lineTo(back + 0.4, 9.0);
      }, 0.18, 0.06, 2).translate(x, 0, 0), [k.body, k.body]);
    }
    for (const x of [-2.8, 2.8]) k.box(0.35, 2.4, 0.9, 8.3, 8.6, k.all(k.body), undefined, x);
    k.box(2.2, 0.4, 1.5, 9.4, 0.4, k.all(k.body));
    k.box(1.8, 0.25, 0.08, 9.4, -0.37, k.all(black));
    // vents in the bonnet either side
    for (const x of [-3, 3]) for (let i = 0; i < 3; i++) k.box(2, 0.08, 0.25, bonnet(-7.2 + i * 0.5) + 0.05, -7.2 + i * 0.5, k.all(black), undefined, x);
    // round flares over all four wheels
    const R = 2.85;
    const hubY = 2.25;
    const axles = [-7, 6.6];
    const reaches = [3.5, 3.4];
    for (let i = 0; i < 2; i++) for (const x of [-(w / 2 - 0.35), w / 2 - 0.35]) {
      const z = axles[i];
      const reach = reaches[i];
      k.add(profile((s) => {
        const a = Math.asin((hubY - 1.8) / R);
        s.moveTo(z - reach, 1.8);
        s.lineTo(z - reach, 4.4);
        s.quadraticCurveTo(z - reach, 5.45, z - reach + 1.2, 5.45);
        s.lineTo(z + reach - 1.2, 5.45);
        s.quadraticCurveTo(z + reach, 5.45, z + reach, 4.4);
        s.lineTo(z + reach, 1.8);
        s.absarc(z, hubY, R, -a, Math.PI + a, false);
      }, 1.2, 0.2, 8).translate(x, 0, 0), [blue, blue]);
    }
    // the colours: white with blue brush strokes: the flares blue, a ragged blue wave on each door behind the front
    // flare, a thin blue line along the sills, the left half of the nose and bonnet blue with a ragged edge, blue
    // across a corner of the tail
    /** a flat piece in the (z, y) plane on a side at `x` */
    const side2d = (pts: [number, number][], x: number, m: THREE.Material) => {
      k.add(profile((s) => {
        s.moveTo(pts[0][0], pts[0][1]);
        for (const [z, y] of pts.slice(1)) s.lineTo(z, y);
      }, 0.08).translate(x, 0, 0), [m, m]);
    };
    const d0 = axles[0] + reaches[0];
    const d1 = axles[1] - reaches[1];
    for (const side of [-1, 1]) {
      const bx = side * (w / 2 + 0.04);
      side2d([[d0, 1.8], [d0 + 1.9, 1.8], [d0 + 1.1, 2.6], [d0 + 1.6, 3.4], [d0 + 0.6, 4.3], [d0 + 1.2, 5.1], [d0 + 0.4, 5.55], [d0, 5.6]], bx, blue);
      side2d([[d0 + 1.9, 1.8], [d1, 1.8], [d1, 2.02], [d0 + 1.7, 2.02]], bx, blue);
      // (above the rear flare, up to the waist)
      side2d([[d1, 5.4], [back - 0.3, 5.4], [back - 0.3, 5.9], [d1 + 1.5, 5.85], [d1 + 0.6, 5.6]], bx, blue);
    }
    k.box(4.6, 2.6, 0.08, 4.3, back + 0.02, k.all(blue), undefined, w / 2 - 2.5);
    const onBonnet = (pts: [number, number][], m: THREE.Material) => {
      const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, z)));
      const g = new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: false }).rotateX(Math.PI / 2);
      const pos = g.getAttribute('position');
      for (let n = 0; n < pos.count; n++) pos.setY(n, pos.getY(n) + bonnet(pos.getZ(n)) + 0.08);
      g.computeVertexNormals();
      k.add(g, [m, m]);
    };
    const ex = w / 2 - 0.3;
    onBonnet([[-ex, front + 0.6], [-1.2, front + 0.6], [-2.3, front + 2.2], [-1.3, front + 3.6], [-2.9, front + 5.4], [-2.2, -4.2], [-ex, -4.2]], blue);
    k.front(w / 2 - 1.4, 1.8, 0.1, 2.4, front - 0.61, k.all(blue), -(w / 2 + 1.4) / 2);
    k.front(1.4, 0.9, 0.1, 2.85, front - 0.61, k.all(blue), -1);
    // the nose: long headlamps swept back along the top of each corner, a small grille between them, the bumper below
    // with a wide grey mesh intake right across it, amber indicators at its corners, a black splitter
    for (const side of [-1, 1]) {
      k.add(profile((s) => {
        s.moveTo(front - 0.02, 3.95);
        s.lineTo(front - 0.02, 4.45);
        s.lineTo(front + 2.4, bonnet(front + 2.4) - 0.1);
        s.lineTo(front + 2.4, bonnet(front + 2.4) - 0.5);
      }, 2.6).translate(side * (w / 2 - 1.7), 0, 0), [black, k.lamp]);
    }
    k.front(2.6, 0.5, 0.1, 4.15, front - 0.04, k.all(black));
    k.front(w + 0.2, 1.8, 0.8, 2.4, front - 0.2, k.all(k.body));
    k.front(9.6, 1.3, 0.1, 2.3, front - 0.64, k.all(black));
    k.front(9.2, 1.0, 0.1, 2.3, front - 0.68, k.all(mesh));
    for (let i = 0; i < 3; i++) k.front(9.2, 0.06, 0.1, 1.95 + i * 0.35, front - 0.72, k.all(black));
    for (const side of [-1, 1]) k.front(1, 0.35, 0.1, 3.1, front - 0.62, k.all(amber), side * (w / 2 - 0.8));
    k.front(w, 0.15, 1.2, 1.45, front - 0.4, k.all(black));
    // at night or in the evening, a white pod across the nose between the headlamps, sloping back onto the bonnet,
    // four round lamps in a row in its face, each in a chrome ring
    if (k.floodlights) {
      const y0 = bonnet(front + 0.8);
      k.add(profile((s) => {
        s.moveTo(front - 0.7, 3.9);
        s.lineTo(front - 0.7, y0 + 0.9);
        s.lineTo(front + 2.6, bonnet(front + 2.6) + 0.15);
        s.lineTo(front + 2.6, bonnet(front + 2.6) - 0.2);
        s.lineTo(front + 0.2, 3.9);
      }, 8.2, 0.25, 3), [k.body, k.body]);
      for (const x of [-2.85, -0.95, 0.95, 2.85]) {
        k.add(drum(0.82, 0.1, 'z', x, (3.9 + y0 + 0.9) / 2, front - 0.74 - k.noseZ, 16), [k.chrome, k.chrome, k.chrome], k.nose);
        k.add(drum(0.68, 0.1, 'z', x, (3.9 + y0 + 0.9) / 2, front - 0.8 - k.noseZ, 16), [k.lamp, k.lamp, k.lamp], k.nose);
      }
    }
    // the tail: tall red lamps up the corners on a black panel, a white bumper
    k.box(w - 1, 1, 0.12, 4.8, back + 0.03, k.all(black));
    for (const x of [-(w / 2 - 1.2), w / 2 - 1.2]) k.box(1.6, 1.8, 0.15, 4.8, back + 0.06, k.all(red), undefined, x);
    k.box(w + 0.2, 1.2, 0.6, 2.4, back + 0.2, k.all(k.body));
    // blue mud flaps behind the wheels
    for (const z of [-3.3, 10.05]) for (const x of [-(w / 2 - 1.1), w / 2 - 1.1]) k.box(1.8, 1.6, 0.2, 1.2, z, k.all(blue), undefined, x);
    return {
      axles: [axles[0], axles[1]],
      wheel: { radius: 2.25, width: 2.7, half: w / 2 - 1.3, rim: '#f4f4f0' },
      tail: { z: back + 0.1, y: 4.8, x: w / 2 - 1.2, w: 1.4, h: 1.6 },
      exhaust: { x: 1.8, y: 1.75, z: back + 0.5 },
    };
  },

  /**
   * ZEFIRO RS, mid 2000s: the wide, wedge-nosed three-door hatch that won two makers' titles running (the Focus RS
   * WRC's kind of car). A long sloping nose with a big trapezoid intake, swept-back headlamps, a long raked screen, a
   * flat roof, a big wing on tall black end plates over the hatch, broad flares. Lime nose, green, white and blue.
   */
  zefiro(k) {
    const w = 12.8;
    const front = -12;
    const back = 11;
    const black = k.paint(0x16171b);
    const lime = k.paint(0xa6d23a);
    const green = k.paint(0x179a4a);
    const blue = k.paint(0x1d3f9a);
    const sky = k.paint(0x7cc8e8);
    const red = k.paint(0xd0242a);
    const waist = 5.8;
    /** the bonnet's height at `z`, from the nose up to the screen */
    const bonnet = (z: number) => 4.7 + ((z - front - 0.8) * 1.05) / (-4 - front - 0.8);
    // the body: a long sloping nose, the bonnet rising to the screen, level sides, an upright tail
    k.add(profile((s) => {
      s.moveTo(front + 0.6, 1.5);
      s.lineTo(back - 0.4, 1.5);
      s.lineTo(back, 2.1);
      s.lineTo(back, 5.3);
      s.quadraticCurveTo(back, 6.1, back - 0.8, 6.1);
      s.lineTo(8.6, 6.1);
      s.lineTo(-4, waist);
      s.lineTo(front + 0.8, bonnet(front + 0.8));
      s.quadraticCurveTo(front, 4.7, front, 3.9);
      s.lineTo(front, 2.1);
      s.quadraticCurveTo(front, 1.5, front + 0.6, 1.5);
    }, w, 0.75, 8), [k.pods, k.body]);
    // the glasshouse: one smooth arc from the raked screen over the domed roof down the sloping hatch, its shoulders
    // rounded in
    const arc = new THREE.SplineCurve([
      new THREE.Vector2(-4.1, 5.7), new THREE.Vector2(-2.3, 7.5), new THREE.Vector2(-0.4, 8.65), new THREE.Vector2(2.2, 8.95),
      new THREE.Vector2(5, 8.75), new THREE.Vector2(7.5, 7.75), new THREE.Vector2(back - 0.8, 6.2),
    ]).getPoints(48);
    /** the glass's top at `z` */
    const roof = (z: number) => {
      for (let n = 1; n < arc.length; n++) {
        const [a, b] = [arc[n - 1], arc[n]];
        if (z <= b.x) return a.y + ((b.y - a.y) * (z - a.x)) / (b.x - a.x || 1);
      }
      return arc[arc.length - 1].y;
    };
    const along = (z0: number, z1: number, dy = 0) => arc.filter((p) => p.x >= z0 && p.x <= z1).map((p) => new THREE.Vector2(p.x, p.y + dy));
    k.add(profile((s) => {
      s.moveTo(arc[0].x, arc[0].y);
      for (const p of arc.slice(1)) s.lineTo(p.x, p.y);
      s.lineTo(back - 0.8, 5.7);
    }, w - 1.7, 0.6, 4), [k.glass, k.glass]);
    // (the roof's skin over it, from the screen's top to the hatch's)
    k.add(profile((s) => {
      const top = along(-1.2, 7.2, 0.28);
      const under = along(-1.2, 7.2, -0.12).reverse();
      s.moveTo(top[0].x, top[0].y);
      for (const p of [...top.slice(1), ...under]) s.lineTo(p.x, p.y);
    }, w - 1.5, 0.45, 2), [k.body, k.body]);
    const px = (w - 2.3) / 2;
    for (const side of [-1, 1]) {
      const x = side * px;
      // (the screen pillars, the door's rear edge, and the broad rear pillar down to the tail, in blue)
      k.add(profile((s) => {
        const top = along(-4.1, -0.9, 0.05);
        s.moveTo(-4.4, 5.7);
        for (const p of top) s.lineTo(p.x - 0.25, p.y);
        for (const p of top.reverse()) s.lineTo(p.x + 0.25, p.y);
        s.lineTo(-3.8, 5.7);
      }, 0.3).translate(x, 0, 0), [k.body, k.body]);
      k.box(0.3, roof(1.8) - 5.7, 0.45, (roof(1.8) + 5.7) / 2, 1.8, k.all(k.body), undefined, x);
      k.add(profile((s) => {
        const top = along(5.2, back, 0.05);
        s.moveTo(top[0].x, top[0].y);
        for (const p of top.slice(1)) s.lineTo(p.x, p.y);
        s.lineTo(back - 0.6, 5.7);
        s.lineTo(7.4, 5.7);
      }, 0.3).translate(x, 0, 0), [blue, blue]);
    }
    // the big black wing over the hatch on tall end plates reaching back past the tail, its lip in the driver's
    // colour (yours gold); a small vent on the front of the roof
    k.add(profile((s) => {
      s.moveTo(7.3, 9.25);
      s.lineTo(back + 0.4, 9.05);
      s.lineTo(back + 0.4, 8.7);
      s.lineTo(7.6, 8.95);
    }, w - 1.3, 0.1, 3), [black, black]);
    k.box(w - 1.5, 0.16, 0.22, 9.12, back + 0.35, k.all(k.scoop));
    for (const x of [-(w / 2 - 0.75), w / 2 - 0.75]) {
      k.add(profile((s) => {
        s.moveTo(7.3, roof(7.3) - 0.1);
        s.lineTo(7.3, 9.6);
        s.lineTo(back + 0.6, 9.35);
        s.lineTo(back + 0.6, 8.6);
        s.lineTo(9.3, roof(9.3) - 0.1);
      }, 0.18, 0.06, 2).translate(x, 0, 0), [black, black]);
    }
    k.box(2.2, 0.4, 1.5, roof(0.3) + 0.45, 0.3, k.all(k.body));
    k.box(1.8, 0.25, 0.08, roof(0.3) + 0.45, -0.47, k.all(black));
    // vents in the bonnet either side
    for (const x of [-3.4, 3.4]) for (let i = 0; i < 3; i++) k.box(1.8, 0.08, 0.25, bonnet(-6.8 + i * 0.5) + 0.12, -6.8 + i * 0.5, k.all(black), undefined, x);
    // broad flares over all four wheels: lime at the front, blue at the back
    const R = 2.85;
    const hubY = 2.25;
    const axles = [-7.4, 7];
    const reaches = [3.5, 3.4];
    for (let i = 0; i < 2; i++) for (const x of [-(w / 2 - 0.35), w / 2 - 0.35]) {
      const z = axles[i];
      const reach = reaches[i];
      const m = i === 0 ? lime : blue;
      k.add(profile((s) => {
        const a = Math.asin((hubY - 1.8) / R);
        s.moveTo(z - reach, 1.8);
        s.lineTo(z - reach, 3.6);
        s.bezierCurveTo(z - reach, 4.9, z - reach + 1.4, 5.5, z, 5.5);
        s.bezierCurveTo(z + reach - 1.4, 5.5, z + reach, 4.9, z + reach, 3.6);
        s.lineTo(z + reach, 1.8);
        s.absarc(z, hubY, R, -a, Math.PI + a, false);
      }, 1.2, 0.2, 8).translate(x, 0, 0), [m, m]);
    }
    // the colours: white, the nose and front wings lime; a blue and a light blue stripe down behind the front flare;
    // green low on the door, rising to the front; behind it a light blue stripe and deep blue over the rear quarter,
    // slanting up to the rear pillar; a blue band up the middle of the bonnet; a blue tail
    /** a slab with corners rounded `r` seen from above, `x0..x1` across, `z0..z1` along, its top at `y`, `h` deep */
    // (the front bumper's face bulges: it rolls under at the bottom and back into the nose at the top)
    const bz = front - 0.6;
    const tuck = (z: number, y: number) => 0.75 * ((y - 2.45) / 0.95) ** 2 * Math.max(0, 1 - (z - bz) / 2);
    const bend = (g: THREE.BufferGeometry) => {
      const pos = g.getAttribute('position');
      for (let n = 0; n < pos.count; n++) pos.setZ(n, pos.getZ(n) + tuck(pos.getZ(n), pos.getY(n)));
      g.computeVertexNormals();
      return g;
    };
    const slab = (x0: number, x1: number, z0: number, z1: number, r: number, y: number, h: number, m: THREE.Material, bent = false) => {
      r = Math.min(r, (z1 - z0) / 2 - 0.01, (x1 - x0) / 2 - 0.01);
      const s = new THREE.Shape();
      s.moveTo(x0 + r, z0);
      s.lineTo(x1 - r, z0);
      s.quadraticCurveTo(x1, z0, x1, z0 + r);
      s.lineTo(x1, z1 - r);
      s.quadraticCurveTo(x1, z1, x1 - r, z1);
      s.lineTo(x0 + r, z1);
      s.quadraticCurveTo(x0, z1, x0, z1 - r);
      s.lineTo(x0, z0 + r);
      s.quadraticCurveTo(x0, z0, x0 + r, z0);
      const b = h < 1 ? 0 : 0.2;
      const g = new THREE.ExtrudeGeometry(s, { depth: h - 2 * b, steps: bent ? 8 : 1, bevelEnabled: b > 0, bevelSize: b, bevelThickness: b, bevelOffset: -b, bevelSegments: 2, curveSegments: 8 });
      g.rotateX(Math.PI / 2).translate(0, y - b, 0);
      k.add(bent ? bend(g) : g, [m, m]);
    };
    /** a flat piece in the (z, y) plane on a side at `x` */
    const side2d = (pts: [number, number][], x: number, m: THREE.Material) => {
      k.add(profile((s) => {
        s.moveTo(pts[0][0], pts[0][1]);
        for (const [z, y] of pts.slice(1)) s.lineTo(z, y);
      }, 0.08).translate(x, 0, 0), [m, m]);
    };
    const d0 = axles[0] + reaches[0];
    const d1 = axles[1] - reaches[1];
    /** the slant between the green and the blue: its z at height `y` */
    const slant = (y: number) => 0.6 + (y - 1.8) * 1.25;
    const top = (z: number) => waist + ((z + 4) * 0.3) / 12.6 - 0.05;
    for (const side of [-1, 1]) {
      const bx = side * (w / 2 + 0.04);
      // (lime ahead of the front flare, above it)
      side2d([[front + 0.6, 1.8], [d0 - 7, 1.8], [d0 - 7, 5.5], [d0, 5.5], [d0, top(d0)], [front + 0.6, 4.6]], bx, lime);
      side2d([[d0, 1.8], [d0 + 0.45, 1.8], [d0 + 0.45, top(d0 + 0.45)], [d0, top(d0)]], bx, blue);
      side2d([[d0 + 0.45, 1.8], [d0 + 0.75, 1.8], [d0 + 0.75, top(d0 + 0.75)], [d0 + 0.45, top(d0 + 0.45)]], bx, sky);
      // (green low on the door, its top rising toward the front)
      side2d([[d0 + 0.75, 1.8], [slant(1.8), 1.8], [slant(4.1), 4.1], [-0.5, 4.4], [d0 + 0.75, 5.0]], bx, green);
      side2d([[slant(1.8), 1.8], [slant(1.8) + 0.5, 1.8], [slant(top(5)) + 0.5, top(5)], [slant(top(5)), top(5)]], bx, sky);
      side2d([[slant(1.8) + 0.5, 1.8], [d1, 1.8], [d1, 5.5], [back - 0.3, 5.5], [back - 0.3, top(back)], [slant(top(5)) + 0.5, top(5)]], bx, blue);
    }
    const onBonnet = (pts: [number, number][], m: THREE.Material, lift = 0.08) => {
      const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, z)));
      const g = new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: false }).rotateX(Math.PI / 2);
      const pos = g.getAttribute('position');
      for (let n = 0; n < pos.count; n++) pos.setY(n, pos.getY(n) + bonnet(pos.getZ(n)) + lift);
      g.computeVertexNormals();
      k.add(g, [m, m]);
    };
    const ex = w / 2 - 0.3;
    onBonnet([[-ex, front + 0.7], [ex, front + 0.7], [ex, -4.2], [-ex, -4.2]], lime);
    onBonnet([[-1.6, front + 0.7], [1.6, front + 0.7], [2.3, -4.2], [-2.3, -4.2]], blue, 0.12);
    // the nose: big headlamps swept back from the corners, a blue-rimmed black grille between them, the lime bumper
    // below with a big black trapezoid intake, amber indicators at its corners, a black splitter
    for (const side of [-1, 1]) {
      // (a big lamp at each corner, its top along the bonnet's edge, swept far back and up into the wing, its
      // inner end black with a round projector in it, wrapping a little round onto the side)
      const x = side * (w / 2 - 1.75);
      k.add(profile((s) => {
        s.moveTo(front - 0.08, 3.85);
        s.lineTo(front - 0.08, 4.65);
        s.lineTo(front + 3.6, bonnet(front + 3.6) + 0.03);
        s.lineTo(front + 3.6, bonnet(front + 3.6) - 0.25);
        s.lineTo(front + 1.2, 3.85);
      }, 3.1).translate(x, 0, 0), [k.lamp, k.lamp]);
      k.box(1.1, 0.75, 0.08, 4.25, front - 0.13, k.all(black), undefined, side * (w / 2 - 2.7));
      k.add(drum(0.28, 0.08, 'z', side * (w / 2 - 2.7), 4.25, front - 0.19 - k.noseZ, 12), [k.lamp, k.lamp, k.lamp], k.nose);
      side2d([[front + 0.3, 3.9], [front + 1.3, 3.9], [front + 1.3, 4.75], [front + 0.3, 4.6]], side * (w / 2 + 0.06), k.lamp);
    }
    k.front(w - 0.6, 1.5, 0.02, 4.2, front - 0.01, k.all(lime));
    k.front(3.4, 0.75, 0.1, 4.15, front - 0.04, k.all(blue));
    k.front(3.0, 0.5, 0.1, 4.15, front - 0.08, k.all(black));
    slab(-(w / 2 + 0.1), w / 2 + 0.1, bz, front + 2.2, 2.4, 3.4, 1.9, lime, true);
    {
      const s = new THREE.Shape([new THREE.Vector2(-4.6, 1.6), new THREE.Vector2(4.6, 1.6), new THREE.Vector2(3.4, 3.2), new THREE.Vector2(-3.4, 3.2)]);
      const g = new THREE.ShapeGeometry(s, 1);
      // (split finely so it can follow the bulge)
      const fine = new THREE.PlaneGeometry(9.2, 1.6, 8, 8).rotateY(Math.PI).translate(0, 2.4, 0);
      const pos = fine.getAttribute('position');
      for (let n = 0; n < pos.count; n++) {
        const y = pos.getY(n);
        const half = 4.6 - ((y - 1.6) / 1.6) * 1.2;
        pos.setX(n, (pos.getX(n) / 4.6) * half);
        pos.setZ(n, bz - 0.04);
      }
      g.dispose();
      fine.addGroup(0, fine.getIndex()!.count, 0);
      k.add(bend(fine), [black, black]);
    }
    for (const side of [-1, 1]) k.front(1, 0.35, 0.1, 3.1, bz - 0.02 + tuck(bz, 3.1), k.all(k.paint(0xf29a1a)), side * (w / 2 - 2.6));
    slab(-(w / 2 - 0.3), w / 2 - 0.3, front - 0.75, front + 0.6, 2.4, 1.5, 0.45, black);
    // at night or in the evening, a black pod of four big round lamps on the front of the bonnet
    if (k.floodlights) {
      k.add(profile((s) => {
        s.moveTo(front + 0.5, bonnet(front + 0.8) - 0.3);
        s.lineTo(front + 0.5, bonnet(front + 0.8) + 1.6);
        s.lineTo(front + 1.7, bonnet(front + 1.7) + 1.4);
        s.lineTo(front + 2.5, bonnet(front + 2.5));
      }, 7.4, 0.15, 2), [black, black]);
      for (const x of [-2.7, -0.9, 0.9, 2.7]) {
        k.add(drum(0.74, 0.1, 'z', x, bonnet(front + 0.8) + 0.65, front + 0.42 - k.noseZ, 14), [k.lamp, k.lamp, k.lamp], k.nose);
      }
    }
    // the tail: blue, red lamps high at the corners, a blue bumper
    k.box(w - 0.4, 3.6, 0.08, 3.9, back + 0.02, k.all(blue));
    // (tall red lamps up the rear corners, running on up the edge of each rear pillar beside the hatch)
    for (const side of [-1, 1]) {
      k.box(1.5, 1.9, 0.15, 4.85, back + 0.06, k.all(red), undefined, side * (w / 2 - 1));
      k.add(profile((s) => {
        s.moveTo(back + 0.05, 5.75);
        s.lineTo(back - 0.6, 6.25);
        s.lineTo(7.4, roof(7.4) + 0.05);
        s.lineTo(6.9, roof(6.9) - 0.4);
        s.lineTo(back - 1.1, 5.95);
        s.lineTo(back - 0.6, 5.75);
      }, 1).translate(side * (w / 2 - 0.85), 0, 0), [red, red]);
    }
    slab(-(w / 2 + 0.1), w / 2 + 0.1, back - 2, back + 0.5, 1.4, 3, 1.2, blue);
    // black mud flaps behind the wheels
    for (const z of [-3.7, 10.45]) for (const x of [-(w / 2 - 1.1), w / 2 - 1.1]) k.box(1.8, 1.6, 0.2, 1.2, z, k.all(black), undefined, x);
    return {
      axles: [axles[0], axles[1]],
      wheel: { radius: 2.25, width: 2.7, half: w / 2 - 1.3, rim: '#f4f4f0' },
      tail: { z: back + 0.1, y: 4.85, x: w / 2 - 1, w: 1.4, h: 1.7 },
      exhaust: { x: -1.8, y: 1.75, z: back + 0.5 },
    };
  },

  /**
   * APEX R1, today: the wide modern hatch (the game's first car). A hatchback shell, glass all round the cabin, a
   * roof scoop, a big wing on the hatch, flared arches, and a bank of spotlights on the front bumper.
   */
  apex(k) {
    const { W, L } = k;
    k.box(W - 2, 5, L - 5, 4.6, 0.5, [k.pods, k.pods, k.body, k.dark, k.body, k.body]); // the shell, sills to the waistline
    k.box(W - 2.4, 0.5, 9, 7.3, -(L / 2 - 7.5), capped(k.body, k.deck(12 / 8, 1), k.dark)); // the bonnet
    k.box(W - 3, 4.4, 13, 9.3, 2.5, capped(k.glass, k.glass, k.dark)); // the cabin's glass
    k.box(W - 3.4, 0.7, 11, 11.7, 3, capped(k.body, k.deck(W - 3.4, 11), k.dark)); // the roof
    for (const x of [-(W - 3.2) / 2, (W - 3.2) / 2]) for (const z of [-3.6, 8.6]) k.box(0.5, 4.4, 1, 9.3, z, k.all(k.body), undefined, x);
    // wheel arches flared out over the tyres, in the trim colour
    for (const z of [-(L / 2 - 7), L / 2 - 7]) for (const x of [-(W / 2 - 0.4), W / 2 - 0.4]) {
      k.box(1.4, 1.2, 8, 6.4, z, capped(k.trim, k.trim, k.dark), undefined, x);
    }
    k.box(3.2, 1.2, 3.4, 12.6, -1, capped(k.scoop, k.scoop, k.dark));
    k.box(W - 5, 0.8, 1, 12.4, -2.8, capped(k.tcam, k.tcam, k.dark));
    // the rear wing on the hatch, on two stays
    k.box(W - 1.5, 0.7, 3, 13.4, L / 2 - 3, capped(k.trim, k.trim, k.dark));
    for (const x of [-(W - 6) / 2, (W - 6) / 2]) k.box(0.6, 2.4, 1.6, 12, L / 2 - 3, k.all(k.carbon), undefined, x);
    // the front bumper, and the spotlight pod on it
    k.front(W - 1.6, 2.6, 2.4, 3, -(L / 2 - 1.2), capped(k.carbon, k.carbon, k.dark));
    k.front(W - 4, 2, 1, 6.2, -(L / 2 - 1.6), capped(k.carbon, k.carbon, k.dark));
    for (const x of [-4.2, -1.4, 1.4, 4.2]) k.front(2, 1.6, 0.4, 6.2, -(L / 2 - 1.05), k.all(k.lamp), x);
    // mud flaps behind the rear wheels
    for (const x of [-(W / 2 - 1.5), W / 2 - 1.5]) k.box(3, 2.6, 0.3, 1.6, L / 2 - 2.6, k.all(k.carbon), undefined, x);
    return {
      axles: [-(L / 2 - 7), L / 2 - 7],
      wheel: { radius: 3.5, width: 3, half: W / 2 - 1.6, rim: '#2a2c33' },
      tail: { z: L / 2 - 2 + 0.5, y: 6, x: W / 2 - 2.6, w: 3.4, h: 1.8 },
    };
  },
};
