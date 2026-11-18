// The race's effects drawn over the picture, each on a canvas of its own: the
// rain (streaks falling at a slant)
// and your chequered flag (a big waving one for a few seconds as you cross the
// line).

import { style } from './dom';

/** A canvas's size on the screen (CSS px), kept as it changes: read each frame, it would make the page lay itself out again each frame. */
function sizeOf(el: HTMLCanvasElement): { w: number; h: number } {
  const size = { w: 0, h: 0 };
  new ResizeObserver(([e]) => {
    size.w = Math.round(e.contentRect.width);
    size.h = Math.round(e.contentRect.height);
  }).observe(el);
  return size;
}

/** Rain over the picture: streaks falling at a slant, under the readouts. */
export function createRain() {
  const el = document.createElement('canvas');
  style(el, { position: 'absolute', inset: '0', width: '100%', height: '100%', zIndex: '1', pointerEvents: 'none', display: 'none' });
  const ctx = el.getContext('2d')!;
  // (as many drops as the heaviest rain has: as many of them drawn as it's raining now)
  const drops = Array.from({ length: 90 }, () => ({ x: Math.random(), y: Math.random(), v: 0.9 + Math.random() * 0.6 }));
  const size = sizeOf(el);
  /** Draw the rain for `rain` (0…1: how hard it's raining). */
  const draw = (dt: number, rain: number) => {
    const falling = Math.round(drops.length * rain);
    el.style.display = falling > 0 ? 'block' : 'none';
    if (falling <= 0) return;
    // (sized again only when the screen is: setting a canvas's size, even to the same, makes it anew)
    const { w, h } = size;
    if (el.width !== w || el.height !== h) [el.width, el.height] = [w, h];
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(210,220,236,.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const d of drops.slice(0, falling)) {
      d.y += d.v * dt * 1.6;
      d.x -= d.v * dt * 0.25;
      if (d.y > 1) Object.assign(d, { y: d.y - 1, x: Math.random() + 0.1 });
      if (d.x < 0) d.x += 1.1;
      const px = d.x * w;
      const py = d.y * h;
      ctx.moveTo(px, py);
      ctx.lineTo(px + 4, py - 16);
    }
    ctx.stroke();
  };
  return { el, draw };
}

/** Your chequered flag: a big waving one over the picture for a few seconds as you cross the line. */
export function createFlagOverlay() {
  const el = document.createElement('canvas');
  el.width = 168;
  el.height = 112;
  style(el, { position: 'absolute', left: '50%', top: 'calc(30% + 34px)', transform: 'translateX(-50%)', width: '168px', height: '112px', zIndex: '3', pointerEvents: 'none', display: 'none', imageRendering: 'pixelated' });
  const ctx = el.getContext('2d')!;
  /** Draw the waving flag at `t` s: a pole, and 8 × 5 squares, each column lifted and shaded by a wave running along it. */
  const draw = (t: number) => {
    ctx.clearRect(0, 0, 168, 112);
    ctx.fillStyle = '#c9ccd4';
    ctx.fillRect(8, 6, 4, 104);
    const cell = 18;
    for (let c = 0; c < 8; c++) {
      const phase = c * 0.8 - t * 9;
      const lift = Math.sin(phase) * 5 * ((c + 1) / 8);
      const light = 0.78 + 0.22 * Math.cos(phase);
      for (let r = 0; r < 5; r++) {
        const white = (c + r) % 2 === 0;
        const v = Math.round((white ? 244 : 21) * light);
        ctx.fillStyle = `rgb(${v},${v},${white ? Math.round(248 * light) : Math.round(31 * light)})`;
        ctx.fillRect(12 + c * cell, 8 + r * cell + lift, cell, cell);
      }
    }
  };
  return { el, draw };
}
