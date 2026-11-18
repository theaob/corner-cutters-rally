// The control deck under the game screen: an analogue thumbstick (floating, on a touch screen), two face
// buttons and two small ones (A, B, START and SELECT inside), each showing what
// it does now, an icon on it and the action's name (hidden when it does
// nothing), and the status strip (race position, lap).

import { thumbstick, type Button, type Controls } from './controls';
import { vibrate } from './haptics';
import { save, saved } from './save';
import { t } from './i18n';

export type StickSide = 'left' | 'right';

/** Which side the thumbstick sits on (right unless the player moved it; kept on the device). */
export function stickSide(): StickSide {
  return saved('settings', 'stickSide') === 'left' ? 'left' : 'right';
}

/** Put the thumbstick on `side` (the A and B buttons go to the other), and remember it. */
export function setStickSide(deck: HTMLElement, side: StickSide): void {
  deck.classList.toggle('stick-right', side === 'right');
  save('settings', 'stickSide', side);
}

/**
 * How you drive with a touch screen or the keys (DRIVING in the settings; kept on the device): SPLIT, the experiment,
 * the screen in landscape and in two halves (hold one to steer that way, both to brake and then reverse; the gas is
 * always on), or STICK, Corner Cutters' floating thumbstick in portrait (and the keys' own gas and brake). SPLIT unless
 * the player picked STICK; ?stick or ?split in the address picks one for the visit (for testing).
 */
export type DriveScheme = 'split' | 'stick';
export const DRIVE_SCHEMES: DriveScheme[] = ['split', 'stick'];
export function driveScheme(search: string = globalThis.location?.search ?? ''): DriveScheme {
  const params = new URLSearchParams(search);
  if (params.has('stick')) return 'stick';
  if (params.has('split')) return 'split';
  return saved('settings', 'drive') === 'stick' ? 'stick' : 'split';
}
/** Whether you drive by the screen's halves (SPLIT). */
export const splitOn = (): boolean => driveScheme() === 'split';
/** Pick how you drive, and remember it; the page (src/app.ts) hears 'drive-scheme' and lays itself out for it. */
export function setDriveScheme(scheme: DriveScheme): void {
  save('settings', 'drive', scheme);
  globalThis.dispatchEvent?.(new Event('drive-scheme'));
}

/** A tick under the finger on a button press (if vibration is on). */
const buzz = () => vibrate(8);

/**
 * Keep the browser's own touch gestures (scrolling, zooming, a tap turning into
 * a click) off `el`, so every touch on it reaches the game as pointer events.
 * `touch-action: none` in the CSS should be enough, but inside a cross-origin
 * frame (itch.io on a phone) the page around the frame can still take a touch
 * over as a scroll, which cancels it; a non-passive touch handler can't be overruled.
 */
export function holdTouches(el: HTMLElement): void {
  const stop = (e: TouchEvent) => {
    // (a text field keeps its touches: a tap focuses it and brings up the keyboard)
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.cancelable) e.preventDefault();
  };
  el.addEventListener('touchstart', stop, { passive: false });
  el.addEventListener('touchmove', stop, { passive: false });
}

/** Keep the pointer's events coming to `el` while it's held, if the browser allows it (it can refuse). */
function capture(el: HTMLElement, pointerId: number): void {
  try {
    el.setPointerCapture(pointerId);
  } catch {
    // the pointer is already gone (or capture isn't allowed): the press still counts
  }
}

export function bindDeck(deck: HTMLElement, controls: Controls): void {
  deck.addEventListener('contextmenu', (e) => e.preventDefault());
  holdTouches(deck);

  const stick = deck.querySelector<HTMLElement>('[data-dpad]');
  if (stick) bindStick(stick, controls, deck);
  bindSplit(deck, controls);

  for (const el of deck.querySelectorAll<HTMLElement>('[data-button]')) {
    const button = el.dataset.button as Button;
    const source = `touch-${button}`;
    let held: number | undefined;
    const release = () => {
      held = undefined;
      controls.clear(source);
      el.classList.remove('pressed');
    };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      // (a press before it was let go, its lifting never reported: let go of that one first, so this one counts)
      if (held !== undefined) release();
      held = e.pointerId;
      controls.press(source, button, true);
      el.classList.add('pressed');
      capture(el, e.pointerId);
      buzz();
    });
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('lostpointercapture', release);
    // (without capture the finger can lift off somewhere else)
    releaseAnywhere(() => held, release);
  }
}

/** Also let go when the held pointer lifts anywhere on the page. */
function releaseAnywhere(held: () => number | undefined, release: () => void): void {
  for (const type of ['pointerup', 'pointercancel'] as const) {
    window.addEventListener(type, (e) => {
      if (e.pointerId === held()) release();
    });
  }
}

/** px between a floating stick's base and the screen's edge, at the closest */
export const FLOAT_MARGIN = 8;

