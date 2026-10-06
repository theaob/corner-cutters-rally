// A stage's HUD, built once: the readout (the stage clock, your car, your tyres
// and track limits), the banner, the results panel, your crew's card on the
// line, the minimap, and the pause screen; and where they go on the wide
// screen and on the phone.

import type { Difficulty } from '../difficulty';
import type { Scheme } from '../crews';
import { style } from './dom';
import { READOUT_GRID, readoutRun } from './readoutView';

/** The HUD for your car in `scheme`, number `number`, at `difficulty`, its minimap fitted to a road `width` × `height` (in tiles). */
export function createHud(scheme: Scheme, number: number, difficulty: Difficulty, circuit: { width: number; height: number }) {
  const readout = document.createElement('div');
  style(readout, {
    // (under the minimap's row, along the top on a phone)
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
  // the minimap fits the road in a 136 × 140 box, whatever its shape
  const miniScale = Math.min(136 / circuit.width, 140 / circuit.height);
  const MINI_W = Math.round(circuit.width * miniScale);
  // your crew's card on the line: your car's number on a plate in your colours, gone at GO
  const crewCard = document.createElement('div');
  style(crewCard, {
    position: 'absolute', left: '50%', top: 'calc(30% + 34px)', zIndex: '3', transform: 'translateX(-50%)',
    display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 10px 4px 4px', borderRadius: '10px',
    background: 'rgba(21,20,31,.8)', color: '#f4f2fa', font: '12px Silkscreen, monospace', whiteSpace: 'nowrap',
    pointerEvents: 'none', transition: 'opacity .4s',
  });
  const plate = document.createElement('span');
  plate.textContent = `#${number}`;
  style(plate, {
    display: 'inline-block', padding: '6px 8px', borderRadius: '6px', background: scheme.body, color: scheme.trim,
    border: `2px solid ${scheme.trim}`, font: '14px Silkscreen, monospace', textShadow: 'none',
  });
  const weatherTag = document.createElement('span');
  crewCard.append(plate, `YOU · ${difficulty.name} · `, weatherTag);
  const MINI_H = Math.round(circuit.height * miniScale);
  const mini = document.createElement('canvas');
  mini.width = MINI_W * 2;
  mini.height = MINI_H * 2;
  style(mini, {
    position: 'absolute', zIndex: '2', width: `${MINI_W}px`, height: `${MINI_H}px`,
    background: 'rgba(21,20,31,.6)', borderRadius: '6px',
  });
  const miniCtx = mini.getContext('2d')!;
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
  // the wide screen: the readout top left, the minimap top right (TUNE above it). The phone: RESTART and PAUSE in the
  // top corners (index.html) with the minimap between them, the readout down the left, the stage's km to go under the
  // minimap, the banner across the middle above the road, and the controls along the bottom
  /** Lay the HUD out for the wide screen or the phone, in `host`. */
  const place = (desktop: boolean, host: HTMLElement) => {
    if (desktop) {
      style(readout, { left: '6px', top: '6px', fontSize: '12px', lineHeight: 'normal', width: 'auto' });
      style(mini, { left: 'auto', right: '6px', top: '40px', transform: 'none', width: `${MINI_W}px`, height: `${MINI_H}px` });
      banner.style.top = '30%';
      results.style.maxHeight = 'calc(82% - 8px)';
      results.style.fontSize = '12px';
    } else {
      style(readout, { left: '12px', top: '48px', fontSize: '10px', lineHeight: '15px', width: '116px', boxSizing: 'border-box' });
      // the minimap in the middle of the screen, as big as fits beside the readout (and as much again the other side)
      const SIDE_W = 116;
      const w = host.clientWidth || 390;
      const from = 12 + SIDE_W + 8;
      const to = w - from;
      const fitMini = Math.min(1, (to - from) / MINI_W);
      const centre = w / 2;
      style(mini, { left: `${centre - (MINI_W * fitMini) / 2}px`, right: 'auto', top: '12px', transform: 'none', width: `${MINI_W * fitMini}px`, height: `${MINI_H * fitMini}px` });
      document.documentElement.style.setProperty('--mini-x', `${centre}px`);
      document.documentElement.style.setProperty('--mini-h', `${Math.round(MINI_H * fitMini)}px`);
      banner.style.top = '198px';
      // (the table, centred top to bottom with the buttons under it, clear of the stick above and below)
      results.style.maxHeight = 'calc(100% - 2 * var(--deck-cover, 0px) - 80px)';
      // (as big as its widest row fits: 12 px on most phones, 11 on a narrow one)
      results.style.fontSize = (host.clientWidth || 390) >= 380 ? '12px' : '11px';
    }
  };
  return { readout, mainLines, tyreLine, banner, results, crewCard, weatherTag, mini, miniCtx, pauseScreen, pauseTitle, pauseButton, MINI_W, MINI_H, place };
}
