// Virtual handheld buttons, fed by the keyboard, a gamepad and the on-screen
// deck. Each input source keeps its own set of held buttons, so releasing a key
// doesn't cancel a button still held on the touch deck (and vice versa). A
// gamepad also gives analogue driving (steering, gas, brake), and the controls
// remember which source was used last, so a game can drive the car the way
// that device suits.

import { onHidden } from './host';

export type Button = 'up' | 'down' | 'left' | 'right' | 'a' | 'b' | 'start' | 'select';
export type Direction = 'up' | 'down' | 'left' | 'right';

/** Analogue car-relative driving from a gamepad: steering −1 (left) … 1 (right), gas and brake 0…1; and its left stick as a
 * screen direction (y down, length 0…1), for pointing the way to go. */
export interface Drive {
  turn: number;
  gas: number;
  brake: number;
  stick?: Stick;
}

export interface Stick {
  /** screen-space direction (y down); length 0…1 is how far the thumb is pushed */
  x: number;
  y: number;
}

export class Controls {
  private readonly held = new Map<string, Set<Button>>();
  private readonly pressCounts = new Map<Button, number>();
  private readonly sticks = new Map<string, Stick>();
  private readonly drives = new Map<string, Drive>();
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
    // a press: the button going down when nothing held it (two sources at once are one press); but a tap on the
    // screen's own buttons always is one, whatever else holds the button (a source left holding it, as a touch whose
    // lifting a phone never reported, or a pad the phone lists that isn't one, would otherwise swallow every tap)
    if (down && !set.has(button) && (!this.isDown(button) || source.startsWith('touch-'))) this.countPress(button);
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
    this.sticks.delete(source);
    this.drives.delete(source);
  }

  /** Let go of everything from every source (the page lost focus or is being left). */
  clearAll(): void {
    this.held.clear();
    this.sticks.clear();
    this.drives.clear();
  }

  /** Analogue position from a touch source (the thumbstick reports the thumb's exact offset). */
  setStick(source: string, stick: Stick): void {
    if (stick.x || stick.y) this.last = source;
    this.sticks.set(source, stick);
  }

  /** Analogue driving from a gamepad. */
  setDrive(source: string, drive: Drive): void {
    if (drive.turn || drive.gas || drive.brake || drive.stick?.x || drive.stick?.y) this.last = source;
    this.drives.set(source, drive);
  }

  /** The analogue driving from `source`, if it gives any. */
  drive(source: string): Drive | undefined {
    return this.drives.get(source);
  }

  /** Whether `button` is held on `source` in particular. */
  isDownOn(source: string, button: Button): boolean {
    return this.held.get(source)?.has(button) ?? false;
  }

  /** The analogue stick if a touch source is providing one; undefined for keyboard-only input. */
  stick(): Stick | undefined {
    for (const s of this.sticks.values()) return s;
    return undefined;
  }

  /**
   * Where the player is pushing, length 0…1: the touch thumbstick's exact thumb
   * position when there is one, otherwise the held direction buttons (8-way,
   * length 1). Used for analogue walking and driving.
   */
  direction(): Stick {
    const s = this.stick();
    if (s && (s.x !== 0 || s.y !== 0)) return s;
    const x = (this.isDown('right') ? 1 : 0) - (this.isDown('left') ? 1 : 0);
    const y = (this.isDown('down') ? 1 : 0) - (this.isDown('up') ? 1 : 0);
    const len = Math.hypot(x, y);
    return len ? { x: x / len, y: y / len } : { x: 0, y: 0 };
  }

  isDown(button: Button): boolean {
    for (const set of this.held.values()) if (set.has(button)) return true;
    return false;
  }
}

// Eight 45° sectors, starting at "right" and going clockwise (screen y points down).
const SECTORS: Direction[][] = [
  ['right'],
  ['down', 'right'],
  ['down'],
  ['down', 'left'],
  ['left'],
  ['up', 'left'],
  ['up'],
  ['up', 'right'],
];

/**
 * Directions held for a thumb at (dx, dy) from the centre of a pad.
 * Anything inside the dead zone counts as no direction.
 */
export function directionsFromOffset(dx: number, dy: number, deadZone: number): Direction[] {
  if (Math.hypot(dx, dy) < deadZone) return [];
  const sector = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
  return SECTORS[((sector % 8) + 8) % 8];
}