/**
 * Where a floating stick's base goes for a thumb landing at (`x`, `y`): centred under the thumb, kept `FLOAT_MARGIN`
 * px inside `bounds` (the screen). As the offset (px) from its place at rest, whose centre is (`homeX`, `homeY`).
 */
export function floatOffset(x: number, y: number, homeX: number, homeY: number, radius: number, bounds: { left: number; top: number; right: number; bottom: number }): { x: number; y: number } {
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(Math.max(lo, hi), v));
  const r = radius + FLOAT_MARGIN;
  return { x: clamp(x, bounds.left + r, bounds.right - r) - homeX, y: clamp(y, bounds.top + r, bounds.bottom - r) - homeY };
}

/**
 * The thumbstick: a round base with a knob that follows the thumb (stopped at
 * the rim). It reports the thumb's exact direction and push (analogue), and the
 * 8-way direction buttons once it's pushed well out, for menus.
 *
 * On a touch screen it floats: a thumb landing anywhere on the stick's side of the lower screen (the zone) brings the
 * stick there, centred under it, and drives it from there; let go, it glides back to its place at rest, in the corner.
 */
function bindStick(pad: HTMLElement, controls: Controls, deck: HTMLElement): void {
  const knob = pad.querySelector<HTMLElement>('.knob');
  let held: number | undefined;
  /** where the stick has floated to (px from its place at rest) */
  let offset = { x: 0, y: 0 };
  const place = (o: { x: number; y: number }) => {
    offset = o;
    pad.style.transform = o.x || o.y ? `translate(${o.x}px, ${o.y}px)` : '';
  };
  const moveKnob = (x: number, y: number) => knob?.style.setProperty('transform', `translate(${x}px, ${y}px)`);
  const update = (e: PointerEvent) => {
    const r = pad.getBoundingClientRect();
    // the knob's centre can go as far as the base's rim minus its own radius
    const travel = (r.width - (knob?.offsetWidth ?? r.width * 0.42)) / 2;
    const s = thumbstick(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2), travel);
    controls.set('dpad', s.dirs);
    controls.setStick('dpad', s.stick);
    moveKnob(s.knob.x, s.knob.y);
  };
  const release = () => {
    held = undefined;
    controls.clear('dpad');
    pad.classList.remove('pressed');
    moveKnob(0, 0);
    place({ x: 0, y: 0 });
  };
  const press = (e: PointerEvent, on: HTMLElement) => {
    e.preventDefault();
    held = e.pointerId;
    pad.classList.add('pressed');
    update(e);
    capture(on, e.pointerId);
    buzz();
  };
  pad.addEventListener('pointerdown', (e) => press(e, pad));
  // the zone the stick floats over (on a touch screen: the CSS shows it there, the stick itself left to it)
  const zone = document.createElement('div');
  zone.className = 'stick-zone';
  zone.setAttribute('aria-hidden', 'true');
  deck.prepend(zone);
  zone.addEventListener('pointerdown', (e) => {
    if (held !== undefined) return;
    const r = pad.getBoundingClientRect();
    const b = deck.getBoundingClientRect();
    place(floatOffset(e.clientX, e.clientY, r.left + r.width / 2 - offset.x, r.top + r.height / 2 - offset.y, r.width / 2, b));
    press(e, zone);
  });
  for (const el of [pad, zone]) {
    el.addEventListener('pointermove', (e) => {
      if (e.pointerId === held) update(e);
    });
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('lostpointercapture', (e) => {
      if (e.pointerId === held) release();
    });
  }
  releaseAnywhere(() => held, release);
}

/** Which halves of a pad from `left` to `right` (px) the fingers at `xs` are on (SPLIT). */
export function splitHalves(xs: number[], left: number, right: number): { left: boolean; right: boolean } {
  const mid = (left + right) / 2;
  return { left: xs.some((x) => x < mid), right: xs.some((x) => x >= mid) };
}

/**
 * SPLIT's pad (shown over the whole screen while you drive, landscape: the CSS's html.split): its left half holds
 * `left`, its right half `right`, each finger by where it is now (one sliding across moves over), both at once
 * meaning both (the stage brakes, then reverses). It's the 'split' source, so the stage knows to drive by halves.
 */
