// A rally stage's own parts of the screen: the co-driver's card (the call just
// made: a big arrow and grade in the bend's colour, and the call in full under
// it, read out too where the device can speak, a tone for its grade where it
// can't, and a short buzz), and the stage's results (every crew's time on it,
// then the rally's standings after it: your row kept in view, the podium set
// apart, and each gap drawn as a bar).

import { beep, soundVolume } from '../../engine/audio';
import { vibrate } from '../../engine/haptics';
import { gradeColor } from '../access';
import { formatTime as fmt } from '../time';
import { crewName, gapText, rallyEvent, stageOrder, standings, type Rally } from '../rally';
import { cardArrow, shown, spoken, type Grade, type PaceNote } from '../paceNotes';
import { style } from './dom';
import { t } from '../../engine/i18n';
import { driverName } from '../profile';
import { COLOR, DISPLAY, font, pixelFont } from '../theme';

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

/** A grade's tone (Hz), for a device with no voice: low for a hairpin and a 1, rising a step a grade to a 6. */
export function gradeTone(grade: Grade): number {
  const step = grade === 'hairpin' ? 0 : grade;
  // (a whole tone a grade, from about A3)
  return Math.round(220 * 2 ** ((step * 2) / 12));
}

/** Whether the device can speak the calls: a voice to speak with (an Android web view can have the API but no voices). */
export function hasVoice(voice: Pick<SpeechSynthesis, 'getVoices'> | undefined): boolean {
  try {
    return !!voice && voice.getVoices().length > 0;
  } catch {
    return false;
  }
}

