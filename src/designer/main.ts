// The track designer: a tool of its own, not part of the game (designer.html,
// `npm run designer`). It shows a circuit as the game builds it (the track,
// run-off, pit lane, grandstands, scenery) in 3D, seen through a free,
// first-person camera, and edits the layout: drag its control points over the
// ground, add and remove them, set the height of the ground at each, the pit
// lane and the rest; the circuit is rebuilt as you go and checked against what
// the game needs (see layoutEdit.ts). Export it as code for layouts.ts, or save
// and load it as JSON; a draft is kept in the browser between visits.
//
// Camera: hold the right mouse button to look about; W A S D to move, Q and E
// down and up, Shift to go faster; F switches between flying and walking (at a
// driver's eye height over the ground).

import * as THREE from 'three';
import { groundAt } from '../engine/sim';
import type { Circuit } from '../f1/circuit';
import { createCircuitScene, type CircuitScene } from '../f1/circuitScene';
import { LAYOUTS, type LandmarkKind } from '../f1/layouts';
import { DRY } from '../f1/weather';
import { DESIGNER_DRAFT_ID, DESIGNER_DRIVE_KEY } from '../f1/designerDraft';
import { aiLap, blankDraft, check, circuitOf, draftCentre, draftFrom, findCrossing, layoutFrom, layoutToTs, setSetting, settingOf, square, type Draft, type DraftPoint, type Setting } from './layoutEdit';

const DRAFT_KEY = 'cc:designer:draft';
/** px/s the camera flies at (Shift: four times), and the eye's height over the ground when walking */
const FLY_SPEED = 320;
const EYE = 9;
/** px on screen within which a click picks a control point */
const PICK = 16;

const view = document.getElementById('view')!;
const panel = document.getElementById('panel')!;
const hud = document.getElementById('hud')!;
const crosshair = document.getElementById('crosshair')!;
document.getElementById('help')!.textContent = [
  'right mouse held: look   W A S D: move   Q / E: down / up   Shift: faster',
  'F: fly / walk   left click: pick a point (drag to move it)',
  'N: new point after the picked one (a track point, or a corner of a sea or lake)   Delete: remove it   [ ]: lower / raise (Shift: ×5)',
  'Home: make it the start line   G: go to it   Ctrl+Z / Ctrl+Y: undo / redo',
].join('\n');

// ---- the renderer and the camera ------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
view.prepend(renderer.domElement);
const camera = new THREE.PerspectiveCamera(70, 1, 1, 30000);
camera.rotation.order = 'YXZ';
let yaw = 0;
let pitch = -0.35;
let mode: 'fly' | 'walk' = 'fly';
const resize = () => {
  const r = view.getBoundingClientRect();
  renderer.setSize(r.width, r.height, false);
  camera.aspect = r.width / Math.max(1, r.height);
  camera.updateProjectionMatrix();
};
window.addEventListener('resize', resize);
resize();

// ---- the draft, its history, and the circuit it makes ----------------------------------------------
let draft: Draft = loadSaved() ?? draftFrom(LAYOUTS[0]);
const undo: string[] = [];
const redo: string[] = [];
/**
 * What can be picked and dragged on the ground: a control point of the track, a corner of the sea, a point of a
 * lake's shore, or a landmark (each in layout units).
 */
type Handle = { kind: 'point'; i: number } | { kind: 'sea'; i: number } | { kind: 'lake'; l: number; i: number } | { kind: 'mark'; key: LandmarkKind };
const HANDLE_COLOR = { point: 0xff4fd8, sea: 0x3f9bff, lake: 0x5fe0d0, mark: 0xf08a24 };
/** The landmarks a street circuit can have, as the designer names them */
const LANDMARK_NAMES: [LandmarkKind, string][] = [
  ['casino', 'casino (and its garden)'],
  ['pool', 'swimming pool'],
  ['tennis', 'tennis court'],
  ['maiden', 'Maiden Tower'],
  ['flames', 'Flame Towers'],
  ['crescent', 'Crescent'],
];
/** Every handle the draft has */
function handles(): Handle[] {
  const out: Handle[] = draft.points.map((_, i) => ({ kind: 'point', i }));
  const street = draft.extras.street;
  street?.sea.forEach((_, i) => out.push({ kind: 'sea', i }));
  (draft.extras.lakes ?? []).forEach((lake, l) => lake.forEach((_, i) => out.push({ kind: 'lake', l, i })));
  for (const [key] of LANDMARK_NAMES) if (street?.landmarks?.[key]) out.push({ kind: 'mark', key });
  return out;
}
/** Where a handle is (layout units), if it's still there */
function handleAt(h: Handle): { x: number; y: number } | undefined {
  if (h.kind === 'point') return draft.points[h.i];
  if (h.kind === 'sea') return draft.extras.street?.sea[h.i];
  if (h.kind === 'lake') return draft.extras.lakes?.[h.l]?.[h.i];
  return draft.extras.street?.landmarks?.[h.key];
}
const sameHandle = (a: Handle | undefined, b: Handle | undefined) => JSON.stringify(a) === JSON.stringify(b);
/** The selected track point's index, if a track point is selected */
const selectedPoint = () => (selected?.kind === 'point' ? selected.i : undefined);
let selected: Handle | undefined;
let circuit: Circuit | undefined;
let world: CircuitScene | undefined;
const markers = new THREE.Group();

