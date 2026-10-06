// A stage's start and finish, dressed as a rally's are. At the start: a
// gantry over the road with the START banner, and beside the line the start
// clock (its five red lights going out one a second through the countdown, the
// last green at GO, the seconds counting down under them). At the finish, the
// boards along the road: a yellow board with a chequered flag on it (the
// flying finish ahead), the red one at the flying finish itself, both sides of
// the road; then STOP, where the times are taken, at the stop control past it.
// Visual only: nothing here is solid.

import * as THREE from 'three';
import { groundAt } from '../engine/sim';
import { canvas } from '../engine/render/sprites';
import { pixelTexture } from '../engine/render/textures';
import { HALF_WIDTH, type Circuit } from './circuit';

/** px along the road from the flying finish: the yellow board before it, and the stop control after it */
export const DRESSING = { warning: 220, stop: 360 };

/** Where the stop control is (px along the road): `DRESSING.stop` past the flying finish, short of the road's end. */
export const stopAt = (finish: number, length: number) => Math.min(finish + DRESSING.stop, length - 60);

const POST = 0x3a3a44;

/** The start clock's face for `left` seconds of the countdown (undefined: GO, the light green; null: not started, all dark). */
function paintClock(x: CanvasRenderingContext2D, left: number | null | undefined): void {
  x.fillStyle = '#121218';
  x.fillRect(0, 0, 40, 40);
  // the five lights, going out one a second; at GO the last one green
  for (let k = 0; k < 5; k++) {
    const on = left === undefined ? k === 4 : left !== null && k < left;
    x.fillStyle = left === undefined ? (on ? '#3ae06a' : '#2a2a30') : on ? '#ff3030' : '#2a2a30';
    x.fillRect(3 + k * 7, 4, 6, 6);
  }
  // the seconds, in amber
  x.fillStyle = '#ffb23a';
  x.font = 'bold 15px monospace';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(left === undefined ? 'GO' : left === null ? '--' : `0:0${Math.max(0, left)}`, 20, 26);
}

/** A board's face: `color`, edged in white, with a chequered flag on it (`flag`) or a word. */
function boardFace(color: string, flag: boolean, word?: string): THREE.Texture {
  const [c, x] = canvas(32, 32);
  x.fillStyle = '#f4f4f8';
  x.fillRect(0, 0, 32, 32);
  x.fillStyle = color;
  x.fillRect(2, 2, 28, 28);
  if (flag) {
    // the flag on its pole: a chequer of 4 × 3
    x.fillStyle = '#1b1b26';
    x.fillRect(8, 7, 2, 19);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
      x.fillStyle = (i + j) % 2 ? '#1b1b26' : '#f4f4f8';
      x.fillRect(10 + i * 4, 7 + j * 4, 4, 4);
    }
  }
  if (word) {
    x.fillStyle = '#f4f4f8';
    x.font = 'bold 10px monospace';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(word, 16, 17);
  }
  return pixelTexture(c);
}

export interface StageDressing {
  group: THREE.Group;
  /** Show the start clock for `left` seconds to GO (undefined: GO; null: not started). */
  setClock(left: number | null | undefined): void;
}

/** The start and finish of `circuit`'s stage (an empty group for a road without one). */
export function buildDressing(circuit: Circuit, stageName = ''): StageDressing {
  const group = new THREE.Group();
  const { track, grid } = circuit;
  const stage = track.stage;
  if (!stage) return { group, setClock: () => {} };
  const n = track.samples.length;
  const at = (s: number) => track.samples[Math.max(0, Math.min(n - 1, Math.round(s / track.spacing)))];
  const lambert = (color: THREE.ColorRepresentation) => new THREE.MeshLambertMaterial({ color });
  const post = lambert(POST);
  /** a box `w` × `h` × `d` at (across, up, along) from the road's middle at `s`, facing back down the road, with `front` on its face */
  const put = (s: number, across: number, up: number, w: number, h: number, d: number, front: THREE.Material, rest: THREE.Material = post) => {
    const p = at(s);
    const x = p.x + Math.cos(p.dir) * across;
    const y = p.y + Math.sin(p.dir) * across;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [rest, rest, rest, rest, front, rest]);
    m.position.set(x, groundAt(grid, x, y).h + up + h / 2, y);
    m.rotation.y = -p.dir;
    m.castShadow = true;
    group.add(m);
    return m;
  };

  // the start gantry: two posts either side of the line, the banner across the road between them
  const span = HALF_WIDTH + 10;
  for (const side of [-1, 1]) put(stage.start, side * span, 0, 2.4, 36, 2.4, post);
  const [bc, bx] = canvas(128, 16);
  bx.fillStyle = '#d8323c';
  bx.fillRect(0, 0, 128, 16);
  bx.fillStyle = '#f4f4f8';
  bx.fillRect(0, 0, 128, 1);
  bx.fillRect(0, 15, 128, 1);
  bx.font = 'bold 11px monospace';
  bx.textAlign = 'center';
  bx.textBaseline = 'middle';
  bx.fillText(stageName ? `START · ${stageName.toUpperCase()}` : 'START', 64, 8.5);
  const banner = new THREE.MeshLambertMaterial({ map: pixelTexture(bc) });
  put(stage.start, 0, 28, span * 2 + 2.4, 9, 1.4, banner, lambert(0xd8323c));
  // the start clock, on the left just short of the line, turned a little to face the car on it
  const [cc, cx] = canvas(40, 40);
  paintClock(cx, null);
  const clockTex = pixelTexture(cc);
  const face = new THREE.MeshBasicMaterial({ map: clockTex, toneMapped: false });
  const clock = put(stage.start - 6, -(HALF_WIDTH + 4), 10, 14, 14, 3, face, lambert(0x1b1b26));
  clock.rotation.y += 0.5;
  put(stage.start - 6, -(HALF_WIDTH + 4), 0, 1.6, 10, 1.6, post).rotation.y += 0.5;
  let shown: number | null | undefined = null;

  // the finish: the yellow board, then the red at the flying finish, both sides; then STOP on the right
  const board = (s: number, tex: THREE.Texture, sides: number[]) => {
    const m = new THREE.MeshLambertMaterial({ map: tex });
    for (const side of sides) {
      put(s, side * (HALF_WIDTH + 7), 0, 1.4, 12, 1.4, post);
      put(s, side * (HALF_WIDTH + 7), 12, 13, 13, 1, m, lambert(0xd0d0d8));
    }
  };
  board(stage.finish - DRESSING.warning, boardFace('#f2c81e', true), [-1, 1]);
  board(stage.finish, boardFace('#d8323c', true), [-1, 1]);
  board(stopAt(stage.finish, track.length), boardFace('#d8323c', false, 'STOP'), [1]);

  return {
    group,
    setClock: (left) => {
      if (left === shown) return;
      shown = left;
      paintClock(cx, left);
      clockTex.needsUpdate = true;
    },
  };
}