/** The co-driver's card, in its slot under the top bar (race/hud.ts). */
export function createPaceCard() {
  const el = document.createElement('div');
  style(el, {
    display: 'none', flexDirection: 'column', alignItems: 'center', gap: '3px', padding: '6px 12px 6px', borderRadius: '10px', boxSizing: 'border-box',
    maxWidth: '100%', background: COLOR.panel, borderTop: `4px solid ${COLOR.gold}`, color: COLOR.text, font: font('sm'),
    pointerEvents: 'none', textAlign: 'center', textWrap: 'balance', textShadow: `0 2px 0 ${COLOR.ink}`,
  });
  const big = document.createElement('div');
  style(big, { font: pixelFont(DISPLAY.call), color: COLOR.gold, lineHeight: '1', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' });
  // the bend's arrow, drawn on the screen the way the road goes in the picture
  const arrow = document.createElementNS(SVG, 'svg');
  arrow.setAttribute('viewBox', '-50 -50 100 100');
  arrow.setAttribute('aria-hidden', 'true');
  arrow.style.width = arrow.style.height = 'calc(50px * var(--ts, 1))';
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
      // (the bend's colour, by its grade: access.ts; a jump or the finish in gold)
      const color = first.grade !== undefined && !first.finish && !first.jump ? gradeColor(first.grade) : COLOR.gold;
      big.style.color = color;
      el.style.borderTopColor = color;
      el.dataset.color = color;
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
      // (a short buzz with each call, felt as the card comes up)
      vibrate(14);
      const volume = soundVolume();
      // (no voice to read it out: a tone for its grade, low for slow)
      if (!hasVoice(voice) && volume > 0 && first.grade !== undefined && !first.finish && !first.jump) {
        beep(gradeTone(first.grade), 0.16, 0.18, 'triangle');
        // (and the next bend's, shorter, when it follows on at once)
        if (call.length > 1 && call[1].grade !== undefined) beep(gradeTone(call[1].grade), 0.12, 0.14, 'triangle', 0.2);
      }
      if (voice && hasVoice(voice) && volume > 0) {
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

/** The podium's colours: gold, silver, bronze, for the places set apart at the top of a table. */
export const PODIUM = [COLOR.gold, '#c9cfd8', '#d08a52'] as const;

/** s: the widest gap a results bar is drawn to (wider ones fill it) */
export const GAP_SCALE = 30;

/** A gap's bar, as a share (0…1) of the widest gap shown (`most`); none for the leader or a gap not known. */
export function gapBar(gap: number | undefined, most: number): number {
  if (gap === undefined || !(gap > 0) || !(most > 0)) return 0;
  return Math.min(1, gap / most);
}

/** A cell of a results row. */
const cell = (text: string, css: Partial<CSSStyleDeclaration> = {}) => {
  const td = document.createElement('td');
  td.textContent = text;
  style(td, { padding: '2px 4px', whiteSpace: 'nowrap', ...css });
  return td;
};

/** A cell with the gap's bar in it, `share` of its width. */
const barCell = (share: number, color: string) => {
  const td = document.createElement('td');
  style(td, { padding: '2px 4px', width: '22%' });
  const bar = document.createElement('div');
  style(bar, { height: '5px', borderRadius: '2px', width: `${Math.round(share * 100)}%`, minWidth: share > 0 ? '2px' : '0', background: color, opacity: '.75' });
  td.append(bar);
  return td;
};

/** A row of a results table: its cells, whether it's yours, and its gap (for its bar). */
interface ResultRow {
  cells: [string, Partial<CSSStyleDeclaration>?][];
  you: boolean;
  gap?: number;
}

/**
 * A table of `rows`, in order: the first three set apart (their places in the podium's colours, a line under the
 * third), each gap drawn as a bar, and yours kept in view (it sticks to the top or bottom of the panel as it scrolls).
 */
function table(rows: ResultRow[]): HTMLTableElement {
  const t = document.createElement('table');
  style(t, { width: '100%', borderCollapse: 'collapse', marginBottom: '8px' });
  // (the bars to the widest gap, up to half a minute: a crew who didn't finish shouldn't squash everyone else's)
  const most = Math.min(GAP_SCALE, Math.max(0, ...rows.map((r) => (r.gap !== undefined && Number.isFinite(r.gap) ? r.gap : 0))));
  rows.forEach((r, i) => {
    const tr = document.createElement('tr');
    if (r.you) {
      // (kept in view: an opaque row, stuck to whichever edge of the panel it would scroll past)
      style(tr, { background: '#3b3426', color: COLOR.gold, position: 'sticky', top: '0', bottom: '0', zIndex: '1' });
      tr.dataset.you = '';
    }
    if (i === 2 && rows.length > 3) tr.style.borderBottom = `1px solid ${COLOR.keyEdge}`;
    const [place, ...rest] = r.cells;
    tr.append(cell(place[0], { ...place[1], ...(i < 3 ? { color: PODIUM[i] } : {}) }));
    const [name, time, ...more] = rest;
    tr.append(cell(name[0], name[1]), cell(time[0], time[1]), barCell(gapBar(r.gap, most), r.you ? COLOR.gold : COLOR.muted));
    for (const [text, css] of more) tr.append(cell(text, css));
    t.append(tr);
  });
  return t;
}
const heading = (text: string, color: string = COLOR.gold) => {
  const h = document.createElement('div');
  h.textContent = text;
  style(h, { color, margin: '2px 0 6px', textAlign: 'center' });
  return h;
};

/** Stage `k`'s results (once it's in the rally), then the rally after it, into `el`. */
export function renderStageResults(el: HTMLElement, r: Rally, k: number, stageName: string): void {
  const event = rallyEvent(r);
  const dim = { color: COLOR.muted };
  const name = (crew: number) => (crew === r.you ? driverName() : crewName(r.crews[crew]));
  const right = { textAlign: 'right' };
  const stage = stageOrder(r, k).map((o, i) => ({
    you: o.crew === r.you,
    gap: i === 0 ? undefined : o.gap,
    cells: [
      [`${i + 1}`, dim], [name(o.crew)],
      [i === 0 ? fmt(o.time) : gapText(o.gap), right], [o.note ? t(o.note === 'OFF' ? 'WENT OFF' : o.note) : '', { color: COLOR.red, fontSize: '10px' }],
    ] as [string, Partial<CSSStyleDeclaration>?][],
  }));
  const after = standings(r).map((s, i) => ({
    you: s.crew === r.you,
    gap: i === 0 ? undefined : s.gap,
    cells: [
      [`${i + 1}`, dim], [name(s.crew)], [i === 0 ? fmt(s.total) : gapText(s.gap), right],
    ] as [string, Partial<CSSStyleDeclaration>?][],
  }));
  const last = k === event.stages.length - 1;
  el.replaceChildren(
    heading(`${t('SS{n}', { n: k + 1 })} · ${stageName.toUpperCase()}`),
    table(stage),
    heading(`${t(event.name)} · ${last ? t('FINAL') : t('AFTER SS{n} OF {total}', { n: k + 1, total: event.stages.length })}`, COLOR.teal),
    table(after),
  );
}
