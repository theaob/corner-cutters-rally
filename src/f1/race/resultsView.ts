// The results at the flag and qualifying's times, as tables (the pixel font
// isn't monospaced, so the columns line up in cells): what each row says is
// worked out from the race (`resultRows`, `qualifyingRows`: engine-free), then
// drawn into the results panel, the rows sliding in one after another. Over the
// race's table, your race at a glance (`raceSummary`): where you finished, from
// where on the grid, the gap, your best lap, your stops and any penalty.

import { formatTime as fmt } from '../records';
import type { Race } from '../raceControl';
import { line } from './dom';
import { icon, type IconName } from './icons';

/** A driver as the results name them. */
export interface Named {
  name: string;
  number?: number;
  team: { code: string };
}

/** One row of the results: place, places gained from the grid, number, name, team, time, best lap, notes. */
export interface ResultRow {
  place: number;
  /** places gained (+) or lost (−) from the grid slot */
  moved: number;
  number?: number;
  name: string;
  team: string;
  /** the winner's time, the gap to it, laps done, or DNF */
  time: string;
  best: string;
  /** the race's fastest lap (in purple) */
  fastest: boolean;
  /** penalty seconds and pit stops (+5S 1P) */
  notes: string;
  /** the pit stops made, and the penalty's seconds */
  stops: number;
  penalty: number;
  /** out of the race */
  out: boolean;
  /** across the line (or out): the place is final */
  finished: boolean;
  you: boolean;
}

/** The results' rows in finishing `order` (the entrants are in grid order). */
export function resultRows(race: Race, order: number[], named: Named[], you: number, fastestWho?: number): ResultRow[] {
  const first = race.entrants[order[0]].progress;
  const winner = (first.finished ?? 0) + first.penalty;
  return order.map((i, pos) => {
    const e = race.entrants[i];
    const p = e.progress;
    const time = p.retired
      ? 'DNF'
      : p.finished !== undefined
        ? pos === 0
          ? fmt(p.finished + p.penalty)
          : `+${(p.finished + p.penalty - winner).toFixed(2)}`
        : `${p.lap}/${race.laps} LAPS`;
    return {
      place: pos + 1, moved: i - pos, number: named[i].number, name: named[i].name, team: named[i].team.code, time,
      best: p.lapTimes.length ? fmt(Math.min(...p.lapTimes)) : '–', fastest: fastestWho === i,
      notes: [p.penalty ? `+${p.penalty}S` : '', e.stops ? `${e.stops}P` : ''].filter(Boolean).join(' '), stops: e.stops, penalty: p.penalty,
      out: !!p.retired, finished: !!p.retired || p.finished !== undefined, you: i === you,
    };
  });
}

/** A box of your race at a glance: what it is (with its icon), what you got, and its colour (if not white). */
export interface SummaryBox {
  icon: IconName;
  label: string;
  value: string;
  color?: string;
}

/** gold, silver and bronze for the podium's places */
const PODIUM = ['#f2c14e', '#c9ccd6', '#c8803a'];

/**
 * Your race at a glance, from the results' `rows`, five boxes (one row, even on a phone): where you finished (in the
 * podium's colours; OUT, in red), where you started and the places you made, the gap to the winner (the winner: your
 * time), your best lap (purple: the race's fastest), and your pit stops (and the penalty, if you had one, in red).
 */
export function raceSummary(rows: ResultRow[]): SummaryBox[] {
  const r = rows.find((x) => x.you);
  if (!r) return [];
  const grid = r.place + r.moved;
  const moved = r.moved > 0 ? ` ▲${r.moved}` : r.moved < 0 ? ` ▼${-r.moved}` : '';
  return [
    r.out
      ? { icon: 'flag', label: 'FINISH', value: 'OUT', color: '#d8323c' }
      : { icon: 'flag', label: r.finished ? 'FINISH' : 'PLACE', value: `P${r.place}`, color: PODIUM[r.place - 1] },
    { icon: 'car', label: 'GRID', value: `P${grid}${r.out ? '' : moved}`, color: r.out ? undefined : r.moved > 0 ? '#5fe0d0' : r.moved < 0 ? '#d8323c' : undefined },
    r.place === 1 && !r.out ? { icon: 'watch', label: 'TIME', value: r.time } : { icon: 'watch', label: 'GAP', value: r.time },
    { icon: 'star', label: r.fastest ? 'FASTEST' : 'BEST', value: r.best, color: r.fastest ? '#b36bff' : undefined },
    r.penalty
      ? { icon: 'warn', label: 'STOPS', value: `${r.stops} +${r.penalty}S`, color: '#d8323c' }
      : { icon: 'wrench', label: 'STOPS', value: `${r.stops}` },
  ];
}

