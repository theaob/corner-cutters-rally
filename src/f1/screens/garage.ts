// The garage: every car, a row to each performance class (HISTORIC … WRC, the ladder up), and the one you have your
// eye on turning slowly on its stand beside them, with its class's five bars (every car in a class drives the same)
// and how it stands: YOUR CAR, PICK, or the career points still to go to unlock it. Your career points over it all,
// and how far they are along to the next car. Touch, or keys: left/right moves along a class's row, up/down from one
// class to the next, A picks the car (once it's unlocked), B (or the phone's back) goes back.

import * as THREE from 'three';
import type { Button } from '../../engine/controls';
import { onBack } from '../../engine/backButton';
import { holdTouches } from '../../engine/deck';
import type { Services } from '../../engine/services';
import { backLabel, t } from '../../engine/i18n';
import { createCarMesh } from '../../engine/render/vehicles3d';
import { menuButton } from '../menu';
import { menuPick, menuTick } from '../sounds';
import { reportOpen } from '../report';
import { motionReduced } from '../access';
import { CLASSES, carsIn, classOf, type CarSpec, type ClassSpec } from '../cars';
import { pickCar, toNextCar, yourCar } from '../career';

/** The five bars: each a class's number, put on a bar between the slowest class's and today's (a little past each end). */
export const BARS: { label: string; of: (c: ClassSpec) => number; lo: number; hi: number }[] = [
  { label: 'TOP SPEED', of: (c) => c.speed, lo: 0.84, hi: 1.02 },
  { label: 'PICK-UP', of: (c) => 1 / c.pickup, lo: 0.7, hi: 1.04 },
  { label: 'GRIP', of: (c) => c.grip, lo: 0.78, hi: 1.03 },
  { label: 'STEERING', of: (c) => c.turn, lo: 0.92, hi: 1.08 },
  { label: 'STRENGTH', of: (c) => c.tough, lo: 0.82, hi: 1.03 },
];
/** A class's share of bar `b` (0…1). */
export const barShare = (b: (typeof BARS)[number], c: ClassSpec) => Math.max(0.06, Math.min(1, (b.of(c) - b.lo) / (b.hi - b.lo)));

export const DRIVE: Record<CarSpec['drive'], string> = { front: 'FRONT-WHEEL DRIVE', rear: 'REAR-WHEEL DRIVE', all: 'FOUR-WHEEL DRIVE' };

/** The car turning on its stand, drawn on a canvas of its own (none where there's no WebGL): show(car) puts another on it. */
function turntable(canvas: HTMLCanvasElement) {
  let renderer: THREE.WebGLRenderer | undefined;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch {
    return { show: () => false, dispose: () => {} };
  }
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xdfe8f4, 0x5a4a38, 1.7));
  const sun = new THREE.DirectionalLight(0xfff4e0, 2.1);
  sun.position.set(-40, 80, -30);
  scene.add(sun);
  const stand = new THREE.Mesh(new THREE.CircleGeometry(19, 48), new THREE.MeshLambertMaterial({ color: 0x2a2e36 }));
  stand.rotation.x = -Math.PI / 2;
  scene.add(stand);
  const camera = new THREE.PerspectiveCamera(24, 1, 1, 500);
  camera.position.set(-36, 21, -42);
  camera.lookAt(0, 3.5, 0);
  let mesh: THREE.Object3D | undefined;
  let spin = -0.6;
  let last = performance.now();
  let frame = 0;
  const still = motionReduced();
  const draw = (now: number) => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w && h && (canvas.width !== Math.round(w * renderer!.getPixelRatio()) || canvas.height !== Math.round(h * renderer!.getPixelRatio()))) {
      renderer!.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    if (!still) spin += Math.min(0.1, (now - last) / 1000) * 0.5;
    last = now;
    if (mesh) mesh.rotation.y = spin;
    renderer!.render(scene, camera);
    frame = requestAnimationFrame(draw);
  };
  frame = requestAnimationFrame(draw);
  return {
    show(car: CarSpec) {
      if (mesh) {
        scene.remove(mesh);
        disposeAll(mesh);
      }
      mesh = createCarMesh('f1', { ...car.paint!, model: car.id }, false);
      scene.add(mesh);
      return true;
    },
    dispose() {
      cancelAnimationFrame(frame);
      if (mesh) disposeAll(mesh);
      stand.geometry.dispose();
      (stand.material as THREE.Material).dispose();
      renderer!.dispose();
      renderer!.forceContextLoss();
    },
  };
}

