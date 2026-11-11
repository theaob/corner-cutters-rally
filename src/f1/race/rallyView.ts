// A rally stage's own parts of the screen: the co-driver's card (the call just
// made: a big arrow and grade, and the call in full under it, read out too where
// the device can speak), and the stage's results (every crew's time on it, then
// the rally's standings after it).

import { soundVolume } from '../../engine/audio';
import { formatTime as fmt } from '../time';
import { crewName, gapText, rallyEvent, stageOrder, standings, type Rally } from '../rally';
import { cardArrow, shown, spoken, type PaceNote } from '../paceNotes';
import { style } from './dom';

const SVG = 'http://www.w3.org/2000/svg';

/**
 * The card's arrow, pointing up and sweeping `sweep` degrees round (right positive), in a box from -50 to 50 each way:
 * its line (an SVG path) and its head (a polygon's points). A shaft, then an arc, then the head at the arc's end along it.
 */
export function arrowShape(sweep: number): { line: string; head: string } {
  const R = 17;
  const y0 = 4;
  const side = Math.sign(sweep) || 1;
  const phi = (Math.abs(sweep) * Math.PI) / 180;
  const f = (v: number) => Math.round(v * 10) / 10;
  // (round from the shaft's top, the centre to its side: the way it's going at φ is (sin φ, -cos φ), mirrored for a left)
  const end = { x: side * R * (1 - Math.cos(phi)), y: y0 - R * Math.sin(phi) };
  const dir = { x: side * Math.sin(phi), y: -Math.cos(phi) };
  const tip = { x: end.x + dir.x * 13, y: end.y + dir.y * 13 };
  const across = { x: -dir.y * 11, y: dir.x * 11 };
  const large = phi > Math.PI ? 1 : 0;
  return {
    line: `M0 40 L0 ${y0} A${R} ${R} 0 ${large} ${side > 0 ? 1 : 0} ${f(end.x)} ${f(end.y)}`,
    head: [tip, { x: end.x + across.x, y: end.y + across.y }, { x: end.x - across.x, y: end.y - across.y }].map((q) => `${f(q.x)},${f(q.y)}`).join(' '),
  };
}

/** The co-driver's card, over the top of the picture. */
export function createPaceCard() {
  const el = document.createElement('div');
  style(el, {
    position: 'absolute', left: '50%', top: 'calc(30% - 76px)', zIndex: '2', transform: 'translateX(-50%)',
    display: 'none', flexDirection: 'column', alignItems: 'center', gap: '2px', padding: '6px 14px 5px', borderRadius: '10px',
    background: 'rgba(21,20,31,.82)', borderTop: '3px solid #f2c14e', color: '#f4f2fa', font: 'calc(11px * var(--ts, 1)) Silkscreen, monospace',
    pointerEvents: 'none', whiteSpace: 'nowrap', textShadow: '0 2px 0 #1b1b26',
  });
  const big = document.createElement('div');
  style(big, { font: 'calc(28px * var(--ts, 1)) Silkscreen, monospace', color: '#f2c14e', lineHeight: '1', display: 'flex', alignItems: 'center', gap: '6px' });
  // the bend's arrow, drawn on the screen the way the road goes in the picture
  const arrow = document.createElementNS(SVG, 'svg');
  arrow.setAttribute('viewBox', '-50 -50 100 100');
  arrow.setAttribute('aria-hidden', 'true');
  arrow.style.width = arrow.style.height = 'calc(40px * var(--ts, 1))';
  const turned = document.createElementNS(SVG, 'g');
  const line = document.createElementNS(SVG, 'path');
  const head = document.createElementNS(SVG, 'polygon');
  line.setAttribute('fill', 'none');
  line.setAttribute('stroke', 'currentColor');
  line.setAttribute('stroke-width', '10');
  line.setAttribute('stroke-linecap', 'round');
  head.setAttribute('fill', 'currentColor');
  turned.append(line, head);
  arrow.append(turned);
  const grade = document.createElement('span');
  const words = document.createElement('div');
  el.append(big, words);
  let until = 0;
  /** the voice, where the device has one (and the sound's on) */
  const voice = typeof speechSynthesis !== 'undefined' ? speechSynthesis : undefined;
  return {
    el,
    /**
     * Show and say `call` (the notes in it), for a couple of seconds from `now` (s). `facing`: the way the picture faces,
     * for a view that stays put (paceNotes' screenFacing), so the arrow points where the bend goes on the screen.
     */
    call(call: PaceNote[], now: number, facing?: number) {
      const first = call[0];
      if (first.finish || first.jump) big.replaceChildren(first.finish ? '▣ FINISH ▣' : '▲ JUMP ▲');
      else {
        const { rotate, sweep } = cardArrow(first, facing);
        const shape = arrowShape(sweep);
        line.setAttribute('d', shape.line);
        head.setAttribute('points', shape.head);
        turned.setAttribute('transform', `rotate(${Math.round(rotate)})`);
        arrow.dataset.rotate = String(Math.round(rotate));
        grade.textContent = first.grade === 'hairpin' ? 'HP' : String(first.grade);
        // (the arrow on the side the bend goes, from the driver's seat, as the voice says it)
        big.replaceChildren(...(first.dir === 'left' ? [arrow, grade] : [grade, arrow]));
      }
      words.textContent = shown(call, 2);
      el.style.display = 'flex';
      until = now + 2.4;
      const volume = soundVolume();
      if (voice && volume > 0) {
        try {
          // (the last call cut short: the next bend's more urgent)
          voice.cancel();
          const u = new SpeechSynthesisUtterance(spoken(call));
          u.rate = 1.35;
          u.volume = volume;
          voice.speak(u);
        } catch {
          // (no voice after all: the card's enough)
        }
      }
    },
    /** Hide the card once its time's up (or at once: `off`). */
    update(now: number, off = false) {
      if (off || now >= until) el.style.display = 'none';
    },
    hush() {
      el.style.display = 'none';
      try {
        voice?.cancel();
      } catch {
        // (nothing to hush)
      }
    },
  };
}