function loadSaved(): Draft | undefined {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as Draft) : undefined;
  } catch {
    return undefined;
  }
}

/** Keep a change: onto the undo history, into the browser, and the circuit rebuilt. */
function commit(before: string) {
  undo.push(before);
  if (undo.length > 200) undo.shift();
  redo.length = 0;
  save();
  rebuild();
}

function save() {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // (a private window: the draft just isn't kept)
  }
}

/** Where a control point is in the world (the map, as the circuit lays it out), and its ground height. */
function toWorld(p: { x: number; y: number }): THREE.Vector3 {
  const off = circuit?.offset ?? { x: 0, y: 0 };
  const x = p.x * draft.scale - off.x;
  const z = p.y * draft.scale - off.y;
  const h = circuit ? groundAt(circuit.grid, x, z).h : 0;
  return new THREE.Vector3(x, h, z);
}
const fromWorld = (x: number, z: number) => {
  const off = circuit?.offset ?? { x: 0, y: 0 };
  return { x: Math.round((x + off.x) / draft.scale), y: Math.round((z + off.y) / draft.scale) };
};

/** Free a scene's meshes, materials and textures. */
function dispose(scene: THREE.Object3D) {
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    for (const mat of mats) {
      for (const v of Object.values(mat)) if (v instanceof THREE.Texture) v.dispose();
      mat.dispose();
    }
  });
}

/** Build the circuit the draft makes, and its scene; the camera kept where it was over the same ground. */
function rebuild() {
  const before = circuit?.offset;
  let next: Circuit;
  try {
    next = circuitOf(layoutFrom(draft));
  } catch (err) {
    status(`can't build it: ${(err as Error).message}`, true);
    renderPanel();
    return;
  }
  if (world) {
    world.scene.remove(markers);
    dispose(world.scene);
  }
  circuit = next;
  world = createCircuitScene(circuit, DRY);
  world.scene.add(markers);
  // (the map is laid out round the track: if it moved, move with it)
  if (before) camera.position.add(new THREE.Vector3(before.x - circuit.offset.x, 0, before.y - circuit.offset.y));
  buildMarkers();
  renderPanel();
  status('');
}

/** The control points as markers over the ground, and a line joining them round the lap. */
function buildMarkers() {
  for (const c of [...markers.children]) {
    markers.remove(c);
    dispose(c);
  }
  const ball = new THREE.SphereGeometry(5, 12, 8);
  const box = new THREE.BoxGeometry(9, 9, 9);
  handles().forEach((h, k) => {
    const p = handleAt(h)!;
    const sel = sameHandle(h, selected);
    const start = h.kind === 'point' && h.i === 0;
    const color = sel ? 0xf2c14e : start ? 0xffffff : HANDLE_COLOR[h.kind];
    // (a landmark a box, the rest balls)
    const m = new THREE.Mesh(h.kind === 'mark' ? box : ball, new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.95 }));
    m.renderOrder = 10;
    m.position.copy(toWorld(p)).add(new THREE.Vector3(0, 10, 0));
    m.userData.handle = k;
    m.userData.base = sel ? 1.6 : start ? 1.3 : 1;
    if (h.kind === 'point') m.userData.index = h.i;
    markers.add(m);
  });
  // the lap, and the sea's and lakes' outlines, as lines joining their handles
  const loop = (pts: { x: number; y: number }[], color: number) => {
    if (pts.length < 2) return undefined;
    const l = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts.map((p) => toWorld(p).add(new THREE.Vector3(0, 10, 0)))), new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.6 }));
    l.renderOrder = 9;
    markers.add(l);
    return l;
  };
  loop(draft.points, HANDLE_COLOR.point);
  loop(draft.extras.street?.sea ?? [], HANDLE_COLOR.sea);
  for (const lake of draft.extras.lakes ?? []) loop(lake, HANDLE_COLOR.lake);
}