function disposeAll(o: THREE.Object3D): void {
  o.traverse((n) => {
    const m = n as THREE.Mesh;
    m.geometry?.dispose();
    const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    for (const mat of mats) {
      (mat as THREE.MeshLambertMaterial).map?.dispose();
      mat.dispose();
    }
  });
}

/** Show the garage in `host` until the player goes back; `points`: your career points. */
export function showGarage(host: HTMLElement, services: Services, points: number, closed?: AbortSignal): Promise<'back'> {
  const { controls, hud } = services;
  const screen = document.createElement('div');
  screen.className = 'circuit-menu garage';
  const p = (text: string, color = 'var(--muted)', cls = '') => {
    const e = document.createElement('p');
    e.textContent = text;
    if (cls) e.className = cls;
    e.style.color = color;
    return e;
  };
  return new Promise((resolve) => {
    let done = false;
    const canvas = document.createElement('canvas');
    canvas.className = 'garage-stand';
    const table = turntable(canvas);
    const close = () => {
      if (done) return;
      done = true;
      offBack();
      table.dispose();
      screen.remove();
    };
    const finish = () => {
      if (done) return;
      close();
      menuPick();
      resolve('back');
    };
    const offBack = onBack(() => (finish(), true));
    const back = menuButton(backLabel(), finish);
    back.classList.add('page-back');
    const title = document.createElement('h1');
    title.textContent = t('GARAGE');
    // your career points, and the way to the next car
    const next = toNextCar(points);
    const career = document.createElement('div');
    career.className = 'info-panel garage-career';
    career.append(p(t('{n} CAREER POINTS', { n: points }), 'var(--gold)'));
    if (next) {
      const bar = document.createElement('div');
      bar.className = 'garage-progress';
      const fill = document.createElement('i');
      fill.style.width = `${Math.round(next.share * 100)}%`;
      bar.append(fill);
      career.append(bar, p(t('{n} MORE TO UNLOCK {car}', { n: next.left, car: next.car.name })));
    } else career.append(p(t('EVERY CAR UNLOCKED')));
    career.append(p(t('EARNED IN THE SEASON: YOUR POINTS FROM EACH ROUND, AND A BONUS AT THE END OF IT'), 'var(--muted)', 'garage-small'));

    // the car looked at: on its stand, its name, its class's bars and how it stands
    const look = document.createElement('div');
    look.className = 'info-panel garage-look';
    const name = document.createElement('strong');
    const facts = p('');
    const bars = document.createElement('div');
    bars.className = 'garage-bars';
    const state = document.createElement('div');
    look.append(canvas, name, facts, bars, state);

    // the classes, a row each
    const rows = document.createElement('div');
    rows.className = 'garage-rows';
    let mine = yourCar(points);
    const grid: { car: CarSpec; el: HTMLButtonElement }[][] = [];
    let at = { row: 0, col: 0 };
    for (const cls of CLASSES) {
      const cars = carsIn(cls.id);
      const row = document.createElement('div');
      row.className = 'garage-row';
      const label = document.createElement('b');
      label.textContent = t(cls.name);
      const open = points >= cars[0].unlock;
      if (!open) label.classList.add('locked');
      row.append(label);
      const line: { car: CarSpec; el: HTMLButtonElement }[] = [];
      for (const car of cars) {
        const el = document.createElement('button');
        el.className = 'garage-car';
        const chip = document.createElement('i');
        chip.style.background = car.paint?.body ?? '#888';
        chip.style.boxShadow = `inset 0 0 0 3px ${car.paint?.stripe ?? '#444'}`;
        const n = document.createElement('span');
        n.textContent = car.name;
        el.append(chip, n);
        if (points < car.unlock) {
          el.classList.add('locked');
          const lock = document.createElement('em');
          lock.textContent = `${car.unlock}`;
          el.append(lock);
        }
        el.addEventListener('click', () => {
          at = { row: CLASSES.indexOf(cls), col: cars.indexOf(car) };
          if (points >= car.unlock && car !== mine) pick();
          else show();
        });
        line.push({ car, el });
        row.append(el);
      }
      grid.push(line);
      rows.append(row);
      const k = line.findIndex((c) => c.car === mine);
      if (k >= 0) at = { row: grid.length - 1, col: k };
    }

    const show = () => {
      const { car } = grid[at.row][at.col];
      const cls = classOf(car);
      grid.forEach((line, r) => line.forEach((c, k) => {
        c.el.classList.toggle('focused', r === at.row && k === at.col);
        c.el.classList.toggle('mine', c.car === mine);
      }));
      grid[at.row][at.col].el.scrollIntoView?.({ block: 'nearest' });
      if (!table.show(car)) canvas.style.display = 'none';
      name.textContent = car.name;
      facts.textContent = `${t(cls.name)} · ${car.era} · ${t(DRIVE[car.drive])}`;
      bars.replaceChildren(...BARS.map((b) => {
        const row = document.createElement('div');
        const label = document.createElement('span');
        label.textContent = t(b.label);
        const bar = document.createElement('div');
        bar.className = 'garage-bar';
        const fill = document.createElement('i');
        fill.style.width = `${Math.round(barShare(b, cls) * 100)}%`;
        bar.append(fill);
        row.append(label, bar);
        return row;
      }));
      if (car === mine) state.replaceChildren(p(t('YOUR CAR'), 'var(--accent-b)'));
      else if (points >= car.unlock) state.replaceChildren(menuButton(`${t('DRIVE THIS CAR')} ▶`, pick));
      else state.replaceChildren(p(t('UNLOCKS AT {n} CAREER POINTS', { n: car.unlock }), 'var(--gold)'));
    };
    const pick = () => {
      const { car } = grid[at.row][at.col];
      if (!pickCar(car, points)) return;
      mine = car;
      menuPick();
      show();
    };

    const columns = document.createElement('div');
    columns.className = 'card-columns';
    const side = document.createElement('div');
    side.className = 'card-side';
    side.append(look);
    const right = document.createElement('div');
    right.className = 'card-side';
    right.append(career, rows);
    columns.append(side, right);
    screen.append(back, title, columns);
    holdTouches(screen);
    host.append(screen);
    hud.setPosition('');
    hud.setLap('');
    hud.setLabel('a', 'OK');
    hud.setLabel('b', '');
    show();
    closed?.addEventListener('abort', close);

    const seen = new Map<Button, number>();
    const pressed = (b: Button) => {
      const n = controls.presses(b);
      const edge = n > (seen.get(b) ?? n);
      seen.set(b, n);
      return edge;
    };
    const tick = () => {
      if (done) return;
      const [down, up, left, right, a, start, b] = (['down', 'up', 'left', 'right', 'a', 'start', 'b'] as const).map((k) => pressed(k) && !reportOpen());
      if (b) return finish();
      const dy = (down ? 1 : 0) - (up ? 1 : 0);
      const dx = (right ? 1 : 0) - (left ? 1 : 0);
      if (dy || dx) {
        const row = (at.row + dy + grid.length) % grid.length;
        const col = dy ? Math.min(at.col, grid[row].length - 1) : (at.col + dx + grid[row].length) % grid[row].length;
        at = { row, col };
        menuTick();
        show();
      }
      if (a || start) pick();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
