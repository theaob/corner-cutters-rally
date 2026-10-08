// Driving on a touch screen, held in both hands.
//
// One thumb steers with two buttons in its corner, ◀ and ▶: hold one to steer that way. The steering wheel
// (steering.ts) turns toward it at its own rate, so a tap is a nudge and a hold is a bend, and lifting brings the wheel
// back to the middle. A thumb can roll from one button to the other without lifting. A bar over the buttons shows
// where the wheel is.
//
// The other thumb works the pedals in its corner: GAS, BRAKE beside it, and DRIFT (the handbrake) above them, rolled
// between the same way. With GAS on AUTO in the settings there's no gas pedal: the gas is on unless you brake.
//
// SIDES in the settings puts the steering under the left thumb (the pedals right) or the other way round.

import { vibrate } from '../haptics';
import type { Intent } from './intent';
import type { GasMode, SteerSide } from './settings';

/** px round each button still counted as on it (a thumb rolling between them, or a little off) */
export const BUTTON_SLOP = 14;

/** The steering the arrow buttons held ask for: one of them steers that way; both, or neither, straight on. */
export const arrowSteer = (left: boolean, right: boolean): number => (right ? 1 : 0) - (left ? 1 : 0);

const el = (tag: string, cls: string, text = '') => {
  const e = document.createElement(tag);
  e.className = cls;
  if (text) e.textContent = text;
  return e;
};

/**
 * A corner of buttons for the thumbs: each finger down on it is on the nearest button it's on or close to, and moves
 * to another as it rolls across without lifting.
 */
class ButtonZone<B extends string> {
  /** the button each finger on the zone is on */
  private readonly on = new Map<number, B | undefined>();

  constructor(
    readonly el: HTMLElement,
    private readonly buttons: Record<B, HTMLElement>,
    private readonly usable: (b: B) => boolean = () => true,
  ) {
    const update = (e: PointerEvent) => {
      const was = this.on.get(e.pointerId);
      const now = this.at(e.clientX, e.clientY);
      this.on.set(e.pointerId, now);
      if (now && now !== was) vibrate(8);
      this.paint();
    };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // (the pointer's gone already)
      }
      update(e);
    });
    el.addEventListener('pointermove', (e) => {
      if (this.on.has(e.pointerId)) update(e);
    });
    const end = (e: PointerEvent) => {
      if (this.on.delete(e.pointerId)) this.paint();
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('lostpointercapture', end);
  }

  /** Whether some finger is on button `b`. */
  held(b: B): boolean {
    for (const v of this.on.values()) if (v === b) return true;
    return false;
  }

  release(): void {
    this.on.clear();
    this.paint();
  }

  /** The button under (x, y), if any: the nearest of those it's on or close to. */
  private at(x: number, y: number): B | undefined {
    let best: B | undefined;
    let bestD = Infinity;
    for (const b of Object.keys(this.buttons) as B[]) {
      if (!this.usable(b)) continue;
      const r = this.buttons[b].getBoundingClientRect();
      if (!r.width) continue;
      const d = Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom));
      if (d <= BUTTON_SLOP && d < bestD) {
        best = b;
        bestD = d;
      }
    }
    return best;
  }

  private paint(): void {
    for (const b of Object.keys(this.buttons) as B[]) this.buttons[b].classList.toggle('pressed', this.held(b));
  }
}

export class TouchDriving {
  readonly el: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly marker: HTMLElement;
  private readonly steer: ButtonZone<'left' | 'right'>;
  private readonly pedals: ButtonZone<'gas' | 'brake' | 'drift'>;
  private gas: GasMode = 'manual';

  constructor(host: HTMLElement) {
    this.el = el('div', 'drive');
    this.el.setAttribute('aria-hidden', 'true');
    const steerZone = el('div', 'drive-steer');
    this.bar = el('div', 'drive-wheel');
    this.marker = el('span', 'drive-wheel-marker');
    this.bar.append(this.marker);
    const left = el('div', 'drive-arrow left', '◀');
    const right = el('div', 'drive-arrow right', '▶');
    steerZone.append(this.bar, left, right);
    const pedalZone = el('div', 'drive-pedals');
    const pedals = { drift: el('div', 'drive-pedal drift', 'DRIFT'), brake: el('div', 'drive-pedal brake', 'BRAKE'), gas: el('div', 'drive-pedal gas', 'GAS') };
    pedalZone.append(pedals.drift, pedals.brake, pedals.gas);
    this.el.append(steerZone, pedalZone);
    host.prepend(this.el);
    this.steer = new ButtonZone(steerZone, { left, right });
    this.pedals = new ButtonZone(pedalZone, pedals, (p) => p !== 'gas' || this.gas === 'manual');
  }

  /** SIDES and GAS from the settings. */
  setOptions(side: SteerSide, gas: GasMode): void {
    if (this.el.dataset.side !== side) this.el.dataset.side = side;
    if (this.el.dataset.gas !== gas) this.el.dataset.gas = gas;
    this.gas = gas;
  }

  /** What the thumbs ask for now. */
  intent(): Intent {
    return {
      steer: arrowSteer(this.steer.held('left'), this.steer.held('right')),
      throttle: this.gas === 'manual' && this.pedals.held('gas') ? 1 : 0,
      brake: this.pedals.held('brake') ? 1 : 0,
      handbrake: this.pedals.held('drift'),
    };
  }

  /** Draw where the steering wheel is (−1…1) on the bar over the arrows. */
  showWheel(pos: number): void {
    const travel = (this.bar.clientWidth - this.marker.offsetWidth) / 2;
    this.marker.style.transform = `translateX(${(pos * travel).toFixed(1)}px)`;
  }

  /** Let go of everything (the stage paused, or the page hidden). */
  release(): void {
    this.steer.release();
    this.pedals.release();
  }

  dispose(): void {
    this.release();
    this.el.remove();
  }
}