/** A cell of a results row. */
const cell = (text: string, css: Partial<CSSStyleDeclaration> = {}) => {
  const td = document.createElement('td');
  td.textContent = text;
  style(td, { padding: '2px 4px', whiteSpace: 'nowrap', ...css });
  return td;
};

/** A table of `rows` (each: its cells, and whether it's yours). */
function table(rows: { cells: [string, Partial<CSSStyleDeclaration>?][]; you: boolean }[]): HTMLTableElement {
  const t = document.createElement('table');
  style(t, { width: '100%', borderCollapse: 'collapse', marginBottom: '8px' });
  for (const r of rows) {
    const tr = document.createElement('tr');
    if (r.you) style(tr, { background: 'rgba(242,193,78,.18)', color: '#f2c14e' });
    for (const [text, css] of r.cells) tr.append(cell(text, css));
    t.append(tr);
  }
  return t;
}

const heading = (text: string, color = '#f2c14e') => {
  const h = document.createElement('div');
  h.textContent = text;
  style(h, { color, margin: '2px 0 6px', textAlign: 'center' });
  return h;
};

/** Stage `k`'s results (once it's in the rally), then the rally after it, into `el`. */
export function renderStageResults(el: HTMLElement, r: Rally, k: number, stageName: string): void {
  const event = rallyEvent(r);
  const dim = { color: '#9d9ab8' };
  const name = (crew: number) => (crew === r.you ? 'YOU' : crewName(r.crews[crew]));
  const right = { textAlign: 'right' };
  const stage = stageOrder(r, k).map((o, i) => ({
    you: o.crew === r.you,
    cells: [
      [`${i + 1}`, dim], [name(o.crew)],
      [i === 0 ? fmt(o.time) : gapText(o.gap), right], [o.note ?? '', { color: '#d8323c', fontSize: '10px' }],
    ] as [string, Partial<CSSStyleDeclaration>?][],
  }));
  const after = standings(r).map((s, i) => ({
    you: s.crew === r.you,
    cells: [
      [`${i + 1}`, dim], [name(s.crew)], [i === 0 ? fmt(s.total) : gapText(s.gap), right],
    ] as [string, Partial<CSSStyleDeclaration>?][],
  }));
  const last = k === event.stages.length - 1;
  el.replaceChildren(
    heading(`SS${k + 1} · ${stageName.toUpperCase()}`),
    table(stage),
    heading(last ? `${event.name} · FINAL` : `${event.name} · AFTER SS${k + 1} OF ${event.stages.length}`, '#5fe0d0'),
    table(after),
  );
}
