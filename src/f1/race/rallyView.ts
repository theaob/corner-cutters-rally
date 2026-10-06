// A rally stage's own parts of the screen: the co-driver's card (the call just
// made: a big arrow and grade, and the call in full under it, read out too where
// the device can speak), and the stage's results (every crew's time on it, then
// the rally's standings after it).

import { soundVolume } from '../../engine/audio';
import { formatTime as fmt } from '../records';
import { crewName, crewTeam, gapText, rallyEvent, stageOrder, standings, type Rally } from '../rally';
import { shown, spoken, type PaceNote } from '../paceNotes';
import { style } from './dom';

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
  style(big, { font: 'calc(28px * var(--ts, 1)) Silkscreen, monospace', color: '#f2c14e', lineHeight: '1' });
  const words = document.createElement('div');
  el.append(big, words);
  let until = 0;
  /** the voice, where the device has one (and the sound's on) */
  const voice = typeof speechSynthesis !== 'undefined' ? speechSynthesis : undefined;
  return {
    el,
    /** Show and say `call` (the notes in it), for a couple of seconds from `now` (s). */
    call(call: PaceNote[], now: number) {
      const first = call[0];
      big.textContent = first.finish ? '▣ FINISH ▣' : first.jump ? '▲ JUMP ▲' : first.grade === 'hairpin' ? (first.dir === 'left' ? '◀◀ HP' : 'HP ▶▶') : first.dir === 'left' ? `◀ ${first.grade}` : `${first.grade} ▶`;
      words.textContent = shown(call);
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
      [`${i + 1}`, dim], [name(o.crew)], [crewTeam(r.crews[o.crew]).code, dim],
      [i === 0 ? fmt(o.time) : gapText(o.gap), right], [o.note ?? '', { color: '#d8323c', fontSize: '10px' }],
    ] as [string, Partial<CSSStyleDeclaration>?][],
  }));
  const after = standings(r).map((s, i) => ({
    you: s.crew === r.you,
    cells: [
      [`${i + 1}`, dim], [name(s.crew)], [crewTeam(r.crews[s.crew]).code, dim], [i === 0 ? fmt(s.total) : gapText(s.gap), right],
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
