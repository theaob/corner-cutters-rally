// One graphics context for the whole game: the menu's live backdrop and each race draw on the same renderer and
// canvas, one after the other, instead of each making its own and throwing it away. What that keeps is the compiled
// shaders: a race's first frame compiles a few dozen programs (seconds on a slow phone, behind the loading card),
// and the next race, or the menu coming back, needs the same ones again. The post-processing passes stay too.
//
// Whoever is drawing borrows the view and gives it back when its screen closes; a screen that borrows while another
// still has it (a race opening over a backdrop handed on between menus) has the other told to stop first.

import * as THREE from 'three';
import { Hd2dPipeline } from './hd2d';

export interface SharedView {
  renderer: THREE.WebGLRenderer;
  post: Hd2dPipeline;
}

export const SHARED_VIEW = {
  /** compiled programs kept at most: past that the context is let go when it's given back, and the next borrower starts afresh (each circuit, by day, by night, in the wet, adds a few of its own) */
  maxPrograms: 160,
  /** geometries and textures still on the GPU when the next screen borrows (something the last one never freed), at most: past that the context is let go too, which frees them */
  maxLeft: 40,
};

/** a compiled program, as three.js keeps it: destroyed when the last material using it is disposed (`usedTimes` at 0) */
interface Program {
  usedTimes: number;
}

let view: SharedView | undefined;
/** the programs held on to: one use of each is ours, so disposing a scene's materials leaves them compiled */
let kept = new WeakSet<Program>();
/** who has the view now: called to make it stop and give the view back */
let holder: (() => void) | undefined;

/** A new renderer and its passes (throws where there's no WebGL). */
let make = (scene: THREE.Scene, camera: THREE.Camera): SharedView => {
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  return { renderer, post: new Hd2dPipeline(renderer, scene, camera) };
};
/** For the tests (no WebGL there): what makes the view, and any view so far forgotten. */
export function useViewMaker(f: typeof make): void {
  make = f;
  view = undefined;
  holder = undefined;
  kept = new WeakSet();
}

const lost = (v: SharedView) => v.renderer.getContext().isContextLost();

function letGo(): void {
  if (!view) return;
  const { renderer, post } = view;
  view = undefined;
  kept = new WeakSet();
  post.dispose();
  renderer.dispose();
  renderer.forceContextLoss();
  renderer.domElement.remove();
}

/**
 * The view, to draw `scene` through `camera`: its canvas out of the page and plain (the borrower places and styles
 * it), no shadows, three.js's own settings otherwise as a new renderer's. `stop` is called if another screen borrows
 * while this one still has it: it must give the view back (returnView). Throws where there's no WebGL.
 */
export function borrowView(scene: THREE.Scene, camera: THREE.Camera, stop: () => void): SharedView {
  holder?.();
  holder = undefined;
  // (a context the phone took away while nobody was drawing: a new one)
  // (or one with the last screens' leftovers piling up)
  if (view && (lost(view) || view.renderer.info.memory.geometries + view.renderer.info.memory.textures > SHARED_VIEW.maxLeft)) letGo();
  if (!view) {
    view = make(scene, camera);
    // (with ?debug: __view() says what it holds, between screens too)
    if (new URLSearchParams(globalThis.location?.search ?? '').has('debug')) Object.assign(globalThis, { __view: viewHolds });
  } else {
    view.post.setView(scene, camera);
  }
  const { renderer } = view;
  renderer.shadowMap.enabled = false;
  renderer.info.autoReset = true;
  renderer.domElement.className = '';
  renderer.domElement.removeAttribute('style');
  holder = stop;
  return view;
}

/**
 * The view given back, before the scene it drew is disposed (its programs are held on to while its materials still
 * use them). Its canvas leaves the page and its buffers shrink to nothing until the next borrower sizes them.
 */
export function returnView(v: SharedView): void {
  if (v !== view) return;
  holder = undefined;
  const { renderer, post } = v;
  renderer.domElement.remove();
  const programs = (renderer.info.programs ?? []) as unknown as Program[];
  // (a context lost mid-race, or more programs than are worth keeping: let go, the next screen makes its own)
  if (lost(v) || programs.length > SHARED_VIEW.maxPrograms) return letGo();
  for (const p of programs) {
    if (kept.has(p)) continue;
    kept.add(p);
    p.usedTimes++;
  }
  renderer.setRenderTarget(null);
  renderer.renderLists.dispose();
  renderer.setSize(1, 1, false);
  post.setSize(1, 1);
}

/** What the view holds now (nothing without one): its compiled programs, and the geometries and textures on the GPU. For the logbook and ?debug. */
export function viewHolds(): { programs: number; geometries: number; textures: number } {
  const info = view?.renderer.info;
  return { programs: info?.programs?.length ?? 0, geometries: info?.memory.geometries ?? 0, textures: info?.memory.textures ?? 0 };
}