/** While a handle is dragged: its marker and the lines follow it, the circuit rebuilt when it's let go. */
function moveMarker() {
  buildMarkers();
}

// ---- picking ----------------------------------------------------------------------------------------
const ray = new THREE.Raycaster();
const mouse = new THREE.Vector2();
function setMouse(e: MouseEvent) {
  const r = renderer.domElement.getBoundingClientRect();
  mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(mouse, camera);
}
/** The handle under the mouse, if any (nearest on screen, within PICK px). */
function pickHandle(e: MouseEvent): Handle | undefined {
  const r = renderer.domElement.getBoundingClientRect();
  let best: number | undefined;
  let bestD = PICK;
  for (const m of markers.children) {
    if (m.userData.handle === undefined) continue;
    const v = m.position.clone().project(camera);
    if (v.z > 1) continue;
    const sx = ((v.x + 1) / 2) * r.width + r.left;
    const sy = ((1 - v.y) / 2) * r.height + r.top;
    const d = Math.hypot(sx - e.clientX, sy - e.clientY);
    if (d < bestD) [best, bestD] = [m.userData.handle as number, d];
  }
  return best === undefined ? undefined : handles()[best];
}
/** Where the mouse's ray meets the ground (the heights as the circuit has them), if it does. */
function groundHit(): THREE.Vector3 | undefined {
  const { origin, direction } = ray.ray;
  if (direction.y > -1e-3) return undefined;
  let h = 0;
  let p = new THREE.Vector3();
  for (let k = 0; k < 8; k++) {
    const t = (h - origin.y) / direction.y;
    if (t < 0) return undefined;
    p = origin.clone().addScaledVector(direction, t);
    h = circuit ? groundAt(circuit.grid, p.x, p.z).h : 0;
  }
  return p;
}

// ---- the mouse and keys ----------------------------------------------------------------------------
let looking = false;
let dragging: { handle: Handle; before: string } | undefined;
const held = new Set<string>();
const canvas = renderer.domElement;
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('mousedown', (e) => {
  if (e.button === 2) {
    looking = true;
    canvas.requestPointerLock?.();
    crosshair.style.display = 'block';
    return;
  }
  if (e.button !== 0) return;
  setMouse(e);
  const h = pickHandle(e);
  selected = h;
  if (h) dragging = { handle: h, before: JSON.stringify(draft) };
  buildMarkers();
  renderPanel();
});
window.addEventListener('mouseup', (e) => {
  if (e.button === 2 && looking) {
    looking = false;
    if (document.pointerLockElement) document.exitPointerLock();
    crosshair.style.display = 'none';
  }
  if (e.button === 0 && dragging) {
    const moved = JSON.stringify(draft) !== dragging.before;
    const before = dragging.before;
    dragging = undefined;
    if (moved) commit(before);
  }
});
window.addEventListener('mousemove', (e) => {
  if (looking) {
    yaw -= e.movementX * 0.0025;
    pitch = Math.max(-1.5, Math.min(1.5, pitch - e.movementY * 0.0025));
    return;
  }
  if (!dragging) return;
  setMouse(e);
  const hit = groundHit();
  if (!hit) return;
  const p = fromWorld(hit.x, hit.z);
  const pt = handleAt(dragging.handle);
  if (!pt || (pt.x === p.x && pt.y === p.y)) return;
  pt.x = p.x;
  pt.y = p.y;
  moveMarker();
});
const typing = () => document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLSelectElement || document.activeElement instanceof HTMLTextAreaElement;
window.addEventListener('keydown', (e) => {
  if (typing()) return;
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === 'z') return void (e.preventDefault(), step(undo, redo));
  if ((e.ctrlKey || e.metaKey) && k === 'y') return void (e.preventDefault(), step(redo, undo));
  held.add(k);
  if (k === 'f') {
    mode = mode === 'fly' ? 'walk' : 'fly';
    status(mode === 'walk' ? 'walking: at eye height over the ground' : 'flying');
  }
  if (k === 'g' && selected) goToHandle(selected);
  if (!selected) return;
  const before = JSON.stringify(draft);
  // a corner of the sea or a lake: N adds one half way to the next, Delete takes it away (three at least)
  if (selected.kind === 'sea' || selected.kind === 'lake') {
    const ring = selected.kind === 'sea' ? draft.extras.street!.sea : draft.extras.lakes![selected.l];
    const i = selected.i;
    if (k === 'n') {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      ring.splice(i + 1, 0, { x: Math.round((a.x + b.x) / 2), y: Math.round((a.y + b.y) / 2) });
      selected = { ...selected, i: i + 1 };
      commit(before);
    } else if ((k === 'delete' || k === 'backspace') && ring.length > 3) {
      ring.splice(i, 1);
      selected = { ...selected, i: Math.min(i, ring.length - 1) };
      commit(before);
    }
    return;
  }
  if (selected.kind !== 'point') return;
  const pts = draft.points;
  const at = selected.i;
  if (k === 'n') {
    // a new point half way to the next one
    const a = pts[at];
    const b = pts[(at + 1) % pts.length];
    pts.splice(at + 1, 0, { x: Math.round((a.x + b.x) / 2), y: Math.round((a.y + b.y) / 2), h: Math.round(((a.h + b.h) / 2) * 10) / 10 });
    selected = { kind: 'point', i: at + 1 };
    commit(before);
  } else if ((k === 'delete' || k === 'backspace') && pts.length > 4) {
    pts.splice(at, 1);
    selected = { kind: 'point', i: Math.min(at, pts.length - 1) };
    commit(before);
  } else if (k === '[' || k === ']') {
    pts[at].h = Math.round((pts[at].h + (k === ']' ? 1 : -1) * (e.shiftKey ? 10 : 2)) * 10) / 10;
    commit(before);
  } else if (k === 'home' && at > 0) {
    // this point becomes the start line (the lap starts here; the pit lane is placed from it)
    draft.points = [...pts.slice(at), ...pts.slice(0, at)];
    selected = { kind: 'point', i: 0 };
    commit(before);
  }
});
window.addEventListener('keyup', (e) => held.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => held.clear());

