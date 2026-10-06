// The title splash, as the game opens: the backdrop race (its still at once,
// the live race fading in over it), the logo dropping in over a kerb sweeping
// across, and TAP TO START blinking under it. A tap, a key or a gamepad's
// button starts: the theme plays from there (browsers allow no sound before
// one), and the game goes on to its first screen (the menu, or a new player's
// controls lap). Only on opening the game to its menu: a link straight to a
// race or a mode goes straight there.

import type { Button, Controls } from '../../engine/controls';
import type { CircuitLayout } from '../layouts';
import { versionLine } from '../settingsRows';
import { showStill } from './backdropStill';

/** ms from the start being pressed to the game going on (the prompt flashes) */
export const SPLASH_GO_MS = 360;

const BUTTONS: Button[] = ['a', 'b', 'start', 'select', 'up', 'down', 'left', 'right'];
/** keys that are no start on their own (held for something else, or the layout switch) */
const NOT_START = new Set(['Shift', 'Control', 'Alt', 'Meta', 'Tab', 'CapsLock', 'v', 'V']);

/** What the prompt says: a tap on a touch screen, a key otherwise. */
export function startPrompt(touch: boolean): string {
  return touch ? 'TAP TO START' : 'PRESS ANY KEY';
}

export interface Splash {
  /** resolves once the player has started (and the prompt has flashed) */
  started: Promise<void>;
  /** take it all away (the curtain's down over it) */
  close(): void;
}

/** Show the splash in `host`, the backdrop racing on `layout`; `controls` for a gamepad's buttons. */
export function showSplash(host: HTMLElement, layout: CircuitLayout, controls: Controls): Splash {
  const closed = new AbortController();
  const { signal } = closed;
  const still = showStill(host);
  let stopBackdrop = () => {};
  void import('./menuBackdrop').then(({ startBackdrop }) => {
    if (!signal.aborted) stopBackdrop = startBackdrop(host, layout, still);
  });

  const page = document.createElement('div');
  page.className = 'splash';
  const logo = document.createElement('h1');
  logo.className = 'splash-logo';
  logo.setAttribute('aria-label', 'Corner Cutters');
  const word = (text: string) => {
    const w = document.createElement('span');
    w.className = 'splash-word';
    w.textContent = text;
    w.setAttribute('aria-hidden', 'true');
    return w;
  };
  const kerb = document.createElement('span');
  kerb.className = 'splash-kerb';
  logo.append(word('CORNER'), kerb, word('CUTTERS'));
  const tag = document.createElement('p');
  tag.className = 'splash-tag';
  tag.textContent = 'ARCADE GRAND PRIX';
  const prompt = document.createElement('p');
  prompt.className = 'splash-start';
  const touch = globalThis.matchMedia?.('(pointer: coarse)').matches ?? false;
  prompt.textContent = startPrompt(touch);
  page.append(logo, tag, prompt, versionLine());
  host.append(page);

  let go = () => {};
  const started = new Promise<void>((resolve) => {
    let done = false;
    go = () => {
      if (done || signal.aborted) return;
      done = true;
      page.classList.add('go');
      setTimeout(resolve, SPLASH_GO_MS);
    };
  });
  // a tap: on its release (in a cross-origin frame on a phone a tap's click can go astray)
  let armed = false;
  page.addEventListener('pointerdown', () => (armed = true), { signal });
  page.addEventListener('pointerleave', () => (armed = false), { signal });
  page.addEventListener('pointerup', () => armed && go(), { signal });
  // a key
  window.addEventListener('keydown', (e) => !NOT_START.has(e.key) && !e.repeat && go(), { signal });
  // a gamepad's button (any of the handheld's)
  const before = BUTTONS.map((b) => controls.presses(b));
  const poll = () => {
    if (signal.aborted) return;
    if (BUTTONS.some((b, k) => controls.presses(b) > before[k])) go();
    requestAnimationFrame(poll);
  };
  requestAnimationFrame(poll);

  return {
    started,
    close: () => {
      closed.abort();
      stopBackdrop();
      still.remove();
      page.remove();
    },
  };
}