/** One row of qualifying's times, in grid order. */
export interface QualifyingRow {
  place: number;
  name: string;
  team: string;
  time: string;
  gap: string;
  you: boolean;
}

/** Qualifying's rows: the grid (drivers by slot), each driver's time (none: NO TIME), the gap to pole. */
export function qualifyingRows(grid: number[], times: (number | undefined)[], named: Named[], you: number): QualifyingRow[] {
  const pole = times[grid[0]];
  return grid.map((k, pos) => {
    const time = times[k];
    return {
      place: pos + 1, name: named[k].name, team: named[k].team.code, time: time === undefined ? 'NO TIME' : fmt(time),
      gap: time === undefined || pole === undefined || pos === 0 ? '' : `+${(time - pole).toFixed(3)}`, you: k === you,
    };
  });
}

const cell = (tag: 'td' | 'th', text: string, right = false, padding = '1px 2px') => {
  const c = document.createElement(tag);
  c.textContent = text;
  Object.assign(c.style, { padding, textAlign: right ? 'right' : 'left', fontWeight: 'normal', whiteSpace: 'nowrap' });
  return c;
};
const table = (heads: [string, boolean][], padding?: string) => {
  const t = document.createElement('table');
  Object.assign(t.style, { width: '100%', borderCollapse: 'collapse', font: 'inherit', color: 'inherit' });
  const head = document.createElement('tr');
  head.style.color = '#9d9ab8';
  head.append(...heads.map(([text, right]) => cell('th', text, right, padding)));
  t.append(head);
  return t;
};

/** A line under a table: its text, and whether it's new (in gold, NEW!). */
export interface Note {
  text: string;
  isNew?: boolean;
}
/** A line of `parts` (text, and icons in their place), centred, styled with `css`. */
const iconLine = (parts: (string | IconName | HTMLElement)[], css: Partial<CSSStyleDeclaration> = {}) => {
  const d = line('', { display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: '5px', ...css });
  for (const p of parts) d.append(p instanceof HTMLElement ? p : ICON_NAMES.has(p) ? icon(p as IconName) : document.createTextNode(p));
  return d;
};
const ICON_NAMES = new Set<string>(['watch', 'lap', 'star', 'cup', 'car', 'tyre', 'tow', 'warn', 'ghost', 'wrench', 'sand', 'flag', 'medal']);
const noteLine = (n: Note, first: boolean) => iconLine(['cup', `${n.text}${n.isNew ? ' · NEW!' : ''}`], { color: n.isNew ? '#f2c14e' : '#f4f2fa', ...(first ? { marginTop: '8px' } : {}) });

/** Your race at a glance: its boxes side by side in one row, all the same width, centred. */
function summaryBoxes(boxes: SummaryBox[]): HTMLElement {
  const el = document.createElement('div');
  Object.assign(el.style, { display: 'flex', justifyContent: 'center', gap: '5px', margin: '0 0 10px' });
  for (const b of boxes) {
    const box = document.createElement('div');
    Object.assign(box.style, {
      flex: '1 1 0', minWidth: '0', maxWidth: '96px', boxSizing: 'border-box', padding: '5px 4px', borderRadius: '6px', background: 'rgba(255,255,255,0.05)',
      border: '1px solid rgba(157,154,184,0.25)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px',
    });
    const head = iconLine([b.icon, b.label], { color: '#9d9ab8', fontSize: '8px', gap: '3px', whiteSpace: 'nowrap' });
    const value = line(b.value, { fontSize: '13px', color: b.color ?? '#f4f2fa', whiteSpace: 'nowrap' });
    box.append(head, value);
    el.append(box);
  }
  return el;
}

