// Driving on a touch screen, held in both hands.
//
// One thumb steers: put it down anywhere on its half of the screen and drag across. Where it lands is the middle; the
// further across it goes, the further the wheel turns, full lock a thumb's width away. Lift it and the wheel comes back
// to the middle on its own. A wheel drawn under the thumb shows where the steering is.
//
// The other thumb works the pedals in its corner: GAS, BRAKE beside it, and DRIFT (the handbrake) above them. A thumb
// can roll from one pedal to the next without lifting. With GAS on AUTO in the settings there's no gas pedal: the
// gas is on unless you brake.
//
// SIDES in the settings puts the steering under the left thumb (the pedals right) or the other way round.

import { vibrate } from '../haptics';
import type { Intent } from './intent';
import type { GasMode, SteerSide } from './settings';

/** How the steering drag reads: px a thumb goes across for full lock, and px of wobble ignored round where it landed. */
export const DRAG = { full: 64, dead: 4 };

/** The wheel (−1…1) for a thumb `dx` px across from where it landed. */
export function dragSteer(dx: number, full = DRAG.full, dead = DRAG.dead): number {
  const d = Math.abs(dx);
  if (d <= dead) return 0;
  return Math.sign(dx) * Math.min(1, (d - dead) / (full - dead));
}

/** Where a landing point goes as a thumb pushes past full lock: it follows, so steering back answers at once. */
export function followAnchor(anchor: number, x: number, full = DRAG.full): number {
  if (x - anchor > full) return x - full;
  if (anchor - x > full) return x + full;
  return anchor;
}

type Pedal = 'gas' | 'brake' | 'drift';
/** px round each pedal still counted as on it (a thumb rolling between them, or a little off) */
const PEDAL_SLOP = 14;

const el = (tag: string, cls: string, text = '') => {
  const e = document.createElement(tag);
  e.className = cls;
  if (text) e.textContent = text;
  return e;
};

export class TouchDriving {
  readonly el: HTMLElement;
  private readonly steerZone: HTMLElement;
  private readonly wheel: HTMLElement;
  private readonly knob: HTMLElement;
  private readonly pedalZone: HTMLElement;
  private readonly pedals: Record<Pedal, HTMLElement>;
  /** the steering thumb: its pointer, and where across the zone the middle is (px, client) */
  private steering?: { id: number; anchor: number };
  private steer = 0;
  /** the pedal each thumb on the pedals is on */
  private readonly onPedal = new Map<number, Pedal | undefined>();
  private gas: GasMode = 'manual';

  constructor(host: HTMLElement) {
    this.el = el('div', 'drive');
    this.el.setAttribute('aria-hidden', 'true');
    this.steerZone = el('div', 'drive-steer');
    this.wheel = el('div', 'drive-wheel');
    this.wheel.append(el('span', 'drive-wheel-arrow left', '◀'), el('span', 'drive-wheel-arrow right', '▶'));
    this.knob = el('span', 'drive-wheel-knob');
    this.wheel.append(this.knob);
    this.steerZone.append(this.wheel, el('span', 'drive-hint', 'DRAG TO STEER'));
    this.pedalZone = el('div', 'drive-pedals');
    this.pedals = { drift: el('div', 'drive-pedal drift', 'DRIFT'), brake: el('div', 'drive-pedal brake', 'BRAKE'), gas: el('div', 'drive-pedal gas', 'GAS') };
    this.pedalZone.append(this.pedals.drift, this.pedals.brake, this.pedals.gas);
    this.el.append(this.steerZone, this.pedalZone);
    host.prepend(this.el);
    this.bindSteering();
    this.bindPedals();
  }

  /** SIDES and GAS from the settings. */
  setOptions(side: SteerSide, gas: GasMode): void {
    this.el.dataset.side = side;
    this.el.dataset.gas = gas;
    this.gas = gas;
  }

  /** What the thumbs ask for now. */
  intent(): Intent {
    const on = new Set(this.onPedal.values());
    return {
      steer: this.steer,
      throttle: this.gas === 'manual' && on.has('gas') ? 1 : 0,
      brake: on.has('brake') ? 1 : 0,
      handbrake: on.has('drift'),
    };
  }

  /** Draw the wheel where the steering is (−1…1). */
  showWheel(pos: number): void {
    const travel = (this.wheel.clientWidth - this.knob.offsetWidth) / 2;
    this.knob.style.transform = `translateX(${(pos * travel).toFixed(1)}px)`;
  }

  /** Let go of everything (the stage paused, or the page hidden). */
  release(): void {
    this.endSteering();
    this.onPedal.clear();
    this.paintPedals();
  }

  dispose(): void {
    this.release();
    this.el.remove();
  }

  private bindSteering(): void {
    const zone = this.steerZone;
    zone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (this.steering) return;
      this.steering = { id: e.pointerId, anchor: e.clientX };
      this.steer = 0;
      const r = zone.getBoundingClientRect();
      // (the wheel comes to the thumb)
      this.wheel.style.left = `${e.clientX - r.left}px`;
      this.wheel.style.top = `${e.clientY - r.top}px`;
      zone.classList.add('pressed');
      try {
        zone.setPointerCapture(e.pointerId);
      } catch {
        // (the pointer's gone already)
      }
    });
    zone.addEventListener('pointermove', (e) => {
      const s = this.steering;
      if (!s || s.id !== e.pointerId) return;
      s.anchor = followAnchor(s.anchor, e.clientX);
      this.steer = dragSteer(e.clientX - s.anchor);
    });
    const end = (e: PointerEvent) => {
      if (this.steering?.id === e.pointerId) this.endSteering();
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
    zone.addEventListener('lostpointercapture', end);
  }

  private endSteering(): void {
    this.steering = undefined;
    this.steer = 0;
    this.steerZone.classList.remove('pressed');
    this.wheel.style.left = '';
    this.wheel.style.top = '';
  }

  /** The pedal under (x, y), if any: the nearest of those it's on or close to. */
  private pedalAt(x: number, y: number): Pedal | undefined {
    let best: Pedal | undefined;
    let bestD = Infinity;
    for (const p of Object.keys(this.pedals) as Pedal[]) {
      if (p === 'gas' && this.gas === 'auto') continue;
      const r = this.pedals[p].getBoundingClientRect();
      if (!r.width) continue;
      const dx = Math.max(r.left - x, 0, x - r.right);
      const dy = Math.max(r.top - y, 0, y - r.bottom);
      const d = Math.hypot(dx, dy);
      if (d <= PEDAL_SLOP && d < bestD) {
        best = p;
        bestD = d;
      }
    }
    return best;
  }

  private bindPedals(): void {
    const zone = this.pedalZone;
    const update = (e: PointerEvent) => {
      const was = this.onPedal.get(e.pointerId);
      const now = this.pedalAt(e.clientX, e.clientY);
      this.onPedal.set(e.pointerId, now);
      if (now && now !== was) vibrate(8);
      this.paintPedals();
    };
    zone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try {
        zone.setPointerCapture(e.pointerId);
      } catch {
        // (the pointer's gone already)
      }
      update(e);
    });
    zone.addEventListener('pointermove', (e) => {
      if (this.onPedal.has(e.pointerId)) update(e);
    });
    const end = (e: PointerEvent) => {
      if (!this.onPedal.delete(e.pointerId)) return;
      this.paintPedals();
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
    zone.addEventListener('lostpointercapture', end);
  }

  private paintPedals(): void {
    const on = new Set(this.onPedal.values());
    for (const p of Object.keys(this.pedals) as Pedal[]) this.pedals[p].classList.toggle('pressed', on.has(p));
  }
}
