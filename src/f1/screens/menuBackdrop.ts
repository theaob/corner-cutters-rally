// The menu's live backdrop: a race going on behind the menus. A handful of AI
// cars lap a circuit (the one last picked) in
// the race's own simulation, already spread out round the lap when it fades
// in; the camera follows one car, and every few seconds pans over to another,
// a little wider than in a race. Drawn small and at most 30 times a second, and
// not while the page is hidden; none at all for a device asking for reduced
// motion (or without WebGL). Loaded only once the menu is up, so the menu
// itself shows as quickly as before, over a still of it (./backdropStill).

import * as THREE from 'three';
import { bodyTilt, carClass, newCar, type Car } from '../../engine/driving';
import { SIM_DT, lerp, lerpAngle } from '../../engine/fixedStep';
import { HD2D_VIEW } from '../../engine/look';
import { Hd2dPipeline } from '../../engine/render/hd2d';
import { createCarMesh } from '../../engine/render/vehicles3d';
import { gridFor } from '../bridge';
import { buildCircuit } from '../circuit';
import { createCircuitScene } from '../circuitScene';
import { NORMAL, handlingFor } from '../difficulty';
import type { CircuitLayout } from '../layouts';
import { newRace, stepRace } from '../raceControl';
import { lineCornerSpeed, lineDecel } from '../racing';
import { TEAMS } from '../teams';
import { DRY } from '../weather';
import { keepStill } from './backdropStill';
import { gameHidden } from '../../engine/host';

export const BACKDROP = {
  /** cars lapping */
  cars: 6,
  /** s of racing run before it's shown (the field spread out round the lap) */
  preRoll: 14,
  /** s the camera stays with a car before panning to the next */
  dwell: 7,
  /** the camera's zoom (a race's is 0.8) */
  zoom: 0.9,
  /** where the car the camera's on sits, from the top of the screen (a share of its height): in the open space above the menu's title */
  carAt: 0.17,
  /** share of the screen's resolution it's drawn at, and the most frames a second */
  res: 0.75,
  fps: 30,
  /** frames drawn before it's kept as the still the next menu opens on (3 s in) */
  keepAt: 90,
};

const deg = THREE.MathUtils.degToRad;

/**
 * Start the backdrop behind `host`'s contents, racing on `layout`, fading in
 * over `still` (the still it's in place of, taken away once it's covered).
 * Gives back a function that stops it.
 */