/** The notes cell of a row: its pit stops and penalty, each with its icon (nothing if neither). */
function notesCell(r: ResultRow): HTMLElement {
  const c = cell('td', '');
  const inner = document.createElement('span');
  Object.assign(inner.style, { display: 'inline-flex', alignItems: 'center', gap: '3px' });
  if (r.stops) inner.append(icon('wrench', 8), document.createTextNode(`${r.stops}`));
  if (r.penalty) {
    const pen = document.createElement('span');
    Object.assign(pen.style, { display: 'inline-flex', alignItems: 'center', gap: '3px', color: '#d8323c', marginLeft: r.stops ? '4px' : '0' });
    pen.append(icon('warn', 8), document.createTextNode(`+${r.penalty}S`));
    inner.append(pen);
  }
  c.append(inner);
  return c;
}

/**
 * The results into `el`: `title`, your race at a glance, the table (your row in gold, the fastest lap in purple, places
 * gained green and lost red, stops and penalties by their icons), the key, the records `notes`, and `next` (what A
 * does, if anything). `since`: s since the results went up, so the rows rebuilt as the others finish carry on sliding
 * in where they were.
 */
export function renderResults(el: HTMLElement, title: string, rows: ResultRow[], notes: Note[], next: string | undefined, since: number, footer?: HTMLElement): void {
  const t = table([['', true], ['', false], ['NO', true], ['NAME', false], ['TEAM', false], ['TIME', true], ['BEST', true], ['', false]]);
  for (const r of rows) {
    const row = document.createElement('tr');
    if (r.you) row.style.color = '#f2c14e';
    row.style.animation = `row-in 0.35s ease-out ${(0.15 + (r.place - 1) * 0.07 - since).toFixed(3)}s both`;
    const change = cell('td', r.moved > 0 ? `▲${r.moved}` : r.moved < 0 ? `▼${-r.moved}` : '–');
    change.style.color = r.moved > 0 ? '#5fe0d0' : r.moved < 0 ? '#d8323c' : '#6c6a88';
    const best = cell('td', r.best, true);
    if (r.fastest) best.style.color = '#b36bff';
    row.append(cell('td', `${r.place}`, true), change, cell('td', r.number === undefined ? '' : `${r.number}`, true), cell('td', r.name), cell('td', r.team), cell('td', r.time, true), best, notesCell(r));
    t.append(row);
  }
  const summary = raceSummary(rows);
  el.replaceChildren(
    line(title, { fontSize: '15px', color: '#f2c14e', marginBottom: '8px', textAlign: 'center' }),
    ...(summary.length ? [summaryBoxes(summary)] : []),
    t,
    iconLine(['▲▼ FROM THE GRID ·', 'wrench', 'STOPS ·', 'warn', 'PENALTY'], { color: '#9d9ab8', marginTop: '8px' }),
    ...notes.map((n, k) => noteLine(n, k === 0)),
    // (RESTART and EXIT are buttons under the table: no lines for them here)
    ...(next ? [line(next, { marginTop: '8px', textAlign: 'center' })] : []),
    ...(footer ? [footer] : []),
  );
  el.style.display = 'block';
}

/** Qualifying's times into `el`: `title`, the table (your row in gold), where you start, the record `note`, and on to the race. */
export function renderQualifying(el: HTMLElement, title: string, rows: QualifyingRow[], note: Note): void {
  const t = table([['', true], ['NAME', false], ['TEAM', false], ['TIME', true], ['GAP', true]], '1px 3px');
  for (const r of rows) {
    const row = document.createElement('tr');
    if (r.you) row.style.color = '#f2c14e';
    row.append(...[cell('td', `${r.place}`, true, '1px 3px'), cell('td', r.name, false, '1px 3px'), cell('td', r.team, false, '1px 3px'), cell('td', r.time, true, '1px 3px'), cell('td', r.gap, true, '1px 3px')]);
    row.style.animation = `row-in 0.35s ease-out ${(0.15 + (r.place - 1) * 0.07).toFixed(2)}s both`;
    t.append(row);
  }
  const place = rows.find((r) => r.you)?.place ?? 0;
  el.replaceChildren(
    line(title, { fontSize: '15px', color: '#f2c14e', marginBottom: '8px' }),
    t,
    line(place === 1 ? 'POLE POSITION!' : `YOU START P${place}`, { color: '#f2c14e', marginTop: '8px' }),
    noteLine(note, true),
    line('RACE: on to the grid', { marginTop: '8px' }),
  );
  el.style.animation = 'row-in 0.25s ease-out both';
  el.style.display = 'block';
}