/** How the on-screen thumbstick reads, as shares of how far its knob can travel from the centre. */
export const THUMBSTICK = {
  /** nothing until the thumb is this far out */
  deadZone: 0.12,
  /** full push from here to the rim, so full throttle doesn't need the very edge */
  full: 0.85,
  /** the up/down/left/right buttons (menus) come on past this */
  buttons: 0.5,
};

/**
 * The thumbstick for a thumb at (dx, dy) px from its centre, with a knob that
 * can travel `travel` px: the analogue reading (exact angle, length 0…1), where
 * to draw the knob (following the thumb, stopped at the rim), and the direction
 * buttons it holds for anything that reads buttons (8-way, only when pushed well out).
 */
export function thumbstick(dx: number, dy: number, travel: number): { stick: Stick; knob: { x: number; y: number }; dirs: Direction[] } {
  const d = Math.hypot(dx, dy);
  const reach = Math.min(1, d / travel);
  const t = Math.min(1, Math.max(0, (reach - THUMBSTICK.deadZone) / (THUMBSTICK.full - THUMBSTICK.deadZone)));
  const ux = d ? dx / d : 0;
  const uy = d ? dy / d : 0;
  return {
    stick: t ? { x: ux * t, y: uy * t } : { x: 0, y: 0 },
    knob: { x: ux * reach * travel, y: uy * reach * travel },
    dirs: directionsFromOffset(dx, dy, travel * THUMBSTICK.buttons),
  };
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

/** A gamepad's buttons (in the standard layout) as the handheld's: A drifts (B), Start pauses (A), Y restarts (START), Back is SELECT, the d-pad moves. */
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

/** Stick travel ignored around the centre (worn sticks don't rest at 0). */
const PAD_DEAD_ZONE = 0.15;

/** A gamepad's state as the handheld's buttons and analogue driving: the left stick steers (or points), the right trigger is gas, the left the brake. */
export function readGamepad(pad: { buttons: readonly { pressed: boolean; value: number }[]; axes: readonly number[] }): { buttons: Button[]; drive: Drive } {
  const buttons = PAD_BUTTONS.filter(([i]) => pad.buttons[i]?.pressed).map(([, b]) => b);
  const x = pad.axes[0] ?? 0;
  const turn = Math.abs(x) < PAD_DEAD_ZONE ? 0 : Math.sign(x) * ((Math.abs(x) - PAD_DEAD_ZONE) / (1 - PAD_DEAD_ZONE));
  // (the stick as a direction: its dead zone round the centre, then out to the rim)
  const y = pad.axes[1] ?? 0;
  const len = Math.hypot(x, y);
  const out = len < PAD_DEAD_ZONE ? 0 : Math.min(1, (len - PAD_DEAD_ZONE) / (1 - PAD_DEAD_ZONE));
  const stick = out ? { x: (x / len) * out, y: (y / len) * out } : { x: 0, y: 0 };
  return { buttons, drive: { turn, gas: pad.buttons[7]?.value ?? 0, brake: pad.buttons[6]?.value ?? 0, stick } };
}

/**
 * A pad's buttons less those held since it turned up (`stuck`, kept up to date: each let go of once counts from
 * then on). Some phones list a part of themselves as a gamepad (a fingerprint reader, a side key) with buttons that
 * never let go: those would hold the game's buttons down for good, and a real pad's are let go at once.
 */
export function unstuck(buttons: Button[], stuck: Set<Button>): Button[] {
  for (const b of [...stuck]) if (!buttons.includes(b)) stuck.delete(b);
  return buttons.filter((b) => !stuck.has(b));
}

/** Poll the first connected gamepad every frame, as the 'gamepad' source. */
export function bindGamepad(controls: Controls, target: Window = window): void {
  if (!target.navigator.getGamepads) return;
  let had = false;
  /** the pad being read (its id), and the buttons it had held when it turned up */
  let which: string | undefined;
  let stuck = new Set<Button>();
  const poll = () => {
    const pad = [...target.navigator.getGamepads()].find((p) => p && p.connected);
    if (pad) {
      const read = readGamepad(pad);
      if (pad.id !== which) {
        which = pad.id;
        stuck = new Set(read.buttons);
      }
      const buttons = unstuck(read.buttons, stuck);
      const { drive } = read;
      controls.set('gamepad', buttons);
      controls.setDrive('gamepad', drive);
      had = true;
    } else if (had) {
      controls.clear('gamepad');
      had = false;
      which = undefined;
    }
    target.requestAnimationFrame(poll);
  };
  target.requestAnimationFrame(poll);
}
