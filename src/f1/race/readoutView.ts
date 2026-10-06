// The readout's rows on the screen (readout.ts says what they are): each line
// an icon, its label and its value, as cells of the readout's grid, so every
// icon, label and value lines up in its column whatever the letters' widths
// (the pixel font isn't monospaced). Redrawn only when a line changes.

import { iconSvg } from './icons';
import { readoutRows } from './readout';

/** The readout's grid: the icons, the labels and the values, each in a column of its own. */
export const READOUT_GRID = { display: 'grid', gridTemplateColumns: 'max-content max-content max-content', columnGap: '4px', alignItems: 'center' };

/** px square of the readout's icons (the size of a capital letter) */
const ICON = 8;

/** Show `text`'s rows in `el` (a run of the readout's grid: display contents), unless it shows them already. */
export function paintRows(el: HTMLElement, text: string): void {
  if (el.dataset.text === text) return;
  el.dataset.text = text;
  const cells: HTMLElement[] = [];
  for (const r of readoutRows(text)) {
    const mark = document.createElement('span');
    if (r.icon) mark.innerHTML = iconSvg(r.icon, ICON);
    Object.assign(mark.style, { display: 'flex', justifyContent: 'center', width: `${ICON}px` });
    cells.push(mark);
    if (r.span) {
      const both = document.createElement('span');
      both.textContent = `${r.label} ${r.value}`;
      both.style.gridColumn = 'span 2';
      cells.push(both);
      continue;
    }
    const label = document.createElement('span');
    label.textContent = r.label;
    const value = document.createElement('span');
    value.textContent = r.value;
    cells.push(label, value);
  }
  el.replaceChildren(...cells);
}

/** A run of the readout's rows (its own colour, if any), laid out in the readout's grid. */
export function readoutRun(color?: string): HTMLElement {
  const el = document.createElement('div');
  el.style.display = 'contents';
  if (color) el.style.color = color;
  return el;
}