function step(from: string[], to: string[]) {
  const prev = from.pop();
  if (!prev) return;
  to.push(JSON.stringify(draft));
  draft = JSON.parse(prev);
  if (selected && !handleAt(selected)) selected = undefined;
  save();
  rebuild();
}

/** Put the camera over a handle: behind a track point looking along the lap, or above anything else. */
function goToHandle(h: Handle) {
  if (h.kind === 'point') return goTo(h.i);
  const p = toWorld(handleAt(h)!);
  yaw = 0;
  pitch = -Math.atan2(160, 120);
  camera.position.set(p.x, p.y + 160, p.z + 120);
}

/** Put the camera a little behind and above point `i`, looking along the lap. */
function goTo(i: number) {
  const p = toWorld(draft.points[i]);
  const q = toWorld(draft.points[(i + 1) % draft.points.length]);
  const dir = Math.atan2(q.x - p.x, q.z - p.z);
  yaw = dir + Math.PI;
  // (looking down at the point)
  pitch = -Math.atan2(70, 160);
  camera.position.set(p.x - Math.sin(dir) * 160, p.y + 70, p.z - Math.cos(dir) * 160);
}

// ---- the panel ----------------------------------------------------------------------------------------
let statusText = '';
let statusBad = false;
function status(text: string, bad = false) {
  statusText = text;
  statusBad = bad;
  const el = document.getElementById('status');
  if (el) {
    el.textContent = text;
    el.style.color = bad ? 'var(--bad)' : '';
  }
}

function field(label: string, value: string | number, onChange: (v: string) => void, type = 'text', step?: string): HTMLLabelElement {
  const l = document.createElement('label');
  l.append(label);
  const input = document.createElement('input');
  input.type = type;
  input.value = String(value);
  if (step) input.step = step;
  input.addEventListener('change', () => onChange(input.value));
  l.append(input);
  return l;
}
function button(text: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = text;
  b.addEventListener('click', onClick);
  return b;
}
function heading(text: string) {
  const h = document.createElement('h2');
  h.textContent = text;
  return h;
}
/** Change the draft from the panel: kept, and the circuit rebuilt. */
function edit(change: () => void) {
  const before = JSON.stringify(draft);
  change();
  if (JSON.stringify(draft) !== before) commit(before);
}