function bindSplit(deck: HTMLElement, controls: Controls): void {
  const pad = document.createElement('div');
  pad.className = 'split-pad';
  pad.setAttribute('aria-hidden', 'true');
  deck.prepend(pad);
  const fingers = new Map<number, number>();
  const update = () => {
    const r = pad.getBoundingClientRect();
    const h = splitHalves([...fingers.values()], r.left, r.right);
    const held: Button[] = [...(h.left ? (['left'] as const) : []), ...(h.right ? (['right'] as const) : [])];
    if (fingers.size) controls.set('split', held);
    else controls.clear('split');
    pad.classList.toggle('held-left', h.left);
    pad.classList.toggle('held-right', h.right);
  };
  pad.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (!fingers.size) buzz();
    fingers.set(e.pointerId, e.clientX);
    capture(pad, e.pointerId);
    update();
  });
  pad.addEventListener('pointermove', (e) => {
    if (!fingers.has(e.pointerId)) return;
    fingers.set(e.pointerId, e.clientX);
    update();
  });
  const lift = (e: PointerEvent) => {
    if (fingers.delete(e.pointerId)) update();
  };
  pad.addEventListener('pointerup', lift);
  pad.addEventListener('pointercancel', lift);
  pad.addEventListener('lostpointercapture', lift);
  for (const type of ['pointerup', 'pointercancel'] as const) window.addEventListener(type, lift);
  // (the controls let go of everything from outside, as the page is hidden: the pad lets go too)
  pad.addEventListener('split-release', () => {
    fingers.clear();
    update();
  });
}

/** Show every deck button as let go (after the controls were cleared from outside). */
export function releaseDeck(deck: HTMLElement): void {
  deck.querySelectorAll('.pressed').forEach((el) => el.classList.remove('pressed'));
  deck.querySelector('.split-pad')?.dispatchEvent(new Event('split-release'));
  deck.querySelector<HTMLElement>('[data-dpad] .knob')?.style.setProperty('transform', 'translate(0px, 0px)');
}

/** The deck's buttons that show what they do (the thumbstick aside). */
export type DeckButton = 'a' | 'b' | 'start' | 'select';

const stroke = (d: string) => `<path d="${d}" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>`;
const fill = (d: string) => `<path d="${d}" fill="currentColor"/>`;
/** An icon for each thing a deck button does (by its label), drawn on the button: 24×24, in the button's text colour. */
export const DECK_ICONS: Record<string, string> = {
  PAUSE: fill('M6 5h4v14H6zM14 5h4v14h-4z'),
  RESUME: fill('M7 4l13 8-13 8z'),
  RACE: fill('M7 4l13 8-13 8z'),
  SKIP: fill('M4 5l10 7-10 7zM16 5h3.5v14H16z'),
  NEXT: fill('M4 5l10 7-10 7zM16 5h3.5v14H16z'),
  AGAIN: stroke('M19 12a7 7 0 1 1-2.5-5.4') + fill('M14 3.5h7v7z'),
  RESTART: stroke('M19 12a7 7 0 1 1-2.5-5.4') + fill('M14 3.5h7v7z'),
  EXIT: stroke('M20 12H6') + fill('M11 5l-8 7 8 7z'),
  MENU: stroke('M20 12H6') + fill('M11 5l-8 7 8 7z'),
  BACK: stroke('M20 12H6') + fill('M11 5l-8 7 8 7z'),
  DONE: stroke('M4.5 12.5l5 5L19.5 7'),
  OK: stroke('M4.5 12.5l5 5L19.5 7'),
  // (a sweep round a bend: an arc with its arrowhead, centred in the box)
  DRIFT: stroke('M4.25 20c0-7 5-12 11.5-12.5') + fill('M13.25 4l6.5 3.6-6.5 3.4z'),
};

/** Status strip (race position and lap) + what each button does. */
export class Hud {
  constructor(private readonly deck: HTMLElement) {}

  private el(name: string): HTMLElement | null {
    return this.deck.querySelector(`[data-hud="${name}"]`);
  }

  private set(name: string, text: string): void {
    const el = this.el(name);
    if (el && el.textContent !== text) el.textContent = text;
  }

  /** Race position, e.g. "P3/10". */
  setPosition(text: string): void {
    this.set('position', text);
  }

  /** Mark the position as just gained (green ▲) or lost (red ▼), or neither. */
  setPositionChange(change: 'gain' | 'lose' | undefined): void {
    const el = this.el('position');
    el?.classList.toggle('gain', change === 'gain');
    el?.classList.toggle('lose', change === 'lose');
  }

  /** Lap counter, e.g. "LAP 2/3". */
  setLap(text: string): void {
    this.set('lap', text);
  }

  /** What `button` does now ('' for nothing: it's hidden), named under it and drawn on it. */
  setLabel(button: DeckButton, text: string): void {
    const label = this.el(`label-${button}`);
    const shown = t(text);
    if (!label || label.textContent === shown) return;
    label.textContent = shown;
    const key = this.deck.querySelector<HTMLElement>(`[data-button="${button}"]`);
    const icon = this.el(`icon-${button}`);
    if (icon) icon.innerHTML = DECK_ICONS[text] ? `<svg viewBox="0 0 24 24" aria-hidden="true">${DECK_ICONS[text]}</svg>` : '';
    key?.setAttribute('aria-label', shown || button);
    // (the button, and on the face its column with the name under it)
    (key?.closest('.col') ?? key)?.classList.toggle('idle', !text);
  }
}
