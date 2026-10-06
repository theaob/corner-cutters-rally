// The menus' parts: a row of options (its label and value, swiped or tapped to
// change), a menu button, the button that opens the game in a tab of its own
// when it's framed in another page, and the settings screen (DIFFICULTY, then
// the rows the pause screen has too). On a phone it's all touch; on a keyboard,
// up/down moves, left/right changes a row, Enter picks, and B goes back.

import type { Button } from '../engine/controls';
import { onBack } from '../engine/backButton';
import { holdTouches } from '../engine/deck';
import type { Services } from '../engine/services';
import { YOUTUBE } from '../engine/host';
import { menuPick, menuTick } from './sounds';
import { DIFFICULTIES, type Difficulty } from './difficulty';
import { settingsRows as settingsRowsNow, versionLine } from './settingsRows';
import { openReport, reportOpen } from './report';

/** px a finger must travel sideways for a swipe; less than TAP_SLOP counts as a tap */
const SWIPE = 28;
const TAP_SLOP = 12;

/**
 * What a gesture on an option row does: a swipe left is the next value and a
 * swipe right the previous (like a carousel); a tap on the row's left third
 * (its ◀) steps back, anywhere else forward; a short wobble does nothing.
 * `dx` is how far the finger moved sideways (px), `at` where it lifted across the row (0…1).
 */
export function rowGesture(dx: number, at: number): -1 | 0 | 1 {
  if (Math.abs(dx) >= SWIPE) return dx < 0 ? 1 : -1;
  if (Math.abs(dx) < TAP_SLOP) return at < 1 / 3 ? -1 : 1;
  return 0;
}

/**
 * A wrapped line of text's box narrowed to its longest line (a box wraps at its widest, leaving its lines short
 * of it either side): what's beside it then sits right beside the text. One line: left as it is.
 */
function hugLines(el: HTMLElement): void {
  el.style.width = '';
  const range = document.createRange();
  range.selectNodeContents(el);
  const lines = [...range.getClientRects()];
  if (new Set(lines.map((r) => Math.round(r.top))).size < 2) return;
  el.style.width = `${Math.ceil(Math.max(...lines.map((r) => r.width)))}px`;
}

/**
 * A row of options: its label and the current value (with a line about it and, for a paint scheme, its colours),
 * switched with left/right or a tap.
 */
export function optionRow<T>(
  label: string, values: T[], start: T, show: (v: T) => { name: string; about: string; colors?: string[]; icon?: Element }, onChange?: (v: T) => void,
) {
  const el = document.createElement('button');
  el.className = 'option-row';
  let i = Math.max(0, values.indexOf(start));
  let fitName = () => {};
  const render = () => {
    const v = show(values[i]);
    el.innerHTML = '';
    // one line: the label on the left; on the right the value (with its colours) and a line about it
    const name = document.createElement('b');
    name.textContent = label;
    const right = document.createElement('div');
    right.className = 'value';
    // (its arrows either side; a name too long for the row wraps between them)
    const top = document.createElement('strong');
    const arrow = (a: string) => Object.assign(document.createElement('em'), { textContent: a });
    const text = Object.assign(document.createElement('em'), { className: 'name', textContent: v.name });
    top.append(arrow('◀'), text, arrow('▶'));
    fitName = () => hugLines(text);
    const line = document.createElement('div');
    line.className = 'line';
    if (v.colors || v.icon) {
      const chips = document.createElement('div');
      chips.className = 'chips';
      if (v.icon) chips.append(v.icon);
      for (const c of v.colors ?? []) {
        const chip = document.createElement('i');
        chip.style.background = c;
        chips.append(chip);
      }
      line.append(chips);
    }
    line.append(top);
    const about = document.createElement('span');
    about.textContent = v.about;
    right.append(line, about);
    el.append(name, right);
  };
  const step = (by: number) => {
    i = (i + by + values.length) % values.length;
    render();
    fitName();
    menuTick();
    onChange?.(values[i]);
  };
  // swipe it, or tap its sides (the row keeps the finger's events: touch captures to it)
  let startX: number | undefined;
  el.addEventListener('pointerdown', (e) => (startX = e.clientX));
  el.addEventListener('pointercancel', () => (startX = undefined));
  el.addEventListener('pointerup', (e) => {
    if (startX === undefined) return;
    const r = el.getBoundingClientRect();
    const by = rowGesture(e.clientX - startX, (e.clientX - r.left) / Math.max(1, r.width));
    startX = undefined;
    if (by) step(by);
  });
  render();
  // (as it's laid out, and again whenever the row's size changes: a wrapped name's box hugging its lines)
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => fitName()).observe(el);
  return { el, step, value: () => values[i], refresh: render };
}