function renderPanel() {
  panel.innerHTML = '';
  const title = document.createElement('h1');
  title.textContent = 'Track Designer';
  const sub = document.createElement('div');
  sub.style.color = 'var(--muted)';
  sub.textContent = 'Corner Cutters · shape a circuit, then export it for layouts.ts';
  panel.append(title, sub);

  // load: a circuit of the game's, or a blank
  panel.append(heading('Start from'));
  const pick = document.createElement('select');
  for (const l of LAYOUTS) pick.append(new Option(l.name, l.id));
  pick.append(new Option('A blank (a rounded rectangle)', '__blank'));
  const loadRow = document.createElement('div');
  loadRow.className = 'row';
  loadRow.append(pick, button('Load', () => {
    const before = JSON.stringify(draft);
    draft = pick.value === '__blank' ? blankDraft() : draftFrom(LAYOUTS.find((l) => l.id === pick.value)!);
    selected = undefined;
    commit(before);
    goTo(0);
  }));
  panel.append(loadRow);

  panel.append(heading('Circuit'));
  panel.append(
    field('id', draft.id, (v) => edit(() => (draft.id = v.trim() || draft.id))),
    field('name', draft.name, (v) => edit(() => (draft.name = v))),
    field('about', draft.about, (v) => edit(() => (draft.about = v))),
    field('scale', draft.scale, (v) => edit(() => (draft.scale = Math.max(0.2, Number(v) || draft.scale))), 'number', '0.05'),
    field('tyre wear', draft.extras.tyreWear ?? '', (v) => edit(() => (draft.extras.tyreWear = v === '' ? undefined : Number(v)))),
  );
  sceneryPanel();

  panel.append(heading('Pit lane (px from the line)'));
  panel.append(
    field('from', draft.pit.from, (v) => edit(() => (draft.pit.from = Number(v)))),
    field('to', draft.pit.to, (v) => edit(() => (draft.pit.to = Number(v)))),
  );
  const side = document.createElement('label');
  side.append('side');
  const sideSel = document.createElement('select');
  sideSel.append(new Option('left of the way of the race', '-1'), new Option('right', '1'));
  sideSel.value = String(draft.pit.side);
  sideSel.addEventListener('change', () => edit(() => (draft.pit.side = Number(sideSel.value) as -1 | 1)));
  side.append(sideSel);
  panel.append(side);

  panel.append(heading(selected ? handleName(selected) : 'Picked (click a point, a corner or a landmark)'));
  const picked = selected && handleAt(selected);
  if (selected && picked) {
    const h = selected;
    panel.append(
      field('x', picked.x, (v) => edit(() => (handleAt(h)!.x = Number(v))), 'number'),
      field('y', picked.y, (v) => edit(() => (handleAt(h)!.y = Number(v))), 'number'),
    );
    const i = selectedPoint();
    if (i !== undefined) {
      const p: DraftPoint = draft.points[i];
      panel.append(field('height (px)', p.h, (v) => edit(() => (draft.points[i].h = Number(v))), 'number', '1'));
    }
  }
  const count = document.createElement('div');
  count.style.color = 'var(--muted)';
  count.textContent = `${draft.points.length} points`;
  panel.append(count);

  panel.append(heading('Checks'));
  const checks = document.createElement('div');
  checks.id = 'checks';
  if (circuit) {
    for (const c of check(layoutFrom(draft), circuit)) {
      const row = document.createElement('div');
      row.className = c.ok ? 'ok' : 'bad';
      const mark = document.createElement('b');
      mark.textContent = c.ok ? '✓' : '✗';
      const text = document.createElement('span');
      text.textContent = `${c.label}: ${c.value}`;
      row.append(mark, text);
      checks.append(row);
    }
  }
  panel.append(checks);
  const lapRow = document.createElement('div');
  lapRow.className = 'row';
  const lapOut = document.createElement('span');
  lapRow.append(button('AI lap', () => {
    if (!circuit) return;
    const lap = aiLap(circuit);
    lapOut.textContent = lap.time === undefined ? 'no lap in 2 minutes' : `${lap.time.toFixed(2)} s${lap.damage ? ` · ${Math.round(lap.damage)} damage` : ' · unhurt'}`;
    lapOut.style.color = lap.time === undefined || lap.damage ? 'var(--bad)' : 'var(--good)';
  }), lapOut);
  panel.append(lapRow);

  // drive it: the draft in the game itself, in a tab of its own (its quit comes back here)
  panel.append(heading('Drive it'));
  const driveRow = document.createElement('div');
  driveRow.className = 'row';
  const driveMode = document.createElement('select');
  driveMode.style.width = 'auto';
  driveMode.append(new Option('Quick race', 'race'), new Option('Time trial (alone)', 'timetrial'));
  try {
    driveMode.value = localStorage.getItem(`${DESIGNER_DRIVE_KEY}:mode`) ?? 'timetrial';
  } catch {
    driveMode.value = 'timetrial';
  }
  const drive = button('Drive it ▶', () => drive_(driveMode.value));
  drive.style.borderColor = 'var(--gold)';
  drive.style.color = 'var(--gold)';
  driveRow.append(driveMode, drive);
  panel.append(driveRow);

  panel.append(heading('Export'));
  const out = document.createElement('div');
  out.className = 'row';
  out.append(
    button('Copy as code', async () => {
      const ts = layoutToTs(layoutFrom(draft));
      try {
        await navigator.clipboard.writeText(ts);
        status('copied: paste it into src/f1/layouts.ts and add it to LAYOUTS');
      } catch {
        download(`${draft.id}.ts`, ts, 'text/plain');
        status('saved as a file (the clipboard was refused)');
      }
    }),
    button('Save JSON', () => download(`${draft.id}.json`, JSON.stringify(layoutFrom(draft), null, 2), 'application/json')),
    button('Open JSON', () => openJson()),
  );
  panel.append(out);
  const st = document.createElement('div');
  st.id = 'status';
  panel.append(st);
  status(statusText, statusBad);
}

