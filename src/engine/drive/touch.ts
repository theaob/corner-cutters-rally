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
//
// In TOP-DOWN there are no pedals at all: one thumb anywhere across the lower screen points (below). Once you've
// steered, the wheel fades back out of the picture.
//
// With CONTROL on POINT (TOP-DOWN's, point.ts) the steering thumb points instead: drag from where it lands the way you
// want the car to go on the screen. A ring under the thumb shows the way. Past the ring's edge, the middle follows the
// thumb, so pointing a new way answers at once.

import { vibrate } from '../haptics';
import { t } from '../i18n';
import type { Intent } from './intent';
import type { Control, DriveStyle, GasMode, SteerSide } from './settings';

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

/** POINT: px a thumb goes from where it landed before it points (a wobble ignored), and px the ring reaches (past it,
 * the middle follows the thumb). */
export const POINT_DRAG = { dead: 9, reach: 46 };

/** POINT: the way a thumb at (x, y) points from `anchor` (screen px, y down), as long as how far out it is (1 at the
 * ring's edge: a drift's push), none inside the dead zone; and where the anchor goes as the thumb passes the ring's reach. */
export function dragPoint(anchor: { x: number; y: number }, x: number, y: number, dead = POINT_DRAG.dead, reach = POINT_DRAG.reach): { point?: { x: number; y: number }; anchor: { x: number; y: number } } {
  const dx = x - anchor.x;
  const dy = y - anchor.y;
  const d = Math.hypot(dx, dy);
  const next = d > reach ? { x: x - (dx / d) * reach, y: y - (dy / d) * reach } : anchor;
  // (as long as how far out it is: at the ring's edge, 1)
  const k = Math.min(d, reach) / reach / (d || 1);
  return { point: d > dead ? { x: dx * k, y: dy * k } : undefined, anchor: next };
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
  private readonly hint: HTMLElement;
  private readonly pedalZone: HTMLElement;
  private readonly pedals: Record<Pedal, HTMLElement>;
  /** the steering thumb: its pointer, and where across the zone the middle is (px, client) */
  private steering?: { id: number; anchor: number; spot: { x: number; y: number } };
  private steer = 0;
  /** POINT: the way the thumb points on the screen (none: not pointing) */
  private point?: { x: number; y: number };
  private control: Control = 'wheel';
  /** the pedal each thumb on the pedals is on */
  private readonly onPedal = new Map<number, Pedal | undefined>();
  private gas: GasMode = 'manual';
  /** TOP-DOWN: no pedals (game.css hides them; a thumb on them would brake) */
  private brakeZone = false;

  constructor(host: HTMLElement) {
    this.el = el('div', 'drive');
    this.el.setAttribute('aria-hidden', 'true');
    this.steerZone = el('div', 'drive-steer');
    this.wheel = el('div', 'drive-wheel');
    this.wheel.append(el('span', 'drive-wheel-arrow left', '◀'), el('span', 'drive-wheel-arrow right', '▶'));
    this.knob = el('span', 'drive-wheel-knob');
    this.wheel.append(this.knob);
    this.hint = el('span', 'drive-hint', t('DRAG TO STEER'));
    this.steerZone.append(this.wheel, this.hint);
    this.pedalZone = el('div', 'drive-pedals');
    this.pedals = { drift: el('div', 'drive-pedal drift', t('DRIFT')), brake: el('div', 'drive-pedal brake', t('BRAKE')), gas: el('div', 'drive-pedal gas', t('GAS')) };
    this.pedalZone.append(this.pedals.drift, this.pedals.brake, this.pedals.gas);
    this.el.append(this.steerZone, this.pedalZone);
    host.prepend(this.el);
    this.bindSteering();
    this.bindPedals();
  }

  /** SIDES, GAS, STYLE and CONTROL from the settings. */
  setOptions(side: SteerSide, gas: GasMode, style: DriveStyle = 'sim', control: Control = 'wheel'): void {
    this.el.dataset.side = side;
    this.el.dataset.gas = gas;
    this.el.dataset.style = style;
    this.gas = gas;
    this.brakeZone = style === 'topdown';
    const next = style === 'topdown' ? control : 'wheel';
    if (next !== this.control) this.endSteering();
    this.control = next;
    this.el.dataset.control = next;
    this.hint.textContent = next === 'point' ? t('DRAG THE WAY TO GO') : t('DRAG TO STEER');
  }

  /** What the thumbs ask for now. */
  intent(): Intent {
    const on = new Set(this.onPedal.values());
    return {
      steer: this.steer,
      throttle: this.gas === 'manual' && on.has('gas') ? 1 : 0,
      brake: on.has('brake') ? 1 : 0,
      handbrake: on.has('drift'),
      ...(this.point && { point: { ...this.point } }),
    };
  }

  /** Draw the wheel where the steering is (−1…1). (POINT: the ring shows where the thumb points, as it moves.) */
  showWheel(pos: number): void {
    if (this.control === 'point') return;
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
      this.steering = { id: e.pointerId, anchor: e.clientX, spot: { x: e.clientX, y: e.clientY } };
      this.steer = 0;
      this.point = undefined;
      this.knob.style.transform = '';
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
      if (this.control === 'point') {
        const was = s.spot;
        const d = dragPoint(s.spot, e.clientX, e.clientY);
        s.spot = d.anchor;
        this.point = d.point;
        // (the ring follows the thumb past its reach; the knob shows the way it points)
        if (d.anchor !== was) {
          this.wheel.style.left = `${parseFloat(this.wheel.style.left) + d.anchor.x - was.x}px`;
          this.wheel.style.top = `${parseFloat(this.wheel.style.top) + d.anchor.y - was.y}px`;
        }
        this.knob.style.transform = d.point ? `translate(${(d.point.x * POINT_DRAG.reach).toFixed(1)}px, ${(d.point.y * POINT_DRAG.reach).toFixed(1)}px)` : '';
        this.wheel.classList.toggle('pushed', !!d.point && Math.hypot(d.point.x, d.point.y) > 0.95);
        if (d.point) this.el.classList.add('steered');
        return;
      }
      s.anchor = followAnchor(s.anchor, e.clientX);
      this.steer = dragSteer(e.clientX - s.anchor);
      // (steered once: the wheel can fade)
      if (this.steer !== 0) this.el.classList.add('steered');
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
    this.point = undefined;
    if (this.control === 'point') this.knob.style.transform = '';
    this.steerZone.classList.remove('pressed');
    this.wheel.style.left = '';
    this.wheel.style.top = '';
  }

  /** The pedal under (x, y), if any: the nearest of those it's on or close to. */
  private pedalAt(x: number, y: number): Pedal | undefined {
    // (TOP-DOWN: anywhere on the half)
    if (this.brakeZone) return 'brake';
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
