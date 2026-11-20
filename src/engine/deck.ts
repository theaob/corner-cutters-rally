// The control deck, laid over the landscape screen: the screen's two halves while you drive (the left one steers
// left, the right one right, both brake and then reverse), two face buttons and two small ones (A, B, START and
// SELECT), each showing what it does now, an icon on it and the action's name (hidden when it does nothing), and the
// status strip (race position, lap).

import type { Button, Controls } from './controls';
import { vibrate } from './haptics';
import { t } from './i18n';

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
    // (and a page taller than the screen keeps them too, so a finger can scroll it: a menu's lower rows in
    // landscape; the browser cancels the press once the finger moves, so a scroll picks nothing)
    if (scrollerUnder(e.target, el)) return;
    if (e.cancelable) e.preventDefault();
  };
  el.addEventListener('touchstart', stop, { passive: false });
  el.addEventListener('touchmove', stop, { passive: false });
}

/**
 * The element from `target` up to `root` that scrolls up and down and has more in it than it shows (a menu taller
 * than the screen), or null.
 */
export function scrollerUnder(target: EventTarget | null, root: HTMLElement): HTMLElement | null {
  for (let e = target instanceof Element ? target : null; e; e = e === root ? null : e.parentElement) {
    if (!(e instanceof HTMLElement) || e.scrollHeight <= e.clientHeight + 1) continue;
    const y = getComputedStyle(e).overflowY;
    if (y === 'auto' || y === 'scroll') return e;
  }
  return null;
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

/** Which halves of a pad from `left` to `right` (px) the fingers at `xs` are on. */
export function splitHalves(xs: number[], left: number, right: number): { left: boolean; right: boolean } {
  const mid = (left + right) / 2;
  return { left: xs.some((x) => x < mid), right: xs.some((x) => x >= mid) };
}

/**
 * The halves' pad (over the whole screen while you drive: game.css): its left half holds
 * `left`, its right half `right`, each finger by where it is now (one sliding across moves over), both at once
 * meaning both (the stage brakes, then reverses). It's the 'split' source, so the stage knows to drive by halves.
 */
function bindSplit(deck: HTMLElement, controls: Controls): void {
  const pad = document.createElement('div');
  pad.className = 'split-pad';
  pad.setAttribute('aria-hidden', 'true');
  // (each half's own panel: unseen while you drive, lit up on the controls lap when it's the one to hold, game.css)
  for (const side of ['left', 'right'] as const) {
    const half = document.createElement('div');
    half.className = `half ${side}`;
    half.append(Object.assign(document.createElement('span'), { className: 'arrow', textContent: side === 'left' ? '◀' : '▶' }));
    pad.append(half);
  }
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
}

/** The deck's buttons that show what they do. */
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
