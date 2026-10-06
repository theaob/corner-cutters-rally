// The Championship won: a celebration over the whole screen before the standings, as big a moment as the game
// has. A dark curtain with gold light rays turning behind the trophy, which drops in; WORLD CHAMPION stamped
// across it letter by letter; your team on a band in its colours and your season in numbers; fireworks bursting
// all over and waves of confetti; a fanfare and a buzz; then TAP TO CONTINUE. It stays up until tapped (or A or
// START pressed, `close()`). With reduced motion asked for it's a still card: no rays turning, no fireworks or
// confetti (the fanfare still plays).

import { beep } from '../../engine/audio';
import { vibrate } from '../../engine/haptics';
import { confetti, trophy } from './celebrate';

/** What the card says about your season. */
export interface TitleWin {
  team: { name: string; body: string; trim: string };
  points: number;
  wins: number;
  /** points clear of the next driver */
  clear: number;
  /** DIFFICULTY · LENGTH */
  how: string;
}

/** ms the fireworks keep going */
export const FIREWORKS_MS = 7000;
/** ms before a tap can close it (so the tap that got you here doesn't) */
export const TITLE_HOLD_MS = 1500;

const reduced = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** The numbers under the team: points, wins and the margin (the WINS and CLEAR singular as they must be). */
export function titleLine(w: Pick<TitleWin, 'points' | 'wins' | 'clear'>): string {
  return `${w.points} POINTS · ${w.wins} WIN${w.wins === 1 ? '' : 'S'} · ${w.clear > 0 ? `${w.clear} CLEAR` : 'ON COUNTBACK'}`;
}

/** The fanfare: a rising call, then the held chord (square waves, as the game's other sounds). */
export function fanfare(): void {
  const notes: [number, number, number][] = [
    // (Hz, s from now, s long)
    [523, 0, 0.14], [659, 0.15, 0.14], [784, 0.3, 0.14], [1047, 0.45, 0.32],
    [784, 0.8, 0.12], [1047, 0.95, 0.7], [1319, 0.95, 0.7], [1568, 0.95, 0.7],
  ];
  for (const [f, at, len] of notes) beep(f, len, 0.07, 'square', at);
}

/** Show it over `host`. Gives back its `done` (it's closed) and `close()` (A or START: the screen's own buttons). */
export function celebrateTitle(host: HTMLElement, w: TitleWin): { done: Promise<void>; close: () => void } {
  const still = reduced();
  const el = document.createElement('div');
  el.className = `title-win${still ? ' still' : ''}`;
  const rays = document.createElement('div');
  rays.className = 'rays';
  const cup = trophy(168);
  const head = document.createElement('h1');
  // (each letter stamped in after the last)
  [...'WORLD CHAMPION'].forEach((ch, k) => {
    const s = document.createElement('span');
    s.textContent = ch === ' ' ? ' ' : ch;
    s.style.animationDelay = `${0.5 + k * 0.05}s`;
    head.append(s);
  });
  const band = document.createElement('div');
  band.className = 'team-band';
  band.textContent = w.team.name.toUpperCase();
  band.style.background = w.team.body;
  band.style.borderColor = w.team.trim;
  const line = document.createElement('p');
  line.textContent = titleLine(w);
  const how = document.createElement('p');
  how.className = 'how';
  how.textContent = w.how;
  const tap = document.createElement('p');
  tap.className = 'tap';
  tap.textContent = 'TAP TO CONTINUE';
  const fx = document.createElement('canvas');
  fx.className = 'fireworks';
  el.append(rays, fx, cup, head, band, line, how, tap);
  host.append(el);

  fanfare();
  // (a buzz with the trophy's landing, and with the chord)
  vibrate(60);
  setTimeout(() => vibrate(120), 950);
  if (!still) {
    fireworks(fx, FIREWORKS_MS);
    // three waves of confetti, over it all
    for (const at of [300, 2600, 4900]) setTimeout(() => el.isConnected && confetti(host, 4200), at);
  }

  let resolve = () => {};
  const done = new Promise<void>((r) => (resolve = r));
  const opened = performance.now();
  const close = () => {
    if (!el.isConnected || performance.now() - opened < TITLE_HOLD_MS) return;
    el.classList.add('going');
    setTimeout(() => {
      el.remove();
      for (const c of host.querySelectorAll('.confetti')) c.remove();
      resolve();
    }, 300);
  };
  el.addEventListener('pointerup', close);
  return { done, close };
}

const SPARKS = ['#f2c14e', '#ff4fd8', '#5fe0d0', '#4fa3ff', '#f4f2fa', '#ff7a3c'];

/** Fireworks on `c` for `ms`: a burst every half second or so, all over the top two thirds, each a ring of sparks falling and fading. */
function fireworks(c: HTMLCanvasElement, ms: number): void {
  const x = c.getContext('2d');
  if (!x) return;
  const scale = Math.min(2, globalThis.devicePixelRatio || 1);
  const w = (c.width = c.clientWidth * scale || 780);
  const h = (c.height = c.clientHeight * scale || 1600);
  const sparks: { x: number; y: number; vx: number; vy: number; life: number; color: string }[] = [];
  const burst = () => {
    const cx = w * (0.12 + Math.random() * 0.76);
    const cy = h * (0.08 + Math.random() * 0.5);
    const color = SPARKS[Math.floor(Math.random() * SPARKS.length)];
    const n = 36;
    const speed = (0.18 + Math.random() * 0.1) * w;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const v = speed * (0.7 + Math.random() * 0.3);
      sparks.push({ x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, color: Math.random() < 0.2 ? '#f4f2fa' : color });
    }
  };
  const start = performance.now();
  let last = start;
  let next = 0;
  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = now - start;
    if (t < ms && t >= next) {
      burst();
      // (now and then two at once)
      if (Math.random() < 0.3) burst();
      next = t + 350 + Math.random() * 350;
    }
    x.clearRect(0, 0, w, h);
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.vx *= 1 - 1.8 * dt;
      s.vy = s.vy * (1 - 1.8 * dt) + h * 0.12 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt * 0.9;
      if (s.life <= 0) {
        sparks.splice(i, 1);
        continue;
      }
      x.globalAlpha = Math.min(1, s.life * 1.4);
      x.fillStyle = s.color;
      const size = 3 * scale;
      x.fillRect(Math.round(s.x), Math.round(s.y), size, size);
    }
    x.globalAlpha = 1;
    if ((t < ms || sparks.length) && c.isConnected) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