/** What a handle is, for the panel and the readout. */
function handleName(h: Handle): string {
  if (h.kind === 'point') return `Point ${h.i}${h.i === 0 ? ' · the start line' : ''}`;
  if (h.kind === 'sea') return `The sea · corner ${h.i}`;
  if (h.kind === 'lake') return `Lake ${h.l + 1} · point ${h.i}`;
  return LANDMARK_NAMES.find(([k]) => k === h.key)![1];
}

function checkbox(label: string, on: boolean, onChange: (on: boolean) => void): HTMLLabelElement {
  const l = document.createElement('label');
  l.append(label);
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = on;
  box.addEventListener('change', () => onChange(box.checked));
  l.append(box);
  return l;
}
function choice(label: string, options: [string, string][], value: string, onChange: (v: string) => void): HTMLLabelElement {
  const l = document.createElement('label');
  l.append(label);
  const sel = document.createElement('select');
  for (const [v, text] of options) sel.append(new Option(text, v));
  sel.value = value;
  sel.addEventListener('change', () => onChange(sel.value));
  l.append(sel);
  return l;
}
const num = (v: string, fallback: number) => (v.trim() === '' || !Number.isFinite(Number(v)) ? fallback : Number(v));
const note = (text: string) => {
  const d = document.createElement('div');
  d.style.color = 'var(--muted)';
  d.textContent = text;
  return d;
};

/**
 * The scenery and the rest of the circuit's shape: what it stands in (parkland, a forest, the desert with its palms
 * and camels, or a street circuit's town: its sea, tunnel, landmarks and old city walls), lakes, a bridge where the
 * lap crosses itself, a banked bend, and a podium over the straight.
 */