export function startBackdrop(host: HTMLElement, layout: CircuitLayout, still?: HTMLElement): () => void {
  if (globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return () => {};
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'low-power' });
  } catch {
    return () => {};
  }
  const f1 = carClass('f1');
  const handling = handlingFor(NORMAL);
  const circuit = buildCircuit(layout, { cornerSpeed: lineCornerSpeed(f1, handling), decel: lineDecel(f1) });
  const world = createCircuitScene(circuit, DRY);
  // the field: a car from each of the first teams, a touch apart in pace so they race
  const field = circuit.slots.slice(0, BACKDROP.cars).map((s, k) => ({
    car: newCar(f1, s.x, s.y, s.heading),
    ai: { lane: ((k * 7) % 11) - 5, pace: 0.93 - k * 0.012, craft: 0.6 },
  }));
  const race = newRace(circuit.track, circuit.grid, handling, 9999, field, 0, undefined, 'dry');
  const meshes = field.map((_, k) => {
    const t = TEAMS[k % TEAMS.length];
    const mesh = createCarMesh('f1', { body: t.body, stripe: t.trim, accent: t.accent, pattern: t.pattern }, !!circuit.layout.dirt);
    world.scene.add(mesh);
    return mesh;
  });
  for (let t = 0; t < BACKDROP.preRoll + 4; t += SIM_DT) stepRace(race, SIM_DT);

  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  const canvas = renderer.domElement;
  canvas.className = 'live-backdrop';
  // (over the still, under the menu)
  if (still?.parentElement === host) still.after(canvas);
  else host.prepend(canvas);
  const camera = new THREE.PerspectiveCamera(HD2D_VIEW.fov, 1, 1, 4000);
  camera.up.set(0, 0, -1);
  const post = new Hd2dPipeline(renderer, world.scene, camera);
  let size = '';
  const fit = () => {
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    const key = `${w}:${h}`;
    if (key === size) return;
    size = key;
    renderer.setSize(Math.round(w * BACKDROP.res), Math.round(h * BACKDROP.res), false);
    post.setSize(Math.round(w * BACKDROP.res), Math.round(h * BACKDROP.res));
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };

  /** the car the camera's on, and how long it has been */
  let following = 0;
  let held = 0;
  const focus = new THREE.Vector3(race.entrants[0].car.x, 0, race.entrants[0].car.y);
  let before = race.entrants.map((e) => ({ x: e.car.x, y: e.car.y, z: e.car.z, heading: e.car.heading }));
  let carry = 0;
  let last = performance.now();
  let lastDraw = 0;
  /** frames drawn so far */
  let drawn = 0;
  let stopped = false;
  const frame = (now: number) => {
    if (stopped) return;
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (gameHidden() || now - lastDraw < 1000 / BACKDROP.fps - 2) return;
    const frameDt = Math.min(0.1, (now - lastDraw) / 1000);
    lastDraw = now;
    fit();
    // the race, in fixed steps (the cars drawn between the last two)
    carry += frameDt;
    while (carry >= SIM_DT) {
      before = race.entrants.map((e) => ({ x: e.car.x, y: e.car.y, z: e.car.z, heading: e.car.heading }));
      stepRace(race, SIM_DT);
      carry -= SIM_DT;
    }
    const alpha = carry / SIM_DT;
    const at = (car: Car, k: number) => ({ x: lerp(before[k].x, car.x, alpha), y: lerp(before[k].y, car.y, alpha), z: lerp(before[k].z, car.z, alpha), heading: lerpAngle(before[k].heading, car.heading, alpha) });
    race.entrants.forEach((e, k) => {
      const p = at(e.car, k);
      const tilt = bodyTilt(e.car, gridFor(circuit.track, circuit.grid, e.progress.idx));
      meshes[k].position.set(p.x, p.z, p.y);
      meshes[k].rotation.set(tilt.pitch, -p.heading, tilt.roll, 'YXZ');
    });
    // the camera: on one car, then over to the next
    held += frameDt;
    if (held > BACKDROP.dwell) {
      held = 0;
      following = (following + 1 + Math.floor(Math.random() * (field.length - 1))) % field.length;
    }
    const c = race.entrants[following].car;
    const p = at(c, following);
    const pitch = deg(HD2D_VIEW.pitch);
    const dist = host.clientHeight / (2 * Math.tan(deg(HD2D_VIEW.fov / 2))) / BACKDROP.zoom;
    // (the camera looks at a point below the car on the screen, so the car sits up in the open space above the menu)
    const down = ((0.5 - BACKDROP.carAt) * host.clientHeight) / BACKDROP.zoom / Math.sin(pitch);
    const target = new THREE.Vector3(p.x + (c.vx / c.cls.topSpeed) * 40, p.z * 0.5, p.y + (c.vy / c.cls.topSpeed) * 40 + down);
    // (on the first frame straight there; then it eases along, and pans across to the next car)
    if (drawn === 0) focus.copy(target);
    else focus.lerp(target, 1 - Math.exp(-frameDt * 1.6));
    camera.position.set(focus.x, focus.y + Math.sin(pitch) * dist, focus.z + Math.cos(pitch) * dist);
    camera.lookAt(focus);
    world.followSun(focus);
    world.animate(now / 1000);
    // (the cherry blossom's petals, where there's blossom: kicked up by the cars as they race)
    world.stepScenery(frameDt, race.entrants.map((e) => e.car), c);
    post.render(dt, { bloom: HD2D_VIEW.bloom, blur: HD2D_VIEW.blur, bloomOn: true, blurOn: true });
    // (faded in once a few frames are drawn: the first can take a while, compiling the shaders)
    if (++drawn === 3) {
      canvas.classList.add('on');
      // (the still under it, once it's faded in over it)
      canvas.addEventListener('transitionend', () => still?.remove(), { once: true });
    }
    // (a picture of it, for the next menu to open on: drawn this frame, so there's one to take)
    if (drawn === BACKDROP.keepAt) keepStill(canvas);
  };
  requestAnimationFrame(frame);

  return () => {
    stopped = true;
    post.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    canvas.remove();
  };
}
