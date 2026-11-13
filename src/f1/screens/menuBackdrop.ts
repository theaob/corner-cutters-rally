// The menu's live backdrop: rally cars on the shakedown behind the menus. A
// few AI cars drive the road one after another, spread out along it, in the
// stage's own simulation, each starting again from the line once it's over the
// finish; the camera follows one car, and every few seconds pans over to another,
// a little wider than in a race. Drawn small and at most 30 times a second, and
// not while the page is hidden; none at all for a device asking for reduced
// motion (or without WebGL). Loaded only once the menu is up, so the menu
// itself shows as quickly as before, over a still of it (./backdropStill).

import * as THREE from 'three';
import { bodyTilt, carClass, newCar, type Car } from '../../engine/driving';
import { SIM_DT, lerp, lerpAngle } from '../../engine/fixedStep';
import { HD2D_VIEW } from '../../engine/look';
import { borrowView, returnView, type SharedView } from '../../engine/render/sharedView';
import { disposeDeep } from '../../engine/render/dispose';
import { createCarMesh } from '../../engine/render/vehicles3d';
import { buildCircuit } from '../circuit';
import { createCircuitScene } from '../circuitScene';
import { NORMAL, handlingFor } from '../difficulty';
import type { CircuitLayout } from '../layouts';
import { newRace, stepRace } from '../raceControl';
import { lineCornerSpeed, lineDecel, newProgress } from '../racing';
import { CREWS, crewById, liveryOf, schemeById } from '../crews';
import { DRY } from '../weather';
import { keepStill } from './backdropStill';
import { gameHidden } from '../../engine/host';
import { motionReduced } from '../access';

export const BACKDROP = {
  /** cars on the road */
  cars: 3,
  /** px apart along the road they start */
  apart: 1600,
  /** s of driving run before it's shown */
  preRoll: 4,
  /** s the camera stays with a car before panning to the next */
  dwell: 7,
  /** the camera's zoom (a race's is 0.8) */
  zoom: 0.9,
  /** where the car the camera's on sits, from the top of the screen (a share of its height): in the open space above the menu's title */
  carAt: 0.17,
  /** share of the screen's resolution it's drawn at, and the most frames a second */
  res: 0.75,
  fps: 30,
  /** the page's frames this slow (a second) or slower: drawn without the glow and blur (40, where the menu starts being reported as slow: it was 20, and a phone at 35 fps stayed with the glow) */
  slowFps: 40,
  /** frames drawn before it's kept as the still the next menu opens on (3 s in) */
  keepAt: 90,
};

const deg = THREE.MathUtils.degToRad;

/** ms a backdrop handed over (parkBackdrop) waits to be picked up by the next screen before it stops */
export const PARK_MS = 1000;

/** The backdrop racing now, and the one handed over from the screen going to the one opening (still racing, unless nobody takes it). */
let racing: { canvas: HTMLCanvasElement; stop: () => void; layoutId: string } | undefined;
let parked: { stop: () => void; layoutId: string; canvas: HTMLCanvasElement; timer: ReturnType<typeof setTimeout> } | undefined;

/**
 * Let the next backdrop started carry on this one's race instead of beginning another (the title
 * splash into the menu: the same cars, the same camera, no new fade-in). Stopped all the same if nothing takes it
 * (the next screen is a race, say) or it hadn't faded in yet. `stop` is what startBackdrop gave back.
 */
export function parkBackdrop(stop: () => void): void {
  if (!racing || racing.stop !== stop || !racing.canvas.classList.contains('on')) return stop();
  const { canvas, layoutId } = racing;
  parked = { stop, layoutId, canvas, timer: setTimeout(() => { parked = undefined; stop(); }, PARK_MS) };
}

/**
 * Start the backdrop behind `host`'s contents, driving `layout`, fading in
 * over `still` (the still it's in place of, taken away once it's covered).
 * Gives back a function that stops it.
 */
