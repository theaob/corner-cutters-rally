// A stage's HUD, built once: the readout (the stage clock, your car, your
// tyres), the banner, the results panel, your crew's card on the line, and the
// pause screen; and where they go on the wide screen and on the phone. No map:
// the co-driver's calls are what you drive by.

import type { Difficulty } from '../difficulty';
import type { Scheme } from '../crews';
import { style } from './dom';
import { READOUT_GRID, readoutRun } from './readoutView';

/** The HUD for your car in `scheme`, at `difficulty`. */
export function createHud(scheme: Scheme, difficulty: Difficulty) {
  const readout = document.createElement('div');
  style(readout, {
    // (top left; on a phone, down the left under RESTART)
    position: 'absolute', zIndex: '2', padding: '2px 6px', borderRadius: '6px',
    background: 'rgba(21,20,31,.75)', color: '#9d9ab8', font: '12px Silkscreen, monospace', whiteSpace: 'pre',
    // (each line an icon, its label and its value, in columns: readoutView.ts)
    ...READOUT_GRID,
  });
  // the stage clock and your car
  const mainLines = readoutRun();
  const tyreLine = readoutRun();
  readout.append(mainLines, tyreLine);
  const banner = document.createElement('div');
  style(banner, {
    position: 'absolute', left: '0', right: '0', top: '30%', zIndex: '2', textAlign: 'center', padding: '0 16px',
    font: 'calc(20px * var(--ts, 1)) Silkscreen, monospace', color: '#f2c14e', textShadow: '0 2px 0 #1b1b26', pointerEvents: 'none',
    // (a message on two lines: even ones, no word left on its own)
    textWrap: 'balance',
  });
  const results = document.createElement('div');
  style(results, {
    position: 'absolute', left: '10px', right: '10px', top: '18%', zIndex: '3', padding: '10px', borderRadius: '10px',
    // (its height capped to the room there is: place; scrolled if it's longer)
    boxSizing: 'border-box', overflowY: 'auto',
    background: 'rgba(21,20,31,.92)', color: '#f4f2fa', font: '12px Silkscreen, monospace', display: 'none',
  });
  // your crew's card on the line: a swatch of your car's paint, gone at GO
  const crewCard = document.createElement('div');
  style(crewCard, {
    position: 'absolute', left: '50%', top: 'calc(30% + 34px)', zIndex: '3', transform: 'translateX(-50%)',
    display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 10px 4px 4px', borderRadius: '10px',
    background: 'rgba(21,20,31,.8)', color: '#f4f2fa', font: '12px Silkscreen, monospace', whiteSpace: 'nowrap',
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
    gap: '10px', background: 'rgba(14,13,22,.72)', color: '#f4f2fa', font: '12px Silkscreen, monospace',
  });
  const pauseTitle = document.createElement('div');
  pauseTitle.textContent = 'PAUSED';
  style(pauseTitle, { font: 'calc(22px * var(--ts, 1)) Silkscreen, monospace', color: '#f2c14e', textShadow: '0 2px 0 #1b1b26', marginBottom: '6px' });
  const pauseButton = (label: string, action: () => void) => {
    const b = document.createElement('button');
    b.textContent = label;
    style(b, {
      width: '60%', padding: '10px 0', borderRadius: '10px', border: '1px solid #3a3858', background: '#25233a',
      color: '#f4f2fa', font: 'calc(14px * var(--ts, 1)) Silkscreen, monospace', cursor: 'pointer', touchAction: 'none',
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
  // the wide screen: the readout top left. The phone: RESTART and PAUSE in the top corners (index.html) with the
  // stage's km to go between them, the readout down the left, the banner across the middle above the road, and the
  // controls along the bottom
  /** Lay the HUD out for the wide screen or the phone, in `host`. */
  const place = (desktop: boolean, host: HTMLElement) => {
    if (desktop) {
      style(readout, { left: '6px', top: '6px', fontSize: '12px', lineHeight: 'normal', width: 'auto' });
      banner.style.top = '30%';
      results.style.maxHeight = 'calc(82% - 8px)';
      results.style.fontSize = '12px';
    } else {
      style(readout, { left: '12px', top: '48px', fontSize: '10px', lineHeight: '15px', width: '116px', boxSizing: 'border-box' });
      banner.style.top = '198px';
      // (the table, centred top to bottom with the buttons under it, clear of the stick above and below)
      results.style.maxHeight = 'calc(100% - 2 * var(--deck-cover, 0px) - 80px)';
      // (as big as its widest row fits: 12 px on most phones, 11 on a narrow one)
      results.style.fontSize = (host.clientWidth || 390) >= 380 ? '12px' : '11px';
    }
  };
  return { readout, mainLines, tyreLine, banner, results, crewCard, weatherTag, pauseScreen, pauseTitle, pauseButton, place };
}