function sceneryPanel() {
  // somewhere near what's picked (or the middle of the track) for something new to start at
  const near = () => {
    const p = selected && handleAt(selected);
    const c = draftCentre(draft);
    return p ? { x: p.x, y: p.y, size: c.r / 4 } : { x: c.x, y: c.y, size: c.r / 4 };
  };
  panel.append(heading('Setting'));
  panel.append(
    choice('stands in', [['park', 'parkland (grass)'], ['forest', 'a forest'], ['desert', 'the desert (palms, camels)'], ['street', 'a street circuit (a town)']], settingOf(draft), (v) =>
      edit(() => setSetting(draft, v as Setting)),
    ),
  );
  const street = draft.extras.street;
  if (street) {
    panel.append(heading('Street circuit'));
    panel.append(
      field('walls (px off the track)', street.runoff, (v) => edit(() => (street.runoff = Math.max(8, num(v, street.runoff)))), 'number'),
      field('tunnel from (px along the lap; blank: none)', street.tunnel?.[0] ?? '', (v) => edit(() => (street.tunnel = v.trim() === '' ? undefined : [num(v, 0), street.tunnel?.[1] ?? num(v, 0) + 400]))),
      field('tunnel to', street.tunnel?.[1] ?? '', (v) => edit(() => street.tunnel && (street.tunnel = [street.tunnel[0], num(v, street.tunnel[1])]))),
    );
    const seaRow = document.createElement('div');
    seaRow.className = 'row';
    seaRow.append(
      street.sea.length
        ? button('Remove the sea', () => edit(() => (street.sea = [])))
        : button('Add a sea (drag its corners)', () => edit(() => {
          const c = near();
          street.sea = square(c.x, c.y + c.size * 2, c.size * 2);
          selected = { kind: 'sea', i: 0 };
        })),
    );
    panel.append(seaRow);
    panel.append(note('Landmarks (drag them where you want them; each is set where it fits, clear of the track and seen as you drive by)'));
    for (const [key, name] of LANDMARK_NAMES) {
      panel.append(checkbox(name, !!street.landmarks?.[key], (on) => edit(() => {
        street.landmarks ??= {};
        if (on) {
          const c = near();
          street.landmarks[key] = { x: Math.round(c.x), y: Math.round(c.y) };
          selected = { kind: 'mark', key };
        } else delete street.landmarks[key];
        if (!Object.keys(street.landmarks).length) delete street.landmarks;
      })));
    }
    panel.append(checkbox('old city walls (towers, a gate)', !!street.castle, (on) => edit(() => (street.castle = on ? { from: 0.3, to: 0.45, side: 1 } : undefined))));
    if (street.castle) {
      const castle = street.castle;
      panel.append(
        field('walls from (share of the lap)', castle.from, (v) => edit(() => (castle.from = Math.min(1, Math.max(0, num(v, castle.from))))), 'number', '0.01'),
        field('walls to', castle.to, (v) => edit(() => (castle.to = Math.min(1, Math.max(0, num(v, castle.to))))), 'number', '0.01'),
        choice('walls on', [['1', 'the right, going round'], ['-1', 'the left']], String(castle.side), (v) => edit(() => (castle.side = Number(v) as 1 | -1))),
        note("(only where there's room behind the barriers, and only as tall as hides no track: on the camera's side of the track they may not show)"),
      );
    }
  }

  panel.append(heading('Lakes'));
  const lakes = draft.extras.lakes ?? [];
  const lakeRow = document.createElement('div');
  lakeRow.className = 'row';
  lakeRow.append(button('Add a lake', () => edit(() => {
    const c = near();
    draft.extras.lakes = [...lakes, square(c.x, c.y, c.size)];
    selected = { kind: 'lake', l: lakes.length, i: 0 };
  })));
  if (selected?.kind === 'lake') {
    const l = selected.l;
    lakeRow.append(button(`Remove lake ${l + 1}`, () => edit(() => {
      draft.extras.lakes = lakes.filter((_, k) => k !== l);
      if (!draft.extras.lakes.length) delete draft.extras.lakes;
      selected = undefined;
    })));
  }
  panel.append(lakeRow, note(`${lakes.length} lake${lakes.length === 1 ? '' : 's'}${lakes.length ? ' (pick one of its points to remove it)' : ''}`));

  panel.append(heading('Bridge (where the lap crosses itself)'));
  const bridge = draft.extras.bridge;
  const bridgeRow = document.createElement('div');
  bridgeRow.className = 'row';
  bridgeRow.append(button(bridge ? 'Find the crossing again' : 'Find the crossing, and bridge it', () => {
    if (!circuit) return;
    const x = findCrossing(circuit);
    if (!x) return status("the lap doesn't cross itself: shape it into a figure of eight first", true);
    edit(() => (draft.extras.bridge = { over: Math.round(x.b), under: Math.round(x.a), height: bridge?.height ?? 36 }));
    status('bridged: the stretch met second goes over (swap them if you like); give both the same height there');
  }));
  if (bridge) {
    bridgeRow.append(
      button('Swap over and under', () => edit(() => (draft.extras.bridge = { ...bridge, over: bridge.under, under: bridge.over }))),
      button('No bridge', () => edit(() => delete draft.extras.bridge)),
    );
  }
  panel.append(bridgeRow);
  if (bridge) {
    panel.append(
      field('over (px along the lap)', bridge.over, (v) => edit(() => (bridge.over = num(v, bridge.over))), 'number'),
      field('under (px along the lap)', bridge.under, (v) => edit(() => (bridge.under = num(v, bridge.under))), 'number'),
      field('deck height (px)', bridge.height, (v) => edit(() => (bridge.height = Math.max(12, num(v, bridge.height)))), 'number'),
    );
  }

  panel.append(heading('Banked bend'));
  panel.append(checkbox('banking', !!draft.extras.banking, (on) => edit(() => (draft.extras.banking = on ? { from: 1000, to: 2000, grade: 0.3 } : undefined))));
  const bank = draft.extras.banking;
  if (bank) {
    panel.append(
      field('from (px along the lap)', bank.from, (v) => edit(() => (bank.from = num(v, bank.from))), 'number'),
      field('to', bank.to, (v) => edit(() => (bank.to = num(v, bank.to))), 'number'),
      field('grade (rise per px across)', bank.grade, (v) => edit(() => (bank.grade = num(v, bank.grade))), 'number', '0.05'),
    );
  }
  panel.append(field('podium deck over the straight (px up; blank: on the run-off)', draft.extras.podiumDeck ?? '', (v) => edit(() => (draft.extras.podiumDeck = v.trim() === '' ? undefined : num(v, 30)))));
}

