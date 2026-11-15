// The readout's rows on the screen (readout.ts says what they are): each line
// an icon, its label and its value, as cells of the readout's grid, so every
// icon, label and value lines up in its column whatever the letters' widths
// (the pixel font isn't monospaced). Redrawn only when a line changes; a changed value alone is rewritten in place.

import { iconSvg } from './icons';
import { readoutRows } from './readout';

/** The readout's grid: the icons, the labels and the values, each in a column of its own. */
export const READOUT_GRID = { display: 'grid', gridTemplateColumns: 'max-content max-content max-content', columnGap: '4px', alignItems: 'center' };

/** px square of the readout's icons (the size of a capital letter) */
const ICON = 8;

/** What a painted run holds: the shape its rows had (icons, labels, spans) and the value cells to update in place. */
interface Painted {
  shape: string;
  /** the value cells, one per row (the whole row's text cell for a spanned one) */
  values: HTMLElement[];
  /** each row's value text as shown, to touch the DOM only where it changed */
  shown: string[];
  /** the longest value's length: the fit is redone only when a value's width could have moved the widest row */
  widest: number;
}
const painted = new WeakMap<HTMLElement, Painted>();

/**
 * Show `text`'s rows in `el` (a run of the readout's grid: display contents), unless it shows them already. While the
 * rows keep their icons and labels (the LAP clock ticks every frame) only the values that changed are rewritten: no
 * rows are built, no icons parsed, and the phone's fit is redone only if a value got longer or shorter.
 */
export function paintRows(el: HTMLElement, text: string): void {
  if (el.dataset.text === text) return;
  el.dataset.text = text;
  const rows = readoutRows(text);
  const shape = rows.map((r) => `${r.icon ?? ''}|${r.label}|${r.span ? 1 : 0}`).join('\n');
  const widest = Math.max(0, ...rows.map((r) => r.value.length + (r.span ? r.label.length + 1 : 0)));
  const old = painted.get(el);
  if (old && old.shape === shape) {
    rows.forEach((r, i) => {
      const v = r.span ? `${r.label} ${r.value}` : r.value;
      if (old.shown[i] !== v) {
        old.shown[i] = v;
        old.values[i].textContent = v;
      }
    });
    const moved = old.widest !== widest;
    old.widest = widest;
    if (moved && el.parentElement) fitReadout(el.parentElement);
    return;
  }
  const cells: HTMLElement[] = [];
  const values: HTMLElement[] = [];
  const shown: string[] = [];
  for (const r of rows) {
    const mark = document.createElement('span');
    if (r.icon) mark.innerHTML = iconSvg(r.icon, ICON);
    Object.assign(mark.style, { display: 'flex', justifyContent: 'center', width: `${ICON}px` });
    cells.push(mark);
    if (r.span) {
      const both = document.createElement('span');
      both.textContent = `${r.label} ${r.value}`;
      both.style.gridColumn = 'span 2';
      cells.push(both);
      values.push(both);
      shown.push(both.textContent);
      continue;
    }
    const label = document.createElement('span');
    label.textContent = r.label;
    const value = document.createElement('span');
    value.textContent = r.value;
    cells.push(label, value);
    values.push(value);
    shown.push(r.value);
  }
  el.replaceChildren(...cells);
  painted.set(el, { shape, values, shown, widest });
  if (el.parentElement) fitReadout(el.parentElement);
}

/**
 * On the phone the readout is a fixed width (as wide as the timing tower opposite); a longer word in another language
 * (LASTİK, MEILLEUR, NEUM. and a long value beside it) spilt out of its panel. Shrink the type, down to a floor,
 * until its widest row fits; the wide screen's panel (width auto) just grows, and is left alone. Its base size is
 * `data-base`, set by the layout.
 */
export function fitReadout(box: HTMLElement): void {
  const base = parseFloat(box.dataset.base ?? '');
  if (!base || !box.clientWidth) return;
  const room = box.clientWidth - 12;
  box.style.fontSize = `${base}px`;
  for (let i = 0; i < 4; i++) {
    const left = box.getBoundingClientRect().left + 6;
    let right = 0;
    for (const c of box.querySelectorAll('span')) right = Math.max(right, c.getBoundingClientRect().right);
    const used = right - left;
    if (used <= room + 0.5) return;
    const next = Math.max(6, Math.floor(parseFloat(box.style.fontSize) * (room / used) * 10) / 10);
    if (next >= parseFloat(box.style.fontSize)) return;
    box.style.fontSize = `${next}px`;
  }
}

/** A run of the readout's rows (its own colour, if any), laid out in the readout's grid. */
export function readoutRun(color?: string): HTMLElement {
  const el = document.createElement('div');
  el.style.display = 'contents';
  if (color) el.style.color = color;
  return el;
}
