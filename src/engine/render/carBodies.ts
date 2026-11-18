// The rally cars' bodies (cars.ts names them; vehicles3d.ts builds a car round one): six low-poly shells, one an era,
// each with the silhouette that era's rally cars are known by, seen from above (the stage's camera) as much as from the
// side. All invented: no maker's lines, lamps, grille or badge copied, only the shape of the time.
//
// Each body is built from boxes (some slanted, for a raked screen or a wedge nose) in the car's own frame: facing
// north (−z), y up, the ground at 0, about W (14) px wide and L (30) long like the car the physics drives. It returns
// where its wheels and tail lights go. BoxGeometry faces: +x, −x, +y, −y, +z (back), −z (front).

import * as THREE from 'three';

export type CarModel = 'mini' | 'brisk' | 'stiletto' | 'quadra' | 'typhoon' | 'apex';

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
    const front = -12.5;
    const back = 12.5;
    const black = k.paint(0x16171b);
    const white = k.paint(0xf3f1ea);
    // the body: a rounded box from the sills to the waist, the bonnet curving down to the grille and the boot to the tail
    k.add(profile((s) => {
      s.moveTo(front + 0.6, 1.6);
      s.lineTo(back - 0.6, 1.6);
      s.quadraticCurveTo(back, 1.7, back, 2.6);
      s.lineTo(back, 5.4);
      s.quadraticCurveTo(back - 0.1, 6.2, back - 1, 6.3);
      s.lineTo(-6.2, 6.5);
      s.quadraticCurveTo(front + 3, 6.3, front + 1.2, 5.6);
      s.quadraticCurveTo(front + 0.1, 5.3, front, 4.6);
      s.lineTo(front, 2.6);
      s.quadraticCurveTo(front, 1.7, front + 0.6, 1.6);
    }, w, 0.7), [k.pods, k.body]);
    // the seams on the outside, down the body at the screen's foot
    for (const x of [-(w / 2 + 0.05), w / 2 + 0.05]) k.box(0.3, 4, 0.3, 4.4, -6.3, k.all(k.body), undefined, x);
    // the glasshouse, upright, the screen a little raked; the pillars in the body colour
    k.add(profile((s) => {
      s.moveTo(-6.3, 6.3);
      s.lineTo(-5, 9.7);
      s.lineTo(8.4, 9.7);
      s.lineTo(9.1, 6.3);
    }, w - 1.6), [k.glass, k.glass]);
    for (const [z0, z1] of [[-6.35, -5.05], [9.15, 8.45]] as const) {
      for (const x of [-(w - 1.6) / 2, (w - 1.6) / 2]) {
        k.add(profile((s) => {
          s.moveTo(z0 - 0.4, 6.3);
          s.lineTo(z1 - 0.4, 9.7);
          s.lineTo(z1 + 0.5, 9.7);
          s.lineTo(z0 + 0.5, 6.3);
        }, 0.4).translate(x, 0, 0), [k.body, k.body]);
      }
    }
    for (const x of [-(w - 1.6) / 2, (w - 1.6) / 2]) k.box(0.4, 3.4, 0.7, 8, 2, k.all(k.body), undefined, x); // the door pillars
    // the roof: white, domed, its gutter overhanging the glass
    k.add(profile((s) => {
      s.moveTo(-5.4, 9.6);
      s.lineTo(8.8, 9.6);
      s.quadraticCurveTo(8.8, 10.3, 7.8, 10.4);
      s.lineTo(-4.3, 10.4);
      s.quadraticCurveTo(-5.4, 10.3, -5.4, 9.6);
    }, w - 1.1, 0.35), [k.trim, k.trim]);
    // the swivelling spotlight on the roof, its housing the driver's colour (yours gold)
    k.add(drum(0.75, 1.3, 'z', 0, 11.15, -3.8, 10), [k.scoop, k.scoop, k.scoop]);
    k.add(drum(0.55, 0.12, 'z', 0, 11.15, -4.5, 10), [k.lamp, k.lamp, k.lamp]);
    k.box(0.5, 0.5, 0.5, 10.6, -3.8, k.all(black));
    // black arch extensions over the wheels
    for (const z of [-8.7, 8.7]) for (const x of [-(w / 2 + 0.25), w / 2 + 0.25]) {
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
    for (const x of [-(w / 2 + 0.04), w / 2 + 0.04]) k.add(drum(1.5, 0.1, 'x', x, 4.2, 0.4, 14), [white, white, white]);
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
    for (const z of [-5.4, 11.6]) for (const x of [-(w / 2 - 0.9), w / 2 - 0.9]) k.box(1.8, 1.6, 0.2, 1.3, z, k.all(black), undefined, x);
    return {
      axles: [-8.7, 8.7],
      wheel: { radius: 2.75, width: 2.5, half: w / 2 - 0.55, rim: '#a7adb5' },
      tail: { z: back + 0.05, y: 4.6, x: w / 2 - 0.9, w: 0.9, h: 1.7 },
    };
  },

  /**
   * BRISK 1800, 1970s: the square three-box saloon, rear driven, that won on gravel for years. A long bonnet with a
   * black anti-glare panel before the screen, a small upright cabin, a boot with a lip, square flares, a quad lamp pod.
   */
  brisk(k) {
    const w = 12.4;
    const half = 14.4;
    k.box(w, 4.2, half * 2 - 0.4, 4.3, 0, capped(k.pods, k.body, k.dark)); // the shell
    k.box(w - 0.4, 0.5, 10, 6.65, -half + 5.2, capped(k.body, k.deck(w - 0.4, 10), k.dark)); // the bonnet
    k.box(w - 3, 0.12, 2.6, 6.95, -5.6, k.all(k.carbon)); // the black panel before the screen
    k.slant(w - 1.6, 3.8, 11.4, 8.3, 0.9, k.all(k.glass), { front: 0.6, back: 0.6, inset: 0.4 });
    pillars(k, w - 1.8, 3.8, 8.3, -4.4, 6.2, 0.4);
    k.box(w - 2.6, 0.6, 9.6, 10.4, 0.9, capped(k.body, k.deck(w - 2.6, 9.6), k.dark)); // the roof
    k.box(3, 1, 3, 11.2, 0.4, k.all(k.scoop));
    k.box(w - 4.4, 0.6, 0.8, 10.9, -3.6, k.all(k.tcam));
    k.box(w - 0.4, 0.5, 7.6, 6.65, half - 4, capped(k.body, k.body, k.dark)); // the boot
    k.box(w - 1, 0.8, 1.1, 7.3, half - 0.6, k.all(k.trim)); // its lip
    // square flares over the wheels
    for (const z of [-9.4, 9.4]) for (const x of [-(w / 2 + 0.1), w / 2 + 0.1]) k.box(1.6, 1.8, 8, 5.6, z, capped(k.trim, k.trim, k.dark), undefined, x);
    // the nose: the grille full width, a chrome bumper, the quad lamp pod
    k.front(w - 0.6, 2, 0.4, 5, -half - 0.05, capped(k.dark, k.dark, k.dark));
    k.front(w + 0.2, 0.7, 0.8, 2.7, -half - 0.3, k.all(k.chrome));
    spotlights(k, 4, 2.7, 6.9, -half + 0.4, w - 2, 1.7);
    for (const x of [-(w / 2 - 1.4), w / 2 - 1.4]) k.box(2.6, 2.4, 0.3, 1.6, half - 2.6, k.all(k.carbon), undefined, x);
    return {
      axles: [-9.4, 9.4],
      wheel: { radius: 3.3, width: 3, half: w / 2 - 1.2, rim: '#f0f0f0' },
      tail: { z: half - 0.1, y: 5.3, x: w / 2 - 1.9, w: 3, h: 1.6 },
    };
  },

  /**
   * STILETTO, 1970s: the mid-engined wedge built only to win rallies. Short and wide, its nose low and sharp, a
   * wraparound screen over a tiny cabin, the roof's spoiler, a louvred engine cover, a wing on the tail.
   */
  stiletto(k) {
    const w = 13.4;
    const nose = -12.6;
    const tail = 12;
    k.slant(w, 4.6, tail - nose, 4.4, (nose + tail) / 2, capped(k.pods, k.deck(w, tail - nose), k.dark), { front: 2.6, inset: 0.3 }); // the wedge
    k.slant(w - 2.4, 3.6, 8.6, 8.2, -1.6, k.all(k.glass), { front: 3, inset: 1 }); // the wraparound screen
    k.box(w - 4.2, 0.6, 4.6, 9.9, 0.6, capped(k.body, k.trim, k.dark)); // the roof
    k.box(w - 3, 0.5, 1.4, 10.5, 3.2, k.all(k.trim)); // the roof's spoiler
    k.box(2.6, 0.9, 2.4, 10.6, 0.2, k.all(k.scoop));
    k.box(w - 1.4, 0.5, 8.4, 6.85, 7.4, capped(k.body, k.body, k.dark)); // the engine cover
    for (const z of [5, 6.6, 8.2, 9.8]) k.box(w - 5, 0.16, 0.6, 7.15, z, k.all(k.carbon)); // its louvres
    k.box(w - 0.4, 0.6, 2.2, 9, tail - 1.2, k.all(k.trim)); // the tail's wing
    for (const x of [-(w - 5) / 2, (w - 5) / 2]) k.box(0.6, 2.2, 1.4, 7.8, tail - 1.2, k.all(k.carbon), undefined, x);
    // round flares, low
    for (const z of [-8, 7.4]) for (const x of [-(w / 2), w / 2]) k.box(1.2, 1.2, 7.4, 5.2, z, capped(k.trim, k.trim, k.dark), undefined, x);
    // the nose: a lamp pod across it, a splitter
    k.front(w - 1, 0.6, 1.2, 2.2, nose - 0.2, k.all(k.carbon));
    spotlights(k, 4, 2.6, 4.2, nose - 0.2, w - 3, 1.5);
    for (const x of [-(w / 2 - 1.4), w / 2 - 1.4]) k.box(2.6, 2.4, 0.3, 1.6, tail - 2.2, k.all(k.carbon), undefined, x);
    return {
      axles: [-8, 7.4],
      wheel: { radius: 3.5, width: 3.3, half: w / 2 - 1.4, rim: '#c9a227' },
      tail: { z: tail - 0.1, y: 5.4, x: w / 2 - 2, w: 1.9, h: 1.9 },
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
