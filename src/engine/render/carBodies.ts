// The rally cars' bodies (cars.ts names them; vehicles3d.ts builds a car round one): six low-poly shells, one an era,
// each with the silhouette that era's rally cars are known by, seen from above (the stage's camera) as much as from the
// side. All invented: no maker's lines, lamps, grille or badge copied, only the shape of the time.
//
// Each body is built from boxes (some slanted, for a raked screen or a wedge nose) in the car's own frame: facing
// north (−z), y up, the ground at 0, about W (14) px wide and L (30) long like the car the physics drives. It returns
// where its wheels and tail lights go. BoxGeometry faces: +x, −x, +y, −y, +z (back), −z (front).

import * as THREE from 'three';

export type CarModel = 'mini' | 'fulvia' | 'alpine' | 'brisk' | 'stiletto' | 'quadra' | 'typhoon' | 'apex';

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

/** Pillars at each corner of a cabin `w` wide from z `z0` to `z1`, `h` tall at `y`. */
function pillars(k: BodyKit, w: number, h: number, y: number, z0: number, z1: number, inset = 0): void {
  for (const x of [-w / 2, w / 2]) for (const z of [z0, z1]) k.slant(0.5, h, 1, y, z, k.all(k.body), { inset }, undefined, x);
}

/** A row of `n` spotlights `gap` apart on the nose, at `y`, their lenses at `z`, on a carbon pod `podW` wide. */
function spotlights(k: BodyKit, n: number, gap: number, y: number, z: number, podW: number, size = 1.6): void {
  k.front(podW, size + 0.4, 1, y, z + 0.55, capped(k.carbon, k.carbon, k.dark));
  for (let i = 0; i < n; i++) k.front(size + 0.4, size, 0.4, y, z, k.all(k.lamp), (i - (n - 1) / 2) * gap);
}

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
    // the nose: a chrome grille, round headlamps in chrome rings, two spotlights before the grille, a chrome bumper
    k.front(5.6, 2.8, 0.3, 4.3, front - 0.05, k.all(k.chrome));
    k.front(4.8, 2.2, 0.3, 4.3, front - 0.12, k.all(black));
    for (const y of [3.7, 4.3, 4.9]) k.front(4.8, 0.16, 0.3, y, front - 0.2, k.all(k.chrome));
    for (const x of [-3.9, 3.9]) {
      // (each in a pod of the wing, standing out in front of the body: the wing's curve never cuts into the lamp)
      k.add(drum(1.2, 2, 'z', x, 4.9, front + 0.5 - k.noseZ, 14), [k.body, k.body, k.body], k.nose);
      k.add(drum(1.05, 0.4, 'z', x, 4.9, front - 0.65 - k.noseZ, 14), [k.chrome, k.chrome, k.chrome], k.nose);
      k.add(drum(0.85, 0.2, 'z', x, 4.9, front - 0.8 - k.noseZ, 14), [k.lamp, k.lamp, k.lamp], k.nose);
    }
    for (const x of [-1.5, 1.5]) {
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
    k.front(w - 0.8, 1.9, 0.3, 3.6, front - 0.05, k.all(k.chrome));
    k.front(w - 1.2, 1.5, 0.3, 3.6, front - 0.12, k.all(black));
    for (const x of [-4.4, -2.4, 2.4, 4.4]) {
      k.add(drum(0.82, 0.3, 'z', x, 3.6, front - 0.25 - k.noseZ, 14), [k.chrome, k.chrome, k.chrome], k.nose);
      k.add(drum(0.66, 0.12, 'z', x, 3.6, front - 0.42 - k.noseZ, 14), [k.lamp, k.lamp, k.lamp], k.nose);
    }
    for (const x of [-1.25, 1.25]) {
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
    // the nose: a black grille across it, a round headlamp in a chrome ring at each end, two big chrome spotlights
    // standing before the grille and two more below the slim black bumper, amber indicators at its corners
    k.front(w - 1.4, 2, 0.2, 4.05, front - 0.05, k.all(black));
    const lamp = (x: number, y: number, z: number, r: number, depth: number, shell: THREE.Material) => {
      k.add(drum(r, depth, 'z', x, y, z + depth / 2 - k.noseZ, 14), [shell, shell, shell], k.nose);
      k.add(drum(r - 0.15, 0.15, 'z', x, y, z - 0.05 - k.noseZ, 14), [k.lamp, k.lamp, k.lamp], k.nose);
    };
    for (const side of [-1, 1]) {
      lamp(side * (w / 2 - 1.55), 4.05, front - 0.25, 0.85, 0.2, k.chrome);
      lamp(side * 1.75, 4.05, front - 1.15, 1.05, 1, k.chrome);
      lamp(side * 1.75, 1.75, front - 1.15, 0.85, 0.9, k.chrome);
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
    // the engine cover's louvres, black, down the slope
    for (let i = 0; i < 6; i++) {
      const z = 5 + i * 1.15;
      k.box(w - 3.6, 0.14, 0.55, deck(z) + 0.08, z, k.all(black));
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
    // the nose: the black pod of five spotlights on the bonnet, a yellow fog lamp at each end of the lip
    const podZ = front + 2.4;
    const podY = nose(podZ);
    k.add(profile((s) => {
      s.moveTo(podZ - 0.8, nose(podZ - 0.8) - 0.4);
      s.lineTo(podZ + 0.8, nose(podZ + 0.8) - 0.4);
      s.lineTo(podZ + 0.8, podY + 1.9);
      s.lineTo(podZ - 0.5, podY + 1.9);
      s.lineTo(podZ - 0.8, podY + 1.6);
    }, w - 1.8, 0.15, 2).translate(0, 0, -k.noseZ), [black, black], k.nose);
    for (let i = 0; i < 5; i++) {
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
   * QUADRA, 1980s: the four-wheel-drive coupe that changed rallying. Upright and boxy, a long flat bonnet, a tall
   * square cabin, big box flares, a boot spoiler, a full-width lamp pod.
   */
  quadra(k) {
    const w = 13.4;
    const half = 14.8;
    k.box(w - 0.6, 4.6, half * 2 - 0.4, 4.5, 0, capped(k.pods, k.body, k.dark)); // the shell
    k.box(w - 1, 0.5, 11.4, 7.05, -half + 5.9, capped(k.body, k.deck(w - 1, 11.4), k.dark)); // the long bonnet
    k.slant(w - 1.8, 4, 10.8, 8.8, 1.6, k.all(k.glass), { front: 0.5, back: 1.2, inset: 0.3 }); // the boxy cabin
    pillars(k, w - 2, 4, 8.8, -3.6, 6.6, 0.3);
    k.box(w - 2.4, 0.6, 9.4, 11.1, 1.4, capped(k.body, k.deck(w - 2.4, 9.4), k.dark)); // the roof
    k.box(3.2, 1.1, 3.2, 11.9, 0.8, k.all(k.scoop));
    k.box(w - 5, 0.8, 0.9, 11.8, -3, k.all(k.tcam));
    k.box(w - 1, 0.5, 7.8, 7.05, half - 4.1, capped(k.body, k.body, k.dark)); // the boot
    k.box(w - 1.6, 1, 1.6, 7.8, half - 1, capped(k.carbon, k.carbon, k.dark)); // the boot spoiler
    // big box flares, in the trim
    for (const z of [-9.8, 9.8]) for (const x of [-(w / 2), w / 2]) k.box(1.8, 2.2, 9.4, 5.6, z, capped(k.trim, k.trim, k.dark), undefined, x);
    // the nose: the bumper and a full-width lamp pod
    k.front(w - 0.6, 2.6, 2, 3, -half - 0.3, capped(k.carbon, k.carbon, k.dark));
    spotlights(k, 4, 2.8, 6, -half - 0.6, w - 2.4);
    for (const x of [-(w / 2 - 1.5), w / 2 - 1.5]) k.box(3, 2.6, 0.3, 1.6, half - 2.6, k.all(k.carbon), undefined, x);
    return {
      axles: [-9.8, 9.8],
      wheel: { radius: 3.6, width: 3.2, half: w / 2 - 1.5, rim: '#b8bcc4' },
      tail: { z: half - 0.1, y: 5.8, x: w / 2 - 3, w: 4.6, h: 1.4 },
    };
  },

  /**
   * TYPHOON, 1990s: the compact turbo saloon that ruled the gravel in the late nineties (the Impreza's kind of car).
   * Rounded shoulders, a short sloping nose with big corner headlamps, a wide flat scoop on the bonnet with vents
   * either side, a roof vent, a tall wing over a short boot on two stays, broad flares, gold wheels.
   */
  typhoon(k) {
    const w = 13.4;
    const half = 14;
    // the shell, its shoulders rounded and its nose sloping
    k.slant(w - 0.2, 4.8, half * 2 - 0.4, 4.6, 0, capped(k.pods, k.body, k.dark), { front: 0.8, back: 0.3, inset: 0.7 });
    k.slant(w - 1.6, 0.6, 10, 6.65, -half + 5.2, capped(k.body, k.deck(w - 1.6, 10), k.dark), { front: 0.7, inset: 0.4 }); // the bonnet
    // the scoop: wide and flat, just before the screen, open at the front; a vent either side
    k.slant(5.4, 1.5, 3.8, 7.6, -6.4, [k.body, k.body, k.body, k.dark, k.body, k.dark], { front: 0.7, inset: 0.3 });
    for (const x of [-4.3, 4.3]) k.box(1.2, 0.14, 2, 7, -9.4, k.all(k.carbon), undefined, x);
    // the cabin, rounded: a raked screen, a short roof, a sloping back window
    k.slant(w - 2.2, 3.8, 12, 8.75, 1.4, k.all(k.glass), { front: 1.8, back: 1.6, inset: 1.1 });
    k.box(w - 4.6, 0.6, 7.6, 10.75, 1.5, capped(k.body, k.deck(w - 4.6, 7.6), k.dark)); // the roof
    k.box(2.6, 0.9, 2.4, 11.4, -0.6, [k.scoop, k.scoop, k.scoop, k.dark, k.scoop, k.dark]); // the roof vent
    k.box(w - 6, 0.6, 0.8, 11.3, -2, k.all(k.tcam));
    k.slant(w - 1.4, 0.5, 6, 6.95, half - 3.4, capped(k.body, k.body, k.dark), { back: 0.3, inset: 0.4 }); // the short boot
    // the tall wing, on two stays
    k.box(w - 0.8, 0.6, 2.6, 11.6, half - 2.4, k.all(k.trim));
    for (const x of [-(w - 5) / 2, (w - 5) / 2]) k.box(0.6, 4.6, 1.4, 9.2, half - 2.4, k.all(k.carbon), undefined, x);
    // broad flares, in the trim
    for (const z of [-9.4, 9.4]) for (const x of [-(w / 2 - 0.2), w / 2 - 0.2]) k.slant(1.8, 1.6, 9, 6, z, capped(k.trim, k.trim, k.dark), { inset: 0.3 }, undefined, x);
    // the nose: a bumper with a wide intake, big headlamps at the corners, four spotlights on the bumper
    k.front(w - 0.6, 2.8, 2, 3, -half - 0.2, capped(k.body, k.body, k.dark));
    k.front(w - 5, 1.2, 0.3, 3, -half - 1.25, k.all(k.dark));
    for (const x of [-(w / 2 - 2.2), w / 2 - 2.2]) k.slant(3.4, 1.3, 1, 5.6, -half + 0.6, k.all(k.lamp), { front: 0.3 }, undefined, x);
    spotlights(k, 4, 2.3, 4, -half - 1.3, w - 5, 1.3);
    for (const x of [-(w / 2 - 1.5), w / 2 - 1.5]) k.box(3, 2.6, 0.3, 1.6, half - 2.2, k.all(k.carbon), undefined, x);
    return {
      axles: [-9.4, 9.4],
      wheel: { radius: 3.6, width: 3.3, half: w / 2 - 1.5, rim: '#d4a72c' },
      tail: { z: half - 0.1, y: 6, x: w / 2 - 2.2, w: 3, h: 1.4 },
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