export function startBackdrop(host: HTMLElement, layout: CircuitLayout, still?: HTMLElement): () => void {
  if (motionReduced()) return () => {};
  // (a backdrop handed over from the screen before, in this host (whatever circuit the menu has since picked: the race behind carries on): it goes on, over the still)
  if (parked) {
    const p = parked;
    parked = undefined;
    clearTimeout(p.timer);
    if (p.canvas.parentElement === host) {
      if (still?.parentElement === host) still.after(p.canvas);
      still?.remove();
      return p.stop;
    }
    p.stop();
  }
  const f1 = carClass('f1');
  const handling = handlingFor(NORMAL);
  const circuit = buildCircuit(layout, { cornerSpeed: lineCornerSpeed(f1, handling), decel: lineDecel(f1) });
  const world = createCircuitScene(circuit, DRY);
  const { track } = circuit;
  const start = circuit.layout.stage?.start ?? 0;
  const finish = circuit.layout.stage?.finish ?? track.length;
  /** a car's place on the road `along` px from its start, standing */
  const place = (car: Car, along: number) => {
    const s = track.samples[Math.min(track.samples.length - 1, Math.round(along / track.spacing))];
    Object.assign(car, { x: s.x, y: s.y, heading: s.dir, vx: 0, vy: 0, spin: 0 });
  };
  // the cars: spread out along the road, the first furthest on, a touch apart in pace
  const field = Array.from({ length: BACKDROP.cars }, (_, k) => {
    const car = newCar(f1, 0, 0, 0);
    place(car, start + (BACKDROP.cars - 1 - k) * BACKDROP.apart);
    return { car, ai: { lane: 0, pace: 0.92 - k * 0.015 } };
  });
  const race = newRace(track, circuit.grid, handling, 1, field, 0, 'dry');
  const meshes = field.map((_, k) => {
    const crew = crewById(CREWS[k % CREWS.length].id)!;
    const mesh = createCarMesh('f1', liveryOf(schemeById(crew.scheme)!), !!circuit.layout.dirt);
    world.scene.add(mesh);
    return mesh;
  });
  /** Each car over the finish: back to the start line, to go again. */
  const again = () => race.entrants.forEach((e) => {
    if (e.progress.idx * track.spacing < finish) return;
    place(e.car, start);
    e.progress = newProgress(Math.round(start / track.spacing));
  });
  for (let t = 0; t < BACKDROP.preRoll + 4; t += SIM_DT) stepRace(race, SIM_DT);
  again();

  const camera = new THREE.PerspectiveCamera(HD2D_VIEW.fov, 1, 1, 4000);
  camera.up.set(0, 0, -1);
  // (the game's one renderer, shared with the races: sharedView.ts. A race opening while this is still going stops it)
  let view: SharedView;
  try {
    view = borrowView(world.scene, camera, () => stop());
  } catch {
    disposeDeep(world.scene);
    return () => {};
  }
  const { renderer, post } = view;
  const canvas = renderer.domElement;
  canvas.className = 'live-backdrop';
  // (over the still, under the menu)
  if (still?.parentElement === host) still.after(canvas);
  else host.prepend(canvas);
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
  /** how long the page's frames have been taking (s, smoothed), and whether that's too slow for the glow and blur */
  let frameTime = 1 / 60;
  let lite = false;
  let stopped = false;
  const frame = (now: number) => {
    if (stopped) return;
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    // (a phone that can't keep up, once it's warmed up: the picture without the glow and blur, as a race steps down)
    frameTime += (dt - frameTime) * 0.05;
    if (drawn > BACKDROP.keepAt && frameTime > 1 / BACKDROP.slowFps) lite = true;
    if (gameHidden() || now - lastDraw < 1000 / BACKDROP.fps - 2) return;
    const frameDt = Math.min(0.1, (now - lastDraw) / 1000);
    lastDraw = now;
    fit();
    // the race, in fixed steps (the cars drawn between the last two)
    carry += frameDt;
    while (carry >= SIM_DT) {
      before = race.entrants.map((e) => ({ x: e.car.x, y: e.car.y, z: e.car.z, heading: e.car.heading }));
      stepRace(race, SIM_DT);
      again();
      carry -= SIM_DT;
    }
    const alpha = carry / SIM_DT;
    const at = (car: Car, k: number) => ({ x: lerp(before[k].x, car.x, alpha), y: lerp(before[k].y, car.y, alpha), z: lerp(before[k].z, car.z, alpha), heading: lerpAngle(before[k].heading, car.heading, alpha) });
    race.entrants.forEach((e, k) => {
      const p = at(e.car, k);
      const tilt = bodyTilt(e.car, circuit.grid);
      meshes[k].position.set(p.x, p.z + tilt.lift, p.y);
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
    world.animate(now / 1000, race.entrants.map((e) => e.car));
    post.render(dt, { bloom: HD2D_VIEW.bloom, blur: HD2D_VIEW.blur, bloomOn: !lite, blurOn: !lite });
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

  const stop = () => {
    if (racing?.stop === stop) racing = undefined;
    if (parked?.stop === stop) {
      clearTimeout(parked.timer);
      parked = undefined;
    }
    if (stopped) return;
    stopped = true;
    // (the renderer given back, its canvas out of the page; then the circuit and cars this drew)
    returnView(view);
    disposeDeep(world.scene);
  };
  racing = { canvas, stop, layoutId: layout.id };
  return stop;
}
