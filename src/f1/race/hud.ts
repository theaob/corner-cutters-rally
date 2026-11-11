// A stage's HUD, built once: the readout (the stage clock, your car, your
// tyres), the stage's progress bar, the slots the co-driver's card, the banner
// and the controls lap's prompt each keep to, the results panel, your crew's card
// on the line, and the pause screen; and where they go on the wide screen and on
// the phone. No map: the co-driver's calls are what you drive by (the progress
// bar is only how far along the stage you are, never the road's shape).

import type { Difficulty } from '../difficulty';
import type { Scheme } from '../crews';
import { style } from './dom';
import { READOUT_GRID, readoutRun } from './readoutView';
import { COLOR, font } from '../theme';

/** The HUD for your car in `scheme`, at `difficulty`. */
export function createHud(scheme: Scheme, difficulty: Difficulty) {
  const readout = document.createElement('div');
  style(readout, {
    // (top left; on a phone, down the left under RESTART)
    position: 'absolute', zIndex: '2', padding: '2px 6px', borderRadius: '6px',
    background: 'rgba(21,20,31,.75)', color: COLOR.muted, font: font('md', true), whiteSpace: 'pre',
    // (each line an icon, its label and its value, in columns: readoutView.ts)
    ...READOUT_GRID,
  });
  // the stage clock and your car
  const mainLines = readoutRun();
  const tyreLine = readoutRun();
  readout.append(mainLines, tyreLine);
  // the co-driver's card's slot: under the top bar, so the card never covers the road ahead (the card goes in it)
  const cardSlot = document.createElement('div');
  style(cardSlot, {
    position: 'absolute', left: '50%', zIndex: '2', transform: 'translateX(-50%)', display: 'flex', justifyContent: 'center', pointerEvents: 'none',
  });
  // the banner's slot: under the card's
  const banner = document.createElement('div');
  style(banner, {
    position: 'absolute', left: '0', right: '0', zIndex: '2', textAlign: 'center', padding: '0 16px',
    font: 'calc(20px * var(--ts, 1)) Silkscreen, monospace', color: COLOR.gold, textShadow: `0 2px 0 ${COLOR.ink}`, pointerEvents: 'none',
    // (a message on two lines: even ones, no word left on its own)
    textWrap: 'balance',
  });
  // the controls lap's prompt: its own slot, low over the driving it's about, clear of the card and the banner
  const lesson = document.createElement('div');
  style(lesson, {
    position: 'absolute', left: '50%', zIndex: '2', transform: 'translateX(-50%)', width: 'max-content', maxWidth: 'calc(100% - 32px)',
    boxSizing: 'border-box', padding: '6px 12px', borderRadius: '10px', background: COLOR.panel, textAlign: 'center',
    font: font('md'), lineHeight: '1.5', color: COLOR.white, textShadow: `0 2px 0 ${COLOR.ink}`, pointerEvents: 'none',
    textWrap: 'balance', display: 'none',
  });
  // how far along the stage you are: a thin bar across the top, the splits marked on it (TOP-DOWN, in place of KM TO GO)
  const progress = document.createElement('div');
  style(progress, {
    position: 'absolute', top: '4px', left: '12px', right: '12px', height: '4px', zIndex: '2', borderRadius: '2px',
    background: 'rgba(21,20,31,.6)', boxShadow: '0 0 0 1px rgba(21,20,31,.6)', pointerEvents: 'none', display: 'none',
  });
  const progressFill = document.createElement('div');
  style(progressFill, { position: 'absolute', left: '0', top: '0', bottom: '0', width: '0%', borderRadius: '2px', background: COLOR.gold });
  progress.append(progressFill);
  /** Show the bar with a mark at each share of the stage in `marks` (0…1: the splits, then the finish). */
  const setProgressMarks = (marks: number[]) => {
    progress.querySelectorAll('[data-mark]').forEach((m) => m.remove());
    for (const at of marks) {
      const m = document.createElement('div');
      m.dataset.mark = '';
      style(m, { position: 'absolute', top: '-3px', bottom: '-3px', width: '2px', left: `calc(${(at * 100).toFixed(2)}% - 1px)`, background: COLOR.text });
      progress.append(m);
    }
    progress.style.display = 'block';
  };
  /** Fill the bar to `share` (0…1) of the stage. */
  const setProgress = (share: number) => {
    const w = `${(Math.max(0, Math.min(1, share)) * 100).toFixed(1)}%`;
    if (progressFill.style.width !== w) progressFill.style.width = w;
  };
  const results = document.createElement('div');
  style(results, {
    position: 'absolute', left: '10px', right: '10px', top: '18%', zIndex: '3', padding: '10px', borderRadius: '10px',
    // (its height capped to the room there is: place; scrolled if it's longer)
    boxSizing: 'border-box', overflowY: 'auto',
    background: 'rgba(21,20,31,.92)', color: COLOR.text, font: '12px Silkscreen, monospace', display: 'none',
  });
  // your crew's card on the line: a swatch of your car's paint, gone at GO
  const crewCard = document.createElement('div');
  style(crewCard, {
    position: 'absolute', left: '50%', top: '30%', zIndex: '3', transform: 'translateX(-50%)',
    display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 10px 4px 4px', borderRadius: '10px',
    background: 'rgba(21,20,31,.8)', color: COLOR.text, font: '12px Silkscreen, monospace', whiteSpace: 'nowrap',
    pointerEvents: 'none', transition: 'opacity .4s',
  });
  const plate = document.createElement('span');
  style(plate, {
    display: 'inline-block', width: '22px', height: '22px', boxSizing: 'border-box', borderRadius: '6px', background: scheme.body,
    border: `4px solid ${scheme.trim}`,
  });
  const weatherTag = document.createElement('span');
  crewCard.append(plate, `YOU · ${difficulty.name} · `, weatherTag);
  // the pause screen: resume, restart or leave, by tap or with the deck (A, START, SELECT)
  const pauseScreen = document.createElement('div');
  style(pauseScreen, {
    position: 'absolute', inset: '0', zIndex: '4', display: 'none', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: '10px', background: 'rgba(14,13,22,.72)', color: COLOR.text, font: '12px Silkscreen, monospace',
  });
  const pauseTitle = document.createElement('div');
  pauseTitle.textContent = 'PAUSED';
  style(pauseTitle, { font: 'calc(22px * var(--ts, 1)) Silkscreen, monospace', color: COLOR.gold, textShadow: `0 2px 0 ${COLOR.ink}`, marginBottom: '6px' });
  const pauseButton = (label: string, action: () => void) => {
    const b = document.createElement('button');
    b.textContent = label;
    style(b, {
      width: '60%', padding: '10px 0', borderRadius: '10px', border: `1px solid ${COLOR.keyEdge}`, background: COLOR.key,
      color: COLOR.text, font: 'calc(14px * var(--ts, 1)) Silkscreen, monospace', cursor: 'pointer', touchAction: 'none',
    });
    // on the press's release, not 'click' (in a cross-origin frame on a phone a tap's click can go astray)
    let armed = false;
    b.addEventListener('pointerdown', () => (armed = true));
    b.addEventListener('pointerleave', () => (armed = false));
    b.addEventListener('pointerup', () => {
      if (armed) action();
      armed = false;
    });
    return b;
  };
  // the wide screen: the readout top left, the card's slot top middle with the banner under it, the controls lap's
  // prompt low in the middle. The phone: RESTART and PAUSE in the top corners (index.html) with the stage's number
  // between them, the readout down the left and the camera on the right under them, the card's slot between those two
  // (lower on the controls lap, under its SKIP), the banner under the card, the prompt over the driving, and the
  // controls along the bottom
  /** Lay the HUD out for the wide screen or the phone, in `host`; `lap`: the controls lap (SKIP up top on a phone). */
  const place = (desktop: boolean, host: HTMLElement, lap = false) => {
    if (desktop) {
      style(readout, { left: '12px', top: '14px', fontSize: '12px', lineHeight: 'normal', width: 'auto' });
      style(cardSlot, { top: '14px', left: '50%', right: 'auto', width: 'auto', maxWidth: '60%', transform: 'translateX(-50%)' });
      banner.style.top = '150px';
      style(lesson, { top: 'auto', bottom: '18%' });
      results.style.maxHeight = 'calc(82% - 8px)';
      results.style.fontSize = '12px';
    } else {
      style(readout, { left: '12px', top: '52px', fontSize: '10px', lineHeight: '15px', width: '116px', boxSizing: 'border-box' });
      // (between the readout, 116 px wide, and the camera, 44 px: on a 393 px phone about 200 px; on the controls lap
      // under its SKIP, across the middle)
      if (lap) style(cardSlot, { top: '150px', left: '50%', right: 'auto', width: '240px', transform: 'translateX(-50%)' });
      else style(cardSlot, { top: '52px', left: '134px', right: '62px', width: 'auto', transform: 'none' });
      banner.style.top = lap ? '262px' : '164px';
      // (just over the steering pad and the brake: index.html's .drive)
      style(lesson, { top: 'auto', bottom: '22%' });
      // (the table, centred top to bottom with the buttons under it, clear of the stick above and below)
      results.style.maxHeight = 'calc(100% - 2 * var(--deck-cover, 0px) - 80px)';
      // (as big as its widest row fits: 12 px on most phones, 11 on a narrow one)
      results.style.fontSize = (host.clientWidth || 390) >= 380 ? '12px' : '11px';
    }
  };
  return {
    readout, mainLines, tyreLine, cardSlot, banner, lesson, progress, setProgressMarks, setProgress, results, crewCard, weatherTag, pauseScreen,
    pauseTitle, pauseButton, place,
  };
}
