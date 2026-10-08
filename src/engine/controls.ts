// Virtual handheld buttons for the menus and the stage's own actions (pause, restart, on to the results), fed by the
// keyboard, a gamepad and the on-screen deck. Each input source keeps its own set of held buttons, so releasing a key
// doesn't cancel a button still held on the touch deck (and vice versa). Driving the car is src/engine/drive/'s, not these.

import { onHidden } from './host';

export type Button = 'up' | 'down' | 'left' | 'right' | 'a' | 'b' | 'start' | 'select';
export type Direction = 'up' | 'down' | 'left' | 'right';

export class Controls {
  private readonly held = new Map<string, Set<Button>>();
  private readonly pressCounts = new Map<Button, number>();
  private last = '';

  /** The source the player used last (e.g. 'keyboard', 'gamepad', 'touch-…'); '' before any. */
  lastSource(): string {
    return this.last;
  }

  set(source: string, buttons: Iterable<Button>): void {
    const next = new Set(buttons);
    for (const b of next) if (!this.isDown(b)) this.countPress(b);
    if (next.size) this.last = source;
    this.held.set(source, next);
  }

  press(source: string, button: Button, down: boolean): void {
    const set = this.held.get(source) ?? new Set<Button>();
    if (down) this.last = source;
    if (down && !this.isDown(button)) this.countPress(button);
    if (down) set.add(button);
    else set.delete(button);
    this.held.set(source, set);
  }

  /**
   * How many times `button` has gone from up to down, ever. Compare against a
   * previous reading to catch taps that start and end between two frames.
   */
  presses(button: Button): number {
    return this.pressCounts.get(button) ?? 0;
  }

  private countPress(button: Button): void {
    this.pressCounts.set(button, this.presses(button) + 1);
  }

  clear(source: string): void {
    this.held.delete(source);
  }

  /** Let go of everything from every source (the page lost focus or is being left). */
  clearAll(): void {
    this.held.clear();
  }

  /** Whether `button` is held on `source` in particular. */
  isDownOn(source: string, button: Button): boolean {
    return this.held.get(source)?.has(button) ?? false;
  }

  isDown(button: Button): boolean {
    for (const set of this.held.values()) if (set.has(button)) return true;
    return false;
  }
}

const KEY_MAP: Record<string, Button> = {
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  KeyZ: 'a',
  KeyK: 'a',
  Space: 'a',
  KeyX: 'b',
  KeyJ: 'b',
  ShiftLeft: 'b',
  ShiftRight: 'b',
  Enter: 'start',
  Backspace: 'select',
};

/** Whether `target` takes typing (a text field). */
const typing = (target: EventTarget | null) =>
  typeof HTMLInputElement !== 'undefined' && (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement);

export function bindKeyboard(controls: Controls, target: Window = window): void {
  const onKey = (down: boolean) => (e: KeyboardEvent) => {
    const button = KEY_MAP[e.code];
    // (typing in a text field: the keys are the field's, not the deck's)
    if (!button || typing(e.target)) return;
    e.preventDefault();
    controls.press('keyboard', button, down);
  };
  target.addEventListener('keydown', onKey(true));
  target.addEventListener('keyup', onKey(false));
  target.addEventListener('blur', () => controls.clear('keyboard'));
}

/**
 * Keep input from getting stuck across page switches (SELECT + START reloads
 * the page): let go of everything when the page is hidden or left, reload a
 * page the browser brings back from its back/forward cache (its loops have
 * stopped and it thinks buttons are still held), and take keyboard focus back
 * on load and on any tap, since inside the itch.io frame focus can stay with
 * the outer page after a switch.
 */
export function guardInput(controls: Controls, onRelease: () => void, target: Window = window): void {
  const release = () => {
    controls.clearAll();
    onRelease();
  };
  target.addEventListener('pagehide', release);
  target.addEventListener('blur', release);
  // (the game out of sight: host.ts, the page's visibility or YouTube's pause)
  onHidden((hidden) => hidden && release());
  target.addEventListener('pageshow', (e) => {
    if (e.persisted) target.location.reload();
  });
  target.focus();
  target.addEventListener('pointerdown', () => target.focus(), { capture: true });
}

/** A gamepad's buttons (in the standard layout) as the handheld's: A is B, Start is A (pause), Y restarts (START), Back is SELECT, the d-pad moves. */
const PAD_BUTTONS: [index: number, button: Button][] = [
  [0, 'b'],
  [9, 'a'],
  [3, 'start'],
  [8, 'select'],
  [12, 'up'],
  [13, 'down'],
  [14, 'left'],
  [15, 'right'],
];

/** A gamepad's buttons as the handheld's. */
export function readGamepad(pad: { buttons: readonly { pressed: boolean; value: number }[] }): { buttons: Button[] } {
  return { buttons: PAD_BUTTONS.filter(([i]) => pad.buttons[i]?.pressed).map(([, b]) => b) };
}

/** Poll the first connected gamepad every frame, as the 'gamepad' source. */
export function bindGamepad(controls: Controls, target: Window = window): void {
  if (!target.navigator.getGamepads) return;
  let had = false;
  const poll = () => {
    const pad = [...target.navigator.getGamepads()].find((p) => p && p.connected);
    if (pad) {
      controls.set('gamepad', readGamepad(pad).buttons);
      had = true;
    } else if (had) {
      controls.clear('gamepad');
      had = false;
    }
    target.requestAnimationFrame(poll);
  };
  target.requestAnimationFrame(poll);
}
