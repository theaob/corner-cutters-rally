// The race's HUD, built once: the readout (with its lines for the tyres, the
// tow, the ghost, the next medal and track limits), the banner, the team radio's
// panel, the results panel, your team's card under the start lights, the
// minimap and the timing tower, and the pause screen; and where they go on the
// wide screen and on the phone (the layout drawn in the HUD Lab).

import { logoSvg } from '../logos';
import type { Difficulty } from '../difficulty';
import type { Team } from '../teams';
import { style } from './dom';
import { READOUT_GRID, readoutRun } from './readoutView';

/** The HUD for `team` at `difficulty`, its minimap fitted to a circuit `width` × `height` (in tiles). */
export function createHud(team: Team, difficulty: Difficulty, circuit: { width: number; height: number }) {
  const readout = document.createElement('div');
  style(readout, {
    // (under your position and lap, along the top on a phone)
    position: 'absolute', zIndex: '2', padding: '2px 6px', borderRadius: '6px',
    background: 'rgba(21,20,31,.75)', color: '#9d9ab8', font: '12px Silkscreen, monospace', whiteSpace: 'pre',
    // (each line an icon, its label and its value, in columns: readoutView.ts)
    ...READOUT_GRID,
  });
  // the lap times and records (or a Time Attack's clock), the cars either side, your car
  const mainLines = readoutRun();
  const tyreLine = readoutRun();
  // the slipstream: TOW and a bar that fills as it builds, in cyan, while you're in a car's wake
  const towLine = readoutRun('#5fe0d0');
  // Time Trial: the live gap to your record lap's ghost, green ahead of it, red behind
  const ghostLine = readoutRun();
  // Time Trial and Time Attack: the next medal here and what it asks for (or the gold, held)
  const medalLine = readoutRun();
  // track limits: your strikes, amber while they're warnings, red once they cost you
  const limitsLine = readoutRun();
  readout.append(mainLines, medalLine, ghostLine, towLine, tyreLine, limitsLine);
  const banner = document.createElement('div');
  style(banner, {
    position: 'absolute', left: '0', right: '0', top: '30%', zIndex: '2', textAlign: 'center', padding: '0 16px',
    font: 'calc(20px * var(--ts, 1)) Silkscreen, monospace', color: '#f2c14e', textShadow: '0 2px 0 #1b1b26', pointerEvents: 'none',
    // (a message on two lines: even ones, no word left on its own)
    textWrap: 'balance',
  });
  // the team radio: your engineer's line in a panel in your team's colour, keyed with a click and a squelch
  const radioPanel = document.createElement('div');
  style(radioPanel, {
    position: 'absolute', zIndex: '2', padding: '4px 8px', borderRadius: '6px',
    background: 'rgba(21,20,31,.88)', borderLeft: `3px solid ${team.body}`, color: '#f4f2fa', font: 'calc(11px * var(--ts, 1)) Silkscreen, monospace',
    pointerEvents: 'none', display: 'none',
  });
  const radioLabel = document.createElement('div');
  // (the brighter of your team's colours, so it reads on the dark panel)
  const lightness = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  };
  const radioColor = [team.body, team.trim, ...(team.accent ? [team.accent] : [])].reduce((a, c) => (lightness(c) > lightness(a) ? c : a));
  radioPanel.style.borderLeftColor = radioColor;
  style(radioLabel, { color: radioColor, fontSize: 'calc(9px * var(--ts, 1))', marginBottom: '2px' });
  radioLabel.textContent = '◉ RADIO';
  const radioText = document.createElement('div');
  radioPanel.append(radioLabel, radioText);
  const results = document.createElement('div');
  style(results, {
    position: 'absolute', left: '10px', right: '10px', top: '18%', zIndex: '3', padding: '10px', borderRadius: '10px',
    // (its height capped to the room there is: placeHud; scrolled if it's longer)
    boxSizing: 'border-box', overflowY: 'auto',
    background: 'rgba(21,20,31,.92)', color: '#f4f2fa', font: '12px Silkscreen, monospace', display: 'none',
  });
  // the minimap fits the circuit in a 136 × 140 box, whatever its shape (on a phone, shrunk to the room between the
  // readout and the timing tower: placeHud)
  const miniScale = Math.min(136 / circuit.width, 140 / circuit.height);
  const MINI_W = Math.round(circuit.width * miniScale);
  // your team's card under the start lights: its logo and name, gone at lights out
  const teamCard = document.createElement('div');
  style(teamCard, {
    position: 'absolute', left: '50%', top: 'calc(30% + 34px)', zIndex: '3', transform: 'translateX(-50%)',
    display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 10px 4px 4px', borderRadius: '10px',
    background: 'rgba(21,20,31,.8)', color: '#f4f2fa', font: '12px Silkscreen, monospace', whiteSpace: 'nowrap',
    pointerEvents: 'none', transition: 'opacity .4s',
  });
  const cardLogo = logoSvg(team.id, 36);
  if (cardLogo) teamCard.append(cardLogo);
  const weatherTag = document.createElement('span');
  teamCard.append(`${team.name.toUpperCase()} · ${difficulty.name} · `, weatherTag);
  const MINI_H = Math.round(circuit.height * miniScale);
  const mini = document.createElement('canvas');
  mini.width = MINI_W * 2;
  mini.height = MINI_H * 2;
  style(mini, {
    position: 'absolute', zIndex: '2', width: `${MINI_W}px`, height: `${MINI_H}px`,
    background: 'rgba(21,20,31,.6)', borderRadius: '6px',
  });
  const miniCtx = mini.getContext('2d')!;
  // the timing tower under the minimap, as on TV: the top three, then the cars around you, each with its team's
  // colour and its gap to the leader (in a race)
  const tower = document.createElement('div');
  style(tower, {
    position: 'absolute', zIndex: '2', minWidth: `${Math.max(96, MINI_W)}px`,
    background: 'rgba(21,20,31,.75)', borderRadius: '6px', padding: '2px 0', color: '#f4f2fa',
    font: '10px Silkscreen, monospace', pointerEvents: 'none', display: 'none',
  });
  // the pause screen: resume, restart or back to the circuits, by tap or with the deck (A, START, SELECT)
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
  // the wide screen: the readout top left, the minimap and timing tower top right (TUNE above them), the radio along the
  // bottom. The phone (the layout drawn in the HUD Lab): RESTART and PAUSE in the top corners (index.html) with the
  // minimap between them, the readout down the left, the timing tower down the right, your lap under the minimap, the
  // banner and then the radio across the middle above the track, and the controls along the bottom
  /** Lay the HUD out for the wide screen or the phone, in `host`. */
  const place = (desktop: boolean, host: HTMLElement) => {
    if (desktop) {
      style(readout, { left: '6px', top: '6px', fontSize: '12px', lineHeight: 'normal', width: 'auto' });
      style(mini, { left: 'auto', right: '6px', top: '40px', transform: 'none', width: `${MINI_W}px`, height: `${MINI_H}px` });
      style(tower, { right: '6px', top: `${46 + MINI_H}px`, minWidth: `${Math.max(96, MINI_W)}px`, width: 'auto' });
      style(radioPanel, { left: '6px', right: '6px', top: 'auto', bottom: '8px' });
      banner.style.top = '30%';
      results.style.maxHeight = 'calc(82% - 8px)';
      results.style.fontSize = '12px';
    } else {
      // (the timing tower's size: its type, and a line to each of its rows, so the two read as a pair either side)
      // (as wide as the timing tower on the other side, so the two mirror each other about the middle)
      style(readout, { left: '12px', top: '48px', fontSize: '10px', lineHeight: '15px', width: '116px', boxSizing: 'border-box' });
      // the readout and the timing tower the same width either side, and the minimap in the middle of the screen
      // between them (as big as fits, with a gap to each), your lap centred under it; on your own (no tower) the
      // minimap's still in the middle, the same size
      const TOWER_W = 116;
      const w = host.clientWidth || 390;
      const from = 12 + TOWER_W + 8;
      const to = w - from;
      const fitMini = Math.min(1, (to - from) / MINI_W);
      const centre = w / 2;
      style(mini, { left: `${centre - (MINI_W * fitMini) / 2}px`, right: 'auto', top: '12px', transform: 'none', width: `${MINI_W * fitMini}px`, height: `${MINI_H * fitMini}px` });
      style(tower, { right: '12px', top: '48px', minWidth: '0', width: `${TOWER_W}px`, boxSizing: 'border-box' });
      document.documentElement.style.setProperty('--mini-x', `${centre}px`);
      document.documentElement.style.setProperty('--mini-h', `${Math.round(MINI_H * fitMini)}px`);
      style(radioPanel, { left: '36px', right: '36px', top: '236px', bottom: 'auto' });
      banner.style.top = '198px';
      // (the table, centred top to bottom with the buttons under it, clear of the stick above and below)
      results.style.maxHeight = 'calc(100% - 2 * var(--deck-cover, 0px) - 80px)';
      // (as big as its widest row fits: 12 px on most phones, 11 on a narrow one)
      results.style.fontSize = (host.clientWidth || 390) >= 380 ? '12px' : '11px';
    }
  };
  return {
    readout, mainLines, tyreLine, towLine, ghostLine, medalLine, limitsLine, banner, radioPanel, radioText, results, teamCard, weatherTag,
    mini, miniCtx, tower, pauseScreen, pauseTitle, pauseButton, MINI_W, MINI_H, place,
  };
}
