// Driving on a keyboard: ← → (A, D) steer, ↑ (W) is the gas, ↓ (S) the brake, Shift or X the handbrake. A key is all
// or nothing; the steering wheel (steering.ts) turns toward it at its own rate, so a tap is a nudge.

import { IDLE, type Intent } from './intent';

export const DRIVE_KEYS = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  gas: ['ArrowUp', 'KeyW'],
  brake: ['ArrowDown', 'KeyS'],
  handbrake: ['ShiftLeft', 'ShiftRight', 'KeyX'],
};

const any = (held: ReadonlySet<string>, codes: string[]) => codes.some((c) => held.has(c));

/** What the keys held (their codes) ask for. */
export function keysIntent(held: ReadonlySet<string>): Intent {
  if (!held.size) return IDLE;
  return {
    steer: (any(held, DRIVE_KEYS.right) ? 1 : 0) - (any(held, DRIVE_KEYS.left) ? 1 : 0),
    throttle: any(held, DRIVE_KEYS.gas) ? 1 : 0,
    brake: any(held, DRIVE_KEYS.brake) ? 1 : 0,
    handbrake: any(held, DRIVE_KEYS.handbrake),
  };
}

/** The keys held now, on `win` (let go when the window loses focus). */
export class KeyDriving {
  private readonly held = new Set<string>();
  private readonly down = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    this.held.add(e.code);
  };
  private readonly up = (e: KeyboardEvent) => this.held.delete(e.code);
  private readonly blur = () => this.held.clear();

  constructor(private readonly win: Window = window) {
    win.addEventListener('keydown', this.down);
    win.addEventListener('keyup', this.up);
    win.addEventListener('blur', this.blur);
  }

  intent(): Intent {
    return keysIntent(this.held);
  }

  release(): void {
    this.held.clear();
  }

  dispose(): void {
    this.win.removeEventListener('keydown', this.down);
    this.win.removeEventListener('keyup', this.up);
    this.win.removeEventListener('blur', this.blur);
  }
}