/** Open the game on the draft as it is now (`mode`: a quick race or a time trial). */
function drive_(mode: string) {
  if (!circuit) return status("can't drive it: it doesn't build", true);
  try {
    localStorage.setItem(DESIGNER_DRIVE_KEY, JSON.stringify(layoutFrom(draft)));
    localStorage.setItem(`${DESIGNER_DRIVE_KEY}:mode`, mode);
  } catch {
    return status("can't drive it: the browser won't keep it (a private window?)", true);
  }
  const failing = check(layoutFrom(draft), circuit).filter((c) => !c.ok).map((c) => c.label);
  // (the game beside it: index.html served, play.html built: vite.designer.config.ts)
  window.open(`./${import.meta.env.VITE_GAME_PAGE ?? 'index.html'}?circuit=${DESIGNER_DRAFT_ID}&mode=${mode}`, 'corner-cutters-drive');
  status(failing.length ? `driving it as it is (failing: ${failing.join(', ')})` : 'driving it in the game (a tab of its own)', failing.length > 0);
}

function download(name: string, text: string, type: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function openJson() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const layout = JSON.parse(await file.text());
      if (!Array.isArray(layout.points) || !Array.isArray(layout.elevation) || !layout.pit) throw new Error('not a circuit layout');
      const before = JSON.stringify(draft);
      draft = draftFrom(layout);
      selected = undefined;
      commit(before);
      goTo(0);
    } catch (err) {
      status(`couldn't open it: ${(err as Error).message}`, true);
    }
  });
  input.click();
}

// ---- the loop ----------------------------------------------------------------------------------------
const clock = new THREE.Clock();
const focus = new THREE.Vector3();
function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  // move: along where it looks (walking: along the ground)
  const speed = FLY_SPEED * (held.has('shift') ? 4 : 1) * dt;
  const fwd = new THREE.Vector3(-Math.sin(yaw) * Math.cos(mode === 'fly' ? pitch : 0), mode === 'fly' ? Math.sin(pitch) : 0, -Math.cos(yaw) * Math.cos(mode === 'fly' ? pitch : 0));
  const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  if (!typing()) {
    if (held.has('w')) camera.position.addScaledVector(fwd, speed);
    if (held.has('s')) camera.position.addScaledVector(fwd, -speed);
    if (held.has('d')) camera.position.addScaledVector(right, speed);
    if (held.has('a')) camera.position.addScaledVector(right, -speed);
    if (mode === 'fly' && held.has('e')) camera.position.y += speed;
    if (mode === 'fly' && held.has('q')) camera.position.y -= speed;
  }
  const ground = circuit ? groundAt(circuit.grid, camera.position.x, camera.position.z).h : 0;
  if (mode === 'walk') camera.position.y = ground + EYE;
  else camera.position.y = Math.max(ground + 2, camera.position.y);
  camera.rotation.set(pitch, yaw, 0);
  // (the markers the same size on screen however near or far: a dot, not a ball in the way)
  for (const m of markers.children) {
    if (m.userData.handle === undefined) continue;
    m.scale.setScalar(m.userData.base * Math.max(0.15, camera.position.distanceTo(m.position) * 0.003));
  }
  if (world) {
    // the sun's shadows round what the camera looks at
    focus.copy(camera.position).addScaledVector(new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)), 200);
    focus.y = circuit ? groundAt(circuit.grid, focus.x, focus.z).h : 0;
    world.followSun(focus);
    world.animate(performance.now() / 1000);
    renderer.render(world.scene, camera);
  }
  hud.textContent = `${mode === 'walk' ? 'WALK' : 'FLY'} · x ${Math.round(camera.position.x)} y ${Math.round(camera.position.z)} · ${Math.round(camera.position.y - ground)} px up${selected ? ` · ${handleName(selected)}` : ''}`;
  requestAnimationFrame(frame);
}

rebuild();
goTo(0);
requestAnimationFrame(frame);

// (for checking the designer in a browser from a script: where each point's marker is on screen, and the draft)
(window as unknown as { __designer: unknown }).__designer = {
  draft: () => draft,
  selected: () => selected,
  /** pick a handle (for a script): as a click on it would */
  select: (h: Handle | undefined) => {
    selected = h;
    buildMarkers();
    renderPanel();
  },
  handles,
  onScreen: (i: number) => {
    const m = markers.children.find((c) => c.userData.index === i);
    if (!m) return undefined;
    const v = m.position.clone().project(camera);
    const r = renderer.domElement.getBoundingClientRect();
    return { x: ((v.x + 1) / 2) * r.width + r.left, y: ((1 - v.y) / 2) * r.height + r.top, behind: v.z > 1 };
  },
  goTo,
};