/** A menu button, picked on the press's release (not 'click': in a cross-origin frame on a phone a tap's click can go astray). */
export function menuButton(text: string, onPick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = 'menu-button';
  b.textContent = text;
  let armed = false;
  b.addEventListener('pointerdown', () => (armed = true));
  b.addEventListener('pointerleave', () => (armed = false));
  b.addEventListener('pointerup', () => {
    if (armed) onPick();
    armed = false;
  });
  return b;
}

/** Whether the game is running inside another page's frame. */
export function framed(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true; // (a cross-origin top can refuse even the comparison)
  }
}

/** A button that opens this page in a tab of its own (the same saves: it's the same site). */
export function ownTabButton(): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = 'own-tab';
  b.textContent = 'SLOW HERE? PLAY IN ITS OWN TAB ↗';
  // on the press's release, not 'click' (in a cross-origin frame on a phone a tap's click can go astray)
  let armed = false;
  b.addEventListener('pointerdown', () => (armed = true));
  b.addEventListener('pointerleave', () => (armed = false));
  b.addEventListener('pointerup', () => {
    if (!armed) return;
    armed = false;
    const tab = window.open(window.location.href, '_blank');
    if (tab) tab.opener = null;
    else b.textContent = 'THE PAGE BLOCKED A NEW TAB';
  });
  return b;
}

/**
 * The settings screen in `host`: DIFFICULTY, then the rows the pause screen has too (each remembered as it changes:
 * settingsRows.ts), DONE, and REPORT (a report of the screen as it is; not on YouTube). Resolves with the difficulty
 * picked once DONE (or B, or the phone's back button).
 */
export function showSettings(host: HTMLElement, services: Services, difficulty: Difficulty, closed?: AbortSignal): Promise<Difficulty> {
  const { controls, hud } = services;
  const screen = document.createElement('div');
  screen.className = 'circuit-menu settings-view';
  const title = document.createElement('h2');
  title.textContent = 'SETTINGS';
  const difficultyRow = optionRow('DIFFICULTY', DIFFICULTIES, difficulty, (d) => ({ name: d.name, about: d.about }));
  const rows = [difficultyRow, ...settingsRowsNow()];
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      offBack();
      menuPick();
      screen.remove();
      resolve(difficultyRow.value());
    };
    const offBack = onBack(() => (finish(), true));
    const doneButton = menuButton('DONE', finish);
    const reportButton = menuButton('REPORT', () => void openReport({ mode: 'settings' }, [], () => menuPick()));
    const places: HTMLElement[] = [...rows.map((r) => r.el), doneButton, ...(YOUTUBE ? [] : [reportButton])];
    screen.append(title, ...places, versionLine());
    let focus = 0;
    const show = () => places.forEach((el, k) => el.classList.toggle('focused', k === focus));
    rows.forEach((r, k) => r.el.addEventListener('pointerdown', () => {
      focus = k;
      show();
    }));
    show();
    holdTouches(screen);
    host.append(screen);
    hud.setPosition('');
    hud.setLap('');
    hud.setLabel('a', '');
    hud.setLabel('b', '');
    closed?.addEventListener('abort', () => {
      done = true;
      offBack();
      screen.remove();
    });
    const seen = new Map<Button, number>();
    const pressed = (b: Button) => {
      const n = controls.presses(b);
      const edge = n > (seen.get(b) ?? n);
      seen.set(b, n);
      return edge;
    };
    const tick = () => {
      if (done) return;
      const [down, up, left, right, a, b, start] = (['down', 'up', 'left', 'right', 'a', 'b', 'start'] as const).map((k) => pressed(k) && !reportOpen());
      const move = (down ? 1 : 0) - (up ? 1 : 0);
      if (move) {
        focus = (focus + move + places.length) % places.length;
        menuTick();
        show();
      }
      const row = rows[focus];
      if (row && (left || right)) row.step(right ? 1 : -1);
      if (b) finish();
      else if ((a || start) && places[focus] === reportButton) void openReport({ mode: 'settings' }, [], () => menuPick());
      else if (a || start) finish();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
